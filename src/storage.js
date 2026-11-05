// localStorage persistence: settings, leaderboards, PB ghosts.
const NS = 'slipstream.v1.';

export const DEFAULT_SETTINGS = {
  sensitivity: 2.0,
  fov: 100,
  invertY: false,
  rawInput: true,
  speedFov: true,
  quality: 'high',
  renderScale: 1,
  particles: true,
  showFps: false,
  ghost: true,
  autobhop: true,
  showKeys: true,
  hints: true,
  airaccelerate: 150,
  volume: 0.8,
  music: 0.55,
  sfx: 0.8,
  keys: {
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
    jump: 'Space', restart: 'KeyR', stage: 'KeyT', ghost: 'KeyG',
  },
};

function read(key, fallback) {
  try {
    const v = localStorage.getItem(NS + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; } catch { return false; }
}

export function loadSettings() {
  const s = read('settings', {});
  return { ...DEFAULT_SETTINGS, ...s, keys: { ...DEFAULT_SETTINGS.keys, ...(s.keys || {}) } };
}
export function saveSettings(s) { write('settings', s); }

/** @returns {Array<{time:number, date:number, splits:number[]}>} best first */
export function getBoard(mapId) { return read('lb.' + mapId, []); }

/** Insert a time; returns { rank (1-based or 0 if not top 10), pb: boolean } */
export function submitTime(mapId, time, splits) {
  const board = getBoard(mapId);
  const prevBest = board[0]?.time ?? Infinity;
  const entry = { time, date: Date.now(), splits };
  board.push(entry);
  board.sort((a, b) => a.time - b.time);
  const top = board.slice(0, 10);
  write('lb.' + mapId, top);
  const rank = top.indexOf(entry) + 1;
  return { rank, pb: time < prevBest, prevBest: isFinite(prevBest) ? prevBest : null };
}
export function clearBoard(mapId) {
  try { localStorage.removeItem(NS + 'lb.' + mapId); localStorage.removeItem(NS + 'ghost.' + mapId); } catch { /* ignore */ }
}

export function saveGhost(mapId, frames) {
  // frames: Float32Array [x,y,z,yaw, ...] sampled every GHOST_STEP ticks
  const bytes = new Uint8Array(frames.buffer, frames.byteOffset, frames.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return write('ghost.' + mapId, btoa(bin));
}
export function loadGhost(mapId) {
  const b64 = read('ghost.' + mapId, null);
  if (!b64) return null;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  } catch { return null; }
}

export function getEndlessBest() { return read('endless.best', { score: 0, distance: 0, seed: null }); }
export function setEndlessBest(v) { write('endless.best', v); }
