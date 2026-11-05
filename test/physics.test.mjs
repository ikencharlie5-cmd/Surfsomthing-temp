// Run with: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Brush } from '../src/physics/brush.js';
import { World } from '../src/physics/world.js';
import { Movement, Player } from '../src/physics/movement.js';
import { MapBuilder, line, arc } from '../src/maps/builder.js';
import { V3 } from '../src/physics/vec.js';

const DT = 1 / 100;

function worldFrom(map) {
  const w = new World();
  for (const b of map.brushes) w.add(new Brush(b.points, b));
  return w;
}

test('box brush has 6 faces', () => {
  const m = new MapBuilder('t', 't').box([0, 0, 0], [100, 100, 100]).build();
  const b = new Brush(m.brushes[0].points);
  assert.equal(b.faces.length, 6);
  for (const f of b.faces) assert.equal(f.poly.length, 4);
});

test('player lands and stands on a platform, walks with friction', () => {
  const m = new MapBuilder('t', 't').platform([0, 0, 0], [2000, 32, 2000]).build();
  const world = worldFrom(m);
  const mv = new Movement(world);
  const p = new Player();
  p.teleport([0, 200, 0]);
  for (let i = 0; i < 200; i++) mv.tick(p, { forward: 0, side: 0, jump: false, yaw: 0 }, DT);
  assert.ok(p.onGround, 'should be on ground');
  assert.ok(Math.abs(p.pos.y - 36) < 0.1, `feet on floor, y=${p.pos.y}`);
  for (let i = 0; i < 100; i++) mv.tick(p, { forward: 1, side: 0, jump: false, yaw: 0 }, DT);
  const sp = p.vel.lenH();
  assert.ok(sp > 250 && sp <= 261, `walk speed ${sp}`);
  for (let i = 0; i < 100; i++) mv.tick(p, { forward: 0, side: 0, jump: false, yaw: 0 }, DT);
  assert.ok(p.vel.lenH() < 1, 'friction stops');
});

test('surfing: holding into a descending ramp keeps you on it and builds speed', () => {
  // Ramp running along -Z, dropping 1500 over 8000.
  const m = new MapBuilder('t', 't').ramp(line([0, 0, 0], [0, -1500, -8000], 4), { width: 220, height: 320 }).build();
  const world = worldFrom(m);
  const mv = new Movement(world);
  const p = new Player();
  p.teleport([-140, 0, -100]);
  let surfTicks = 0, maxSpeed = 0;
  for (let i = 0; i < 1500; i++) {
    // facing -Z (yaw 0), hold D (right = +X = into the ramp's left face)
    // only push while below the middle of the face, like a player would
    mv.tick(p, { forward: 0, side: p.pos.x < -110 ? 1 : 0, jump: false, yaw: 0 }, DT);
    if (p.surfing) surfTicks++;
    if (p.surfing) maxSpeed = Math.max(maxSpeed, p.vel.len());
    if (p.pos.z < -7900) break;
  }
  assert.ok(surfTicks > 500, `surfed ${surfTicks} ticks`);
  console.log(`  straight ramp: surfTicks=${surfTicks} z=${p.pos.z.toFixed(0)} y=${p.pos.y.toFixed(0)} maxSpeed=${maxSpeed.toFixed(0)}`);
  assert.ok(p.pos.z < -7000, `travelled along ramp z=${p.pos.z.toFixed(0)}`);
  assert.ok(maxSpeed > 1200, `gained speed ${maxSpeed.toFixed(0)}`);
});

test('not holding into the ramp slides you off the bottom', () => {
  const m = new MapBuilder('t', 't').ramp(line([0, 0, 0], [0, -200, -8000], 4), { width: 220, height: 320 }).build();
  const world = worldFrom(m);
  const mv = new Movement(world);
  const p = new Player();
  p.teleport([-140, 0, -100]);
  for (let i = 0; i < 300; i++) mv.tick(p, { forward: 0, side: 0, jump: false, yaw: 0 }, DT);
  assert.ok(p.pos.y < -400, `fell off: y=${p.pos.y.toFixed(0)}`);
});

