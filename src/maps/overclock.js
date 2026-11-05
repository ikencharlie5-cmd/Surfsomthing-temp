import { MapBuilder, addStage, COLORS } from './builder.js';

export default function build() {
  const b = new MapBuilder('overclock', 'Overclock', {
    difficulty: 'hard',
    description: 'Thin ramps, long gaps, side switches and tight curves.',
  });
  const S = 30000;
  const ramp = { width: 180, height: 290 };

  addStage(b, {
    origin: [0, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.red },
    build: (c) => c.straight(3000, 700).gap(900).straight(3000, 700).gap(900, -300).curve(75, 3500, 1000).straight(1500, 350),
  });
  addStage(b, {
    origin: [S, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.magenta, face: 'right' },
    build: (c) => c.wave(8000, 1750, 420, 2).gap(1000).curve(-100, 3200, 1400).straight(1500, 350),
  });
  addStage(b, {
    origin: [S * 2, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.blue },
    build: (c) => c.straight(3000, 700)
      .gap(1000, 450, { face: 'right' }).straight(3000, 700)
      .gap(1000, -450, { face: 'left' }).straight(3000, 700),
  });
  addStage(b, {
    origin: [S * 3, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.orange },
    build: (c) => c.straight(1500, 400).curve(120, 2800, 1500).straight(1200, 300)
      .gap(850, 0, { face: 'right' }).curve(-120, 2800, 1500).straight(1500, 350),
  });
  addStage(b, {
    origin: [S * 4, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.purple },
    build: (c) => c.straight(4000, 1000).gap(1300).straight(3000, 800)
      .gap(1350).straight(3000, 800).gap(1300, -200).straight(2500, 600),
  });
  addStage(b, {
    origin: [S * 5, 0, 0], heading: 0,
    ramp: { ...ramp, color: COLORS.cyan },
    build: (c) => c.straight(2000, 500).curve(180, 3000, 2300).gap(900).wave(5500, 1300, 380, 1).straight(2000, 500),
    last: true,
  });
  return b.build();
}
