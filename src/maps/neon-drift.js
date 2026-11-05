import { MapBuilder, addStage, COLORS } from './builder.js';

export default function build() {
  const b = new MapBuilder('neon-drift', 'Neon Drift', {
    difficulty: 'easy',
    description: 'Five flowing stages of wide ramps. A good first real map.',
  });
  const S = 25000;
  const ramp = { width: 260, height: 380 };

  addStage(b, {
    origin: [0, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.cyan },
    build: (c) => c.straight(5000, 1050).curve(60, 5000, 950).straight(2500, 550),
  });
  addStage(b, {
    origin: [S, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.magenta },
    build: (c) => c.straight(3000, 700).gap(650).wave(6500, 1400, 450, 1).gap(650).straight(3000, 700),
  });
  addStage(b, {
    origin: [S * 2, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.purple, face: 'right' },
    build: (c) => c.straight(2500, 600).curve(-110, 4500, 1700).straight(2200, 500),
  });
  addStage(b, {
    origin: [S * 3, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.orange },
    build: (c) => c.straight(3500, 800).gap(800).curve(45, 6000, 950).gap(800, -350).straight(3500, 800),
  });
  addStage(b, {
    origin: [S * 4, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.yellow },
    build: (c) => c.straight(3000, 700).curve(90, 4000, 1300).gap(700).straight(4000, 900),
    last: true,
  });
  return b.build();
}
