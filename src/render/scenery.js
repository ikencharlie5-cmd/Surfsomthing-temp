// Themed scenery built procedurally around a map's guide line:
//   beach  - coastal cliffs that fall to a beach, ocean, neon palms, boardwalk, pier, retro props
//   canyon - layered rock canyon at night, mesas, arches, hoodoos, cacti, tumbleweeds, skulls
//   cave   - rough rock cave, stalactites/stalagmites, underground river
//
// Everything here is decoration: collisions use the map's smooth (hidden)
// shell brushes, so rough rock never scrubs your speed. Prop density scales
// with graphics quality.

import * as THREE from 'three';
import { FOG_COLOR, FOG_NEAR, FOG_FAR } from './renderer.js';
import { neonLines } from './worldMesh.js';
import { fbm3, rand } from './noise.js';

const DENSITY = { low: 0.35, medium: 0.6, high: 1, ultra: 1.25 };

// ---------------------------------------------------------------------------
// Geometry accumulator (flat-shaded, low-poly look)
// ---------------------------------------------------------------------------

class Geo {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.glow = []; this.sway = []; this.lp = []; this.lc = []; }

  tri(a, b, c, ca, cb = ca, cc = ca, glow = 0, sa = 0, sb = sa, sc = sa) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const [p, cl, s] of [[a, ca, sa], [b, cb, sb], [c, cc, sc]]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(cl[0], cl[1], cl[2]);
      this.glow.push(glow);
      this.sway.push(s);
    }
  }
  quad(a, b, c, d, col, glow = 0, sw = [0, 0, 0, 0]) {
    this.tri(a, b, c, col, col, col, glow, sw[0], sw[1], sw[2]);
    this.tri(a, c, d, col, col, col, glow, sw[0], sw[2], sw[3]);
  }
  line(a, b, c) { this.lp.push(...a, ...b); this.lc.push(...c, ...c); }

  /** Tapered cylinder from p0 to p1. */
  cyl(p0, p1, r0, r1, segs, col, glow = 0, s0 = 0, s1 = 0) {
    const d = norm(sub(p1, p0));
    const u = norm(cross(Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], d));
    const v = cross(d, u);
    const ring = (p, r, k) => { const a = (k / segs) * Math.PI * 2; return add(p, add(scale(u, Math.cos(a) * r), scale(v, Math.sin(a) * r))); };
    for (let k = 0; k < segs; k++) {
      const a0 = ring(p0, r0, k), a1 = ring(p0, r0, k + 1), b0 = ring(p1, r1, k), b1 = ring(p1, r1, k + 1);
      if (r1 > 0.01) this.quad(a0, a1, b1, b0, col, glow, [s0, s0, s1, s1]);
      else this.tri(a0, a1, p1, col, col, col, glow, s0, s0, s1);
    }
  }

  /** Axis-aligned-in-yaw box. */
  box(c, size, yaw, col, glow = 0) {
    const [sx, sy, sz] = size.map((x) => x / 2);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (x, y, z) => [c[0] + x * cs + z * sn, c[1] + y, c[2] - x * sn + z * cs];
    const v = [P(-sx, -sy, -sz), P(sx, -sy, -sz), P(sx, sy, -sz), P(-sx, sy, -sz), P(-sx, -sy, sz), P(sx, -sy, sz), P(sx, sy, sz), P(-sx, sy, sz)];
    const f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];
    for (const q of f) this.quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], col, glow);
  }

  /** Low-poly blob (icosahedron-ish). */
  blob(c, r, col, glow = 0, rng = Math.random, squash = 1) {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const p = g.attributes.position;
    const jit = new Map();
    const at = (i) => {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!jit.has(key)) jit.set(key, 0.75 + rng() * 0.5);
      const k = jit.get(key) * r;
      return [c[0] + p.getX(i) * k, c[1] + p.getY(i) * k * squash, c[2] + p.getZ(i) * k];
    };
    for (let i = 0; i < p.count; i += 3) this.tri(at(i), at(i + 1), at(i + 2), col, col, col, glow);
    g.dispose();
  }

  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    return m;
  }
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

