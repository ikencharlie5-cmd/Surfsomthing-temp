// Global leaderboards via Supabase's REST API (plain fetch, no SDK).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const online = {
  get enabled() { return !!(SUPABASE_URL && SUPABASE_ANON_KEY); },
};

function headers(extra = {}) {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', ...extra };
}
const base = () => `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/scores`;

async function req(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.status === 204 ? null : res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Fastest plausible time for a map: course length at the 3500 u/s speed cap. */
export function minPlausibleMs(map) {
  let len = 0;
  for (let i = 1; i < map.line.length; i++) {
    const a = map.line[i - 1].p, b = map.line[i].p;
    len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return Math.floor((len / 3500) * 1000 * 0.85);
}

export function cleanName(name) {
  return String(name || '').replace(/[^\w .\-!?]/g, '').trim().slice(0, 16);
}

/** Submit a finished run. Returns { ok, rank } or { ok:false, error }. */
export async function submitScore(map, { player, timeMs, topSpeed, combo }) {
  if (!online.enabled) return { ok: false, error: 'offline' };
  const name = cleanName(player);
  if (!name) return { ok: false, error: 'no-name' };
  if (timeMs < minPlausibleMs(map)) return { ok: false, error: 'implausible' };
  try {
    await req(base(), {
      method: 'POST', headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ map_id: map.id, player: name, time_ms: Math.round(timeMs), top_speed: Math.round(topSpeed || 0), combo: Math.round(combo || 0) }),
    });
    const rank = await globalRank(map.id, timeMs, name);
    return { ok: true, rank };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/** Best time per player, fastest first. */
export async function topScores(mapId, limit = 10) {
  if (!online.enabled) return null;
  const rows = await req(`${base()}?map_id=eq.${encodeURIComponent(mapId)}&select=player,time_ms,top_speed,combo,created_at&order=time_ms.asc&limit=500`, { headers: headers() });
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = r.player.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** 1-based rank among players' best times. */
export async function globalRank(mapId, timeMs, player) {
  const rows = await req(`${base()}?map_id=eq.${encodeURIComponent(mapId)}&time_ms=lt.${Math.round(timeMs)}&select=player&limit=5000`, { headers: headers() });
  const faster = new Set(rows.map((r) => r.player.toLowerCase()));
  faster.delete(String(player).toLowerCase());
  return faster.size + 1;
}
