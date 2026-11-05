// Find seeds for generated maps that the surf bot can finish (full run and
// every fast line). Usage: node tools/seed-search.mjs [themeId ...]
import { generatedMap } from '../src/maps/themes.js';
import { TIERS } from '../src/maps/generator.js';
import { buildWorld, playSection } from '../test/simulate.mjs';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/maps/index.js', import.meta.url), 'utf8');
const re = /G\('(\w+)', '(\w+)', '([\w-]+)', '([^']+)', '((?:[^'\\]|\\.)*)', (\d+)\)/g;
const only = process.argv.slice(2);
const courseLen = (m) => m.line.reduce((s, e, i) => i ? s + Math.hypot(e.p[0] - m.line[i - 1].p[0], e.p[2] - m.line[i - 1].p[2]) : 0, 0);
let match;
while ((match = re.exec(src))) {
  const [, theme, tier, id, name, desc, seedStr] = match;
  if (only.length && !only.includes(theme)) continue;
  const base = Number(seedStr);
  let found = null;
  const tries = Number(process.env.TRIES || 25);
  for (let k = 0; k < tries && !found; k++) {
    const seed = base + k * 7919;
    const m = generatedMap(theme, tier, { id, name, description: desc, seed });
    const w = buildWorld(m);
    const r = playSection(m, w, 0, { full: true });
    if (!r.ok || !r.finished || r.maxSpeed >= 3400) continue;
    let forksOk = true;
    for (const f of m.forks || []) {
      const rf = playSection(m, w, 0, { full: true, skip: [f.from, f.to] });
      // the fast line must really be clearable at the speed riders arrive with
      if (!rf.ok) { forksOk = false; break; }
    }
    if (forksOk) found = { seed, t: r.ticks / 100, max: r.maxSpeed, len: courseLen(m) };
  }
  console.log(found ? `${id} ${base} -> ${found.seed}  ${found.t.toFixed(1)}s  max ${found.max.toFixed(0)}  len ${(found.len / 1000).toFixed(0)}k` : `${id} ${base} -> NONE`);
}
