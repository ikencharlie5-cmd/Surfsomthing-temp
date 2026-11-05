import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, minPlausibleMs, online } from '../src/online.js';
import { MAPS } from '../src/maps/index.js';

test('online is off until configured', () => { assert.equal(online.enabled, false); });

test('player names are cleaned and capped', () => {
  assert.equal(cleanName('  <b>Charlie</b>!!  '), 'bCharlie/b!!'.replace('/', ''));
  assert.equal(cleanName('a'.repeat(40)).length, 16);
});

test('anti-cheat minimum time is below every bot finish', async () => {
  const { buildWorld, playSection } = await import('./simulate.mjs');
  for (const m of MAPS.slice(0, 6)) {
    const r = playSection(m, buildWorld(m), 0, { full: true });
    assert.ok(r.ticks * 10 > minPlausibleMs(m), `${m.id}: bot ${r.ticks * 10}ms vs min ${minPlausibleMs(m)}ms`);
  }
});
