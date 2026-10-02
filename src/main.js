import * as THREE from 'three';
import { createGame, step, queueDir, lastQueuedDir, ticksPerSecond, deathLunge, DIRS, GRID_W, GRID_H } from './game.js';
import { THEMES } from './themes.js';
import { buildStage } from './stage.js';
import { createCharacter } from './characters.js';
import { Collectibles } from './collectibles.js';
import { Particles, Shockwaves, Post } from './fx.js';
import { Thrower } from './thrower.js';
import { CameraRig, VIEWS, DEATH_VIEWS, VIEW_LABELS, screenToGrid } from './camera.js';
import { Sound } from './audio.js';
import { loadPrefs, savePrefs } from './storage.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const canvas = $('#c');

const prefs = loadPrefs();
const sound = new Sound();
sound.muted = !prefs.sound;

// WebGL2: es lo más estable y liviano en Safari de iPhone (WebGPU todavía no aporta acá).
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
} catch (e) {
  $('#nogl').hidden = false;
  throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
const half = { x: GRID_W / 2, z: GRID_H / 2 };
const rig = new CameraRig(camera, half);
rig.view = VIEWS.includes(prefs.view) ? prefs.view : 'cancha';

const hemi = new THREE.HemisphereLight('#dfefff', '#4a7a3a', 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3dc', 2.6);
sun.castShadow = true;
sun.shadow.camera.left = -13;
sun.shadow.camera.right = 13;
sun.shadow.camera.top = 17;
sun.shadow.camera.bottom = -17;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#9cc4ff', 0.5);
fill.position.set(-6, 8, -10);
scene.add(fill);

const particles = new Particles(scene);
const waves = new Shockwaves(scene);
const post = new Post(renderer);

let world = null;
let theme = THEMES[prefs.mode] || THEMES.boca;

function applyQuality() {
  const high = prefs.fx === 'high';
  post.enabled = high;
  sun.shadow.mapSize.setScalar(high ? 2048 : 1024);
  if (sun.shadow.map) {
    sun.shadow.map.dispose();
    sun.shadow.map = null;
  }
  $('#fxBtn').textContent = high ? 'Efectos: altos' : 'Efectos: livianos';
  resize();
}

function buildWorld(mode) {
  if (world) {
    scene.remove(world.stage.group, world.character.group);
    world.stage.dispose();
    world.character.dispose();
    world.collectibles.clear();
    world.thrower.dispose();
  }
  theme = THEMES[mode];
  const stage = buildStage(theme, { w: GRID_W, h: GRID_H, renderer });
  scene.add(stage.group);
  const character = createCharacter(mode, GRID_W * GRID_H);
  scene.add(character.group);
  const collectibles = new Collectibles(mode, scene);
  const thrower = new Thrower(scene, mode, { spots: stage.throwSpots, half, fx: particles });
  scene.fog = new THREE.Fog(theme.fog, 55, 150);
  sun.position.set(...theme.sun).multiplyScalar(2);
  sun.color.set(theme.sunColor);
  hemi.color.set(mode === 'boca' ? '#d8ecff' : '#f2f5f8');
  thrower.onRelease = () => sound.whoosh();
  world = { mode, stage, character, collectibles, thrower };
  app.classList.toggle('mode-boca', mode === 'boca');
  app.classList.toggle('mode-river', mode === 'river');
  document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  document.querySelector('meta[name=theme-color]').setAttribute('content', mode === 'boca' ? '#0b3d91' : '#b00418');
  updateScoreUI();
}

// ---------- Estado de juego ----------
let phase = 'menu';
let game = null;
let demo = null;
let prev = null;
let curr = null;
let acc = 0;
let graceT = 0;
let time = 0;
const death = {
  t: 0,
  replaying: false,
  rt: 0,
  snaps: [],
  lunge: null,
  impact: new THREE.Vector3(),
  impactShown: false,
  view: DEATH_VIEWS.includes(prefs.deathView) ? prefs.deathView : 'auto',
  orbit: 0,
  tps: 7,
  liveT: 0,
  ended: false,
};

function snapshotOf(g) {
  return g.history[g.history.length - 1];
}

function newDemo() {
  demo = createGame();
  prev = curr = snapshotOf(demo);
  acc = 0;
}

function startGame() {
  sound.unlock();
  game = createGame();
  rig.setView(VIEWS.includes(prefs.view) ? prefs.view : 'cancha');
  prev = curr = snapshotOf(game);
  acc = 0;
  graceT = 0.7;
  world.collectibles.clear();
  world.character.group.visible = true;
  post.uniforms.uDeath.value = 0;
  setPhase('play');
  showCheer(theme.id === 'boca' ? '¡DALE BOCA!' : '¡VAMOS RIVER!');
  updateScoreUI();
}

function setPhase(p) {
  phase = p;
  app.classList.remove('phase-menu', 'phase-play', 'phase-paused', 'phase-death');
  app.classList.add(`phase-${p}`);
  app.classList.toggle('replaying', p === 'death' && death.replaying);
  if (p === 'menu') {
    rig.resetUser();
    newDemo();
    world.collectibles.clear();
    post.uniforms.uDeath.value = 0;
  }
  if (p === 'play' || p === 'menu') rig.resetUser();
  updateCamLabel();
  requestAnimationFrame(layout);
}

// ---------- Utilidades de mundo ----------
const toWorld = (c, out = new THREE.Vector3()) => out.set(c.x - (GRID_W - 1) / 2, 0, c.z - (GRID_H - 1) / 2);
const pointPool = [];
for (let i = 0; i < GRID_W * GRID_H + 2; i++) pointPool.push(new THREE.Vector3());
const pts = [];

function interpPoints(a, b, alpha) {
  pts.length = 0;
  const n = b.snake.length;
  for (let i = 0; i < n; i++) {
    const pc = a.snake[Math.min(i, a.snake.length - 1)];
    const cc = b.snake[i];
    const p = pointPool[i];
    p.set(
      pc.x + (cc.x - pc.x) * alpha - (GRID_W - 1) / 2,
      0,
      pc.z + (cc.z - pc.z) * alpha - (GRID_H - 1) / 2,
    );
    pts.push(p);
  }
  return pts;
}

function headingVec(dir) {
  const d = DIRS[dir];
  return new THREE.Vector3(d.x, 0, d.z);
}

function foodWorld(food) {
  if (!food) return null;
  const w = toWorld(food);
  return { ...food, wx: w.x, wz: w.z };
}

// ---------- Efectos ----------
const tmpV = new THREE.Vector3();
function collectFx(food, big = food.bonus) {
  const pos = toWorld(food, new THREE.Vector3()).setY(0.6);
  const colors = theme.id === 'boca' ? ['#ffd94a', '#ffc928', '#ffffff', '#2a6ad6'] : ['#ffffff', '#ff3348', '#cfe6ff', '#ffffff'];
  particles.emit(pos, { count: big ? 70 : 38, colors, speed: big ? 4.5 : 3.2, up: 3.5, life: 0.9, size: 0.26 });
  waves.spawn(pos, { color: theme.id === 'boca' ? '#ffc928' : '#ff4b5c', size: big ? 6 : 3.6, life: 0.55 });
  world.character.eat();
  world.stage.hype(big ? 1.2 : 0.6);
}

function impactFx(strong = true) {
  const p = death.impact;
  particles.emit(tmpV.copy(p).setY(0.4), {
    count: strong ? 90 : 40,
    colors: ['#ffffff', theme.primary, theme.id === 'boca' ? '#ffc928' : '#ff5a6c', '#ff6a3d'],
    speed: 5,
    up: 4,
    life: 1.1,
    size: 0.3,
  });
  waves.spawn(p, { color: '#ff3b3b', size: strong ? 7 : 4.5, life: 0.7 });
  waves.spawn(p, { color: '#ffffff', size: strong ? 4 : 3, life: 0.45 });
  post.uniforms.uFlash.value = strong ? 0.9 : 0.5;
  shake = strong ? 0.35 : 0.2;
  if (!post.enabled) {
    const f = $('#flash');
    f.animate([{ opacity: 0.7 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
  }
}

let shake = 0;

// Marcador del punto de impacto.
const impactMarker = (() => {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.55, 40),
    new THREE.MeshBasicMaterial({ color: '#ff2e3d', transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const xMat = new THREE.MeshBasicMaterial({ color: '#ff2e3d', transparent: true, depthWrite: false });
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.1), xMat);
    bar.rotation.x = -Math.PI / 2;
    bar.rotation.z = a;
    g.add(bar);
  }
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.25, 3, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ff5a5a', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = 1.5;
  g.add(beam);
  g.position.y = 0.03;
  g.visible = false;
  scene.add(g);
  return g;
})();

// ---------- UI ----------
function updateScoreUI() {
  const s = phase === 'menu' ? 0 : game ? game.score : 0;
  $('#score').textContent = s;
  $('#best').textContent = prefs.best[theme.id] || 0;
  document.querySelectorAll('[data-best]').forEach((el) => (el.textContent = prefs.best[el.dataset.best] || 0));
}

function updateCamLabel() {
  const label = phase === 'death' ? VIEW_LABELS[death.view] : VIEW_LABELS[rig.view];
  $('#camLabel').textContent = label;
  $('#deathCamLabel').textContent = VIEW_LABELS[death.view];
}

function cycleCamera() {
  sound.click();
  if (phase === 'death') {
    const i = DEATH_VIEWS.indexOf(death.view);
    death.view = DEATH_VIEWS[(i + 1) % DEATH_VIEWS.length];
    prefs.deathView = death.view;
    if (death.view !== 'auto') rig.setView(death.view);
    rig.resetUser();
  } else {
    const i = VIEWS.indexOf(rig.view);
    rig.setView(VIEWS[(i + 1) % VIEWS.length]);
    prefs.view = rig.view;
  }
  savePrefs(prefs);
  updateCamLabel();
}

function selectView(v) {
  if (phase === 'death') {
    death.view = v;
    prefs.deathView = v;
    rig.setView(v);
  } else {
    rig.setView(v);
    prefs.view = v;
  }
  savePrefs(prefs);
  updateCamLabel();
}

const floaterPool = [];
function floatText(text, worldPos) {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  $('#floaters').appendChild(el);
  floaterPool.push({ el, pos: worldPos.clone(), t: 0 });
}

function updateFloaters(dt) {
  const { w, h } = rig.size;
  for (let i = floaterPool.length - 1; i >= 0; i--) {
    const f = floaterPool[i];
    f.t += dt;
    tmpV.copy(f.pos).setY(1 + f.t * 1.4).project(camera);
    const x = (tmpV.x * 0.5 + 0.5) * w;
    const y = (-tmpV.y * 0.5 + 0.5) * h;
    const k = f.t / 0.9;
    const s = k < 0.2 ? 0.5 + k * 3 : 1.1 - (k - 0.2) * 0.2;
    f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
    f.el.style.opacity = String(Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4));
    if (k >= 1) {
      f.el.remove();
      floaterPool.splice(i, 1);
    }
  }
}

function showCheer(text) {
  const el = $('#cheer');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// Rectángulo libre para encuadrar la cancha según la UI visible.
function layout() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  const hudR = $('#hud .score-pill').getBoundingClientRect();
  let top = hudR.bottom + 6;
  let bottom = h;
  let left = 0;
  let right = w;
  const landscape = w > h && h < 560;
  const vis = (el) => el.offsetParent !== null || getComputedStyle(el).display !== 'none';
  if (phase === 'play' || phase === 'paused') {
    const pad = $('#pad');
    if (vis(pad) && phase === 'play') {
      const r = pad.getBoundingClientRect();
      if (landscape) {
        const btns = [...pad.children].map((b) => b.getBoundingClientRect());
        const leftEdge = Math.max(...btns.filter((b) => b.left < w / 2).map((b) => b.right));
        const rightEdge = Math.min(...btns.filter((b) => b.left > w / 2).map((b) => b.left));
        left = leftEdge + 6;
        right = rightEdge - 6;
        top = Math.max(top - 10, 8);
      } else bottom = r.top - 4;
    } else if (!landscape) bottom = h - 150;
  } else if (phase === 'menu') {
    const r = $('#menu').getBoundingClientRect();
    if (landscape) right = r.left - 8;
    else bottom = r.top - 4;
  } else if (phase === 'death') {
    const r = $('#deathBar').getBoundingClientRect();
    bottom = r.top - 4;
    if (!landscape) top = Math.max(top, $('#deathTop').getBoundingClientRect().bottom + 4);
  }
  const rect = { x: left, y: top, w: Math.max(80, right - left), h: Math.max(80, bottom - top) };
  rig.setLayout(w, h, rect);
}

function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, prefs.fx === 'high' ? 2 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  post.setSize(w, h, dpr);
  layout();
}

// ---------- Entrada ----------
function handleDir(screenDir) {
  if (phase !== 'play') return;
  sound.unlock();
  const heading = headingVec(lastQueuedDir(game));
  const az = rig.controlAz(heading);
  const dir = screenToGrid(screenDir, az);
  queueDir(game, dir);
  if (graceT > 0) graceT = 0;
}

const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', (e) => {
  if (KEYS[e.code]) {
    e.preventDefault();
    handleDir(KEYS[e.code]);
    flashPad(KEYS[e.code]);
    return;
  }
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'KeyP') {
    e.preventDefault();
    if (phase === 'play') pause();
    else if (phase === 'paused') resume();
    else if (phase === 'menu') startGame();
  } else if (e.code === 'Enter') {
    if (phase === 'menu' || phase === 'death') startGame();
    else if (phase === 'paused') resume();
  } else if (e.code === 'KeyC') cycleCamera();
  else if (/^Digit[1-5]$/.test(e.code)) {
    const n = Number(e.code.slice(5)) - 1;
    const list = phase === 'death' ? DEATH_VIEWS : VIEWS;
    if (list[n]) selectView(list[n]);
  } else if (e.code === 'KeyR' && phase === 'death') startReplay();
  else if (e.code === 'Escape') {
    if (app.classList.contains('credits-open')) closeCredits();
    else if (phase === 'play') pause();
    else if (phase === 'death' && death.replaying) skipReplay();
  }
});

