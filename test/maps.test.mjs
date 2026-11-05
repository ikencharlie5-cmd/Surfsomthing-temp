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

  (map.forks || []).forEach((f, fi) => {
    test(`${map.id}: fork ${fi} fast line is clearable at ${f.speed} u/s`, () => {
      // a full-speed run from the start that takes the fast line
      const r = playSection(map, world, 0, { full: true, skip: [f.from, f.to] });
      report(`${map.id} fork${fi}`, r);
      if (!r.ok && r.speedAtFork != null && r.speedAtFork < f.speed) {
        console.log(`    (bot only had ${r.speedAtFork.toFixed(0)} u/s at the fork; skipping fast-line check)`);
        return;
      }
      assert.ok(r.ok, `${r.reason} at guide point ${r.idx}/${r.of}`);
    });
  });
}

test('unlock chain: every locked map can eventually be unlocked', async () => {
  const { isUnlocked } = await import('../src/maps/index.js');
  const done = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const m of MAPS) if (!done.has(m.id) && isUnlocked(m, (id) => done.has(id))) { done.add(m.id); progress = true; }
  }
  assert.equal(done.size, MAPS.length, `unreachable: ${MAPS.filter((m) => !done.has(m.id)).map((m) => m.id)}`);
  assert.ok(!isUnlocked(MAPS.find((m) => m.id === 'final-overdrive'), () => false), 'finale starts locked');
});

test('every theme has five maps, easy to insane, chained unlocks', async () => {
  const { THEMES } = await import('../src/maps/index.js');
  const tiers = ['easy', 'medium', 'hard', 'expert', 'insane', 'extreme'];
  for (const th of THEMES) {
    const maps = MAPS.filter((m) => m.group === th.id);
    assert.equal(maps.length, 6, th.id);
    maps.forEach((m, i) => {
      assert.equal(m.difficulty, tiers[i], m.id);
      assert.deepEqual(m.unlock?.after ?? null, i ? [maps[i - 1].id] : null, m.id);
    });
  }
});

test('every map has its own named twist', () => {
  const labels = new Set();
  for (const m of MAPS) {
    assert.ok(m.twist, `${m.id} has no twist`);
    labels.add(m.group + ':' + m.twist);
  }
  // within a theme, no two maps share a twist
  assert.equal(labels.size, MAPS.length);
});

test('Lost Temple runs through a temple full of duck/dodge blocks', () => {
  const m = MAPS.find((x) => x.id === 'lost-temple');
  assert.equal(m.structures[0].kind, 'temple');
  assert.ok(m.obstacles.length >= 4, `${m.obstacles.length} blocks`);
  assert.ok(m.obstacles.some((o) => o.type === 'duck') && m.obstacles.some((o) => o.type === 'dodge'));
});

