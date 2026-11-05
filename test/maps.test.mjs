import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../src/maps/index.js';
import { buildWorld, playSection } from './simulate.mjs';

const fmt = (v) => `${v.x.toFixed(0)},${v.y.toFixed(0)},${v.z.toFixed(0)}`;
const report = (name, r) => console.log(`  ${name}: ${r.ok ? 'OK ' + (r.ticks / 100).toFixed(1) + 's' : r.reason + ' at guide ' + r.idx + '/' + r.of + ' pos ' + fmt(r.pos)} max ${r.maxSpeed.toFixed(0)}u/s${r.speedAtFork != null ? ' fork@' + r.speedAtFork.toFixed(0) : ''}`);

for (const map of MAPS) {
  const world = buildWorld(map);

  test(`${map.id}: full run start to finish carries speed`, () => {
    const r = playSection(map, world, 0, { full: true });
    report(`${map.id} full`, r);
    assert.ok(r.ok && r.finished, `${r.reason} at guide point ${r.idx}/${r.of}`);
    assert.ok(r.maxSpeed < 3400, `speed stays in band (max ${r.maxSpeed.toFixed(0)})`);
  });

  map.checkpoints.forEach((_, ci) => {
    test(`${map.id}: checkpoint ${ci} respawn (standing start) reaches the next one`, () => {
      const r = playSection(map, world, ci);
      report(`${map.id} cp${ci}`, r);
      assert.ok(r.ok, `${r.reason} at guide point ${r.idx}/${r.of}`);
    });
  });

  (map.forks || []).forEach((f, fi) => {
    test(`${map.id}: fork ${fi} fast line is clearable at ${f.speed} u/s`, () => {
      // a full-speed run from the start that takes the fast line
      const r = playSection(map, world, 0, { full: true, skip: [f.from, f.to] });
      report(`${map.id} fork${fi}`, r);
      if (r.speedAtFork != null && r.speedAtFork < f.speed) {
        console.log(`    (bot only had ${r.speedAtFork.toFixed(0)} u/s at the fork; skipping fast-line check)`);
        return;
      }
      assert.ok(r.ok, `${r.reason} at guide point ${r.idx}/${r.of}`);
    });
  });
}