function flashPad(dir) {
  const b = document.querySelector(`#pad [data-dir=${dir}]`);
  if (!b) return;
  b.classList.add('on');
  setTimeout(() => b.classList.remove('on'), 110);
}

document.querySelectorAll('#pad button').forEach((b) => {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleDir(b.dataset.dir);
    flashPad(b.dataset.dir);
  });
});

// Arrastrar = girar, pellizcar = zoom, doble toque = recentrar.
const pointers = new Map();
let pinchDist = 0;
let lastTap = 0;
canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
  const now = performance.now();
  if (pointers.size === 1 && now - lastTap < 300) rig.resetUser();
  lastTap = now;
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 1) rig.rotate(dx, dy);
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0) rig.zoom(pinchDist / d);
    pinchDist = d;
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  pinchDist = 0;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    rig.zoom(Math.exp(e.deltaY * 0.0015));
  },
  { passive: false },
);
['gesturestart', 'gesturechange', 'dblclick'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// Botones.
function pause() {
  if (phase !== 'play') return;
  setPhase('paused');
}
function resume() {
  if (phase !== 'paused') return;
  setPhase('play');
  graceT = 0.4;
}
function toMenu() {
  death.replaying = false;
  impactMarker.visible = false;
  world.character.group.visible = true;
  setPhase('menu');
  updateScoreUI();
}
function openCredits() {
  app.classList.add('credits-open');
  if (phase === 'play') pause();
}
function closeCredits() {
  app.classList.remove('credits-open');
  requestAnimationFrame(layout);
}

document.querySelectorAll('.mode').forEach((b) =>
  b.addEventListener('click', () => {
    sound.unlock();
    sound.click();
    if (world.mode === b.dataset.mode) return;
    prefs.mode = b.dataset.mode;
    savePrefs(prefs);
    buildWorld(prefs.mode);
    newDemo();
  }),
);
$('#playBtn').addEventListener('click', startGame);
$('#camBtn').addEventListener('click', cycleCamera);
$('#deathCamBtn').addEventListener('click', cycleCamera);
$('#pauseBtn').addEventListener('click', pause);
$('#resumeBtn').addEventListener('click', resume);
$('#pauseMenuBtn').addEventListener('click', toMenu);
$('#deathMenuBtn').addEventListener('click', toMenu);
$('#restartBtn').addEventListener('click', startGame);
$('#replayBtn').addEventListener('click', () => startReplay());
$('#skipBtn').addEventListener('click', () => skipReplay());
$('#closeCredits').addEventListener('click', closeCredits);
document.querySelectorAll('[data-open-credits]').forEach((el) =>
  el.addEventListener('click', (e) => {
    e.preventDefault();
    openCredits();
  }),
);
$('#soundBtn').addEventListener('click', () => {
  prefs.sound = !prefs.sound;
  sound.unlock();
  sound.setMuted(!prefs.sound);
  $('#soundBtn').textContent = prefs.sound ? 'Sonido: sí' : 'Sonido: no';
  savePrefs(prefs);
});
$('#soundBtn').textContent = prefs.sound ? 'Sonido: sí' : 'Sonido: no';
$('#fxBtn').addEventListener('click', () => {
  prefs.fx = prefs.fx === 'high' ? 'low' : 'high';
  savePrefs(prefs);
  applyQuality();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'play') pause();
});

