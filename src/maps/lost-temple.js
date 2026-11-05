import { MapBuilder, addCourse, COLORS } from './builder.js';

const JADE = [0.2, 1.0, 0.6];
const GOLD = [1.0, 0.8, 0.25];
const DROP = 900;

// Night jungle valley: giant trees, vines, a river, ruins and a stepped temple.
export default function build() {
  const b = new MapBuilder('lost-temple', 'Lost Temple', {
    difficulty: 'medium',
    description: 'A night jungle: giant trees and vines, a river, a waterfall, ruins and a glowing stepped temple.',
    env: { sky: 'desert', mountains: false, floor: false, fogColor: [0.02, 0.06, 0.045], fogNear: 5000, fogFar: 42000 },
    theme: { type: 'jungle', seed: 41, groundDrop: DROP },
    unlock: { after: ['vapor-coast'] },
  });
  addCourse(b, {
    ramp: { width: 250, height: 370, color: JADE, minSpeed: 1100 },
    platformColor: GOLD,
    build: (c) => c
      .dropIn(6500, 2500).straight(2500, 280)
      .gap(850, 0, { color: GOLD }).straight(1500, 150).curve(60, 6500, 650)
      .gap(900, -230, { face: 'right', color: COLORS.cyan }).straight(1500, 150).curve(-60, 6500, 650)
      .gap(900, 230, { face: 'left', color: JADE }).wave(6000, 600, 260, 1)
      .gap(900, 0, { color: GOLD }).straight(3000, 600).straight(1500, 100)
      .fork({ length: 4400, speed: 1950, shift: -600, gapIn: 1200, gapOut: 1100, color: COLORS.yellow })
      .straight(1500, 150).curve(50, 7000, 600)
      .gap(900, 0, { color: JADE }).straight(3500, 350),
  });
  b.map.groundDrop = DROP;
  return b.build();
}
