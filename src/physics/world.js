// Collision world: a set of convex brushes plus axis-aligned trigger volumes.
// Implements a Quake/Source style "trace a box from A to B" query.

import { V3 } from './vec.js';

export const DIST_EPSILON = 0.03125; // keep the player 1/32 unit off surfaces
const PARALLEL_TOL = 1e-3;

export class TraceResult {
  constructor() { this.reset(); }
  reset() {
    this.fraction = 1;
    this.endpos = new V3();
    this.normal = new V3();
    this.startsolid = false;
    this.allsolid = false;
    this.brush = null;
    return this;
  }
}

export class World {
  constructor() {
    this.brushes = [];
  }
  add(brush) { this.brushes.push(brush); return brush; }
  remove(brush) {
    const i = this.brushes.indexOf(brush);
    if (i >= 0) this.brushes.splice(i, 1);
  }
  clear() { this.brushes.length = 0; }

  /**
   * Sweep an axis-aligned box (half extents ext) from start to end.
   * @param {V3} start box center
   * @param {V3} end box center
   * @param {V3} ext half extents
   * @param {TraceResult} [out]
   */
  trace(start, end, ext, out = new TraceResult()) {
    out.reset();
    const sx = start.x, sy = start.y, sz = start.z;
    const ex = end.x, ey = end.y, ez = end.z;
    const hx = ext.x, hy = ext.y, hz = ext.z;
    const minx = Math.min(sx, ex) - hx, maxx = Math.max(sx, ex) + hx;
    const miny = Math.min(sy, ey) - hy, maxy = Math.max(sy, ey) + hy;
    const minz = Math.min(sz, ez) - hz, maxz = Math.max(sz, ez) + hz;

    for (let b = 0; b < this.brushes.length; b++) {
      const br = this.brushes[b];
      if (br.max.x < minx - 1 || br.min.x > maxx + 1 ||
          br.max.y < miny - 1 || br.min.y > maxy + 1 ||
          br.max.z < minz - 1 || br.min.z > maxz + 1) continue;
      clipBoxToBrush(sx, sy, sz, ex, ey, ez, hx, hy, hz, br, out);
      if (out.allsolid) break;
    }
    const f = out.fraction;
    out.endpos.set(sx + (ex - sx) * f, sy + (ey - sy) * f, sz + (ez - sz) * f);
    return out;
  }
}

function clipBoxToBrush(sx, sy, sz, ex, ey, ez, hx, hy, hz, br, tr) {
  const pn = br.pn, pd = br.pd;
  const count = pd.length;
  let enterFrac = -1, leaveFrac = 1;
  let clipIdx = -1;
  let startout = false, getout = false;

  for (let i = 0; i < count; i++) {
    const nx = pn[i * 3], ny = pn[i * 3 + 1], nz = pn[i * 3 + 2];
    const dist = pd[i] + Math.abs(nx) * hx + Math.abs(ny) * hy + Math.abs(nz) * hz;
    const d1 = nx * sx + ny * sy + nz * sz - dist;
    const d2 = nx * ex + ny * ey + nz * ez - dist;
    if (d2 > 0) getout = true;
    if (d1 > 0) startout = true;
    // completely in front of this plane -> no hit on this brush
    // (the small tolerance on d2 >= d1 lets us slide exactly parallel to a
    // surface we're resting against without float noise registering a hit)
    if (d1 > 0 && (d2 >= DIST_EPSILON || d2 >= d1 - PARALLEL_TOL)) return;
    // completely behind this plane
    if (d1 <= 0 && d2 <= 0) continue;
    if (d1 > d2) { // entering
      let f = (d1 - DIST_EPSILON) / (d1 - d2);
      if (f < 0) f = 0;
      if (f > enterFrac) { enterFrac = f; clipIdx = i; }
    } else { // leaving
      let f = (d1 + DIST_EPSILON) / (d1 - d2);
      if (f > 1) f = 1;
      if (f < leaveFrac) leaveFrac = f;
    }
  }

  if (!startout) {
    tr.startsolid = true;
    if (!getout) { tr.allsolid = true; tr.fraction = 0; tr.brush = br; }
    return;
  }
  if (enterFrac < leaveFrac && enterFrac > -1 && enterFrac < tr.fraction) {
    tr.fraction = enterFrac < 0 ? 0 : enterFrac;
    tr.normal.set(pn[clipIdx * 3], pn[clipIdx * 3 + 1], pn[clipIdx * 3 + 2]);
    tr.brush = br;
  }
}

/** Axis-aligned trigger volume. */
export class Trigger {
  constructor(min, max, data = {}) {
    Object.assign(this, data);
    this.min = V3.from(min);
    this.max = V3.from(max);
  }
  touches(pos, ext) {
    return pos.x + ext.x > this.min.x && pos.x - ext.x < this.max.x &&
           pos.y + ext.y > this.min.y && pos.y - ext.y < this.max.y &&
           pos.z + ext.z > this.min.z && pos.z - ext.z < this.max.z;
  }
}