// ---------- Muerte y repetición ----------
const REPLAY_TICKS = 30;

function onDeath() {
  const g = game;
  death.t = 0;
  death.liveT = 0;
  death.ended = false;
  death.replaying = false;
  death.impactShown = false;
  death.lunge = deathLunge(g) || snapshotOf(g);
  death.snaps = g.history.slice(-REPLAY_TICKS);
  death.tps = ticksPerSecond(g);
  toWorld(g.death ? g.death.impact : g.snake[0], death.impact);
  impactMarker.position.set(death.impact.x, 0.03, death.impact.z);
  death.orbit = 0;
  const record = g.score > (prefs.best[theme.id] || 0);
  if (record) {
    prefs.best[theme.id] = g.score;
    savePrefs(prefs);
  }
  $('#deathTitle').textContent = g.won ? '¡Campeón!' : g.death.cause === 'wall' ? theme.deathWall : theme.deathSelf;
  $('#deathScore').textContent = `${g.score} ${g.score === 1 ? 'punto' : 'puntos'} · largo ${g.snake.length}`;
  $('#deathTop').classList.toggle('record', record && g.score > 0);
  $('#replayLabel').textContent = 'Choque';
  $('#replayProgress').style.width = '0%';
  rig.resetUser();
  if (death.view !== 'auto') rig.setView(death.view);
  setPhase('death');
  updateScoreUI();
  sound.death();
}

