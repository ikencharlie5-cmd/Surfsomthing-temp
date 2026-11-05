// Seeded course generator: builds a varied, long surf line for a difficulty
// tier, following the rules the bot tests taught us:
//   - riders stay on the outside of turns (switch faces across a gap to turn
//     the other way)
//   - land on a short straight before a curve
//   - curve radius grows with speed (about v^2 / 650)
//   - climbs and flat run-outs keep speed in the 1500-3000 u/s band
// plus challenges: thread-the-needle slots, long jumps and fast-line forks.

export const TIERS = ['easy', 'medium', 'hard', 'expert', 'insane'];

export const TIER = {
  easy: { width: 300, minSpeed: 1050, sections: 10, needles: 1, needleSize: 260, jumps: 0, jumpLen: 0, forks: 0, shiftMax: 220, switchP: 0.2, rMin: 7500 },
  medium: { width: 265, minSpeed: 1100, sections: 12, needles: 2, needleSize: 220, jumps: 1, jumpLen: 2000, forks: 1, shiftMax: 320, switchP: 0.3, rMin: 6800 },
  hard: { width: 235, minSpeed: 1150, sections: 13, needles: 3, needleSize: 180, jumps: 1, jumpLen: 2400, forks: 1, shiftMax: 400, switchP: 0.35, rMin: 6200 },
  expert: { width: 210, minSpeed: 1200, sections: 15, needles: 4, needleSize: 150, jumps: 2, jumpLen: 2800, forks: 2, shiftMax: 450, switchP: 0.4, rMin: 5800 },
  insane: { width: 190, minSpeed: 1250, sections: 17, needles: 5, needleSize: 125, jumps: 3, jumpLen: 3200, forks: 2, shiftMax: 500, switchP: 0.45, rMin: 5500 },
};

function rand(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Fill a Course with a generated layout.
 * @param {import('./builder.js').Course} c
 * @param {object} o { seed, tier, palette:[colors], needle:{color,kind,edge,lintel}, forks:boolean, tunnel: opts|null, tunnelToggle: boolean }
 */
export function generateCourse(c, o) {
  const r = rand(o.seed);
  const T = TIER[o.tier];
  const pal = o.palette;
  const W = c.opts.width;
  const y0 = c.p[1];
  let colorI = 0;
  const nextColor = () => pal[(colorI++) % pal.length];
  const speed = () => Math.sqrt(Math.max(0, 300 * 300 + 2 * 800 * 0.62 * (y0 - c.p[1])));
  const slopeFor = () => {
    const v = speed();
    if (v > 2700) return -lerp(0.02, 0.05, r());
    if (v > 2200) return lerp(0.02, 0.07, r());
    return lerp(0.11, 0.2, r());
  };

  // drop-in: steep, flattening out
  c.dropIn(lerp(6000, 7500, r()), lerp(2300, 3000, r())).straight(lerp(1500, 2600, r()), lerp(150, 260, r()));

  // decide where the challenges go (spread through the run, never the first gap)
  const n = T.sections;
  const slots = Array.from({ length: n }, () => 'gap');
  const place = (kind, count) => {
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 40; tries++) {
        const i = 1 + Math.floor(r() * (n - 1));
        if (slots[i] === 'gap' && slots[i - 1] !== kind && slots[i + 1] !== kind) { slots[i] = kind; break; }
      }
    }
  };
  place('jump', T.jumps);
  if (o.forks !== false) place('fork', T.forks);
  place('needle', T.needles);

  let drift = 0;
  let inTunnel = !!o.tunnel;
  for (let i = 0; i < n; i++) {
    const kind = slots[i];
    const outside = c.opts.face === 'left' ? 1 : -1;
    const ramp = { color: nextColor() };
    if (o.tunnelToggle && o.tunnel && r() < 0.4) { inTunnel = !inTunnel; ramp.tunnel = inTunnel ? o.tunnel : null; }

    // ---- the gap into this section
    if (kind === 'jump') {
      const v = Math.max(T.minSpeed + 500, Math.min(1950, speed() * 0.75));
      c.longJump(T.jumpLen * (o.jumpScale ?? 1) * lerp(0.9, 1.1, r()), v, { ramp });
      c.straight(lerp(2200, 3000, r()), lerp(80, 180, r()));
      continue;
    }
    if (kind === 'fork') {
      c.straight(lerp(1500, 2200, r()), lerp(100, 200, r()));
      c.fork({ length: lerp(4400, 5000, r()), speed: Math.max(1750, Math.min(2150, speed() * 0.72)), shift: -outside * lerp(450, 600, r()), gapIn: 1250, gapOut: 1200, color: o.forkColor || [1.0, 0.9, 0.3] });
      c.straight(lerp(1500, 2200, r()), lerp(120, 220, r()));
      continue;
    }
    if (kind === 'needle') {
      c.gap(lerp(950, 1150, r()), 0, { ...ramp, needle: { size: T.needleSize, ...(o.needle || {}) } });
    } else {
      // turning back the other way needs the other face (stay on the outside)
      const wantSwitch = Math.abs(drift) > 110 || r() < T.switchP;
      if (wantSwitch) {
        const toRight = c.opts.face === 'left';
        c.gap(lerp(900, 1100, r()), (toRight ? -1 : 1) * W * 0.9, { ...ramp, face: toRight ? 'right' : 'left' });
      } else if (r() < 0.45) {
        c.gap(lerp(900, 1150, r()), (r() < 0.5 ? -1 : 1) * lerp(120, T.shiftMax, r()), ramp);
      } else {
        c.gap(lerp(850, 1050, r()), 0, ramp);
      }
    }

    // ---- the section itself
    const turn = c.opts.face === 'left' ? 1 : -1;
    const s = slopeFor();
    const pick = r();
    if (s < 0) {
      const L = lerp(2000, 3200, r());
      c.straight(L, L * s); // climb to bleed speed
    } else if (pick < 0.3) {
      const L = lerp(2800, 4600, r());
      c.straight(L, L * s);
    } else if (pick < 0.65) {
      c.straight(lerp(1300, 1900, r()), lerp(100, 180, r()));
      const v = speed();
      const ang = lerp(35, 80, r()) * turn;
      const R = Math.max(T.rMin * lerp(0.95, 1.25, r()), (v * v) / 650);
      c.curve(ang, R, (Math.abs(ang) * Math.PI / 180) * R * s);
      drift += ang;
      if (r() < 0.5) c.straight(lerp(1200, 2000, r()), lerp(100, 200, r()));
    } else if (pick < 0.85) {
      c.straight(lerp(1200, 1600, r()), lerp(100, 160, r()));
      const L = lerp(5000, 6500, r());
      c.wave(L, L * s, lerp(170, 280, r()), 1);
    } else {
      // steep plunge then a flat run-out
      const L = lerp(2200, 3000, r());
      c.straight(L, L * Math.max(s, 0.25)).straight(lerp(1500, 2200, r()), lerp(80, 160, r()));
    }
  }
  c.straight(lerp(2000, 3000, r()), lerp(150, 300, r()));
  return c;
}
