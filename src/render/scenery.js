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
  if (t.type === 'city') return buildCity(map, t, density);
  if (t.type === 'station') return buildStation(map, t, density);
  if (t.type === 'servers') return buildServers(map, t, density);
  return null;
}

// ---------------------------------------------------------------------------
// Animated light points: steady, blinking, or flowing from a to b.
// ---------------------------------------------------------------------------

class Lights {
  constructor() { this.a = []; this.b = []; this.col = []; this.par = []; }
  /** steady or blinking light. blink: 0 = steady, else blinks per second */
  dot(p, color, size = 40, blink = 0, phase = Math.random()) {
    this.a.push(...p); this.b.push(...p); this.col.push(...color); this.par.push(size, blink, phase, 0);
  }
  /** a light that travels from a to b and loops (speed = loops per second) */
  flow(a, b, color, size = 40, speed = 0.2, phase = Math.random()) {
    this.a.push(...a); this.b.push(...b); this.col.push(...color); this.par.push(size, 0, phase, speed);
  }
  points() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.a, 3));
    g.setAttribute('aB', new THREE.Float32BufferAttribute(this.b, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPar', new THREE.Float32BufferAttribute(this.par, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFogColor: { value: FOG_COLOR }, uFogNear: FOG_NEAR, uFogFar: FOG_FAR },
      vertexShader: /* glsl */`
        attribute vec3 aB; attribute vec3 color; attribute vec4 aPar;
        uniform float uTime;
        varying vec3 vC; varying float vA; varying float vDepth;
        void main() {
          float t = aPar.w > 0.0 ? fract(aPar.z + uTime * aPar.w) : 0.0;
          vec3 p = mix(position, aB, t);
          float on = aPar.y > 0.0 ? step(0.5, fract(uTime * aPar.y + aPar.z)) : 1.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          vC = color; vA = on;
          gl_PointSize = clamp(aPar.x * 900.0 / -mv.z, 1.5, 16.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
        varying vec3 vC; varying float vA; varying float vDepth;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * vA * (1.0 - smoothstep(uFogNear, uFogFar * 1.3, vDepth));
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC * 2.0 * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return pts;
  }
}

/** Window-lit boxes for distant skylines (no collision). */
function windowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFogColor: { value: FOG_COLOR }, uFogNear: FOG_NEAR, uFogFar: FOG_FAR },
    vertexShader: `attribute vec3 color; varying vec3 vC; varying vec3 vW; varying vec3 vN; varying float vDepth;
      void main(){ vC = color; vN = normal; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix*w; vDepth = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      varying vec3 vC; varying vec3 vW; varying vec3 vN; varying float vDepth;
      void main(){
        vec3 an = abs(normalize(vN));
        vec2 uv = an.x > an.z ? vW.zy : vW.xy;
        vec2 cell = floor(uv / vec2(110.0, 140.0)); vec2 f = fract(uv / vec2(110.0, 140.0));
        float win = step(0.3, f.x) * step(f.x, 0.7) * step(0.3, f.y) * step(f.y, 0.7) * step(an.y, 0.5);
        float on = step(0.6, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
        vec3 c = vec3(0.01, 0.008, 0.025) + vC * win * on * 0.8;
        gl_FragColor = vec4(mix(c, uFogColor, smoothstep(uFogNear, uFogFar * 1.6, vDepth) * 0.85), 1.0);
      }`,
  });
}

function finishLights(group, lights) {
  if (!lights.a.length) return;
  const pts = lights.points();
  group.add(pts);
  (group.userData.mats ??= []).push(pts.material);
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
  // A wild, empty beach. The dunes follow the course down (a fixed distance
  // under the ramps) and slope gently to the ocean on the rider's open side
  // (lat > 0); near the finish they flatten out into the beach itself.
  const group = new THREE.Group();
  const geo = new Geo();
  const rng = rand(t.seed || 3);
  let fr = frames(map.line, 320);
  fr = extendFrames(fr, 7000, 16000, 320);
  for (const f of fr) f.r = [-f.r[0], 0, -f.r[2]];
  const seaY = t.seaY;
  const drop = t.sandDrop ?? 700;
  const W = (f) => f.e.width;
  const landY = (f) => Math.max(f.p[1] - f.e.height - drop, seaY + 40);
  const H = (f) => landY(f) - seaY;
  const shore = (f) => W(f) + 1300 + H(f) * 2.4;
  const dune = (p) => (fbm3(p[0] / 1500, 0, p[2] / 1500, 3) - 0.5) * 160;
  const prof = (f) => {
    const L = landY(f), w = W(f), S = shore(f), h = H(f);
    const k = (x) => w + 700 + (S - w - 700) * x;
    return [
      [-(w + 16000), L + 2600], [-(w + 8000), L + 1100], [-(w + 3500), L + 260], [-(w + 1200), L + 40],
      [0, L], [w + 700, L - 20], [k(0.3), L - h * 0.32], [k(0.6), L - h * 0.68], [k(0.85), seaY + h * 0.08 + 20],
      [S, seaY + 4], [S + 500, seaY - 60], [S + 1500, seaY - 280],
    ];
  };
  const groundY = (f, lat) => {
    const pts = prof(f);
    for (let i = 0; i < pts.length - 1; i++) {
      if (lat >= pts[i][0] && lat <= pts[i + 1][0]) {
        const k = (lat - pts[i][0]) / (pts[i + 1][0] - pts[i][0] || 1);
        return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k;
      }
    }
    return seaY;
  };
  const SAND_A = [0.98, 0.64, 0.54], SAND_B = [1.0, 0.76, 0.6], SAND_WET = [0.55, 0.33, 0.36];

  strip(geo, fr, (f) => prof(f).map(([l, y], j) => [l, y, 0, 1]), {
    displace: (p, j) => (j <= 1 ? (fbm3(p[0] / 5000, 0, p[2] / 5000, 3) - 0.35) * 2200 : j <= 8 ? dune(p) : 0),
    color: (p, j) => {
      if (j >= 9) return SAND_WET;
      const k = fbm3(p[0] / 1100, 0, p[2] / 1100, 2);
      const c = mix(SAND_A, SAND_B, k);
      return j <= 1 ? mix(c, [0.8, 0.45, 0.55], 0.35) : c;
    },
  });

  // rocky headland under the start platform
  const sp = map.spawn.pos;
  const f0 = fr.find((f) => !f.ext) || fr[0];
  const base0 = landY(f0);
  // (rock stays below the platform top and behind its front edge)
  const topRock = sp[1] - 140;
  for (let i = 0; i < 30; i++) {
    const r = 220 + rng() * 360;
    const y = base0 + rng() * Math.max(0, topRock - r - base0);
    const off = [(rng() - 0.5) * 1100, 0, (rng() - 0.5) * 1100];
    geo.blob(add([sp[0] - f0.f[0] * (r + 250), y, sp[2] - f0.f[2] * (r + 250)], off), r, mix([0.28, 0.16, 0.24], [0.42, 0.24, 0.3], rng()), 0, rng, 0.8);
  }

  // scattered clusters of neon palms (and the odd lonely one)
  const leafCols = [NEON_GREEN, NEON_CYAN, NEON_PINK];
  const nClusters = Math.round(16 * density);
  for (let c = 0; c < nClusters; c++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const lat = rng() < 0.6 ? -(W(f) + 1500 + rng() * 5000) : W(f) + 900 + rng() * (shore(f) - W(f) - 1500);
    const n = 2 + Math.floor(rng() * 5);
    const col = leafCols[Math.floor(rng() * leafCols.length)];
    for (let k = 0; k < n; k++) {
      const l2 = lat + (rng() - 0.5) * 900;
      const base = at(f, l2, 0);
      base[0] += f.f[0] * (rng() - 0.5) * 900; base[2] += f.f[2] * (rng() - 0.5) * 900;
      base[1] = groundY(f, l2) + dune(base) - 15;
      palm(geo, base, 650 + rng() * 800, rng, rng() < 0.75 ? col : leafCols[Math.floor(rng() * 3)]);
    }
  }
  for (let i = 0; i < Math.round(10 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const lat = W(f) + 1200 + rng() * (shore(f) - W(f) - 1600);
    const base = at(f, lat, 0); base[1] = groundY(f, lat) + dune(base) - 15;
    palm(geo, base, 800 + rng() * 600, rng, leafCols[Math.floor(rng() * 3)]);
  }

  // beach grass tufts glowing on the dunes
  for (let i = 0; i < Math.round(260 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const lat = -(W(f) + 500 + rng() * 5000) * (rng() < 0.7 ? 1 : -0.4);
    const base = at(f, lat, 0); base[1] = groundY(f, lat) + dune(base);
    const col = rng() < 0.5 ? [0.3, 1.2, 0.8] : [0.9, 0.5, 1.2];
    for (let k = 0; k < 5; k++) {
      const a = rng() * Math.PI * 2, h = 70 + rng() * 90;
      geo.line(base, add(base, [Math.cos(a) * 40, h, Math.sin(a) * 40]), col);
    }
  }

  // boulders and driftwood along the waterline
  for (let i = 0; i < fr.length; i++) {
    const f = fr[i];
    if (rng() < 0.22 * density) {
      const lat = shore(f) - 200 - rng() * 700;
      const base = at(f, lat, 0); base[1] = groundY(f, lat);
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) geo.blob(add(base, [(rng() - 0.5) * 300, 20, (rng() - 0.5) * 300]), 70 + rng() * 140, mix([0.25, 0.15, 0.22], [0.4, 0.25, 0.3], rng()), 0, rng, 0.7);
    }
    if (rng() < 0.12 * density) {
      const lat = shore(f) - 300 - rng() * 1200;
      const base = at(f, lat, 0); base[1] = groundY(f, lat) + 15;
      const a = rng() * Math.PI;
      const len = 250 + rng() * 300;
      geo.cyl(add(base, [Math.cos(a) * -len / 2, 0, Math.sin(a) * -len / 2]), add(base, [Math.cos(a) * len / 2, 10, Math.sin(a) * len / 2]), 18, 12, 5, [0.45, 0.32, 0.3]);
    }
  }

  // sea stacks and a rock arch out in the ocean
  for (let i = 0; i < Math.round(9 * density) + 2; i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const base = at(f, shore(f) + 2500 + rng() * 14000, seaY - 100);
    const h = 900 + rng() * 2600;
    let p = base;
    const n = 4;
    for (let k = 0; k < n; k++) {
      const q = add(p, [(rng() - 0.5) * 120, h / n, (rng() - 0.5) * 120]);
      geo.cyl(p, q, 420 - k * 60 + rng() * 80, 360 - k * 60, 7, mix([0.24, 0.13, 0.22], [0.36, 0.2, 0.28], rng()));
      p = q;
    }
    geo.blob(p, 260, [0.3, 0.17, 0.25], 0, rng, 0.5);
    if (rng() < 0.5) palm(geo, add(p, [0, 80, 0]), 500 + rng() * 300, rng, leafCols[Math.floor(rng() * 3)]);
  }
  const af = fr[Math.floor(fr.length * 0.55)];
  const ac = at(af, shore(af) + 6000, seaY - 100);
  for (let k = 0; k < 16; k++) {
    const a0 = (k / 16) * Math.PI, a1 = ((k + 1) / 16) * Math.PI;
    const p0 = add(ac, add(scale(af.f, Math.cos(a0) * 1800), [0, Math.sin(a0) * 2200, 0]));
    const p1 = add(ac, add(scale(af.f, Math.cos(a1) * 1800), [0, Math.sin(a1) * 2200, 0]));
    geo.cyl(p0, p1, 380, 380, 6, [0.32, 0.18, 0.26]);
  }

  // rolling surf along the shore
  group.add(surfZone(fr, shore, seaY));

  const mat = propMaterial({ dir: [0, 0.35, -1], color: [0.75, 0.42, 0.42], ambient: [0.45, 0.28, 0.42] });
  finish(group, geo, mat);
  (group.userData.mats ??= []).push(group.children.find((c) => c.userData.surf)?.material);
  group.userData.mats = group.userData.mats.filter(Boolean);
  return group;
}

/** A rough wall across the course at frame f (dir: +1 faces forward, -1 faces back). */
function capWall(geo, f, dir, halfW, y0, y1, colorFn, roughAmp) {
  const NX = 14, NY = 10;
  const grid = [];
  for (let i = 0; i <= NX; i++) {
    const row = [];
    for (let j = 0; j <= NY; j++) {
      const lat = -halfW + (2 * halfW * i) / NX;
      const y = y0 + ((y1 - y0) * j) / NY;
      let p = at(f, lat, y);
      if (roughAmp) {
        const n = fbm3(p[0] / 700, p[1] / 700, p[2] / 700, 3);
        p = add(p, scale(f.f, dir * -1 * (n * roughAmp)));
      }
      row.push(p);
    }
    grid.push(row);
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
    const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
    const col = colorFn(a);
    geo.tri(a, b, c, col); geo.tri(a, c, d, col);
  }
}

/** Continue the frames straight past both ends (scenery past start and finish). */
function extendFrames(fr, before, after, step) {
  const first = fr[0], last = fr[fr.length - 1];
  const pre = [], post = [];
  for (let d = before; d > 0; d -= step) pre.push({ ...first, p: [first.p[0] - first.f[0] * d, first.p[1], first.p[2] - first.f[2] * d], s: first.s - d, ext: true });
  for (let d = step; d <= after; d += step) post.push({ ...last, p: [last.p[0] + last.f[0] * d, last.p[1], last.p[2] + last.f[2] * d], s: last.s + d, ext: true });
  return [...pre, ...fr, ...post];
}

function surfZone(fr, shore, seaY) {
  const pos = [], dist = [], flow = [];
  const D = 2200;
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i], b = fr[i + 1];
    const sa = typeof shore === 'function' ? shore(a) : shore, sb = typeof shore === 'function' ? shore(b) : shore;
    const A0 = at(a, sa - 250, seaY + 6), A1 = at(a, sa + D, seaY + 6), B0 = at(b, sb - 250, seaY + 6), B1 = at(b, sb + D, seaY + 6);
    pos.push(...A0, ...A1, ...B1, ...A0, ...B1, ...B0);
    dist.push(-250, D, D, -250, D, -250);
    flow.push(a.s, a.s, b.s, a.s, b.s, b.s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFogColor: { value: FOG_COLOR }, uFogNear: FOG_NEAR, uFogFar: FOG_FAR },
    vertexShader: `attribute float aDist; attribute float aFlow; varying float vD; varying float vF; varying float vDepth;
      void main(){ vD = aDist; vF = aFlow; vec4 mv = modelViewMatrix*vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      varying float vD; varying float vF; varying float vDepth;
      void main(){
        float wob = sin(vF * 0.002 + uTime * 0.6) * 60.0 + sin(vF * 0.0007 - uTime * 0.3) * 90.0;
        float d = vD + wob;
        // foam bands rolling in toward the shore
        float band = fract(d / 520.0 + uTime * 0.18);
        float foam = smoothstep(0.86, 0.97, band) * smoothstep(${2200}.0, 300.0, d);
        float edge = smoothstep(120.0, 0.0, abs(d - 40.0 * sin(uTime * 0.8)));
        float wet = smoothstep(0.0, -250.0, d) * 0.35;
        vec3 c = vec3(0.6, 0.95, 1.0) * foam * 0.9 + vec3(1.0, 0.85, 0.95) * edge * 1.3;
        float a = clamp(foam * 0.9 + edge + wet, 0.0, 1.0) * (1.0 - smoothstep(uFogNear, uFogFar, vDepth));
        gl_FragColor = vec4(c + vec3(0.15, 0.05, 0.1) * wet, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.userData.surf = true;
  return mesh;
}





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
  const fr = extendFrames(frames(line, 300).filter((f) => f.e.tunnel), 4500, 9000, 300);
  const rough = (p, s = 1) => fbm3(p[0] / 900, p[1] / 700, p[2] / 900, 4) * s;
  // solid rock walls closing off both ends, so you never see out
  for (const [f, dir] of [[fr[0], 1], [fr[fr.length - 1], -1]]) {
    const tn = f.e.tunnel;
    const L = f.e.width + tn.side;
    capWall(geo, f, dir, L + 3600, f.p[1] - f.e.height - (tn.bottom ?? 900) - 400, f.p[1] + tn.top + 1400, (p) => strataColor(p), 600);
  }

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
  const fr = extendFrames(frames(map.line, 280).filter((f) => f.e.tunnel), 2500, 5000, 280);
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
  for (const [f, dir] of [[fr[0], 1], [fr[fr.length - 1], -1]]) {
    const { L, top, bottom } = shape(f);
    capWall(geo, f, dir, L + 700, bottom - 300, top + 700, (p) => mix([0.06, 0.07, 0.11], [0.2, 0.2, 0.28], rough(p)), 400);
  }
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

// ----------------------------------------------------------------- city

const SIGN_WORDS = ['NEO', 'SYNTH', 'ARCADE', 'HOTEL', 'NOODLES', 'DISCO', 'RADIO', 'MOTEL', 'CYBER', 'VHS', 'CAFE', '24H'];
const SIGN_COLS = [['#ff3ad8', '#00f0ff'], ['#00f0ff', '#ff3ad8'], ['#ffe14d', '#ff3a8c'], ['#3dff9a', '#9b4dff']];

function buildCity(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 17);
  const streetY = t.streetY;
  const towers = map.brushes.filter((b) => b.kind === 'building').map((b) => {
    const xs = b.points.map((p) => p[0]), ys = b.points.map((p) => p[1]), zs = b.points.map((p) => p[2]);
    return { min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)], color: b.color };
  });
  const nearestLine = (x, z) => {
    let best = null, bd = Infinity;
    for (const e of map.line) { const d = (e.p[0] - x) ** 2 + (e.p[2] - z) ** 2; if (d < bd) { bd = d; best = e; } }
    return best;
  };

  for (const tw of towers) {
    const cx = (tw.min[0] + tw.max[0]) / 2, cz = (tw.min[2] + tw.max[2]) / 2, top = tw.max[1];
    const sx = tw.max[0] - tw.min[0], sz = tw.max[2] - tw.min[2];
    const col = tw.color;
    let roof = top;
    if (rng() < 0.55) {
      // setback crown
      const k = 0.55 + rng() * 0.25, h = 300 + rng() * 700;
      geo.box([cx, top + h / 2, cz], [sx * k, h, sz * k], 0, [0.03, 0.02, 0.05]);
      const x0 = cx - sx * k / 2, x1 = cx + sx * k / 2, z0 = cz - sz * k / 2, z1 = cz + sz * k / 2;
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) geo.line([x, top, z], [x, top + h, z], scale(col, 1.3));
      geo.line([x0, top + h, z0], [x1, top + h, z0], scale(col, 1.6)); geo.line([x1, top + h, z0], [x1, top + h, z1], scale(col, 1.6));
      geo.line([x1, top + h, z1], [x0, top + h, z1], scale(col, 1.6)); geo.line([x0, top + h, z1], [x0, top + h, z0], scale(col, 1.6));
      roof = top + h;
    }
    if (rng() < 0.45) {
      // antenna / spire with an aircraft-warning beacon
      const h = 400 + rng() * 1400;
      geo.cyl([cx, roof, cz], [cx, roof + h, cz], 18, 4, 5, [0.15, 0.15, 0.2]);
      lights.dot([cx, roof + h + 20, cz], [1.0, 0.1, 0.1], 70, 0.8, rng());
    } else if (rng() < 0.4) {
      // water tank on legs
      const r = 140 + rng() * 80;
      const bx = cx + (rng() - 0.5) * sx * 0.4, bz = cz + (rng() - 0.5) * sz * 0.4;
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) geo.cyl([bx + dx * r * 0.7, roof, bz + dz * r * 0.7], [bx + dx * r * 0.6, roof + 220, bz + dz * r * 0.6], 10, 10, 4, [0.12, 0.08, 0.1]);
      geo.cyl([bx, roof + 220, bz], [bx, roof + 520, bz], r, r, 8, [0.2, 0.12, 0.12]);
      geo.cyl([bx, roof + 520, bz], [bx, roof + 640, bz], r, 0, 8, [0.16, 0.1, 0.1]);
    }
    // corner beacons on many roofs
    if (rng() < 0.5) lights.dot([tw.min[0], top + 10, tw.min[2]], [1, 0.15, 0.15], 45, 0.5, rng());
    // rooftop neon sign facing the course
    if (rng() < 0.3 * density) {
      const e = nearestLine(cx, cz);
      const word = SIGN_WORDS[Math.floor(rng() * SIGN_WORDS.length)];
      const [ca, cb] = SIGN_COLS[Math.floor(rng() * SIGN_COLS.length)];
      const w = Math.min(sx, sz) * 0.9;
      const sign = textSign(word, [cx, roof + w * 0.18 + 40, cz], { p: e.p }, w, w * 0.22, ca, cb);
      group.add(sign);
    }
  }

  // streets: traffic on the road grid near the course, and street lamps
  const xs = map.line.map((e) => e.p[0]), zs = map.line.map((e) => e.p[2]);
  const pad = 9000;
  const bx0 = Math.min(...xs) - pad, bx1 = Math.max(...xs) + pad, bz0 = Math.min(...zs) - pad, bz1 = Math.max(...zs) + pad;
  const G = 3000;
  const y = streetY + 40;
  const cars = (a, b, lane) => {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.round((len / 900) * density);
    for (let i = 0; i < n; i++) {
      const sp = (900 + rng() * 900) / len;
      const off = lane;
      lights.flow(add(a, off), add(b, off), [1.0, 0.95, 0.8], 55, sp, rng());
      lights.flow(sub(b, off), sub(a, off), [1.0, 0.12, 0.15], 50, sp, rng());
    }
  };
  for (let x = Math.ceil(bx0 / G) * G; x <= bx1; x += G) {
    cars([x, y, bz0], [x, y, bz1], [110, 0, 0]);
    for (let z = Math.ceil(bz0 / 600) * 600; z <= bz1; z += 1200 / density) lights.dot([x + 290, streetY + 350, z], [1.0, 0.6, 0.25], 40);
  }
  for (let z = Math.ceil(bz0 / G) * G; z <= bz1; z += G) {
    cars([bx0, y, z], [bx1, y, z], [0, 0, 110]);
    for (let x = Math.ceil(bx0 / 600) * 600; x <= bx1; x += 1200 / density) lights.dot([x, streetY + 350, z + 290], [1.0, 0.6, 0.25], 40);
  }

  // a distant skyline to fill the horizon
  const wgeo = new Geo();
  const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
  const R0 = Math.max(bx1 - bx0, bz1 - bz0) / 2 + 8000;
  const pal = [[0.2, 0.9, 1.0], [1.0, 0.3, 0.8], [1.0, 0.85, 0.4], [0.7, 0.5, 1.0]];
  for (let i = 0; i < Math.round(220 * density); i++) {
    const a = rng() * Math.PI * 2, r = R0 + rng() * 40000;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const w = 1200 + rng() * 2600, h = 3000 + rng() * rng() * 22000;
    wgeo.box([x, streetY + h / 2, z], [w, h, w * (0.6 + rng() * 0.8)], rng() * Math.PI, pal[Math.floor(rng() * pal.length)]);
    if (rng() < 0.4) lights.dot([x, streetY + h + 60, z], [1, 0.1, 0.1], 160, 0.6, rng());
  }
  const wm = windowMaterial();
  const skyline = wgeo.mesh(wm);
  skyline.frustumCulled = false;
  group.add(skyline);
  (group.userData.mats ??= []).push(wm);

  const mat = propMaterial({ dir: [0.3, 0.8, -0.5], color: [0.25, 0.2, 0.4], ambient: [0.18, 0.12, 0.25] });
  finish(group, geo, mat);
  finishLights(group, lights);
  return group;
}

// ----------------------------------------------------------------- station

const STEEL_A = [0.32, 0.35, 0.42];
const STEEL_B = [0.24, 0.27, 0.34];

function buildStation(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 23);
  const fr = frames(map.line, 300);
  const octa = (f) => {
    const tn = f.e.tunnel;
    const A = f.e.width + tn.side + 90;
    const T = f.p[1] + tn.top + 90;
    const B = f.p[1] - f.e.height - (tn.bottom ?? 600) - 150;
    const q = (T - B) * 0.27;
    return [[-A * 0.55, T], [A * 0.55, T], [A, T - q], [A, B + q], [A * 0.55, B], [-A * 0.55, B], [-A, B + q], [-A, T - q]];
  };
  // corridor modules: panelled octagonal tubes (also read as the hull from outside)
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      let k = 0;
      strip(geo, run, (f) => octa(f).map(([x, y]) => [x, y]), {
        closed: true,
        color: (p, j, f) => ((Math.floor(f.s / 600) + j) % 2 ? STEEL_A : STEEL_B),
      });
      for (let i = 0; i < run.length - 1; i++) {
        const a = octa(run[i]), b = octa(run[i + 1]);
        // light strips along the upper corners and the floor edges
        for (const j of [0, 1, 4, 5]) geo.line(at(run[i], a[j][0] * 0.98, a[j][1] - 15), at(run[i + 1], b[j][0] * 0.98, b[j][1] - 15), j < 2 ? [0.4, 1.4, 1.8] : [0.2, 0.6, 0.9]);
        if (i % 3 === 0) {
          // structural ring outside, windows along the hull
          for (let j = 0; j < 8; j++) {
            const p0 = a[j], p1 = a[(j + 1) % 8];
            geo.line(at(run[i], p0[0] * 1.06, p0[1] + Math.sign(p0[1] - run[i].p[1]) * 30), at(run[i], p1[0] * 1.06, p1[1] + Math.sign(p1[1] - run[i].p[1]) * 30), [0.35, 0.45, 0.7]);
          }
          for (const side of [-1, 1]) lights.dot(at(run[i], side * (a[2][0] + 25), (a[2][1] + a[3][1]) / 2), [1.0, 0.9, 0.7], 45);
        }
      }
      k++;
    }
    run = [];
  };
  for (const f of fr) { if (f.e.tunnel) run.push(f); else flush(); }
  flush();

  // scaffold trusses under the open ramps
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i], b = fr[i + 1];
    if (a.e.tunnel) continue;
    const ya = a.p[1] - a.e.height - 450, yb = b.p[1] - b.e.height - 450;
    const w = a.e.width * 0.6;
    const L0 = at(a, -w, ya), L1 = at(b, -w, yb), R0 = at(a, w, ya), R1 = at(b, w, yb);
    const tc = [0.25, 0.45, 0.8];
    geo.line(L0, L1, tc); geo.line(R0, R1, tc);
    geo.line(L0, R1, scale(tc, 0.6)); geo.line(R0, L1, scale(tc, 0.6));
    geo.line(add(L0, [0, -260, 0]), add(L1, [0, -260, 0]), scale(tc, 0.7));
    if (i % 2 === 0) { geo.line(L0, add(L0, [0, -260, 0]), tc); geo.line(R0, add(R0, [0, -260, 0]), tc); }
  }

  // solar arrays on long arms, with blinking beacons
  for (let i = 10; i < fr.length - 10; i += Math.round(22 / density)) {
    const f = fr[i];
    for (const side of [-1, 1]) {
      if (rng() < 0.3) continue;
      const L = f.e.width + (f.e.tunnel ? f.e.tunnel.side + 200 : 1200);
      const y = f.p[1] + 300;
      const a = at(f, side * L, y), b = at(f, side * (L + 2600), y);
      geo.cyl(a, b, 30, 30, 6, [0.4, 0.4, 0.45]);
      const c = at(f, side * (L + 1500), y);
      const half = scale(f.f, 900);
      const out = scale(f.r, side * 1100);
      const p0 = add(sub(c, half), scale(out, -1)), p1 = add(add(c, half), scale(out, -1)), p2 = add(add(c, half), out), p3 = add(sub(c, half), out);
      geo.quad(p0, p1, p2, p3, [0.05, 0.1, 0.3], 0.1);
      for (let k = 0; k <= 6; k++) {
        const t2 = k / 6;
        geo.line(mix(p0, p3, t2), mix(p1, p2, t2), [0.2, 0.45, 1.0]);
        geo.line(mix(p0, p1, t2), mix(p3, p2, t2), [0.2, 0.45, 1.0]);
      }
      lights.dot(b, side < 0 ? [1, 0.1, 0.1] : [0.1, 1, 0.3], 80, 0.7, rng());
    }
  }

  const mat = propMaterial({ dir: [-0.6, 0.5, 0.3], color: [0.9, 0.85, 1.0], ambient: [0.12, 0.13, 0.2], lamp: 0.5, lampColor: [0.6, 0.85, 1.0] });

  // a giant ring station turning slowly in the distance
  const xs = map.line.map((e) => e.p[0]), zs = map.line.map((e) => e.p[2]);
  const ring = new THREE.Group();
  const rg = new Geo();
  const R = 26000;
  for (let k = 0; k < 48; k++) {
    const a0 = (k / 48) * Math.PI * 2, a1 = ((k + 1) / 48) * Math.PI * 2;
    rg.cyl([Math.cos(a0) * R, 0, Math.sin(a0) * R], [Math.cos(a1) * R, 0, Math.sin(a1) * R], 1400, 1400, 8, k % 2 ? STEEL_A : STEEL_B);
    rg.line([Math.cos(a0) * (R + 1450), 0, Math.sin(a0) * (R + 1450)], [Math.cos(a1) * (R + 1450), 0, Math.sin(a1) * (R + 1450)], [0.4, 1.2, 1.8]);
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    rg.cyl([0, 0, 0], [Math.cos(a) * R, 0, Math.sin(a) * R], 380, 380, 6, STEEL_B);
  }
  rg.blob([0, 0, 0], 3200, STEEL_A, 0, rng);
  const ringMesh = rg.mesh(mat);
  ringMesh.frustumCulled = false;
  ring.add(ringMesh, neonLines(rg.lp, rg.lc, 2));
  ring.position.set((Math.min(...xs) + Math.max(...xs)) / 2 - 60000, map.line[0].p[1] + 8000, (Math.min(...zs) + Math.max(...zs)) / 2 + 30000);
  ring.rotation.set(0.5, 0, 0.35);
  group.add(ring);

  finish(group, geo, mat, (time) => { ring.rotation.y = time * 0.02; });
  finishLights(group, lights);
  return group;
}

