// Seeded course generator: builds a varied, long surf line for a difficulty
// tier, following the rules the bot tests taught us:
//   - riders stay on the outside of turns (switch faces across a gap to turn
//     the other way)
//   - land on a short straight before a curve
//   - curve radius grows with speed (about v^2 / 650)
//   - climbs and flat run-outs keep speed in the 1500-3000 u/s band
// plus challenges: thread-the-needle slots, long jumps and fast-line forks.

export const TIERS = ['easy', 'medium', 'hard', 'expert', 'insane', 'extreme'];

export const TIER = {
  easy: { width: 300, minSpeed: 1050, sections: 10, needles: 1, needleSize: 260, jumps: 0, jumpLen: 0, forks: 0, shiftMax: 220, switchP: 0.2, rMin: 7500, kickers: 1, doubleP: 0 },
  medium: { width: 265, minSpeed: 1100, sections: 12, needles: 2, needleSize: 220, jumps: 1, jumpLen: 2000, forks: 1, shiftMax: 320, switchP: 0.3, rMin: 6800, kickers: 2, doubleP: 0.2 },
  hard: { width: 235, minSpeed: 1150, sections: 13, needles: 3, needleSize: 180, jumps: 1, jumpLen: 2400, forks: 1, shiftMax: 400, switchP: 0.35, rMin: 6200, kickers: 2, doubleP: 0.35 },
  expert: { width: 210, minSpeed: 1200, sections: 15, needles: 4, needleSize: 160, jumps: 2, jumpLen: 2800, forks: 2, shiftMax: 450, switchP: 0.4, rMin: 5800, kickers: 3, doubleP: 0.5 },
  extreme: { width: 185, minSpeed: 1300, sections: 24, needles: 3, needleSize: 160, jumps: 2, jumpLen: 3400, forks: 1, shiftMax: 520, switchP: 0.45, rMin: 5600, kickers: 6, doubleP: 0.75 },
  insane: { width: 190, minSpeed: 1250, sections: 17, needles: 5, needleSize: 140, jumps: 3, jumpLen: 3200, forks: 2, shiftMax: 500, switchP: 0.45, rMin: 5500, kickers: 3, doubleP: 0.6 },
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

  // the map's twist: what makes it different from the others in its theme
  const tw = o.twist || {};
  const tierN = TIERS.indexOf(o.tier);
  const pattern = (len) => Array.from({ length: len }, (_, k) => ((k + Math.floor(r() * 2)) % 2 ? 'duck' : 'dodge'));

  // decide where the challenges go (spread through the run, never the first gap)
  const n = T.sections + (tw.sections || 0);
  const slots = Array.from({ length: n }, () => 'gap');
  const place = (kind, count) => {
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 40; tries++) {
        const i = 1 + Math.floor(r() * (n - 1));
        if (slots[i] === 'gap' && slots[i - 1] !== kind && slots[i + 1] !== kind) { slots[i] = kind; break; }
      }
    }
  };
  place('structure', tw.structure ? tw.structure.count ?? 1 : 0);
  place('spiral', tw.spiral || 0);
  place('dodge', tw.dodge || 0);
  place('jump', Math.max(0, T.jumps + (tw.jumps || 0)));
  if (o.forks !== false) place('fork', Math.max(0, T.forks + (tw.forks || 0)));
  place('needle', Math.max(0, T.needles + (tw.needles || 0)));
  place('kicker', Math.max(0, (T.kickers || 0) + (tw.kickers || 0)));
  place('boost', tw.boost || 0);

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
    if (kind === 'kicker') {
      // build speed, then the flipped drop-in launches you into a real jump
      c.gap(lerp(900, 1050, r()), 0, ramp);
      const L = lerp(2200, 2800, r());
      c.straight(L, L * lerp(0.22, 0.28, r())).straight(lerp(900, 1300, r()), lerp(60, 120, r()));
      const big = r();
      const gapLen = lerp(2500, 3100, big);
      const nd = { size: T.needleSize, top: 3200, ...(o.needle || {}), lintel: undefined };
      const needles = r() < (T.doubleP ?? 0) ? [{ ...nd, at: 0.3 }, { ...nd, at: 0.66 }] : r() < 0.5 ? [{ ...nd, at: 0.5 }] : null;
      c.kicker({ length: lerp(2400, 2900, r()), rise: lerp(380, 560, big), gapLen, landDrop: lerp(600, 820, big), landLen: lerp(5000, 6200, r()), needles, ramp: { color: nextColor() } });
      continue;
    }
    if (kind === 'structure') {
      const st = tw.structure;
      c.gap(lerp(900, 1050, r()), 0, ramp);
      c.straight(lerp(1000, 1400, r()), lerp(80, 140, r()));
      c.structure(st.kind, pattern(st.blocks ?? Math.min(3, 2 + Math.ceil(tierN / 2))), st.opts || {});
      c.straight(lerp(1200, 1800, r()), lerp(100, 160, r()));
      continue;
    }
    if (kind === 'dodge') {
      c.gap(lerp(900, 1050, r()), 0, ramp);
      c.straight(lerp(900, 1300, r()), lerp(80, 140, r()));
      c.dodgeRun(pattern(Math.min(3, 2 + (tierN >= 2 ? 1 : 0))), { color: (o.needle && o.needle.color) || [0.9, 0.5, 0.2], edge: 1.5 });
      continue;
    }
    if (kind === 'spiral') {
      c.gap(lerp(900, 1050, r()), 0, ramp);
      c.straight(lerp(1400, 1900, r()), lerp(100, 160, r()));
      const v = speed();
      const turn = c.opts.face === 'left' ? 1 : -1;
      const ang = lerp(270, 330, r()) * turn;
      const R = Math.max(T.rMin * 1.1, (v * v) / 600, 6000);
      c.curve(ang, R, (Math.abs(ang) * Math.PI / 180) * R * Math.max(0.06, Math.min(0.12, slopeFor())));
      drift += ang;
      c.straight(lerp(1500, 2200, r()), lerp(100, 180, r()));
      continue;
    }
    if (kind === 'boost') {
      c.gap(lerp(950, 1100, r()), 0, { ...ramp, boost: { mult: tw.boostMult ?? 1.15, color: tw.boostColor } });
    } else if (kind === 'needle') {
      c.gap(lerp(950, 1150, r()), 0, { ...ramp, needle: { size: T.needleSize, ...(o.needle || {}) } });
    } else {
      // turning back the other way needs the other face (stay on the outside)
      const wantSwitch = Math.abs(drift) > 110 || r() < (tw.switchP ?? T.switchP);
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
    const wv = tw.waveP ?? 0;
    const pl = tw.plungeP ?? 0;
    if (s < 0) {
      const L = lerp(2000, 3200, r());
      c.straight(L, L * s); // climb to bleed speed
    } else if (pick < wv) {
      c.straight(lerp(1200, 1600, r()), lerp(100, 160, r()));
      const L = lerp(5500, 7000, r());
      c.wave(L, L * s, lerp(170, 280, r()) * (tw.waveAmp ?? 1), tw.waves ?? 1);
    } else if (pick < wv + pl) {
      const L = lerp(2200, 3000, r());
      c.straight(L, L * Math.max(s, 0.3)).straight(lerp(1700, 2400, r()), lerp(60, 140, r()));
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
