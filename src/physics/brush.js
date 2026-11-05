// Convex brushes: built from a cloud of points (convex hull), they provide
//  - face planes + polygons (for rendering)
//  - extra "bevel" planes so that box traces against the brush are exact.
//
// A box sweeping against a convex brush is the same as a point (ray) sweeping
// against the Minkowski sum of the brush and the box. The Minkowski sum of two
// convex polytopes is bounded by planes whose normals are: the brush's face
// normals, the box's face normals (the 6 axes), and cross(brushEdge, boxEdge).
// We add supporting planes for all those directions, which gives a perfect
// collision shape with no "invisible ledge" artifacts at edges. That matters a
// lot for surf, where you slide across seams between ramp segments at speed.

import { V3 } from './vec.js';

const EPS = 1e-3;
const AXES = [new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)];

let nextId = 1;

export class Brush {
  /**
   * @param {Array<[number,number,number]|V3>} points convex point cloud
   * @param {object} [meta] arbitrary data: { kind: 'surf'|'floor'|..., color, ... }
   */
  constructor(points, meta = {}) {
    this.id = nextId++;
    this.meta = meta;
    this.points = dedupePoints(points.map(V3.from));
    this.faces = []; // { n: V3, d: number, poly: V3[] }
    this.planes = []; // { n: V3, d: number } (faces + bevels)
    this.min = new V3(Infinity, Infinity, Infinity);
    this.max = new V3(-Infinity, -Infinity, -Infinity);
    for (const p of this.points) {
      this.min.set(Math.min(this.min.x, p.x), Math.min(this.min.y, p.y), Math.min(this.min.z, p.z));
      this.max.set(Math.max(this.max.x, p.x), Math.max(this.max.y, p.y), Math.max(this.max.z, p.z));
    }
    this._buildHull();
    this._buildBevels();
    // Flat arrays for a fast trace inner loop.
    const n = this.planes.length;
    this.pn = new Float64Array(n * 3);
    this.pd = new Float64Array(n);
    this.planes.forEach((p, i) => {
      this.pn[i * 3] = p.n.x; this.pn[i * 3 + 1] = p.n.y; this.pn[i * 3 + 2] = p.n.z;
      this.pd[i] = p.d;
    });
  }

  _buildHull() {
    const pts = this.points;
    const n = pts.length;
    const scale = Math.max(1, this.max.x - this.min.x, this.max.y - this.min.y, this.max.z - this.min.z);
    const tol = scale * 1e-6 + 1e-4;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          const nrm = V3.cross(V3.sub(pts[j], pts[i]), V3.sub(pts[k], pts[i]));
          if (nrm.len() < 1e-9 * scale * scale) continue;
          nrm.normalize();
          const d = nrm.dot(pts[i]);
          let front = 0, back = 0;
          for (const p of pts) {
            const s = nrm.dot(p) - d;
            if (s > tol) front++;
            else if (s < -tol) back++;
          }
          if (front && back) continue;
          if (front) { nrm.scale(-1); }
          const dd = nrm.dot(pts[i]);
          if (this.faces.some((f) => f.n.dot(nrm) > 1 - 1e-6 && Math.abs(f.d - dd) < tol * 10)) continue;
          this.faces.push({ n: nrm, d: dd, poly: null });
        }
      }
    }
    // Build polygons for each face: gather coplanar points and sort by angle.
    for (const f of this.faces) {
      const on = pts.filter((p) => Math.abs(f.n.dot(p) - f.d) < tol * 10);
      const c = new V3();
      on.forEach((p) => c.add(p));
      c.scale(1 / on.length);
      // basis on plane
      const ref = Math.abs(f.n.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
      const u = V3.cross(ref, f.n).normalize();
      const v = V3.cross(f.n, u);
      on.sort((a, b) => {
        const aa = Math.atan2(V3.sub(a, c).dot(v), V3.sub(a, c).dot(u));
        const bb = Math.atan2(V3.sub(b, c).dot(v), V3.sub(b, c).dot(u));
        return aa - bb;
      });
      f.poly = on;
      this.planes.push({ n: f.n, d: f.d });
    }
  }

  _buildBevels() {
    const cands = [];
    for (const a of AXES) { cands.push(a.clone(), a.clone().scale(-1)); }
    // Edges: use the real polygon edges of the hull.
    const edges = [];
    for (const f of this.faces) {
      for (let i = 0; i < f.poly.length; i++) {
        const a = f.poly[i], b = f.poly[(i + 1) % f.poly.length];
        edges.push(V3.sub(b, a).normalize());
      }
    }
    for (const e of edges) {
      for (const a of AXES) {
        const c = V3.cross(e, a);
        if (c.len() < 1e-6) continue;
        c.normalize();
        cands.push(c, c.clone().scale(-1));
      }
    }
    for (const nrm of cands) {
      if (this.planes.some((p) => p.n.dot(nrm) > 1 - 1e-7)) continue;
      let d = -Infinity;
      for (const p of this.points) d = Math.max(d, nrm.dot(p));
      this.planes.push({ n: nrm, d, bevel: true });
    }
  }

  /** Unique polygon edges (pairs of V3) for line rendering. */
  edges() {
    const out = [];
    const key = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
    const seen = new Set();
    for (const f of this.faces) {
      for (let i = 0; i < f.poly.length; i++) {
        const a = f.poly[i], b = f.poly[(i + 1) % f.poly.length];
        const k1 = key(a), k2 = key(b);
        const k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push([a, b, f]);
      }
    }
    return out;
  }
}

function dedupePoints(pts) {
  const out = [];
  for (const p of pts) {
    if (!out.some((q) => Math.abs(q.x - p.x) < EPS && Math.abs(q.y - p.y) < EPS && Math.abs(q.z - p.z) < EPS)) out.push(p);
  }
  return out;
}