test('curved ramp segments: no snagging across seams', () => {
  const path = arc(0, 0, 4000, 0, -90, 0, -1800, 24); // arc in XZ
  const m = new MapBuilder('t', 't').ramp(path, { width: 240, height: 320, sides: 'both' }).build();
  const world = worldFrom(m);
  const mv = new Movement(world);
  const p = new Player();
  // start on the outer face near angle 0 => position (4000+150, y, 0)
  p.teleport([4000 + 150, -40, 30]);
  p.vel.set(0, 0, -600);
  let minSpeedAfterStart = Infinity, ticks = 0;
  for (let i = 0; i < 1500; i++) {
    // face along the tangent, hold strafe toward ramp centre line
    const ang = Math.atan2(p.pos.z, p.pos.x); // current angle
    const tx = Math.sin(ang), tz = -Math.cos(ang); // tangent (moving toward -90)
    const yaw = Math.atan2(-tx, -tz);
    // ramp is to our left (toward circle centre is inward; outer face => push inward = left)
    mv.tick(p, { forward: 0, side: -1, jump: false, yaw }, DT);
    ticks++;
    if (i > 50) minSpeedAfterStart = Math.min(minSpeedAfterStart, p.vel.len());
    if (Math.atan2(p.pos.z, p.pos.x) < -Math.PI / 2 + 0.05) break;
    if (p.pos.y < -2500) break;
  }
  assert.ok(Math.atan2(p.pos.z, p.pos.x) < -1.2, `made it around the curve (angle ${Math.atan2(p.pos.z, p.pos.x).toFixed(2)}, y ${p.pos.y.toFixed(0)})`);
  assert.ok(minSpeedAfterStart > 300, `no hard stops at seams (min speed ${minSpeedAfterStart.toFixed(0)})`);
});

test('air strafing gains speed (bhop style turning)', () => {
  const m = new MapBuilder('t', 't').platform([0, 0, 0], [100000, 32, 100000]).build();
  const world = worldFrom(m);
  const mv = new Movement(world);
  const p = new Player();
  p.teleport([0, 37, 0]);
  p.vel.set(0, 0, -260);
  let yaw = 0;
  for (let i = 0; i < 1000; i++) {
    // optimal-ish: turn right at a rate, hold D, autobhop
    yaw -= 0.02;
    mv.tick(p, { forward: 0, side: 1, jump: true, yaw }, DT);
  }
  assert.ok(p.vel.lenH() > 400, `bhop speed ${p.vel.lenH().toFixed(0)}`);
});

test('trigger keeps vector bounds when constructed with map data', async () => {
  const { Trigger } = await import('../src/physics/world.js');
  const { HULL } = await import('../src/physics/movement.js');
  const data = { type: 'start', min: [-10, -10, -10], max: [10, 10, 10] };
  const t = new Trigger(data.min, data.max, data);
  assert.equal(t.type, 'start');
  assert.ok(t.touches(new V3(0, 0, 0), HULL));
  assert.ok(!t.touches(new V3(100, 0, 0), HULL));
});

test('seam fix does not let a surfer pass through a real wall', () => {
  const m = new MapBuilder('t', 't').ramp(line([0, 0, 0], [0, -1500, -8000], 4), { width: 220, height: 320 }).build();
  // a tall wall across the ramp
  m.brushes.push(...new MapBuilder('w', 'w').box([0, -500, -3000], [2000, 3000, 100]).build().brushes);
  const world = worldFrom(m);
  const mv = new Movement(world);
  const p = new Player();
  p.teleport([-140, 0, -100]);
  for (let i = 0; i < 1500; i++) {
    mv.tick(p, { forward: 0, side: p.pos.x < -110 ? 1 : 0, jump: false, yaw: 0 }, DT);
  }
  assert.ok(p.pos.z > -2950, `stopped by the wall (z=${p.pos.z.toFixed(0)})`);
});
