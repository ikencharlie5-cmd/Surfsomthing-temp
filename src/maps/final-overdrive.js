import { MapBuilder, addCourse, addCity, COLORS } from './builder.js';

// The finale: long, thin and fast, through open sky, a canyon and a tunnel.
export default function build() {
  const b = new MapBuilder('final-overdrive', 'Final Overdrive', {
    difficulty: 'expert',
    description: 'The finale. Thin ramps, three fast lines, a canyon and a tunnel. Bring speed.',
    env: { fogColor: [0.28, 0.03, 0.18], fogNear: 8000, fogFar: 55000 },
    unlock: { after: ['data-core', 'orbital', 'crystal-cave'] },
  });
  const canyon = { side: 480, top: 1500, bottom: 900, ceiling: false, color: COLORS.red, ribColor: COLORS.orange, ribSpacing: 1300 };
  const tunnel = { side: 340, top: 650, bottom: 600, ceiling: true, color: COLORS.purple, ribColor: COLORS.magenta, ribSpacing: 700 };
  addCourse(b, {
    ramp: { width: 185, height: 300, color: COLORS.red, minSpeed: 1150 },
    platformColor: COLORS.red,
    build: (c) => c
      .dropIn(6500, 2900).straight(2000, 200)
      .gap(1100, 300).straight(2800, 250)
      .gap(1100, -300, { color: COLORS.magenta }).straight(1500, 150).curve(70, 6500, 650)
      .fork({ length: 5000, speed: 2100, shift: 450, gapIn: 1300, gapOut: 1300, color: COLORS.yellow })
      .straight(2500, 220)
      .gap(1100, 0, { tunnel: canyon, color: COLORS.orange, vmin: 1000 }).checkpoint()
      .straight(3500, 1150).straight(2000, 120)
      .gap(1100, -330, { face: 'right' }).straight(1800, 150).curve(-70, 6000, 600)
      .gap(1100, 330, { face: 'left', color: COLORS.yellow }).straight(1800, 150).curve(60, 6500, 550)
      .gap(1100, 0, { tunnel, color: COLORS.magenta, vmin: 1000 }).checkpoint()
      .straight(3500, 1150).straight(2000, 120).wave(6000, 600, 220, 1)
      .gap(1200, 0, { tunnel: null, color: COLORS.cyan }).straight(2500, 200)
      .fork({ length: 5000, speed: 2100, shift: -450, gapIn: 1300, gapOut: 1300, color: COLORS.yellow })
      .straight(2500, 220)
      .gap(1200, 0, { color: COLORS.red, vmin: 1000 }).checkpoint()
      .straight(3500, 1150).straight(2000, 120)
      .fork({ length: 5000, speed: 2000, shift: 450, gapIn: 1300, gapOut: 1300, color: COLORS.yellow })
      .straight(2500, 220)
      .gap(1200, 200, { color: COLORS.purple }).straight(2500, 200)
      .gap(1200, -200, { color: COLORS.red }).straight(2500, 220),
  });
  return b.build();
}