function startReplay() {
  if (phase !== 'death') return;
  death.replaying = true;
  death.orbit = 0;
  death.cut = death.view === 'auto'; // corte de cámara, como en la tele
  death.rt = 0;
  death.impactShown = false;
  death.ended = false;
  impactMarker.visible = false;
  post.uniforms.uDeath.value = 0;
  app.classList.add('replaying');
  $('#replayLabel').textContent = 'Repetición · cámara lenta';
  world.collectibles.clear();
  requestAnimationFrame(layout);
}

function skipReplay() {
  if (!death.replaying) return;
  death.rt = replayEnd();
  finishReplay();
}

function replayEnd() {
  return death.snaps.length - 1 + 0.45;
}

function finishReplay() {
  death.replaying = false;
  death.ended = true;
  app.classList.remove('replaying');
  $('#replayLabel').textContent = 'Punto de impacto';
  $('#replayProgress').style.width = '100%';
  impactMarker.visible = true;
  if (!death.impactShown) {
    death.impactShown = true;
    impactFx(false);
  }
  requestAnimationFrame(layout);
}

// 0 = seguir la cabeza, 1 = mirar el impacto.
function deathFocus() {
  if (phase !== 'death') return 1;
  if (!death.replaying) return 1;
  const left = replayEnd() - death.rt;
  return THREE.MathUtils.smoothstep(2.5 - left, 0, 2.5);
}

