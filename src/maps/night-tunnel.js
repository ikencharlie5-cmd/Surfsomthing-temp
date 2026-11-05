import { MapBuilder, addCourse, COLORS } from './builder.js';

// Fully enclosed: a glowing tunnel with ribs, walls and a ceiling.
export default function build() {
  const b = new MapBuilder('night-tunnel', 'Night Tunnel', {
    difficulty: 'medium',
    description: 'Surf through a ribbed neon tunnel. Close walls, low ceiling, no sky.',
    env: { sky: false, mountains: false, fogColor: [0.025, 0.0, 0.05], fogNear: 2500, fogFar: 17000, floorY: -2500 },
  });
  // enclosed server-farm shaft (scenery drawn by the 'servers' theme)
  const tunnel = { side: 420, top: 750, bottom: 650, ceiling: true, hidden: true, color: COLORS.purple };
  addCourse(b, {
    ramp: { width: 270, height: 390, color: COLORS.magenta, minSpeed: 1100, tunnel },
    build: (c) => c
      .dropIn(6000, 2300).straight(2000, 250)
      .gap(800, 0, { tunnel }).straight(3500, 380)
      .gap(800).curve(60, 5000, 520)
      .gap(850, 0, { color: COLORS.cyan, vmin: 1000 }).checkpoint()
      .straight(3500, 1000).curve(-70, 4500, 520)
      .gap(850, 300).straight(3000, 300)
      .gap(850, -300, { color: COLORS.magenta }).wave(6000, 520, 280, 1)
      .gap(850, 0, { vmin: 1000 }).checkpoint()
      .straight(3500, 1000).curve(80, 4200, 600)
      .gap(900).straight(3500, 350)
      .gap(900, 0, { color: COLORS.cyan }).straight(3000, 300),
  });
  return b.build();
}