function propMaterial(light) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLight: { value: new THREE.Vector3(...light.dir).normalize() },
      uLightCol: { value: new THREE.Color(...light.color) },
      uAmb: { value: new THREE.Color(...light.ambient) },
      uLamp: { value: light.lamp || 0 },
      uLampCol: { value: new THREE.Color(...(light.lampColor || [1, 1, 1])) },
      uFogColor: { value: FOG_COLOR }, uFogNear: FOG_NEAR, uFogFar: FOG_FAR,
    },
    vertexShader: /* glsl */`
      attribute vec3 color; attribute float aGlow; attribute float aSway;
      uniform float uTime;
      varying vec3 vColor; varying vec3 vN; varying float vGlow; varying float vDepth; varying vec3 vWorld;
      void main() {
        vec3 p = position;
        if (aSway > 0.0) {
          p.x += sin(uTime * 1.4 + position.z * 0.003 + position.x * 0.001) * aSway * 40.0;
          p.z += cos(uTime * 1.1 + position.x * 0.003) * aSway * 30.0;
          p.y += sin(uTime * 1.7 + position.x * 0.002) * aSway * 12.0;
        }
        vColor = color; vN = normal; vGlow = aGlow;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight; uniform vec3 uLightCol; uniform vec3 uAmb; uniform float uLamp; uniform vec3 uLampCol;
      uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      varying vec3 vColor; varying vec3 vN; varying float vGlow; varying float vDepth; varying vec3 vWorld;
      void main() {
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        float ndl = max(dot(N, uLight), 0.0);
        vec3 V = normalize(cameraPosition - vWorld);
        float lamp = uLamp * (1.0 - smoothstep(300.0, 4500.0, vDepth)) * (0.35 + 0.65 * max(dot(N, V), 0.0));
        vec3 c = vColor * (uAmb + uLightCol * ndl + uLampCol * lamp);
        c = mix(c, vColor * 2.2, vGlow);
        float fog = smoothstep(uFogNear, uFogFar, vDepth);
        gl_FragColor = vec4(mix(c, uFogColor, fog * (1.0 - vGlow * 0.5)), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

function waterMaterial(colA, colB) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(...colA) }, uB: { value: new THREE.Color(...colB) },
      uFogColor: { value: FOG_COLOR }, uFogNear: FOG_NEAR, uFogFar: FOG_FAR },
    vertexShader: `attribute float aFlow; varying float vFlow; varying vec3 vW; varying float vDepth;
      void main(){ vFlow = aFlow; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix*w; vDepth = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      varying float vFlow; varying vec3 vW; varying float vDepth;
      void main(){
        float r = sin(vFlow*0.004 - uTime*2.5 + sin(vW.x*0.003)*2.0) * sin(vW.z*0.0035 + uTime*0.7);
        float g = smoothstep(0.75, 1.0, r);
        vec3 c = mix(uA, uB, 0.5 + 0.5*r) + uB * g * 1.6;
        gl_FragColor = vec4(mix(c, uFogColor, smoothstep(uFogNear, uFogFar, vDepth)), 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------
// Frames along the guide line
// ---------------------------------------------------------------------------

/** Evenly spaced frames along the guide line: position, right vector, entry. */
function frames(line, step) {
  const out = [];
  let s = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i].p, b = line[i + 1].p;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ p: [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t], r: [-dz / len, 0, dx / len], f: [dx / len, 0, dz / len], e: line[i], s: s + len * t });
    }
    s += len;
  }
  const last = line[line.length - 1], prev = out[out.length - 1];
  out.push({ ...prev, p: [...last.p], e: last, s });
  // smooth the right vectors so rings don't kink at joints
  for (let i = 1; i < out.length - 1; i++) {
    const r = norm(add(add(out[i - 1].r, out[i].r), out[i + 1].r));
    out[i].rs = r;
  }
  for (const f of out) f.r = f.rs || f.r;
  return out;
}

const at = (f, lat, y) => [f.p[0] + f.r[0] * lat, y, f.p[2] + f.r[2] * lat];