// ----------------------------------------------------------------- server farm

function buildServers(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 31);
  const fr = extendFrames(frames(map.line, 260).filter((f) => f.e.tunnel), 2000, 5000, 260);
  const ledCols = [[0.2, 1.0, 0.45], [0.2, 0.8, 1.0], [1.0, 0.7, 0.2], [0.2, 1.0, 0.45]];
  const shape = (f) => {
    const tn = f.e.tunnel;
    return { L: f.e.width + tn.side + 25, top: f.p[1] + tn.top, bot: f.p[1] - f.e.height - (tn.bottom ?? 550) - 150 };
  };
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i], b = fr[i + 1];
    const sa = shape(a), sb = shape(b);
    for (const side of [-1, 1]) {
      // rack fronts
      const p0 = at(a, side * sa.L, sa.bot), p1 = at(b, side * sb.L, sb.bot), p2 = at(b, side * sb.L, sb.top), p3 = at(a, side * sa.L, sa.top);
      geo.quad(p0, p1, p2, p3, i % 2 ? [0.05, 0.06, 0.07] : [0.07, 0.08, 0.09]);
      geo.line(p0, p3, [0.1, 0.45, 0.25]);
      // rack units: thin horizontal glowing bands and blinking LEDs
      const rows = Math.floor((sa.top - sa.bot) / 70);
      for (let r = 1; r < rows; r++) {
        const y0 = sa.bot + r * 70, y1 = sb.bot + r * 70;
        if (r % 4 === 0) geo.line(at(a, side * (sa.L - 2), y0), at(b, side * (sb.L - 2), y1), [0.06, 0.18, 0.12]);
        if (rng() < 0.55 * density) {
          const k = 0.15 + rng() * 0.7;
          const p = mix(at(a, side * (sa.L - 6), y0 + 20), at(b, side * (sb.L - 6), y1 + 20), k);
          const blink = rng() < 0.6 ? 0.5 + rng() * 4 : 0;
          lights.dot(p, ledCols[Math.floor(rng() * ledCols.length)], 7, blink, rng());
        }
      }
    }
    // ceiling with light panels and cable trays
    const c0 = at(a, -sa.L, sa.top), c1 = at(a, sa.L, sa.top), c2 = at(b, sb.L, sb.top), c3 = at(b, -sb.L, sb.top);
    geo.quad(c0, c1, c2, c3, [0.04, 0.05, 0.06]);
    if (i % 3 === 0) geo.quad(at(a, -sa.L * 0.2, sa.top - 4), at(a, sa.L * 0.2, sa.top - 4), at(b, sb.L * 0.2, sb.top - 4), at(b, -sb.L * 0.2, sb.top - 4), [0.25, 0.45, 0.38], 0.6);
    for (const side of [-1, 1]) {
      const ta = at(a, side * sa.L * 0.6, sa.top - 60), tb = at(b, side * sb.L * 0.6, sb.top - 60);
      geo.line(ta, tb, [0.15, 0.6, 0.35]);
      geo.line(add(ta, [0, -40, 0]), add(tb, [0, -40, 0]), [0.1, 0.35, 0.25]);
    }
    // grated floor far below
    const fa = sa.bot - 500, fb = sb.bot - 500;
    geo.quad(at(a, -sa.L, fa), at(a, sa.L, fa), at(b, sb.L, fb), at(b, -sb.L, fb), [0.02, 0.05, 0.04]);
    geo.line(at(a, -sa.L, fa + 2), at(a, sa.L, fa + 2), [0.1, 0.8, 0.4]);
    for (const k of [-0.66, -0.33, 0, 0.33, 0.66]) geo.line(at(a, sa.L * k, fa + 2), at(b, sb.L * k, fb + 2), [0.08, 0.5, 0.25]);
  }
  for (const [f, dir] of [[fr[0], 1], [fr[fr.length - 1], -1]]) {
    const s0 = shape(f);
    capWall(geo, f, dir, s0.L + 200, s0.bot - 700, s0.top + 200, () => [0.05, 0.06, 0.07], 0);
  }
  // data pulses streaming along the cable trays
  for (let i = 0; i < fr.length - 8; i += 2) {
    if (rng() > 0.7 * density) continue;
    const a = fr[i], b = fr[i + 8];
    const sa = shape(a), sb = shape(b);
    const side = rng() < 0.5 ? -1 : 1;
    const col = rng() < 0.5 ? [0.3, 1.0, 0.6] : [0.3, 0.8, 1.0];
    lights.flow(at(a, side * sa.L * 0.6, sa.top - 60), at(b, side * sb.L * 0.6, sb.top - 60), col, 45, 0.6 + rng() * 0.8, rng());
  }
  const mat = propMaterial({ dir: [0, -1, 0], color: [0.1, 0.2, 0.15], ambient: [0.06, 0.08, 0.08], lamp: 0.8, lampColor: [0.6, 1.0, 0.85] });
  finish(group, geo, mat);
  finishLights(group, lights);
  return group;
}
