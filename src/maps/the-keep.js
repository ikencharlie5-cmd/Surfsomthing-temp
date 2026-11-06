// The Keep: ridden from the INSIDE. Drop into the tower shaft, corkscrew down
// inside the tower, burst into the great hall and slalom its pillar doorways,
// kick between floors through two doorways, duck & dodge down into the crypt,
// then break out through the main gate.
import { MapBuilder, addCourse } from './builder.js';
import { themeById } from './themes.js';

const TORCH = [1.0, 0.6, 0.25];
const MOON = [0.75, 0.8, 1.0];
const ROYAL = [0.6, 0.35, 1.0];
const STONE = [0.42, 0.42, 0.46];

export default function build() {
  const th = themeById('castle');
  const b = new MapBuilder('castle-the-keep', 'The Keep', {
    difficulty: 'medium',
    description: 'Ride the inside of the keep: corkscrew down the tower, slalom the great hall, crash out the crypt and through the gate.',
    env: { ...th.env(10202), fogColor: [0.04, 0.035, 0.05], fogNear: 4000, fogFar: 30000 },
    theme: { type: 'interior', seed: 10202, look: 'keep' },
  });
  const W = 250;
  // interior spaces (all solid, all visible)
  const shaft = { side: 260, top: 900, bottom: 600, ceiling: true, color: STONE, interior: 'shaft' };
  const hall = { side: 1300, top: 2600, bottom: 900, ceiling: true, color: STONE, interior: 'hall' };
  const crypt = { side: 280, top: 560, bottom: 520, ceiling: true, color: [0.3, 0.3, 0.34], interior: 'crypt' };
  const door = (size, at = 0.5, lintel = 700) => ({ size, at, lintel, color: STONE, edge: 0.5, castle: true });
  const dbl = (size) => [door(size, 0.3, 900), door(size, 0.66, 900)];
  const L = (o = {}) => ({ face: 'left', ...o });
  const R = (o = {}) => ({ face: 'right', ...o });

  addCourse(b, {
    ramp: { width: W, height: 360, color: TORCH, minSpeed: 1100, face: 'left', tunnel: shaft },
    platformColor: [0.6, 0.6, 0.7],
    startHint: 'You are inside the keep. Corkscrew down the tower, then slalom the great hall!',
    build: (c) => c
      // --- the tower: drop in, then a tight corkscrew down inside it
      .dropIn(4200, 1700).straight(800, 60)
      .curve(200, 4600, 1500)
      .straight(1200, 60)
      .curve(160, 4600, 1200)
      // --- burst into the great hall
      .gap(1000, 0, { color: MOON, tunnel: hall, needle: door(300) }).straight(1600, 320)
      // slalom: side to side through the pillar doorways
      .gap(1000, -W * 0.9, R({ color: TORCH, needle: door(280) })).straight(1800, 330)
      .gap(1000, 0, { color: ROYAL, needle: door(260) }).straight(1500, 300)
      .gap(1000, W * 0.9, L({ color: MOON, needle: door(280) })).straight(1800, 330)
      // up to the gallery: kick across the hall through two doorways
      .straight(1500, 380)
      .kicker({ rise: 380, gapLen: 2500, landDrop: 650, landLen: 4200, landSlope: 0.08, needles: dbl(280), ramp: { color: MOON } })
      // a tight turn round the end of the hall (bleed speed first)
      .straight(1500, 60)
      .gap(1000, -W * 0.9, R({ color: ROYAL })).straight(1200, 60)
      .curve(-120, 5200, 600)
      // --- down the stairs into the crypt: duck & dodge
      .gap(1000, W * 0.9, L({ color: TORCH, tunnel: crypt })).straight(2200, 180)
      .structure('hall', ['dodge', 'dodge', 'duck', 'duck'], { slope: 0.08, spacing: 3000, approach: 2600, side: 280, top: 560, bottom: 520 })
      .straight(2000, 200)
      // --- back up into the hall for one more kicker, then out the main gate
      .gap(1000, 0, { color: MOON, tunnel: hall }).straight(1500, 380)
      .kicker({ rise: 380, gapLen: 2500, landDrop: 650, landLen: 4200, landSlope: 0.08, needles: dbl(270), ramp: { color: TORCH } })
      .straight(1200, 100)
      .gap(1100, 0, { color: TORCH, tunnel: null, needle: door(320, 0.5, 900) })
      .straight(2500, 200),
  });
  b.map.twist = 'Inside the keep';
  return b.build();
}
