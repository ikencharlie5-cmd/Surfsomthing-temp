// Shared helper: let the bot play one stage of a map using the real physics.
import { Brush } from '../src/physics/brush.js';
import { World, Trigger } from '../src/physics/world.js';
import { Movement, Player, HULL } from '../src/physics/movement.js';
import { SurfBot } from '../src/sim/bot.js';

export function buildWorld(map) {
  const w = new World();
  for (const b of map.brushes) w.add(new Brush(b.points, b));
  return w;
}

export function playStage(map, world, stageIndex, botOpts = {}, maxTicks = 100 * 90) {
  const st = map.stages[stageIndex];
  const mv = new Movement(world);
  const p = new Player();
  p.teleport(st.pos);
  const bot = new SurfBot(st.line, botOpts);
  const goal = map.triggers.find((t) => (t.type === 'teleport' || t.type === 'end') && t.stage === stageIndex);
  const gt = new Trigger(goal.min, goal.max);
  let maxSpeed = 0;
  for (let i = 0; i < maxTicks; i++) {
    const cmd = bot.command(p);
    mv.tick(p, cmd, 1 / 100);
    maxSpeed = Math.max(maxSpeed, p.vel.lenH());
    if (gt.touches(p.pos, HULL)) return { ok: true, ticks: i, maxSpeed, pos: p.pos };
    if (p.pos.y < st.resetY) return { ok: false, reason: 'fell', ticks: i, idx: bot.idx, of: st.line.length, pos: p.pos, maxSpeed };
  }
  return { ok: false, reason: 'timeout', idx: bot.idx, of: st.line.length, pos: p.pos, maxSpeed };
}
