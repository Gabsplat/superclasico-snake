// Recorre una partida: menú → juego → giros → muerte → replay, en el modo y tamaño pedidos.
import { chromium } from 'playwright-core';
const [url, w, h, mode, outPrefix] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript((m) => localStorage.setItem('superclasico-snake:v1', JSON.stringify({ mode: m, fx: 'high' })), mode);
await page.goto(url);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outPrefix}-1menu.png` });
await page.tap('#playBtn');
await page.waitForTimeout(400);
// Gira con el pad táctil y verifica que la dirección cambió.
const before = await page.evaluate(() => window.__snake.game.dir);
await page.tap('#pad [data-dir=left]');
await page.waitForTimeout(700);
const after = await page.evaluate(() => { const g = window.__snake.game; return g.queue.length ? g.queue.at(-1) : g.dir; });
// Forzar una comida delante para verificar crecimiento.
const grow = await page.evaluate(async () => {
  const g = window.__snake.game;
  const len0 = g.snake.length;
  const h = g.snake[0];
  while (g.queue.length) await new Promise((r) => setTimeout(r, 50));
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[g.dir];
  g.food = { x: h.x + d[0] * 2, z: h.z + d[1] * 2, value: 1, bonus: false, id: 999 };
  const t0 = performance.now();
  while (g.score === 0 && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  return { len0, len1: g.snake.length, score: g.score };
});
await page.screenshot({ path: `${outPrefix}-2play.png` });
// Esperar a chocar contra el borde.
await page.waitForFunction(() => window.__snake.phase === 'death', null, { timeout: 90000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${outPrefix}-3impact.png` });
await page.waitForFunction(() => window.__snake.death.replaying, null, { timeout: 40000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outPrefix}-4replay.png` });
const deathBtns = await page.evaluate(() =>
  ['#restartBtn', '#replayBtn', '#deathCamBtn', '#camBtn'].map((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return [s, r.width > 0 && r.bottom <= innerHeight && r.top >= 0];
  }),
);
await page.tap('#skipBtn');
await page.waitForTimeout(300);
await page.tap('#deathCamBtn');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outPrefix}-5ended.png` });
const state = await page.evaluate(() => ({
  phase: window.__snake.phase,
  ended: window.__snake.death.ended,
  view: window.__snake.death.view,
  cause: window.__snake.game.death?.cause,
  best: JSON.parse(localStorage.getItem('superclasico-snake:v1')).best,
}));
await page.tap('#replayBtn');
await page.waitForTimeout(300);
const replaying = await page.evaluate(() => window.__snake.death.replaying);
await page.tap('#restartBtn');
await page.waitForTimeout(300);
const restarted = await page.evaluate(() => window.__snake.phase);
// Choque con el propio cuerpo: víbora larga en línea y tres giros.
const selfHit = await page.evaluate(async () => {
  const g = window.__snake.game;
  g.snake = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: 7, z: 10 + i }));
  g.dir = 'up';
  g.queue = [];
  g.food = { x: 0, z: 0, value: 1, id: 555 };
  g.queue.push('left', 'down', 'right');
  const t0 = performance.now();
  while (window.__snake.phase !== 'death' && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  return { phase: window.__snake.phase, cause: g.death?.cause };
});
console.log(JSON.stringify({ before, after, grow, deathBtns, state, replaying, restarted, selfHit, errors }, null, 1));
await browser.close();
