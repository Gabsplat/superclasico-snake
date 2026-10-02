import * as THREE from 'three';

export const VIEWS = ['cancha', 'aerea', 'cerca', 'tribuna'];
export const DEATH_VIEWS = ['auto', ...VIEWS];
export const VIEW_LABELS = { auto: 'Auto', cancha: 'Cancha', aerea: 'Aérea', cerca: 'Cerca', tribuna: 'Tribuna' };

const DEG = Math.PI / 180;
const tmp = new THREE.Vector3();

export class CameraRig {
  constructor(camera, half) {
    this.camera = camera;
    this.half = half; // {x, z} medio tamaño de la grilla
    this.view = 'cancha';
    this.user = { az: 0, el: 0, zoom: 1 };
    this.pos = new THREE.Vector3(0, 30, 20);
    this.target = new THREE.Vector3();
    this.size = { w: 1, h: 1 };
    this.rect = { x: 0, y: 0, w: 1, h: 1 };
    this.fitCache = new Map();
    this.follow = new THREE.Vector3();
    this.snap = true;
  }

  setLayout(w, h, rect) {
    this.size = { w, h };
    this.rect = rect;
    this.fitCache.clear();
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.camera.updateProjectionMatrix();
  }

  get portrait() {
    return this.rect.w < this.rect.h * 1.05;
  }

  baseAz() {
    return this.portrait ? 0 : Math.PI / 2;
  }

  setView(v) {
    this.view = v;
    this.resetUser();
  }

  resetUser() {
    this.user.az = 0;
    this.user.el = 0;
    this.user.zoom = 1;
  }

  rotate(dx, dy) {
    this.user.az -= dx * 0.008;
    this.user.el = THREE.MathUtils.clamp(this.user.el + dy * 0.006, -1.2, 1.2);
  }

  zoom(f) {
    this.user.zoom = THREE.MathUtils.clamp(this.user.zoom * f, 0.22, 2.4);
  }

