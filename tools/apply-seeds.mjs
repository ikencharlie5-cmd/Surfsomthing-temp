// Apply seed-search results ("id base -> seed ...") to src/maps/index.js
import fs from 'node:fs';
const file = new URL('../src/maps/index.js', import.meta.url);
let src = fs.readFileSync(file, 'utf8');
const lines = fs.readFileSync(0, 'utf8').split('\n');
let n = 0;
for (const l of lines) {
  const m = l.match(/^([\w-]+) (\d+) -> (\d+)/);
  if (!m) continue;
  const [, id, , seed] = m;
  const re = new RegExp(`(G\\('\\w+', '\\w+', '${id}', '(?:[^'\\\\]|\\\\.)*', '(?:[^'\\\\]|\\\\.)*', \\{.*?\\}, )(\\d+)\\)`);
  if (re.test(src)) { src = src.replace(re, `$1${seed})`); n++; }
}
fs.writeFileSync(file, src);
console.log('applied', n);