/** Build a strip of rings: profile(frame) -> [[lat, y], ...]; displace/color callbacks. */
function strip(geo, fr, profile, { closed = false, displace, color }) {
  let prev = null;
  for (const f of fr) {
    const prof = profile(f);
    const ring = prof.map(([lat, y, nl = 0, ny = 0], j) => {
      let p = at(f, lat, y);
      if (displace) {
        const d = displace(p, j, prof.length, f);
        p = [p[0] + f.r[0] * nl * d, p[1] + ny * d, p[2] + f.r[2] * nl * d];
      }
      return p;
    });
    if (prev) {
      const n = ring.length;
      for (let j = 0; j < (closed ? n : n - 1); j++) {
        const j2 = (j + 1) % n;
        const a = prev[j], b = prev[j2], c = ring[j2], d = ring[j];
        const ca = color(a, j, f), cc = color(c, j, f);
        geo.tri(a, b, c, ca, ca, cc);
        geo.tri(a, c, d, ca, cc, cc);
      }
    }
    prev = ring;
  }
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export function buildTheme(map, quality = 'high') {
  const t = map.theme;
  if (!t) return null;
  const density = DENSITY[quality] ?? 1;
  if (t.type === 'beach') return buildBeach(map, t, density);
  if (t.type === 'canyon') return buildCanyon(map, t, density);
  if (t.type === 'cave') return buildCave(map, t, density);
  return null;
}

function finish(group, geo, mat, extraUpdate) {
  const mesh = geo.mesh(mat);
  mesh.frustumCulled = false;
  group.add(mesh);
  if (geo.lp.length) group.add(neonLines(geo.lp, geo.lc, 2));
  group.userData.update = (time, cam) => {
    mat.uniforms.uTime.value = time;
    for (const m of group.userData.mats || []) m.uniforms.uTime.value = time;
    if (extraUpdate) extraUpdate(time, cam);
  };
  return group;
}

// ----------------------------------------------------------------- beach

const SAND = [0.62, 0.38, 0.42];
const SAND_DARK = [0.45, 0.24, 0.36];
const CLIFF = [0.32, 0.16, 0.3];
const PALM_TRUNK = [0.22, 0.1, 0.2];
const PALM_LEAF = [0.05, 0.2, 0.22];
const NEON_PINK = [1.0, 0.25, 0.75];
const NEON_CYAN = [0.1, 0.95, 1.0];
const NEON_GREEN = [0.25, 1.0, 0.55];
const NEON_YEL = [1.0, 0.85, 0.3];

function buildBeach(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const rng = rand(t.seed || 3);
  // Riders surf the left face, so the ramp blocks the view to the right:
  // mirror the coast so the ocean is on the open (left) side.
  const fr = frames(map.line, 320);
  for (const f of fr) f.r = [-f.r[0], 0, -f.r[2]];
  const seaY = t.seaY;
  const landAt = (f) => Math.max(f.p[1] - f.e.height - 1900, seaY + 110);
  const w = (f) => f.e.width;
  const groundY = (f, lat) => {
    // matches the terrain profile below (before dune noise)
    const L = landAt(f), W = w(f);
    const pts = profileBeach(f, L, W, seaY);
    for (let i = 0; i < pts.length - 1; i++) {
      if (lat >= pts[i][0] && lat <= pts[i + 1][0]) {
        const k = (lat - pts[i][0]) / (pts[i + 1][0] - pts[i][0] || 1);
        return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k;
      }
    }
    return L;
  };
  const dune = (p) => (fbm3(p[0] / 1600, 0, p[2] / 1600, 3) - 0.5) * 420;

  strip(geo, fr, (f) => profileBeach(f, landAt(f), w(f), seaY), {
    displace: (p, j) => (j <= 4 ? dune(p) : j >= 7 ? (fbm3(p[0] / 500, p[1] / 500, p[2] / 500) - 0.5) * 200 : 0),
    color: (p, j) => {
      if (j >= 6 && p[1] > seaY + 60) return mix(CLIFF, SAND_DARK, fbm3(p[0] / 900, p[1] / 300, p[2] / 900));
      const k = fbm3(p[0] / 2500, 0, p[2] / 2500);
      return mix(SAND_DARK, SAND, k);
    },
  });

  // glowing shoreline where the cliff/beach meets the sea
  for (let i = 0; i < fr.length - 1; i += 1) {
    const a = fr[i], b = fr[i + 1];
    const la = shoreLat(a, landAt(a), w(a), seaY), lb = shoreLat(b, landAt(b), w(b), seaY);
    geo.line(at(a, la, seaY + 8), at(b, lb, seaY + 8), [0.4, 1.6, 1.8]);
    geo.line(at(a, la + 160, seaY + 4), at(b, lb + 160, seaY + 4), [0.6, 0.35, 1.2]);
  }

  // neon palms inland and along the cliff edge
  const leafCols = [NEON_GREEN, NEON_CYAN, NEON_PINK];
  for (let i = 0; i < fr.length; i += 1) {
    const f = fr[i];
    const n = Math.floor(rng() * 1.5 * density + 0.25);
    for (let k = 0; k < n; k++) {
      const lat = rng() < 0.25 ? w(f) + 250 + rng() * 350 : -(w(f) + 900 + rng() * 6000);
      const base = at(f, lat, 0);
      base[1] = groundY(f, lat) + dune(base) - 20;
      palm(geo, base, 700 + rng() * 900, rng, leafCols[Math.floor(rng() * leafCols.length)]);
    }
  }

  // boardwalk + lamps along the final stretch, and a pier into the sea
  const startBW = Math.floor(fr.length * 0.72);
  for (let i = startBW; i < fr.length - 1; i++) {
    const a = fr[i], b = fr[i + 1];
    const lat0 = -(w(a) + 1200), lat1 = lat0 - 520;
    const ya = groundY(a, lat0) + 60, yb = groundY(b, lat0) + 60;
    geo.quad(at(a, lat0, ya), at(a, lat1, ya), at(b, lat1, yb), at(b, lat0, yb), [0.3, 0.17, 0.12]);
    geo.line(at(a, lat0, ya + 4), at(b, lat0, yb + 4), [1.4, 0.6, 0.25]);
    geo.line(at(a, lat1, ya + 4), at(b, lat1, yb + 4), [1.4, 0.6, 0.25]);
    if (i % 2 === 0) for (const lat of [lat0, lat1]) {
      const p = at(a, lat, ya);
      geo.cyl(p, add(p, [0, 420, 0]), 10, 8, 5, [0.15, 0.08, 0.15]);
      geo.blob(add(p, [0, 440, 0]), 26, NEON_YEL, 1, rng);
    }
  }
  const end = fr[fr.length - 1];
  const pierY = seaY + 170;
  const shore = shoreLat(end, landAt(end), w(end), seaY);
  const pier0 = shore - 200, pier1 = shore + 5200;
  for (let k = 0; k < 26; k++) {
    const l0 = pier0 + ((pier1 - pier0) * k) / 26, l1 = pier0 + ((pier1 - pier0) * (k + 1)) / 26;
    geo.quad(at(end, l0, pierY), at(end, l1, pierY), add(at(end, l1, pierY), scale(end.f, 360)), add(at(end, l0, pierY), scale(end.f, 360)), [0.32, 0.18, 0.13]);
    if (k % 3 === 0) for (const side of [0, 360]) {
      const p = add(at(end, l0, pierY), scale(end.f, side));
      geo.cyl(add(p, [0, -400, 0]), p, 18, 18, 5, [0.18, 0.1, 0.12]);
      geo.cyl(p, add(p, [0, 380, 0]), 9, 7, 5, [0.15, 0.08, 0.15]);
      geo.blob(add(p, [0, 400, 0]), 24, k % 2 ? NEON_PINK : NEON_CYAN, 1, rng);
    }
  }
  geo.line(at(end, pier0, pierY + 5), at(end, pier1, pierY + 5), [1.8, 0.5, 1.4]);
  geo.line(add(at(end, pier0, pierY + 5), scale(end.f, 360)), add(at(end, pier1, pierY + 5), scale(end.f, 360)), [1.8, 0.5, 1.4]);
  // neon arch at the end of the pier
  const archC = add(at(end, pier1 - 100, pierY), scale(end.f, 180));
  for (let k = 0; k < 16; k++) {
    const a0 = (k / 16) * Math.PI, a1 = ((k + 1) / 16) * Math.PI;
    const p0 = add(archC, add(scale(end.f, Math.cos(a0) * 300), [0, Math.sin(a0) * 420, 0]));
    const p1 = add(archC, add(scale(end.f, Math.cos(a1) * 300), [0, Math.sin(a1) * 420, 0]));
    geo.line(p0, p1, [2.2, 0.4, 1.6]);
  }

  // lifeguard tower and a vintage car near the beach
  const lg = fr[Math.floor(fr.length * 0.9)];
  lifeguardTower(geo, at(lg, w(lg) + 450, groundY(lg, w(lg) + 450)), Math.atan2(lg.r[0], lg.r[2]), rng);
  const cf = fr[Math.floor(fr.length * 0.82)];
  const carLat = -(w(cf) + 1460);
  vintageCar(geo, at(cf, carLat, groundY(cf, -(w(cf) + 1200)) + 60), Math.atan2(cf.f[0], cf.f[2]));

  const mat = propMaterial(t.light || { dir: [0, 0.25, -1], color: [1.0, 0.55, 0.5], ambient: [0.3, 0.16, 0.32] });
  finish(group, geo, mat);

  // signs: neon title by the start, a retro billboard mid-way
  const s0 = fr[2];
  const signPos = at(s0, -(w(s0) + 1300), s0.p[1] - 150);
  group.add(textSign('VAPOR COAST', signPos, s0, 2600, 520, '#ff3ad8', '#00f0ff'));
  const sb = fr[Math.floor(fr.length * 0.45)];
  const bbPos = at(sb, -(w(sb) + 2600), groundY(sb, -(w(sb) + 2600)) + 1500);
  group.add(billboard(bbPos, sb, 2400, 1200));
  return group;
}

function profileBeach(f, L, W, seaY) {
  const cliffH = Math.max(0, L - seaY);
  return [
    [-(W + 9000), L + 2600, 0, 1],
    [-(W + 5200), L + 1100, 0, 1],
    [-(W + 2600), L + 320, 0, 1],
    [-(W + 1000), L + 40, 0, 1],
    [0, L, 0, 1],
    [W + 650, L - 20, 0, 0],
    [W + 760, L - cliffH * 0.15, 1, 0],
    [W + 860, L - cliffH * 0.6, 1, 0],
    [W + 950, seaY + 30, 1, 0],
    [W + 1500, seaY - 260, 0, 0],
    [W + 4200, seaY - 500, 0, 0],
  ];
}
function shoreLat(f, L, W) { return W + 940; }

function palm(geo, base, h, rng, leafCol) {
  const lean = [(rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5];
  const segs = 6;
  let prev = base;
  const pts = [base];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = add(base, [lean[0] * h * t * t, h * t, lean[2] * h * t * t]);
    geo.cyl(prev, p, 26 - t * 8, 24 - t * 8, 6, PALM_TRUNK, 0, (t - 1 / segs) * 0.3, t * 0.3);
    pts.push(p);
    prev = p;
  }
  // glowing trunk rings
  for (let i = 1; i < segs; i += 2) {
    const p = pts[i];
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2, a1 = ((k + 1) / 6) * Math.PI * 2;
      geo.line(add(p, [Math.cos(a0) * 26, 0, Math.sin(a0) * 26]), add(p, [Math.cos(a1) * 26, 0, Math.sin(a1) * 26]), scale(leafCol, 1.3));
    }
  }
  const top = prev;
  const nf = 7 + Math.floor(rng() * 3);
  for (let k = 0; k < nf; k++) {
    const a = (k / nf) * Math.PI * 2 + rng() * 0.4;
    const len = h * (0.45 + rng() * 0.2);
    const dir = [Math.cos(a), 0, Math.sin(a)];
    const side = [-dir[2], 0, dir[0]];
    let p = top;
    let spine = [top];
    for (let s = 1; s <= 5; s++) {
      const t = s / 5;
      const q = add(top, [dir[0] * len * t, len * (0.25 * t - 0.75 * t * t), dir[2] * len * t]);
      const wdt = Math.sin(t * Math.PI) * len * 0.16;
      const pl = add(p, scale(side, Math.sin((t - 0.2) * Math.PI) * len * 0.16 * 0.9));
      const pr = add(p, scale(side, -Math.sin((t - 0.2) * Math.PI) * len * 0.16 * 0.9));
      const ql = add(q, scale(side, wdt)), qr = add(q, scale(side, -wdt));
      geo.quad(p, q, ql, pl, PALM_LEAF, 0.15, [0.6 * (t - 0.2), 0.6 * t, 0.6 * t, 0.6 * (t - 0.2)]);
      geo.quad(p, pr, qr, q, PALM_LEAF, 0.15, [0.6 * (t - 0.2), 0.6 * (t - 0.2), 0.6 * t, 0.6 * t]);
      spine.push(q);
      p = q;
    }
    for (let s = 0; s < spine.length - 1; s++) geo.line(spine[s], spine[s + 1], scale(leafCol, 1.8));
  }
  for (let k = 0; k < 3; k++) geo.blob(add(top, [(rng() - 0.5) * 40, -30, (rng() - 0.5) * 40]), 16, [1.0, 0.45, 0.2], 0.8, rng);
}

