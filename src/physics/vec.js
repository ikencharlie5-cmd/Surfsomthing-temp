// Tiny allocation-light 3D vector helpers used by the physics code.
// Kept independent of three.js so physics can run (and be tested) in Node.

export class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  len() { return Math.hypot(this.x, this.y, this.z); }
  lenH() { return Math.hypot(this.x, this.z); }
  normalize() { const l = this.len(); if (l > 1e-12) this.scale(1 / l); return this; }
  isZero() { return this.x === 0 && this.y === 0 && this.z === 0; }
  static sub(a, b) { return new V3(a.x - b.x, a.y - b.y, a.z - b.z); }
  static cross(a, b) {
    return new V3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  static from(a) { return Array.isArray(a) ? new V3(a[0], a[1], a[2]) : new V3(a.x, a.y, a.z); }
}

export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
