import { MapBuilder, addCourse, COLORS } from './builder.js';

export default function build() {
  const b = new MapBuilder('neon-drift', 'Neon Drift', {
    difficulty: 'easy',
    description: 'Wide, flowing ramps under the open sky. One fast-line shortcut.',
  });
  addCourse(b, {
    ramp: { width: 270, height: 390, color: COLORS.cyan, minSpeed: 1100 },
    build: (c) => c
      .curve(110, 3800, 2400).straight(2500, 300)
      .gap(800, 0, { color: COLORS.magenta }).wave(6500, 650, 380, 1)
      .gap(800).curve(55, 6000, 600)
      .gap(900, 0, { color: COLORS.purple }).checkpoint()
      .straight(3500, 1050).straight(2500, 150)
      .fork({ length: 4400, speed: 1900, shift: -600, gapIn: 1200, gapOut: 1100, color: COLORS.yellow })
      .straight(3500, 300)
      .gap(900, 0, { color: COLORS.orange }).checkpoint()
      .straight(3500, 1050).curve(-60, 5500, 500)
      .gap(850, 350).straight(3500, 300)
      .gap(850, -350, { color: COLORS.cyan }).wave(6000, 250, 260, 1)
      .gap(900).straight(3000, 300),
  });
  return b.build();
}
