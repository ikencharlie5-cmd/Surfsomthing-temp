import { MapBuilder, addCourse, COLORS } from './builder.js';

export default function build() {
  const b = new MapBuilder('overclock', 'Overclock', {
    difficulty: 'hard',
    description: 'Thin ramps, long gaps, side switches and two fast-line shortcuts.',
  });
  addCourse(b, {
    ramp: { width: 185, height: 300, color: COLORS.red, minSpeed: 1100 },
    build: (c) => c
      .dropIn(6000, 2700).straight(2000, 200)
      .gap(1000, 300).straight(3000, 250)
      .gap(1000, -300, { color: COLORS.magenta }).curve(75, 4200, 500)
      .fork({ length: 4800, speed: 1950, shift: 450, gapIn: 1300, gapOut: 1300, color: COLORS.yellow })
      .straight(2500, 200)
      .gap(1000, 0, { color: COLORS.blue, vmin: 1000 }).checkpoint()
      .straight(3500, 1150).straight(2000, 120)
      .gap(1100, -330, { face: 'right' }).straight(3000, 250)
      .gap(1100, 0, { color: COLORS.orange }).straight(1800, 150).curve(-70, 5800, 600)
      .gap(1100, 330, { face: 'left', vmin: 1000 }).checkpoint()
      .straight(3500, 1150).wave(6000, 650, 260, 1)
      .gap(1200).straight(2500, 200)
      .fork({ length: 5000, speed: 2100, shift: -450, gapIn: 1300, gapOut: 1300, color: COLORS.yellow })
      .straight(3000, 250)
      .gap(1200, 200, { color: COLORS.purple }).straight(2500, 200)
      .gap(1200, -200).straight(2500, 220),
  });
  return b.build();
}
