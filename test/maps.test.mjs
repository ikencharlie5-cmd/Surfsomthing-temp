import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../src/maps/index.js';
import { buildWorld, playStage } from './simulate.mjs';

for (const map of MAPS) {
  const world = buildWorld(map);
  map.stages.forEach((_, si) => {
    for (const offset of [0.4, 0.55]) {
      test(`${map.id} stage ${si + 1} is completable (bot offset ${offset})`, () => {
        const r = playStage(map, world, si, { offset });
        const fmt = (v) => `${v.x.toFixed(0)},${v.y.toFixed(0)},${v.z.toFixed(0)}`;
        console.log(`  ${map.id} s${si + 1} @${offset}: ${r.ok ? 'OK ' + (r.ticks / 100).toFixed(2) + 's' : r.reason + ' at guide ' + r.idx + '/' + r.of + ' pos ' + fmt(r.pos)} max ${r.maxSpeed.toFixed(0)}u/s`);
        assert.ok(r.ok, `${r.reason} at guide point ${r.idx}/${r.of}`);
      });
    }
  });
}
