// Speed rings: flying through one multiplies your horizontal speed once per run.
export function checkBoosts(boosts, used, p) {
  if (!boosts) return null;
  for (let i = 0; i < boosts.length; i++) {
    if (used.has(i)) continue;
    const b = boosts[i];
    const dx = p.pos.x - b.center[0], dz = p.pos.z - b.center[2];
    if (dx * dx + dz * dz < b.radius * b.radius && Math.abs(p.pos.y - b.center[1]) < b.height) {
      used.add(i);
      p.vel.x *= b.mult;
      p.vel.z *= b.mult;
      return b;
    }
  }
  return null;
}
