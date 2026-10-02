// Lógica pura del Snake: sin Three.js ni DOM, para poder testearla con node --test.

export const GRID_W = 15;
export const GRID_H = 23;
export const HISTORY_TICKS = 40;
export const BONUS_EVERY = 5;

export const DIRS = {
  up: { x: 0, z: -1 },
  down: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
};

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function createGame({ w = GRID_W, h = GRID_H, rng = Math.random, length = 4 } = {}) {
  const cx = Math.floor(w / 2);
  const cz = Math.floor(h / 2) + 2;
  const snake = [];
  for (let i = 0; i < length; i++) snake.push({ x: cx, z: cz + i });
  const state = {
    w,
    h,
    rng,
    snake,
    dir: 'up',
    queue: [],
    grow: 0,
    score: 0,
    eaten: 0,
    tick: 0,
    alive: true,
    won: false,
    death: null,
    food: null,
    foodSeq: 0,
    history: [],
  };
  state.food = spawnFood(state);
  record(state);
  return state;
}

export function ticksPerSecond(state) {
  return Math.min(11.5, 6.2 + state.eaten * 0.14);
}

export function lastQueuedDir(state) {
  return state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
}

export function queueDir(state, dir) {
  if (!state.alive || !DIRS[dir]) return false;
  const last = lastQueuedDir(state);
  if (dir === last || dir === OPPOSITE[last]) return false;
  if (state.queue.length >= 3) return false;
  state.queue.push(dir);
  return true;
}

export function isOccupied(state, x, z) {
  return state.snake.some((c) => c.x === x && c.z === z);
}

export function spawnFood(state) {
  const free = [];
  const head = state.snake[0];
  for (let z = 0; z < state.h; z++) {
    for (let x = 0; x < state.w; x++) {
      if (!isOccupied(state, x, z)) free.push({ x, z });
    }
  }
  if (!free.length) return null;
  // Evita aparecer pegado a la cabeza si hay alternativas.
  const far = free.filter((c) => Math.abs(c.x - head.x) + Math.abs(c.z - head.z) >= 3);
  const pool = far.length ? far : free;
  const cell = pool[Math.floor(state.rng() * pool.length) % pool.length];
  const bonus = (state.eaten + 1) % BONUS_EVERY === 0;
  state.foodSeq += 1;
  return { x: cell.x, z: cell.z, bonus, value: bonus ? 3 : 1, id: state.foodSeq };
}

function snapshot(state) {
  return {
    tick: state.tick,
    snake: state.snake.map((c) => ({ x: c.x, z: c.z })),
    dir: state.dir,
    food: state.food ? { ...state.food } : null,
    score: state.score,
  };
}

function record(state) {
  state.history.push(snapshot(state));
  if (state.history.length > HISTORY_TICKS) state.history.shift();
}

// Avanza un paso. Devuelve una lista de eventos para efectos y sonido.
export function step(state) {
  if (!state.alive) return [];
  const events = [];
  if (state.queue.length) state.dir = state.queue.shift();
  const d = DIRS[state.dir];
  const head = state.snake[0];
  const next = { x: head.x + d.x, z: head.z + d.z };

  if (next.x < 0 || next.z < 0 || next.x >= state.w || next.z >= state.h) {
    return die(state, 'wall', next, events);
  }

  const eats = state.food && state.food.x === next.x && state.food.z === next.z;
  const tailMoves = state.grow === 0 && !eats;
  const body = tailMoves ? state.snake.slice(0, -1) : state.snake;
  if (body.some((c) => c.x === next.x && c.z === next.z)) {
    return die(state, 'self', next, events);
  }

  state.snake.unshift(next);
  if (eats) state.grow += 1;
  if (state.grow > 0) state.grow -= 1;
  else state.snake.pop();
  state.tick += 1;

  if (eats) {
    const food = state.food;
    state.score += food.value;
    state.eaten += 1;
    events.push({ type: 'eat', food, cell: next });
    state.food = spawnFood(state);
    if (!state.food) {
      state.alive = false;
      state.won = true;
      events.push({ type: 'win' });
    }
  }
  record(state);
  return events;
}

function die(state, cause, cell, events) {
  state.alive = false;
  const head = state.snake[0];
  // Punto de impacto en coordenadas de grilla (puede ser fraccional en el borde).
  const impact =
    cause === 'wall'
      ? { x: (head.x + cell.x) / 2, z: (head.z + cell.z) / 2 }
      : { x: cell.x, z: cell.z };
  state.death = { cause, cell, from: { x: head.x, z: head.z }, impact, dir: state.dir, tick: state.tick };
  events.push({ type: 'death', ...state.death });
  return events;
}

// Estado "embestida" para dibujar la cabeza entrando en la celda del choque.
export function deathLunge(state) {
  if (!state.death) return null;
  const snake = [{ ...state.death.cell }, ...state.snake.slice(0, -1).map((c) => ({ ...c }))];
  return { snake, dir: state.death.dir, food: state.food ? { ...state.food } : null, score: state.score };
}

export function cellToWorld(state, c) {
  return { x: c.x - (state.w - 1) / 2, z: c.z - (state.h - 1) / 2 };
}