function lifeguardTower(geo, base, yaw, rng) {
  const legs = [[-120, -120], [120, -120], [120, 120], [-120, 120]];
  for (const [x, z] of legs) geo.cyl(add(base, [x, 0, z]), add(base, [x * 0.7, 420, z * 0.7]), 10, 10, 4, [0.85, 0.85, 0.9]);
  geo.box(add(base, [0, 470, 0]), [260, 120, 260], yaw, [0.9, 0.25, 0.35]);
  geo.box(add(base, [0, 560, 0]), [300, 20, 300], yaw, [0.95, 0.95, 1.0]);
  geo.box(add(base, [0, 700, 0]), [6, 260, 6], 0, [0.9, 0.9, 0.9]);
  geo.box(add(base, [50, 790, 0]), [100, 60, 4], 0, NEON_PINK, 1);
  geo.line(add(base, [-130, 410, -130]), add(base, [130, 410, -130]), [2, 0.5, 1.5]);
}

function vintageCar(geo, p, yaw) {
  const body = [0.55, 0.12, 0.45];
  geo.box(add(p, [0, 70, 0]), [170, 60, 420], yaw, body);
  geo.box(add(p, [0, 125, -20]), [150, 55, 210], yaw, [0.25, 0.08, 0.25]);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const local = (x, y, z) => add(p, [x * cs + z * sn, y, -x * sn + z * cs]);
  for (const [x, z] of [[-90, -140], [90, -140], [-90, 140], [90, 140]]) {
    geo.cyl(local(x - 15, 40, z), local(x + 15, 40, z), 38, 38, 8, [0.05, 0.05, 0.07]);
  }
  for (const x of [-60, 60]) {
    geo.box(local(x, 80, 212), [40, 22, 6], yaw, [1, 0.1, 0.15], 1);
    geo.box(local(x, 80, -212), [40, 22, 6], yaw, [1, 0.95, 0.7], 1);
  }
  geo.line(local(-86, 100, -210), local(-86, 100, 210), [2, 0.4, 1.6]);
  geo.line(local(86, 100, -210), local(86, 100, 210), [2, 0.4, 1.6]);
}

