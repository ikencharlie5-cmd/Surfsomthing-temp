import test from 'node:test';
import assert from 'node:assert/strict';
import { EndlessTrack } from '../src/maps/endless.js';
import { Brush } from '../src/physics/brush.js';
import { World } from '../src/physics/world.js';
import { Movement, Player } from '../src/physics/movement.js';
import { SurfBot } from '../src/sim/bot.js';

for (const seed of ['alpha', 'neon', '12345', 'slipstream', 'zz']) {
  test(`endless seed "${seed}": bot survives 20 pieces`, () => {
    const t = new EndlessTrack(seed);
    const w = new World();
    const add = (p) => p.brushes.forEach((b) => w.add(new Brush(b.points, b)));
    add(t.begin());
    for (let i = 0; i < 45; i++) add(t.next());
    const mv = new Movement(w);
    const p = new Player();
    p.teleport(t.spawn.pos);
    const bot = new SurfBot(t.line, { offset: 0.45 });
    let piece = 0;
    for (let i = 0; i < 100 * 60 * 6; i++) {
      mv.tick(p, bot.command(p), 0.01);
      const lp = t.line[bot.idx];
      while (piece + 1 < t.pieces.length && bot.idx >= t.pieces[piece + 1].lineFrom + 1) piece++;
      if (piece >= 20) break;
      if (p.pos.y < lp.p[1] - 2500) break;
    }
    console.log(`  seed ${seed}: reached piece ${piece}, speed ${p.vel.len().toFixed(0)}`);
    assert.ok(piece >= 20, `fell at piece ${piece}`);
  });
}
