// Shared helper: let the bot play parts of a map using the real physics.
import { Brush } from '../src/physics/brush.js';
import { World, Trigger } from '../src/physics/world.js';
import { Movement, Player, HULL } from '../src/physics/movement.js';
import { SurfBot } from '../src/sim/bot.js';

export function buildWorld(map) {
  const w = new World();
  for (const b of map.brushes) w.add(new Brush(b.points, b));
  return w;
}

/**
 * Play from checkpoint `cp` until the next checkpoint is reached (or the
 * finish, for the last one). With opts.full, play from the start to the
 * finish without stopping. opts.skip = [from, to] takes a fork's fast line.
 */
export function playSection(map, world, cp, opts = {}) {
  const c = map.checkpoints[cp];
  const next = opts.full ? null : map.checkpoints[cp + 1];
  const mv = new Movement(world, map.cvars || {});
  const p = new Player();
  p.teleport(c.pos);
  const line = map.line;
  const bot = new SurfBot(line, { offset: opts.offset ?? 0.45, start: c.idx, walk: !!c.start, skip: opts.skip, forks: opts.skip ? [] : map.forks || [] });
  const end = map.triggers.find((t) => t.type === 'end');
  const gt = new Trigger(end.min, end.max);
  let maxSpeed = 0, speedAtFork = null;
  const maxTicks = opts.maxTicks ?? 100 * (opts.full ? 400 : 120);
  for (let i = 0; i < maxTicks; i++) {
    mv.tick(p, bot.command(p), 1 / 100);
    const sp = p.vel.lenH();
    maxSpeed = Math.max(maxSpeed, sp);
    if (opts.skip && speedAtFork == null && bot.idx >= opts.skip[0]) speedAtFork = sp;
    if (next && bot.idx >= next.idx + 1 && p.surfing) return { ok: true, ticks: i, maxSpeed, endSpeed: sp, speedAtFork };
    if (gt.touches(p.pos, HULL)) return { ok: true, ticks: i, maxSpeed, endSpeed: sp, speedAtFork, finished: true };
    const lp = line[bot.idx];
    if (p.pos.y < lp.p[1] - lp.height - 1500) return { ok: false, reason: 'fell', ticks: i, idx: bot.idx, of: line.length, pos: p.pos, maxSpeed, speedAtFork };
  }
  return { ok: false, reason: 'timeout', idx: bot.idx, of: line.length, pos: p.pos, maxSpeed };
}