function canvasPlane(draw, wpx, hpx, wWorld, hWorld) {
  const c = document.createElement('canvas');
  c.width = wpx; c.height = hpx;
  draw(c.getContext('2d'), wpx, hpx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wWorld, hWorld), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: true, side: THREE.DoubleSide, depthWrite: false }));
  return m;
}

function faceToward(obj, f, pos) {
  // face the course (toward the line centre)
  const target = new THREE.Vector3(f.p[0], pos[1], f.p[2]);
  obj.lookAt(target);
}

function textSign(text, pos, f, w, h, colA, colB) {
  const g = new THREE.Group();
  const plane = canvasPlane((ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    ctx.font = `900 ${Math.floor(H * 0.55)}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [blur, col] of [[40, colA], [18, colA], [0, '#ffffff']]) {
      ctx.shadowBlur = blur; ctx.shadowColor = col; ctx.fillStyle = blur ? col : '#fff';
      ctx.fillText(text, W / 2, H / 2);
    }
    ctx.shadowBlur = 20; ctx.shadowColor = colB; ctx.strokeStyle = colB; ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, W - 24, H - 24);
  }, 1024, 220, w, h);
  g.add(plane);
  g.position.set(...pos);
  faceToward(g, f, pos);
  return g;
}

function billboard(pos, f, w, h) {
  const g = new THREE.Group();
  const plane = canvasPlane((ctx, W, H) => {
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1a0638'); grd.addColorStop(0.55, '#ff3a8c'); grd.addColorStop(1, '#ffb347');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    // sun with stripes
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath(); ctx.arc(W * 0.3, H * 0.62, H * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3a8c';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, H * 0.62 + i * H * 0.05, W * 0.6, H * 0.018 + i * 2);
    ctx.font = `900 ${Math.floor(H * 0.17)}px Orbitron, sans-serif`;
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 20;
    ctx.fillText('SLIPSTREAM', W * 0.48, H * 0.3);
    ctx.font = `700 ${Math.floor(H * 0.09)}px Orbitron, sans-serif`;
    ctx.fillText('FM 88.7 · NEON NIGHTS', W * 0.5, H * 0.48);
    ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
  }, 1024, 512, w, h);
  g.add(plane);
  const legGeo = new THREE.BoxGeometry(60, 1600, 60);
  const legMat = new THREE.MeshBasicMaterial({ color: 0x140818, fog: true });
  for (const x of [-w * 0.35, w * 0.35]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, -h / 2 - 800, -20);
    g.add(leg);
  }
  g.position.set(...pos);
  faceToward(g, f, pos);
  return g;
}

// ----------------------------------------------------------------- canyon

const STRATA = [[0.42, 0.13, 0.08], [0.56, 0.24, 0.12], [0.36, 0.1, 0.1], [0.62, 0.36, 0.2], [0.48, 0.18, 0.1], [0.3, 0.09, 0.08]];

function strataColor(p) {
  const v = p[1] * 0.006 + fbm3(p[0] / 3000, p[1] / 900, p[2] / 3000, 3) * 3.0;
  const i = Math.floor(v), k = v - i;
  const a = STRATA[((i % STRATA.length) + STRATA.length) % STRATA.length];
  const b = STRATA[(((i + 1) % STRATA.length) + STRATA.length) % STRATA.length];
  return mix(a, b, Math.pow(k, 6));
}

function buildCanyon(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const rng = rand(t.seed || 9);
  const line = map.line;
  const fr = frames(line, 300).filter((f) => f.e.tunnel);
  const rough = (p, s = 1) => fbm3(p[0] / 900, p[1] / 700, p[2] / 900, 4) * s;

  strip(geo, fr, (f) => {
    const tn = f.e.tunnel;
    const L = f.e.width + tn.side;
    const top = f.p[1] + tn.top, floor = f.p[1] - f.e.height - (tn.bottom ?? 900) - 300;
    const H = top - floor;
    const prof = [[-(L + 3200), top + 500, 0, 1], [-(L + 1400), top + 220, 0, 1], [-(L + 120), top, -1, 0]];
    for (let k = 1; k <= 6; k++) prof.push([-(L + 40), top - (H * k) / 7, -1, 0]);
    prof.push([-(L * 0.55), floor + 60, 0, 1], [0, floor, 0, 1], [L * 0.55, floor + 60, 0, 1]);
    for (let k = 6; k >= 1; k--) prof.push([L + 40, top - (H * k) / 7, 1, 0]);
    prof.push([L + 120, top, 1, 0], [L + 1400, top + 220, 0, 1], [L + 3200, top + 500, 0, 1]);
    return prof;
  }, {
    displace: (p, j, n) => {
      const isWall = (j >= 2 && j <= 8) || (j >= n - 9 && j <= n - 3);
      // walls only push outward so the smooth collision shell stays inside the rock
      return isWall ? 30 + rough(p, 520) : (rough(p) - 0.5) * 360;
    },
    color: (p, j, f) => (p[1] < f.p[1] - f.e.height - 600 ? mix([0.42, 0.22, 0.13], [0.55, 0.32, 0.18], rough(p)) : strataColor(p)),
  });

  // mesas in the distance
  const nMesa = Math.round(28 * density);
  for (let i = 0; i < nMesa; i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const tn = f.e.tunnel;
    const side = rng() < 0.5 ? -1 : 1;
    const lat = side * (f.e.width + tn.side + 4500 + rng() * 9000);
    const base = at(f, lat, f.p[1] + tn.top - 400);
    const r = 900 + rng() * 1800, h = 1200 + rng() * 2800;
    mesa(geo, base, r, h, rng);
  }

  // arches spanning the canyon (you surf under them) and hoodoo pillars
  for (let i = 8; i < fr.length - 8; i += Math.round(26 / Math.max(0.5, density))) {
    if (rng() < 0.35) continue;
    arch(geo, fr[i], rng);
  }
  for (let i = 0; i < Math.round(60 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const tn = f.e.tunnel;
    const side = rng() < 0.5 ? -1 : 1;
    const L = f.e.width + tn.side;
    const onRim = rng() < 0.6;
    const lat = side * (onRim ? L + 500 + rng() * 2400 : L * (0.2 + rng() * 0.5));
    const y = onRim ? f.p[1] + tn.top + 100 : f.p[1] - f.e.height - (tn.bottom ?? 900) - 280;
    hoodoo(geo, at(f, lat, y), 300 + rng() * (onRim ? 1100 : 600), rng);
  }

  // neon saguaros and cattle skulls on the rims
  for (let i = 0; i < Math.round(90 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const tn = f.e.tunnel;
    const side = rng() < 0.5 ? -1 : 1;
    const lat = side * (f.e.width + tn.side + 300 + rng() * 2600);
    const y = f.p[1] + tn.top + 80 + (Math.abs(lat) - f.e.width - tn.side) * 0.12;
    if (rng() < 0.82) saguaro(geo, at(f, lat, y), 350 + rng() * 450, rng);
    else skull(geo, at(f, lat, y + 10), rng() * Math.PI * 2);
  }

  const mat = propMaterial(t.light || { dir: [0.35, 0.7, -0.6], color: [0.42, 0.5, 0.8], ambient: [0.16, 0.1, 0.14], lamp: 0.35, lampColor: [1.0, 0.6, 0.4] });

  // tumbleweeds rolling along the rims
  const weeds = [];
  const weedGeo = new THREE.IcosahedronGeometry(70, 1);
  const weedMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.6, 0.3), wireframe: true, fog: true });
  for (let i = 0; i < Math.round(14 * density); i++) {
    const m = new THREE.Mesh(weedGeo, weedMat);
    const f0 = Math.floor(rng() * (fr.length - 20));
    weeds.push({ m, f0, side: rng() < 0.5 ? -1 : 1, off: 300 + rng() * 1800, speed: 0.6 + rng() * 1.2, phase: rng() * 10 });
    group.add(m);
  }
  finish(group, geo, mat, (time) => {
    for (const w of weeds) {
      const u = (w.f0 + time * w.speed) % (fr.length - 1);
      const i = Math.floor(u), k = u - i;
      const a = fr[i], b = fr[i + 1];
      const tn = a.e.tunnel;
      const lat = w.side * (a.e.width + tn.side + w.off);
      const pa = at(a, lat, a.p[1] + tn.top), pb = at(b, lat, b.p[1] + tn.top);
      const bounce = Math.abs(Math.sin(time * 3 + w.phase)) * 120;
      w.m.position.set(pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k + 150 + bounce, pa[2] + (pb[2] - pa[2]) * k);
      w.m.rotation.set(time * 2 + w.phase, 0, time * 1.3);
    }
  });
  return group;
}

function mesa(geo, base, r, h, rng) {
  const segs = 7;
  const ring = (y, rr) => Array.from({ length: segs }, (_, k) => {
    const a = (k / segs) * Math.PI * 2 + 0.3;
    const j = 0.8 + rng() * 0.35;
    return add(base, [Math.cos(a) * rr * j, y, Math.sin(a) * rr * j]);
  });
  const levels = [[0, r * 1.35], [h * 0.45, r * 1.12], [h * 0.9, r], [h, r * 0.96]];
  let prev = null;
  for (const [y, rr] of levels) {
    const ring2 = ring(y, rr);
    if (prev) for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      geo.quad(prev[k], prev[k2], ring2[k2], ring2[k], strataColor(add(base, [0, y, 0])));
    }
    prev = ring2;
  }
  const c = add(base, [0, h, 0]);
  for (let k = 0; k < segs; k++) geo.tri(prev[k], prev[(k + 1) % segs], c, [0.5, 0.22, 0.12]);
}

function arch(geo, f, rng) {
  const tn = f.e.tunnel;
  const L = f.e.width + tn.side;
  const top = f.p[1] + tn.top;
  const span = L + 260;
  const rise = 900 + rng() * 500;
  const thick = 260 + rng() * 120;
  const steps = 14;
  for (let k = 0; k < steps; k++) {
    const a0 = (k / steps) * Math.PI, a1 = ((k + 1) / steps) * Math.PI;
    const c0 = at(f, -Math.cos(a0) * span, top - 300 + Math.sin(a0) * rise);
    const c1 = at(f, -Math.cos(a1) * span, top - 300 + Math.sin(a1) * rise);
    const up0 = [0, thick, 0], up1 = [0, thick, 0];
    const d = scale(f.f, thick * 0.9);
    const col = strataColor(c0);
    // four faces of the arch segment
    geo.quad(sub(c0, d), sub(c1, d), add(sub(c1, d), up1), add(sub(c0, d), up0), col);
    geo.quad(add(c0, d), add(add(c0, d), up0), add(add(c1, d), up1), add(c1, d), col);
    geo.quad(add(sub(c0, d), up0), add(sub(c1, d), up1), add(add(c1, d), up1), add(add(c0, d), up0), col);
    geo.quad(sub(c0, d), add(c0, d), add(c1, d), sub(c1, d), mix(col, [0.2, 0.08, 0.06], 0.4));
  }
}

function hoodoo(geo, base, h, rng) {
  let p = base;
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const seg = h / n;
    const r = 70 + rng() * 90;
    const q = add(p, [(rng() - 0.5) * 40, seg, (rng() - 0.5) * 40]);
    geo.cyl(p, q, r * (0.8 + rng() * 0.4), r * 0.75, 6, strataColor(p));
    p = q;
  }
  geo.blob(add(p, [0, 50, 0]), 110 + rng() * 60, [0.3, 0.12, 0.09], 0, rng, 0.55);
}

function saguaro(geo, base, h, rng) {
  const green = [0.06, 0.22, 0.12];
  const glow = [0.3, 1.6, 0.7];
  const top = add(base, [0, h, 0]);
  geo.cyl(base, top, 34, 30, 7, green);
  geo.blob(top, 30, green, 0, rng, 1);
  geo.line(add(base, [34, 0, 0]), add(top, [30, 0, 0]), glow);
  geo.line(add(base, [-34, 0, 0]), add(top, [-30, 0, 0]), glow);
  const arms = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < arms; i++) {
    const a = rng() * Math.PI * 2;
    const dir = [Math.cos(a), 0, Math.sin(a)];
    const y0 = h * (0.3 + rng() * 0.3);
    const p0 = add(base, [0, y0, 0]);
    const p1 = add(p0, scale(dir, 90 + rng() * 40));
    const p2 = add(p1, [0, h * (0.25 + rng() * 0.25), 0]);
    geo.cyl(p0, p1, 22, 22, 6, green);
    geo.cyl(p1, p2, 22, 20, 6, green);
    geo.blob(p2, 20, green, 0, rng, 1);
    geo.line(p0, p1, glow);
    geo.line(p1, p2, glow);
  }
}

function skull(geo, p, yaw) {
  const bone = [0.85, 0.82, 0.72];
  geo.box(add(p, [0, 28, 0]), [70, 50, 90], yaw, bone);
  geo.box(add(p, [0, 18, 0]), [40, 30, 70], yaw, bone);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  for (const s of [-1, 1]) {
    const h0 = add(p, [s * 35 * cs, 40, -s * 35 * sn]);
    const h1 = add(p, [s * 110 * cs, 90, -s * 110 * sn]);
    geo.cyl(h0, h1, 12, 2, 5, bone);
  }
  geo.box(add(p, [-15 * cs, 34, 15 * sn - 40]), [12, 12, 4], yaw, [0.1, 1, 0.5], 1);
}

// ----------------------------------------------------------------- cave

function buildCave(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const rng = rand(t.seed || 4);
  const fr = frames(map.line, 280).filter((f) => f.e.tunnel);
  const RING = 28;
  const rough = (p) => fbm3(p[0] / 650, p[1] / 650, p[2] / 650, 4);
  const shape = (f) => {
    const tn = f.e.tunnel;
    const L = f.e.width + tn.side;
    const top = f.p[1] + tn.top;
    const bottom = f.p[1] - f.e.height - (tn.bottom ?? 600) - 900;
    const cy = (top + bottom) / 2 + 250;
    return { L, top, bottom, cy };
  };
  strip(geo, fr, (f) => {
    const { L, top, bottom, cy } = shape(f);
    const prof = [];
    for (let j = 0; j < RING; j++) {
      const a = (j / RING) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const ex = 2 / 4; // superellipse, n = 4 (boxy)
      const x = Math.sign(c) * Math.pow(Math.abs(c), ex) * (L + 70);
      const y = cy + Math.sign(s) * Math.pow(Math.abs(s), ex) * (s > 0 ? top + 70 - cy : cy - bottom);
      prof.push([x, y, c, s]);
    }
    return prof;
  }, {
    closed: true,
    displace: (p) => 20 + rough(p) * 480,
    color: (p) => {
      const k = rough([p[0] * 2, p[1] * 2, p[2] * 2]);
      return mix([0.06, 0.07, 0.11], [0.2, 0.2, 0.28], k);
    },
  });

  // stalactites from the ceiling, stalagmites from the river banks
  for (let i = 0; i < fr.length; i++) {
    const f = fr[i];
    const { L, top, bottom } = shape(f);
    const nT = Math.round((1 + rng() * 2) * density);
    for (let k = 0; k < nT; k++) {
      const lat = (rng() < 0.5 ? -1 : 1) * L * (0.45 + rng() * 0.5);
      const base = at(f, lat, top + 160);
      const len = 180 + rng() * 380;
      geo.cyl(base, add(base, [0, -len, 0]), 40 + rng() * 50, 0, 6, [0.13, 0.13, 0.19]);
    }
    const nM = Math.round(rng() * 2 * density);
    for (let k = 0; k < nM; k++) {
      const lat = (rng() < 0.5 ? -1 : 1) * L * (0.5 + rng() * 0.6);
      const base = at(f, lat, bottom + 520);
      geo.cyl(base, add(base, [0, 300 + rng() * 700, 0]), 70 + rng() * 60, 0, 6, [0.12, 0.12, 0.17]);
    }
    // crystal clusters on the banks
    if (rng() < 0.45 * density) {
      const lat = (rng() < 0.5 ? -1 : 1) * L * (0.6 + rng() * 0.4);
      const c = at(f, lat, bottom + 560);
      const col = [[0.3, 1.0, 1.0], [0.6, 0.5, 1.0], [0.4, 0.8, 1.0]][Math.floor(rng() * 3)];
      for (let n = 0; n < 4; n++) {
        const tip = add(c, [(rng() - 0.5) * 260, 250 + rng() * 350, (rng() - 0.5) * 260]);
        geo.cyl(add(c, [(rng() - 0.5) * 80, 0, (rng() - 0.5) * 80]), tip, 40 + rng() * 30, 0, 5, col, 0.7);
      }
    }
  }

  const mat = propMaterial(t.light || { dir: [0, 1, 0], color: [0.05, 0.08, 0.12], ambient: [0.05, 0.06, 0.09], lamp: 1.2, lampColor: [0.55, 0.85, 1.0] });
  finish(group, geo, mat);

  // underground river along the cave floor
  const wpos = [], wflow = [];
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i], b = fr[i + 1];
    const sa = shape(a), sb = shape(b);
    const ya = sa.bottom + 480, yb = sb.bottom + 480;
    const A0 = at(a, -sa.L - 300, ya), A1 = at(a, sa.L + 300, ya), B0 = at(b, -sb.L - 300, yb), B1 = at(b, sb.L + 300, yb);
    wpos.push(...A0, ...A1, ...B1, ...A0, ...B1, ...B0);
    wflow.push(a.s, a.s, b.s, a.s, b.s, b.s);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wg.setAttribute('aFlow', new THREE.Float32BufferAttribute(wflow, 1));
  const wm = waterMaterial([0.0, 0.05, 0.09], [0.1, 0.7, 0.9]);
  const water = new THREE.Mesh(wg, wm);
  water.frustumCulled = false;
  group.add(water);
  (group.userData.mats ??= []).push(wm);
  return group;
}
