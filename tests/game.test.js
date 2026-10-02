import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, queueDir, deathLunge, HISTORY_TICKS, BONUS_EVERY } from '../src/game.js';

const fixedRng = () => 0;

test('avanza hacia arriba y conserva el largo', () => {
  const g = createGame({ rng: fixedRng });
  const head = { ...g.snake[0] };
  g.food = { x: 0, z: 0, value: 1, id: 99 };
  step(g);
  assert.deepEqual(g.snake[0], { x: head.x, z: head.z - 1 });
  assert.equal(g.snake.length, 4);
});

test('comer suma puntos, crece y genera comida en celda libre', () => {
  const g = createGame({ rng: fixedRng });
  const h = g.snake[0];
  g.food = { x: h.x, z: h.z - 1, value: 1, bonus: false, id: 50 };
  const ev = step(g);
  assert.equal(ev[0].type, 'eat');
  assert.equal(g.snake.length, 5);
  assert.equal(g.score, 1);
  assert.ok(g.food);
  assert.ok(!g.snake.some((c) => c.x === g.food.x && c.z === g.food.z));
});

test('cada quinta comida es bonus de 3 puntos', () => {
  const g = createGame({ rng: fixedRng });
  g.eaten = BONUS_EVERY - 1;
  const h = g.snake[0];
  g.food = { x: h.x, z: h.z - 1, value: 1, id: 7 };
  step(g);
  assert.equal(g.food.bonus, false);
  g.eaten = BONUS_EVERY - 2;
  const h2 = g.snake[0];
  g.food = { x: h2.x, z: h2.z - 1, value: 1, id: 8 };
  step(g);
  assert.equal(g.food.bonus, true);
  assert.equal(g.food.value, 3);
});

test('no permite girar en reversa ni repetir dirección', () => {
  const g = createGame();
  assert.equal(queueDir(g, 'down'), false);
  assert.equal(queueDir(g, 'up'), false);
  assert.equal(queueDir(g, 'left'), true);
  assert.equal(queueDir(g, 'right'), false);
  assert.equal(queueDir(g, 'down'), true);
});

test('chocar contra el borde termina la partida con punto de impacto en el límite', () => {
  const g = createGame({ rng: fixedRng });
  g.food = { x: 0, z: 22, value: 1, id: 1 };
  let ev = [];
  for (let i = 0; i < 40 && g.alive; i++) ev = step(g);
  assert.equal(g.alive, false);
  assert.equal(g.death.cause, 'wall');
  assert.equal(g.death.cell.z, -1);
  assert.equal(g.death.impact.z, -0.5);
  assert.equal(ev.at(-1).type, 'death');
});

test('chocar con el propio cuerpo termina la partida', () => {
  const g = createGame({ rng: fixedRng, length: 6 });
  g.food = { x: 0, z: 0, value: 1, id: 1 };
  queueDir(g, 'left');
  step(g);
  queueDir(g, 'down');
  step(g);
  queueDir(g, 'right');
  step(g);
  assert.equal(g.alive, false);
  assert.equal(g.death.cause, 'self');
});

test('puede entrar en la celda que deja la cola', () => {
  const g = createGame({ rng: fixedRng, length: 4 });
  g.food = { x: 0, z: 0, value: 1, id: 1 };
  queueDir(g, 'left');
  step(g);
  queueDir(g, 'down');
  step(g);
  queueDir(g, 'right');
  step(g);
  assert.equal(g.alive, true);
});

test('el historial guarda copias acotadas y la embestida apunta al choque', () => {
  const g = createGame({ rng: fixedRng });
  g.food = { x: 0, z: 22, value: 1, id: 1 };
  for (let i = 0; i < 60 && g.alive; i++) step(g);
  assert.ok(g.history.length <= HISTORY_TICKS);
  const last = g.history.at(-1);
  assert.deepEqual(last.snake, g.snake);
  assert.notEqual(last.snake, g.snake);
  const lunge = deathLunge(g);
  assert.deepEqual(lunge.snake[0], g.death.cell);
  assert.equal(lunge.snake.length, g.snake.length);
});