  // Distancia y corrimiento del objetivo para que la cancha llene el rectángulo de juego.
  fit(el, az, margin) {
    const key = `${el.toFixed(3)}|${az.toFixed(3)}|${margin}`;
    if (this.fitCache.has(key)) return this.fitCache.get(key);
    const cam = this.camera;
    const corners = [];
    const hx = this.half.x + margin;
    const hz = this.half.z + margin;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push(new THREE.Vector3(sx * hx, 0, sz * hz), new THREE.Vector3(sx * hx, 0.6, sz * hz));
    const tanHalf = Math.tan((cam.fov * DEG) / 2);
    const scale = this.size.h / 2 / tanHalf;
    const target = new THREE.Vector3();
    const fwd = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const m = new THREE.Matrix4();
    const project = (dist) => {
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      m.copy(cam.matrixWorldInverse);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of corners) {
        tmp.copy(c).applyMatrix4(m);
        if (tmp.z > -0.1) return null;
        const px = (tmp.x / -tmp.z) * scale;
        const py = (tmp.y / -tmp.z) * scale;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
      return { minX, maxX, minY, maxY };
    };
    let dist = 30;
    for (let iter = 0; iter < 4; iter++) {
      let lo = 3;
      let hi = 200;
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2;
        const b = project(mid);
        const ok = b && b.maxX - b.minX <= this.rect.w && b.maxY - b.minY <= this.rect.h;
        if (ok) hi = mid;
        else lo = mid;
      }
      dist = hi;
      const b = project(dist);
      const cy = (b.minY + b.maxY) / 2;
      const ppu = (scale / dist) * Math.sin(el);
      target.addScaledVector(fwd, cy / Math.max(ppu, 0.01));
    }
    const res = { dist, target: target.clone() };
    this.fitCache.set(key, res);
    return res;
  }

  // ctx: { phase: 'menu'|'play'|'death', head, heading, impact, time, deathView, deathT }
  desired(ctx) {
    const u = this.user;
    const view = ctx.phase === 'death' ? ctx.deathView : ctx.phase === 'menu' ? 'menu' : this.view;
    let el;
    let az;
    let dist;
    const target = new THREE.Vector3();
    switch (view) {
      case 'menu': {
        az = ctx.time * 0.22 + u.az;
        el = 24 * DEG + u.el;
        dist = 6.2 * u.zoom;
        target.copy(ctx.head).setY(0.45);
        break;
      }
      case 'auto': {
        // Durante la repetición acompaña a la cabeza desde adelante y al costado;
        // al final gira lento alrededor del punto de impacto.
        const h = ctx.heading;
        const k = ctx.focus ?? 1;
        az = Math.atan2(h.x, h.z) + 0.75 + (ctx.orbit ?? 0) + u.az;
        el = (30 + k * 6) * DEG + u.el;
        dist = THREE.MathUtils.lerp(6.5, 4.4, k) * u.zoom;
        target.copy(ctx.head).lerp(ctx.impact, k).setY(0.35);
        break;
      }
      case 'cerca': {
        const h = ctx.heading;
        az = Math.atan2(-h.x, -h.z) + u.az;
        el = 26 * DEG + u.el;
        dist = 5.2 * u.zoom;
        target.copy(ctx.head).addScaledVector(h, 1.4).setY(0.4);
        break;
      }
      case 'tribuna': {
        az = Math.PI / 2 + u.az;
        el = 14 * DEG + u.el;
        dist = (this.portrait ? 13.5 : 12) * u.zoom;
        this.follow.lerp(tmp.set(ctx.head.x * 0.35, 1.4, ctx.head.z * 0.7), 0.05);
        target.copy(this.follow);
        break;
      }
      case 'aerea':
      case 'cancha':
      default: {
        const aerial = view === 'aerea';
        az = this.baseAz() + u.az;
        el = (aerial ? 82 : 56) * DEG + u.el;
        const f = this.fit(el, az, aerial ? 1.6 : 0.35);
        dist = f.dist * u.zoom;
        target.copy(f.target);
        if (u.zoom < 0.95) target.lerp(tmp.copy(ctx.head).setY(0), Math.min(1, (1 - u.zoom) * 1.6));
        break;
      }
    }
    el = THREE.MathUtils.clamp(el, 4 * DEG, 89 * DEG);
    const pos = new THREE.Vector3(
      target.x + dist * Math.cos(el) * Math.sin(az),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(el) * Math.cos(az),
    );
    return { pos, target, az };
  }

  update(dt, ctx) {
    const d = this.desired(ctx);
    const k = this.snap ? 1 : 1 - Math.exp(-dt * (ctx.phase === 'play' && this.view === 'cerca' ? 5 : 4.5));
    this.snap = false;
    this.pos.lerp(d.pos, k);
    this.target.lerp(d.target, k);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    this.lastAz = d.az;
  }

  // Ángulo que usan los controles: en "Cerca" sigue el rumbo; si no, la cámara actual.
  controlAz(heading) {
    if (this.view === 'cerca') return Math.atan2(-heading.x, -heading.z) + this.user.az;
    // Ángulo de destino de la vista (estable aunque la cámara siga en transición).
    if (this.view === 'tribuna') return Math.PI / 2 + this.user.az;
    return this.baseAz() + this.user.az;
  }
}

export function screenToGrid(screenDir, az) {
  const f = { x: -Math.sin(az), z: -Math.cos(az) };
  const r = { x: Math.cos(az), z: -Math.sin(az) };
  const v = screenDir === 'up' ? f : screenDir === 'down' ? { x: -f.x, z: -f.z } : screenDir === 'right' ? r : { x: -r.x, z: -r.z };
  if (Math.abs(v.x) > Math.abs(v.z)) return v.x > 0 ? 'right' : 'left';
  return v.z > 0 ? 'down' : 'up';
}
