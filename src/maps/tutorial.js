import { MapBuilder, addStage, COLORS } from './builder.js';

export default function build() {
  const b = new MapBuilder('tutorial', 'First Wave', {
    difficulty: 'tutorial',
    description: 'Learn to surf: ramps, gaps, curves and air strafing.',
  });
  const S = 25000;

  addStage(b, {
    origin: [0, 0, 0], heading: 0,
    hint: 'Walk forward (W) off the platform. On the ramp, let go of W and hold D, the key toward the ramp. Look along the ramp. Too much D pushes you over the top; too little and you slide off the bottom.',
    ramp: { width: 300, height: 420, color: COLORS.cyan },
    build: (c) => c.straight(9000, 1700),
  });

  addStage(b, {
    origin: [S, 0, 0], heading: 0,
    hint: 'Gaps: when you fly off the end of a ramp, keep looking ahead and land on the same side of the next ramp. Tap D to stay high on the ramp.',
    ramp: { width: 300, height: 420, color: COLORS.magenta },
    build: (c) => c.straight(4500, 900).gap(700).straight(4500, 950).gap(700).straight(4000, 850),
  });

  addStage(b, {
    origin: [S * 2, 0, 0], heading: 0,
    hint: 'Curves: hold D and turn the mouse slowly and smoothly to the right so you keep looking along the ramp as it bends.',
    ramp: { width: 300, height: 420, color: COLORS.purple },
    build: (c) => c.straight(2500, 550).curve(90, 5000, 1500).straight(2500, 550),
  });

  addStage(b, {
    origin: [S * 3, 0, 0], heading: 0,
    hint: 'Air strafing: in the air, hold A and move the mouse LEFT at the same time to drift left. Hold D and move the mouse RIGHT to drift right. Line yourself up with the next ramp.',
    ramp: { width: 300, height: 420, color: COLORS.green },
    build: (c) => c.straight(4500, 950).gap(900, -450).straight(4000, 900).gap(900).straight(4000, 850),
    last: true,
  });
  return b.build();
}