// Devuelve los dos estados y alpha a dibujar durante la repetición.
function replayFrame() {
  const snaps = death.snaps;
  const last = snaps.length - 1;
  const i = Math.min(Math.floor(death.rt), last);
  const alpha = death.rt - i;
  if (i >= last) return { a: snaps[last], b: death.lunge, alpha: Math.min(alpha, 0.45) };
  return { a: snaps[i], b: snaps[i + 1], alpha };
}

// ---------- Bucle ----------
const clock = new THREE.Timer();
const headWorld = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function autopilot(g) {
  const head = g.snake[0];
  const options = ['up', 'down', 'left', 'right'].filter((d) => {
    const v = DIRS[d];
    const nx = head.x + v.x;
    const nz = head.z + v.z;
    if (nx < 1 || nz < 1 || nx >= g.w - 1 || nz >= g.h - 1) return false;
    return !g.snake.slice(0, -1).some((c) => c.x === nx && c.z === nz);
  });
  if (!options.length) return;
  options.sort((a, b) => {
    const da = Math.abs(head.x + DIRS[a].x - g.food.x) + Math.abs(head.z + DIRS[a].z - g.food.z);
    const db = Math.abs(head.x + DIRS[b].x - g.food.x) + Math.abs(head.z + DIRS[b].z - g.food.z);
    return da - db;
  });
  if (options[0] !== g.dir) queueDir(g, options[0]);
}

