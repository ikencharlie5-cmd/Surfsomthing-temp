import { MapBuilder, addCourse, COLORS } from './builder.js';

export default function build() {
  const b = new MapBuilder('tutorial', 'First Wave', {
    difficulty: 'tutorial',
    description: 'Learn to surf: a big drop-in, gaps, air strafing and keeping your speed.',
  });
  addCourse(b, {
    ramp: { width: 320, height: 440, color: COLORS.cyan, minSpeed: 1000 },
    startHint: 'Walk forward (W) off the platform. On the ramp, let go of W and hold D, the key toward the ramp. This steep drop-in builds your speed before the first gap.',
    build: (c) => c
      .dropIn(6000, 2400).straight(3000, 380)
      .gap(800, 0, { color: COLORS.magenta }).checkpoint('Gaps: fly off the end and land on the same side of the next ramp. Tap D to stay high. Fall, and you go back to the start.')
      .straight(3500, 1000)
      .gap(800).straight(4000, 420)
      .gap(900, 0, { color: COLORS.green }).checkpoint('Air strafing: the next ramp is offset to the LEFT. In the air, hold A and move the mouse left to drift onto it.')
      .straight(3500, 1000)
      .gap(1100, -450).straight(3500, 380)
      .gap(1100, 450).straight(3000, 360)
      .gap(900, 0, { color: COLORS.purple }).checkpoint('Keep your speed! Clean landings keep your combo going. Clipping edges or slamming into ramps SCRUBS speed.')
      .straight(3500, 1000).curve(70, 5000, 650)
      .gap(900).straight(4000, 420),
  });
  return b.build();
}
