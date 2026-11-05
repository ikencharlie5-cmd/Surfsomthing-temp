import { MapBuilder, addCourse, addCity, COLORS } from './builder.js';

// Night-time neon city: surf between glowing towers.
export default function build() {
  const b = new MapBuilder('skyline-rush', 'Skyline Rush', {
    difficulty: 'medium',
    description: 'Night surf through a neon city. Towers loom on both sides.',
    env: { mountains: false, fogColor: [0.1, 0.02, 0.16], fogNear: 6000, fogFar: 48000, gridColor: [0.9, 0.2, 1.0] },
    unlock: { after: ['neon-drift'] },
  });
  addCourse(b, {
    ramp: { width: 260, height: 380, color: COLORS.magenta, minSpeed: 1100 },
    platformColor: COLORS.magenta,
    build: (c) => c
      .dropIn(6000, 2400).straight(2500, 280)
      .gap(850, 0, { color: COLORS.cyan }).straight(1500, 150).curve(60, 6000, 600)
      .gap(900, -240, { face: 'right', color: COLORS.yellow }).straight(1500, 150).curve(-70, 5500, 600)
      .gap(950, 240, { face: 'left', color: COLORS.magenta, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).straight(2000, 120)
      .fork({ length: 4600, speed: 2000, shift: -600, gapIn: 1200, gapOut: 1100, color: COLORS.yellow })
      .straight(3000, 300)
      .gap(900, 0, { color: COLORS.cyan, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).straight(1500, 100).curve(70, 6000, 650)
      .gap(900, 300, { color: COLORS.purple }).straight(3200, 300)
      .gap(900, -300, { color: COLORS.magenta }).straight(3000, 300),
  });
  addCity(b.map, { seed: 11 });
  return b.build();
}