function frame(now) {
  clock.update(now);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  time += rawDt;
  let dt = rawDt;
  let a = prev;
  let b = curr;
  let alpha = 0;
  let moving = true;
  let dead = false;
  let deadT = 0;
  let food = null;
  let activeGame = phase === 'menu' ? demo : game;

  if (phase === 'menu') {
    acc += dt;
    const interval = 1 / 4.5;
    while (acc >= interval) {
      acc -= interval;
      autopilot(demo);
      prev = curr;
      const ev = step(demo);
      if (!demo.alive || demo.snake.length > 14) {
        newDemo();
        break;
      }
      curr = snapshotOf(demo);
      for (const e of ev) if (e.type === 'eat') collectFx(e.food, false);
    }
    a = prev;
    b = curr;
    alpha = acc / interval;
    food = demo.food;
  } else if (phase === 'play') {
    const interval = 1 / ticksPerSecond(game);
    if (graceT > 0) graceT -= dt;
    else acc += dt;
    while (acc >= interval && phase === 'play') {
      acc -= interval;
      prev = curr;
      const events = step(game);
      for (const e of events) {
        if (e.type === 'eat') {
          collectFx(e.food);
          sound.collect(e.food.bonus, theme.id);
          floatText(`+${e.food.value}`, toWorld(e.food, new THREE.Vector3()));
          const pill = $('.score-pill');
          pill.classList.remove('bump');
          void pill.offsetWidth;
          pill.classList.add('bump');
          if (e.food.bonus) showCheer(theme.cheers[Math.floor(Math.random() * theme.cheers.length)]);
          updateScoreUI();
        }
        if (e.type === 'death' || e.type === 'win') onDeath();
      }
      if (phase === 'play') curr = snapshotOf(game);
    }
    a = prev;
    b = curr;
    alpha = phase === 'play' ? Math.min(1, acc / interval) : 1;
    food = game.food;
  } else if (phase === 'paused') {
    a = prev;
    b = curr;
    alpha = 1;
    moving = false;
    food = game.food;
    dt = 0;
  }

  if (phase === 'death') {
    death.t += rawDt;
    death.orbit = death.replaying ? 0 : death.orbit + rawDt * 0.22;
    if (!death.replaying && !death.ended) {
      // Embestida en vivo y efecto de choque; luego arranca la repetición sola.
      death.liveT += rawDt;
      const k = Math.min(1, death.liveT / 0.16);
      a = death.snaps[death.snaps.length - 1];
      b = death.lunge;
      alpha = k * 0.45;
      dead = k >= 1;
      deadT = death.liveT - 0.16;
      if (k >= 1 && !death.impactShown) {
        death.impactShown = true;
        impactFx(true);
        impactMarker.visible = true;
      }
      post.uniforms.uDeath.value = Math.min(1, post.uniforms.uDeath.value + rawDt * 3);
      if (death.liveT > 1.15) startReplay();
    } else if (death.replaying) {
      if (death.cut) {
        rig.snap = true;
        death.cut = false;
      }
      const prevRt = death.rt;
      const end = replayEnd();
      const remaining = end - death.rt;
      const scale = remaining < 3 ? 0.18 + (remaining / 3) * 0.3 : 0.55;
      death.rt = Math.min(end, death.rt + rawDt * death.tps * scale);
      // Comidas durante la repetición.
      const i0 = Math.floor(prevRt);
      const i1 = Math.floor(death.rt);
      for (let i = i0; i < i1 && i + 1 < death.snaps.length; i++) {
        const fa = death.snaps[i].food;
        const fb = death.snaps[i + 1].food;
        if (fa && (!fb || fa.id !== fb.id)) collectFx(fa);
      }
      const f = replayFrame();
      a = f.a;
      b = f.b;
      alpha = f.alpha;
      dt = rawDt * scale;
      $('#replayProgress').style.width = `${(death.rt / end) * 100}%`;
      if (death.rt >= end) finishReplay();
    } else {
      const f = { a: death.snaps[death.snaps.length - 1], b: death.lunge };
      a = f.a;
      b = f.b;
      alpha = 0.45;
      dead = true;
      deadT = death.t;
    }
    if (death.ended || (!death.replaying && dead)) {
      post.uniforms.uDeath.value += (0.4 - post.uniforms.uDeath.value) * Math.min(1, rawDt * 2);
    }
    food = b.food;
    if (!death.replaying && dead) moving = false;
  }

  // Personaje.
  const points = interpPoints(a, b, alpha);
  headWorld.copy(points[0]);
  const foodW = foodWorld(food);
  world.collectibles.set(foodW);
  let nearFood = 0;
  if (foodW) {
    lookTarget.set(foodW.wx, 0.6, foodW.wz);
    const d = Math.hypot(foodW.wx - headWorld.x, foodW.wz - headWorld.z);
    nearFood = Math.max(0, 1 - d / 2.2);
  } else lookTarget.copy(camera.position);
  world.character.update({ points, time, dt: phase === 'paused' ? 0 : dt, look: lookTarget, dead, deadT, moving, nearFood });
  world.collectibles.update(time, rawDt, headWorld);
  world.stage.update(time);
  world.thrower.update(phase === 'paused' ? 0 : rawDt, {
    active: phase === 'play' || phase === 'menu',
    snakeHead: headWorld,
    onBounce: (p, k) => {
      waves.spawn(p, { color: '#ffffff', size: 1.6 * k + 0.6, life: 0.4 });
      particles.emit(p, { count: Math.round(14 * k), colors: ['#d8f5c8', '#ffffff', '#7bc46a'], speed: 1.6, up: 1.6, life: 0.6, size: 0.14, gravity: 9 });
      sound.bounce(k);
    },
  });

  // Marcador de impacto.
  if (impactMarker.visible) {
    const s = 1 + Math.sin(time * 6) * 0.12;
    impactMarker.scale.set(s, 1, s);
    impactMarker.children[0].material.opacity = 0.6 + Math.sin(time * 6) * 0.3;
  }

  // Cámara.
  const heading = headingVec(b.dir || 'up');
  rig.update(rawDt, {
    phase: phase === 'paused' ? 'play' : phase,
    head: headWorld,
    heading,
    impact: death.impact,
    time,
    deathView: death.view,
    deathT: death.t,
    orbit: death.orbit,
    focus: deathFocus(),
  });
  if (shake > 0) {
    shake = Math.max(0, shake - rawDt);
    const s = shake * 0.5;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }

  // Efectos.
  waves.update(rawDt);
  const tanHalf = Math.tan(((camera.fov * Math.PI) / 180) / 2);
  particles.update(time, (renderer.domElement.height / 2) / tanHalf);
  post.uniforms.uFlash.value = Math.max(0, post.uniforms.uFlash.value - rawDt * 3);
  post.uniforms.uTime.value = time;
  updateFloaters(rawDt);

  post.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- Arranque ----------
buildWorld(theme.id);
new ResizeObserver(resize).observe(app);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
applyQuality();
setPhase('menu');
updateCamLabel();
rig.snap = true;
requestAnimationFrame(frame);

// Para pruebas automatizadas.
window.__snake = {
  get phase() {
    return phase;
  },
  get game() {
    return game;
  },
  get rig() {
    return rig;
  },
  get death() {
    return death;
  },
  startGame,
  selectView,
  post,
  renderer,
  get world() {
    return world;
  },
};
