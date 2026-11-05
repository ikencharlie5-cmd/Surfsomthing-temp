import { MapBuilder, addCourse, COLORS } from './builder.js';

// The finale: a warp tunnel of light rings through deep space. Wide, fast,
// flowing, with three fast lines for riders who carry speed.
export default function build() {
  const b = new MapBuilder('final-overdrive', 'Final Overdrive', {
    difficulty: 'expert',
    description: 'The finale: a warp tunnel of light through deep space. Huge drop-in, raw speed, three fast lines.',
    env: { sky: 'space', mountains: false, floor: false, fogColor: [0.03, 0.0, 0.06], fogNear: 15000, fogFar: 75000 },
    theme: { type: 'vortex', seed: 61 },
    unlock: { after: ['data-core', 'orbital', 'crystal-cave'] },
  });
  addCourse(b, {
    ramp: { width: 230, height: 340, color: COLORS.magenta, minSpeed: 1200 },
    platformColor: COLORS.cyan,
    build: (c) => c
      .dropIn(7500, 3400).straight(2500, 250)
      .gap(1000, 0, { color: COLORS.cyan }).straight(1500, 150).curve(70, 7500, 700)
      .fork({ length: 5000, speed: 2200, shift: -500, gapIn: 1300, gapOut: 1300, color: COLORS.yellow })
      .straight(2500, 250)
      .gap(1100, -260, { face: 'right', color: COLORS.purple }).straight(1800, 150).curve(-80, 7500, 750)
      .gap(1100, 260, { face: 'left', color: COLORS.magenta }).wave(6500, 650, 280, 1)
      .gap(1100, 0, { color: COLORS.cyan }).straight(3000, 700).straight(2000, 150)
      .fork({ length: 5200, speed: 2300, shift: -500, gapIn: 1300, gapOut: 1300, color: COLORS.yellow })
      .straight(2500, 250)
      .gap(1200, 300, { color: COLORS.purple }).straight(2500, 250)
      .gap(1200, -300, { color: COLORS.magenta }).straight(1500, 150).curve(60, 8000, 600)
      .fork({ length: 5000, speed: 2300, shift: -500, gapIn: 1300, gapOut: 1300, color: COLORS.yellow })
      .straight(3000, 300),
  });
  return b.build();
}
