// The finish is a ring you have to fly through: crossing the ring's plane
// within its radius between two ticks counts; anything else doesn't.
export function passedGate(gate, prev, cur) {
  const h = (gate.heading * Math.PI) / 180;
  const f = [-Math.sin(h), -Math.cos(h)]; // ring faces along the course heading
  const c = gate.center;
  const d0 = (prev.x - c[0]) * f[0] + (prev.z - c[2]) * f[1];
  const d1 = (cur.x - c[0]) * f[0] + (cur.z - c[2]) * f[1];
  if (!(d0 < 0 && d1 >= 0)) return false;
  const t = d0 / (d0 - d1);
  const x = prev.x + (cur.x - prev.x) * t, y = prev.y + (cur.y - prev.y) * t, z = prev.z + (cur.z - prev.z) * t;
  const lat = (x - c[0]) * -f[1] + (z - c[2]) * f[0];
  return Math.hypot(lat, y - c[1]) <= gate.radius;
}
