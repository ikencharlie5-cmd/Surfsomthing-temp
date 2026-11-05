import { MapBuilder, addCourse, addCity, COLORS } from './builder.js';

// Night-time neon city: surf between glowing towers.
export default function build() {
  const b = new MapBuilder('skyline-rush', 'Skyline Rush', {
    difficulty: 'medium',
    description: 'A real city at night: towers on city blocks, rooftop neon, beacons and traffic on the streets far below.',
    env: { mountains: false, floorMode: 'city', fogColor: [0.1, 0.02, 0.16], fogNear: 7000, fogFar: 60000 },
    theme: { type: 'city', seed: 17 },
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
  const minY = Math.min(...b.map.line.map((e) => e.p[1] - e.height));
  const streetY = minY - 3500;
  addCity(b.map, { seed: 11, streetY, grid: 3000 });
  b.map.theme.streetY = streetY;
  b.map.env.floorAbs = streetY;
  return b.build();
}
