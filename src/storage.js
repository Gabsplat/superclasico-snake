const KEY = 'superclasico-snake:v1';

const DEFAULTS = { mode: 'boca', view: 'cancha', deathView: 'auto', sound: true, fx: 'high', best: { boca: 0, river: 0 } };

export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...raw, best: { ...DEFAULTS.best, ...(raw.best || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function savePrefs(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Modo privado sin almacenamiento: se sigue jugando sin guardar.
  }
}
