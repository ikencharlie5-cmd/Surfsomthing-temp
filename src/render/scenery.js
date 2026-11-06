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

// While a map's scenery is built, props are checked against the ride's
// envelope (the ramps plus the air riders fly through) and dropped if they'd
// poke into it. Set via withRide().
let RIDE = null;
let RIDE_OFF = false; // temporarily allow (gates/arches that frame the ride on purpose)

function rideEnvelope(map) {
  const cell = 2000;
  const grid = new Map();
  const add = (x, y, z, hw, up, down) => {
    const k = Math.floor(x / cell) + ',' + Math.floor(z / cell);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([x, y, z, hw, up, down]);
  };
  const line = map.line || [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]) / 300));
    const air = b.gap; // flight between ramps: riders can be well above the line
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      add(a.p[0] + (b.p[0] - a.p[0]) * u, a.p[1] + (b.p[1] - a.p[1]) * u, a.p[2] + (b.p[2] - a.p[2]) * u,
        a.width + 320, air ? 1100 : 450, a.height + (air ? 700 : 250));
    }
  }
  return (x0, y0, z0, x1, y1, z1) => {
    const cx0 = Math.floor((x0 - 1200) / cell), cx1 = Math.floor((x1 + 1200) / cell);
    const cz0 = Math.floor((z0 - 1200) / cell), cz1 = Math.floor((z1 + 1200) / cell);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const list = grid.get(cx + ',' + cz);
      if (!list) continue;
      for (const [x, y, z, hw, up, down] of list) {
        if (x + hw < x0 || x - hw > x1 || z + hw < z0 || z - hw > z1) continue;
        if (y + up < y0 || y - down > y1) continue;
        return true;
      }
    }
    return false;
  };
}

function hitsRide(x0, y0, z0, x1, y1, z1) {
  return !!RIDE && !RIDE_OFF && RIDE(x0, y0, z0, x1, y1, z1);
}

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
    const rr = Math.max(r0, r1);
    if (hitsRide(Math.min(p0[0], p1[0]) - rr, Math.min(p0[1], p1[1]) - rr, Math.min(p0[2], p1[2]) - rr, Math.max(p0[0], p1[0]) + rr, Math.max(p0[1], p1[1]) + rr, Math.max(p0[2], p1[2]) + rr)) return;
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
    const hr = Math.hypot(size[0], size[2]) / 2;
    if (hitsRide(c[0] - hr, c[1] - size[1] / 2, c[2] - hr, c[0] + hr, c[1] + size[1] / 2, c[2] + hr)) return;
    const [sx, sy, sz] = size.map((x) => x / 2);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (x, y, z) => [c[0] + x * cs + z * sn, c[1] + y, c[2] - x * sn + z * cs];
    const v = [P(-sx, -sy, -sz), P(sx, -sy, -sz), P(sx, sy, -sz), P(-sx, sy, -sz), P(-sx, -sy, sz), P(sx, -sy, sz), P(sx, sy, sz), P(-sx, sy, sz)];
    const f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];
    for (const q of f) this.quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], col, glow);
  }

  /** Low-poly blob (icosahedron-ish). */
  blob(c, r, col, glow = 0, rng = Math.random, squash = 1) {
    if (hitsRide(c[0] - r * 1.25, c[1] - r * 1.25 * squash, c[2] - r * 1.25, c[0] + r * 1.25, c[1] + r * 1.25 * squash, c[2] + r * 1.25)) return;
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
  RIDE = rideEnvelope(map);
  try { return buildThemeInner(map, t, quality); } finally { RIDE = null; }
}

function buildThemeInner(map, t, quality) {
  const density = DENSITY[quality] ?? 1;
  if (t.type === 'beach') return buildBeach(map, t, density);
  if (t.type === 'canyon') return buildCanyon(map, t, density);
  if (t.type === 'cave') return buildCave(map, t, density);
  if (t.type === 'city') return buildCity(map, t, density);
  if (t.type === 'station') return buildStation(map, t, density);
  if (t.type === 'servers') return buildServers(map, t, density);
  if (t.type === 'jungle') return buildJungle(map, t, density);
  if (t.type === 'volcano') return buildVolcano(map, t, density);
  if (t.type === 'vortex') return buildVortex(map, t, density);
  if (t.type === 'castle') return buildCastle(map, t, density);
  if (t.type === 'temple-complex') return buildTempleComplex(map, t, density);
  if (t.type === 'landmark') return buildLandmarkScene(map, t, density);
  if (t.type === 'interior') return buildInterior(map, t, density);
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
  const af = fr[Math.floor(fr.length * (0.3 + rng() * 0.5))];
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

// ---------------------------------------------------------------------------
// Shared helpers for terrain themes
// ---------------------------------------------------------------------------

/** Horizontal distance from (x,z) to the guide line (and the line height there). */
function lineDist(line, x, z) {
  let best = Infinity, y = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i].p, b = line[i + 1].p;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2));
    const d = Math.hypot(x - (a[0] + dx * t), z - (a[2] + dz * t));
    if (d < best) { best = d; y = a[1] + (b[1] - a[1]) * t; }
  }
  return { d: best, y };
}

function profileY(pts, lat) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (lat >= pts[i][0] && lat <= pts[i + 1][0]) {
      const k = (lat - pts[i][0]) / (pts[i + 1][0] - pts[i][0] || 1);
      return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k;
    }
  }
  return pts[lat < pts[0][0] ? 0 : pts.length - 1][1];
}

function flowStrip(fr, latA, latB, yFn, material) {
  const pos = [], flow = [];
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i], b = fr[i + 1];
    const A0 = at(a, latA(a), yFn(a)), A1 = at(a, latB(a), yFn(a)), B0 = at(b, latA(b), yFn(b)), B1 = at(b, latB(b), yFn(b));
    pos.push(...A0, ...A1, ...B1, ...A0, ...B1, ...B0);
    flow.push(a.s, a.s, b.s, a.s, b.s, b.s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
  const m = new THREE.Mesh(g, material);
  m.frustumCulled = false;
  return m;
}

function lavaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFogColor: { value: FOG_COLOR }, uFogNear: FOG_NEAR, uFogFar: FOG_FAR },
    vertexShader: `attribute float aFlow; varying float vFlow; varying vec3 vW; varying float vDepth;
      void main(){ vFlow = aFlow; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix*w; vDepth = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      varying float vFlow; varying vec3 vW; varying float vDepth;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vec2(vW.x, vW.z) / 900.0 + vec2(0.0, -uTime * 0.12);
        float crust = n(p * 2.0 + vec2(vFlow * 0.0004 - uTime * 0.2, 0.0)) * 0.6 + n(p * 5.0) * 0.4;
        float hot = smoothstep(0.35, 0.75, crust);
        vec3 c = mix(vec3(0.08, 0.02, 0.02), vec3(1.6, 0.45, 0.08), hot);
        c += vec3(1.4, 0.9, 0.3) * smoothstep(0.82, 0.95, crust);
        c *= 0.8 + 0.2 * sin(uTime * 2.0 + vW.x * 0.002);
        gl_FragColor = vec4(mix(c, uFogColor, smoothstep(uFogNear, uFogFar * 1.4, vDepth) * 0.7), 1.0);
      }`,
  });
}

// ----------------------------------------------------------------- jungle

const LEAF = [[0.03, 0.16, 0.07], [0.04, 0.2, 0.1], [0.02, 0.12, 0.08]];
const STONE = [0.2, 0.24, 0.2];

function buildJungle(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 41);
  const line = map.line;
  const fr = extendFrames(frames(line, 320), 6000, 12000, 320);
  const drop = t.groundDrop ?? 900;
  const W = (f) => f.e.width;
  const L = (f) => f.p[1] - f.e.height - drop;
  const prof = (f) => {
    const g = L(f), w = W(f);
    return [[-(w + 16000), g + 3800], [-(w + 8000), g + 1800], [-(w + 3500), g + 350], [-(w + 1200), g + 40], [-w * 0.35, g - 40], [0, g - 140],
      [w * 0.35, g - 40], [w + 1200, g + 40], [w + 3500, g + 350], [w + 8000, g + 1800], [w + 16000, g + 3800]];
  };
  strip(geo, fr, (f) => prof(f).map(([l, y]) => [l, y, 0, 1]), {
    displace: (p, j) => (j <= 2 || j >= 8 ? (fbm3(p[0] / 3000, 0, p[2] / 3000, 3) - 0.4) * 1800 : (fbm3(p[0] / 600, 0, p[2] / 600, 2) - 0.5) * 120),
    color: (p, j) => (j <= 2 || j >= 8 ? mix([0.02, 0.1, 0.05], [0.04, 0.16, 0.08], fbm3(p[0] / 2000, 0, p[2] / 2000)) : mix([0.08, 0.07, 0.04], [0.05, 0.12, 0.05], fbm3(p[0] / 500, 0, p[2] / 500))),
  });
  // river along the valley floor
  const river = flowStrip(fr, (f) => -W(f) * 0.42, (f) => W(f) * 0.42, (f) => L(f) - 90, waterMaterial([0.0, 0.06, 0.05], [0.1, 0.8, 0.55]));
  group.add(river);

  const clearOf = (x, z, r, top) => {
    const n = lineDist(line, x, z);
    return n.d > 520 + r + 260 || top < n.y - 400 - drop * 0.4;
  };
  // giant trees with canopies, hanging vines and glowing spots
  const nTrees = Math.round(fr.length * 2.2 * density);
  for (let i = 0; i < nTrees; i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const side = rng() < 0.5 ? -1 : 1;
    const lat = side * (W(f) + 700 + rng() * 7500);
    const base = at(f, lat, 0);
    base[1] = profileY(prof(f), lat) - 30;
    const h = 1400 + rng() * 2600, cr = 450 + rng() * 650;
    if (!clearOf(base[0], base[2], cr, base[1] + h + cr)) continue;
    jungleTree(geo, lights, base, h, cr, rng);
  }
  // ferns, glowing mushrooms and neon flowers on the floor
  for (let i = 0; i < Math.round(fr.length * 3 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const lat = (rng() < 0.5 ? -1 : 1) * (W(f) * 0.5 + rng() * 4000);
    const base = at(f, lat, 0); base[1] = profileY(prof(f), lat) - 10;
    const k = rng();
    if (k < 0.5) fern(geo, base, 160 + rng() * 260, rng);
    else if (k < 0.8) mushroom(geo, base, 50 + rng() * 120, rng);
    else geo.blob(add(base, [0, 30, 0]), 25 + rng() * 25, [[1, 0.3, 0.8], [0.3, 0.9, 1], [1, 0.8, 0.2]][Math.floor(rng() * 3)], 0.9, rng);
  }
  // the temple: a stepped pyramid with glowing runes and torches
  const tf = fr[Math.floor(fr.length * (0.25 + rng() * 0.5))];
  const tl = -(W(tf) + 5200);
  const tb = at(tf, tl, profileY(prof(tf), tl) - 50);
  const yaw = Math.atan2(tf.f[0], tf.f[2]);
  let size = 4200, y = tb[1];
  for (let k = 0; k < 7; k++) {
    const hgt = 480;
    geo.box([tb[0], y + hgt / 2, tb[2]], [size, hgt, size], yaw, mix(STONE, [0.14, 0.18, 0.13], k % 2));
    const cs = Math.cos(yaw), sn = Math.sin(yaw), hs = size / 2 + 4;
    const c = (x, z) => [tb[0] + x * cs + z * sn, y + hgt * 0.55, tb[2] - x * sn + z * cs];
    const pts = [c(-hs, -hs), c(hs, -hs), c(hs, hs), c(-hs, hs)];
    for (let q = 0; q < 4; q++) geo.line(pts[q], pts[(q + 1) % 4], k % 2 ? [0.2, 1.4, 1.0] : [0.15, 0.6, 0.5]);
    for (const pq of pts) lights.dot(add(pq, [0, 260, 0]), [1, 0.55, 0.15], 80, 6 + rng() * 3, rng());
    y += hgt; size -= 520;
  }
  geo.box([tb[0], y + 380, tb[2]], [size * 0.8, 760, size * 0.8], yaw, [0.12, 0.15, 0.12]);
  lights.dot([tb[0], y + 900, tb[2]], [0.2, 1, 0.7], 260, 0, 0);
  // ruins: broken pillars and stone heads with glowing eyes
  for (let i = 0; i < Math.round(26 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const lat = (rng() < 0.5 ? -1 : 1) * (W(f) + 900 + rng() * 4000);
    const base = at(f, lat, profileY(prof(f), lat) - 20);
    if (rng() < 0.6) {
      const h = 300 + rng() * 900;
      geo.cyl(base, add(base, [(rng() - 0.5) * 120, h, (rng() - 0.5) * 120]), 90, 80, 7, STONE);
    } else {
      const yw = rng() * Math.PI * 2;
      geo.box(add(base, [0, 260, 0]), [380, 520, 340], yw, STONE);
      geo.box(add(base, [0, 340, 0]), [400, 60, 360], yw, [0.15, 0.18, 0.15]);
      const cs = Math.cos(yw), sn = Math.sin(yw);
      for (const s of [-1, 1]) lights.dot(add(base, [s * 90 * cs + 172 * sn, 380, -s * 90 * sn + 172 * cs]), [0.2, 1, 0.6], 40, 0, 0);
    }
  }
  // a waterfall pouring off the hills into a pool
  const wf = fr[Math.floor(fr.length * (0.15 + rng() * 0.6))];
  const wl = W(wf) + 4200, wtop = profileY(prof(wf), wl) + 2600, wbot = profileY(prof(wf), wl) - 60;
  for (let k = 0; k < 18; k++) geo.blob(at(wf, wl + 700 + rng() * 900, wbot + rng() * (wtop - wbot)), 450 + rng() * 300, [0.08, 0.12, 0.09], 0, rng, 0.8);
  const fallPos = [], fallFlow = [];
  const fw = 520;
  const A = add(at(wf, wl, wtop), scale(wf.f, -fw)), B = add(at(wf, wl, wtop), scale(wf.f, fw)), C = add(at(wf, wl, wbot), scale(wf.f, fw)), D = add(at(wf, wl, wbot), scale(wf.f, -fw));
  fallPos.push(...A, ...B, ...C, ...A, ...C, ...D);
  fallFlow.push(0, 0, 3000, 0, 3000, 3000);
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fallPos, 3));
  fg.setAttribute('aFlow', new THREE.Float32BufferAttribute(fallFlow.map((v) => v * 4), 1));
  const fm = waterMaterial([0.1, 0.3, 0.3], [0.6, 1.0, 0.95]);
  fm.side = THREE.DoubleSide;
  const fall = new THREE.Mesh(fg, fm);
  fall.frustumCulled = false;
  group.add(fall);
  for (let k = 0; k < 40; k++) lights.flow(at(wf, wl - 200 - rng() * 600, wbot + 50), at(wf, wl - 400 - rng() * 800, wbot + 400 + rng() * 500), [0.7, 1, 1], 50, 0.4 + rng() * 0.5, rng());

  // fireflies around the ride
  for (let i = 0; i < Math.round(fr.length * 2 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const p = at(f, (rng() - 0.5) * 2 * (W(f) + 3000), f.p[1] - f.e.height + (rng() - 0.4) * 1800);
    lights.dot(p, rng() < 0.7 ? [0.8, 1.0, 0.3] : [0.3, 1.0, 0.8], 30, 0.3 + rng() * 0.8, rng());
  }

  const mat = propMaterial({ dir: [-0.35, 0.32, -0.88], color: [0.35, 0.45, 0.6], ambient: [0.1, 0.16, 0.12], lamp: 0.45, lampColor: [0.6, 1.0, 0.7] });
  finish(group, geo, mat);
  finishLights(group, lights);
  group.userData.mats.push(river.material, fm);
  return group;
}

function jungleTree(geo, lights, base, h, cr, rng) {
  const bark = [0.1, 0.07, 0.05];
  const top = add(base, [(rng() - 0.5) * 300, h, (rng() - 0.5) * 300]);
  geo.cyl(base, top, 70 + h * 0.025, 40, 6, bark);
  for (let k = 0; k < 4; k++) {
    const a = rng() * Math.PI * 2;
    geo.cyl(add(base, [Math.cos(a) * 220, 0, Math.sin(a) * 220]), add(base, [0, 280, 0]), 40, 10, 4, bark);
  }
  const blobs = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < blobs; k++) {
    const c = add(top, [(rng() - 0.5) * cr, (rng() - 0.3) * cr * 0.5, (rng() - 0.5) * cr]);
    geo.blob(c, cr * (0.5 + rng() * 0.4), LEAF[Math.floor(rng() * LEAF.length)], 0.05, rng, 0.6);
    // hanging vines
    for (let v = 0; v < 3; v++) {
      const vp = add(c, [(rng() - 0.5) * cr, -cr * 0.2, (rng() - 0.5) * cr]);
      geo.line(vp, add(vp, [(rng() - 0.5) * 60, -(400 + rng() * 1200), (rng() - 0.5) * 60]), rng() < 0.3 ? [0.2, 0.9, 0.5] : [0.06, 0.3, 0.15]);
    }
  }
  if (rng() < 0.5) lights.dot(add(base, [0, h * (0.2 + rng() * 0.5), 0]), [0.2, 1, 0.9], 35, 0, 0);
}

function fern(geo, base, size, rng) {
  const n = 6 + Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.3;
    const dir = [Math.cos(a), 0, Math.sin(a)];
    const side = [-dir[2], 0, dir[0]];
    const tip = add(base, [dir[0] * size, size * 0.35, dir[2] * size]);
    const mid = add(base, [dir[0] * size * 0.5, size * 0.45, dir[2] * size * 0.5]);
    geo.tri(base, add(mid, scale(side, size * 0.15)), tip, LEAF[1], LEAF[1], LEAF[1], 0.05, 0, 0.2, 0.4);
    geo.tri(base, tip, add(mid, scale(side, -size * 0.15)), LEAF[0], LEAF[0], LEAF[0], 0.05, 0, 0.4, 0.2);
  }
}

function mushroom(geo, base, size, rng) {
  const col = [[1, 0.25, 0.8], [0.2, 0.9, 1], [0.6, 0.4, 1]][Math.floor(rng() * 3)];
  const top = add(base, [0, size * 1.2, 0]);
  geo.cyl(base, top, size * 0.15, size * 0.12, 5, [0.8, 0.8, 0.75], 0.2);
  geo.cyl(add(top, [0, -size * 0.1, 0]), add(top, [0, size * 0.35, 0]), size * 0.7, 0, 7, col, 0.85);
}

// ----------------------------------------------------------------- volcano

const BASALT = [0.07, 0.055, 0.06];

function buildVolcano(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 51);
  const line = map.line;
  const fr = extendFrames(frames(line, 320), 6000, 14000, 320);
  // riders look left (open side): put the slope down to the lava sea there,
  // and the mountainside behind the ramp
  for (const f of fr) f.r = [-f.r[0], 0, -f.r[2]];
  const drop = t.groundDrop ?? 800;
  const W = (f) => f.e.width;
  const G = (f) => f.p[1] - f.e.height - drop;
  const lavaY = Math.min(...fr.map(G)) - 2600;
  const prof = (f) => {
    const g = G(f), w = W(f);
    return [[-(w + 14000), g + 6000], [-(w + 6000), g + 2400], [-(w + 2500), g + 700], [-(w + 1000), g + 150], [0, g],
      [w + 1200, g - 200], [w + 4500, Math.max(lavaY + 300, g - 1400)], [w + 9000, lavaY + 40], [w + 30000, lavaY - 50]];
  };
  strip(geo, fr, (f) => prof(f).map(([l, y]) => [l, y, 0, 1]), {
    displace: (p, j) => (j <= 1 ? (fbm3(p[0] / 2500, 0, p[2] / 2500, 3) - 0.4) * 2400 : j >= 7 ? 0 : (fbm3(p[0] / 700, 0, p[2] / 700, 3) - 0.5) * 260),
    color: (p) => mix(BASALT, [0.16, 0.1, 0.1], fbm3(p[0] / 900, p[1] / 600, p[2] / 900, 3)),
  });
  // glowing cracks in the rock
  for (let i = 0; i < Math.round(fr.length * 2.5 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const lat = (rng() < 0.6 ? -1 : 1) * (W(f) + 400 + rng() * 4000);
    let p = at(f, lat, profileY(prof(f), lat) + 8);
    for (let k = 0; k < 4; k++) {
      const q = add(p, [(rng() - 0.5) * 500, 0, (rng() - 0.5) * 500]);
      q[1] = p[1] + (rng() - 0.5) * 40;
      geo.line(p, q, [1.8, 0.45, 0.08]);
      p = q;
    }
  }
  // lava: a river channel beside the course and the lava sea below
  const lm = lavaMaterial();
  group.add(flowStrip(fr, (f) => W(f) + 2300, (f) => W(f) + 2950, (f) => profileY(prof(f), W(f) + 2600) + 30, lm));
  const sea = flowStrip(fr, (f) => W(f) + 8000, (f) => W(f) + 60000, () => lavaY + 60, lm);
  group.add(sea);
  // basalt boulders and obsidian spikes
  for (let i = 0; i < Math.round(fr.length * 1.4 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const lat = (rng() < 0.5 ? -1 : 1) * (W(f) + 700 + rng() * 5500);
    const base = at(f, lat, profileY(prof(f), lat));
    if (lineDist(line, base[0], base[2]).d < W(f) + 900) continue;
    if (rng() < 0.55) geo.blob(add(base, [0, 40, 0]), 120 + rng() * 360, mix(BASALT, [0.14, 0.08, 0.1], rng()), 0, rng, 0.7);
    else {
      const h = 300 + rng() * 1100;
      const tip = add(base, [(rng() - 0.5) * 200, h, (rng() - 0.5) * 200]);
      geo.cyl(base, tip, 70 + rng() * 80, 0, 5, [0.12, 0.05, 0.14]);
      geo.line(base, tip, [1.2, 0.3, 1.4]);
    }
  }
  // the volcano itself behind the start, glowing crater and eruption
  const f0 = fr.find((f) => !f.ext) || fr[0];
  const sp = map.spawn.pos;
  const vc = [sp[0] - f0.f[0] * 16000, 0, sp[2] - f0.f[2] * 16000];
  const peak = sp[1] + 7000;
  const ringR = (y) => 2200 + (peak - y) * 1.6;
  const levels = 9, segs = 24;
  let prev = null;
  for (let l = 0; l <= levels; l++) {
    const y = lavaY + ((peak - lavaY) * l) / levels;
    const ring = [];
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const r = ringR(y) * (0.85 + rng() * 0.3);
      ring.push([vc[0] + Math.cos(a) * r, y + (rng() - 0.5) * 200, vc[2] + Math.sin(a) * r]);
    }
    if (prev) for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      const col = mix(BASALT, [0.15, 0.08, 0.09], rng());
      geo.quad(prev[k], prev[k2], ring[k2], ring[k], col);
    }
    prev = ring;
  }
  const crater = [];
  for (let k = 0; k < segs; k++) crater.push(prev[k]);
  for (let k = 0; k < segs; k++) geo.tri(crater[k], crater[(k + 1) % segs], [vc[0], peak - 300, vc[2]], [1.4, 0.4, 0.06], [1.4, 0.4, 0.06], [1.6, 0.8, 0.2], 1);
  for (let k = 0; k < 60; k++) {
    const a = rng() * Math.PI * 2, r = rng() * 1500;
    const s = [vc[0] + Math.cos(a) * r, peak, vc[2] + Math.sin(a) * r];
    lights.flow(s, add(s, [(rng() - 0.5) * 3000, 3000 + rng() * 6000, (rng() - 0.5) * 3000]), [1, 0.45, 0.1], 160, 0.15 + rng() * 0.25, rng());
  }
  // lava streams down the volcano's flank
  for (let k = 0; k < 5; k++) {
    const a = rng() * Math.PI * 2;
    let p = [vc[0] + Math.cos(a) * ringR(peak), peak - 100, vc[2] + Math.sin(a) * ringR(peak)];
    for (let s = 0; s < 8; s++) {
      const y = peak - ((peak - lavaY) * (s + 1)) / 8;
      const q = [vc[0] + Math.cos(a + (rng() - 0.5) * 0.15) * ringR(y), y, vc[2] + Math.sin(a + (rng() - 0.5) * 0.15) * ringR(y)];
      geo.cyl(p, q, 180, 180, 5, [1.3, 0.35, 0.05], 1);
      p = q;
    }
  }
  // embers rising everywhere
  for (let i = 0; i < Math.round(fr.length * 1.8 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const s = at(f, (rng() - 0.5) * 2 * (W(f) + 5000), G(f) + (rng() - 0.5) * 400);
    lights.flow(s, add(s, [(rng() - 0.5) * 600, 1500 + rng() * 2500, (rng() - 0.5) * 600]), rng() < 0.7 ? [1, 0.4, 0.08] : [1, 0.75, 0.3], 26, 0.1 + rng() * 0.2, rng());
  }
  const mat = propMaterial({ dir: [0.2, 0.3, -0.9], color: [0.9, 0.35, 0.15], ambient: [0.16, 0.07, 0.07], lamp: 0.3, lampColor: [1, 0.5, 0.25] });
  finish(group, geo, mat);
  finishLights(group, lights);
  group.userData.mats.push(lm);
  return group;
}

// ----------------------------------------------------------------- vortex (finale)

function buildVortex(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 61);
  const fr = extendFrames(frames(map.line, 300), 4000, 14000, 300);
  const hue = (k) => {
    const cols = [[1.0, 0.2, 0.8], [0.6, 0.3, 1.0], [0.1, 0.9, 1.0], [1.0, 0.85, 0.3]];
    const i = Math.floor(k) % cols.length, j = (i + 1) % cols.length;
    return mix(cols[i], cols[j], k - Math.floor(k));
  };
  const centre = (f) => at(f, 0, f.p[1] - f.e.height * 0.4);
  const ringAt = (f, R, col, segs = 28) => {
    const c = centre(f);
    let prev = null;
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const p = add(c, add(scale(f.r, Math.cos(a) * R), [0, Math.sin(a) * R, 0]));
      if (prev) geo.line(prev, p, col);
      prev = p;
    }
  };
  // the tunnel of rings you race through
  for (let i = 0; i < fr.length; i += 4) {
    const f = fr[i];
    const R = 2800 + Math.sin(i * 0.11) * 500;
    const extEnd = f.ext && i > fr.length / 2;
    ringAt(f, extEnd ? R * Math.max(0.15, 1 - (i - fr.length + 47) / 47) : R, scale(hue(i * 0.02), f.ext ? 2.2 : 1.4));
  }
  // warp streaks racing past
  for (let i = 0; i < Math.round(340 * density); i++) {
    const k = Math.floor(rng() * (fr.length - 16));
    const a = fr[k], b = fr[k + 16];
    const ang = rng() * Math.PI * 2, R = 1800 + rng() * 1600;
    const off = (f) => add(centre(f), add(scale(f.r, Math.cos(ang) * R), [0, Math.sin(ang) * R, 0]));
    lights.flow(off(a), off(b), hue(rng() * 4), 40, 0.5 + rng() * 0.9, rng());
  }
  // a blazing core at the end of the vortex
  const last = fr[fr.length - 1];
  geo.blob(centre(last), 1400, [1.6, 1.0, 1.8], 1, rng);
  for (let k = 0; k < 60; k++) lights.dot(add(centre(last), [(rng() - 0.5) * 5000, (rng() - 0.5) * 5000, (rng() - 0.5) * 5000]), hue(rng() * 4), 200, 1 + rng() * 3, rng());
  const mat = propMaterial({ dir: [0, 1, 0], color: [0.3, 0.3, 0.4], ambient: [0.2, 0.2, 0.3] });
  finish(group, geo, mat);
  finishLights(group, lights);
  return group;
}

// ----------------------------------------------------------------- castle

const STONE_A = [0.34, 0.34, 0.38];
const STONE_B = [0.26, 0.26, 0.3];
const ROOF = [0.16, 0.12, 0.22];
const GLASS = [[1.0, 0.3, 0.3], [0.3, 0.5, 1.0], [1.0, 0.8, 0.3], [0.5, 1.0, 0.5], [0.8, 0.4, 1.0]];

function buildCastle(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 71);
  const line = map.line;
  const fr = extendFrames(frames(line, 320), 5000, 9000, 320);
  const drop = t.groundDrop ?? 900;
  const W = (f) => f.e.width;
  const G = (f) => f.p[1] - f.e.height - drop;
  const WALL = (f) => W(f) + 2600; // curtain walls this far either side
  const wallTop = (f) => G(f) + 2300;
  const stone = (p) => mix(STONE_B, STONE_A, fbm3(p[0] / 300, p[1] / 200, p[2] / 300, 2));

  // ground: paved courtyard between the walls, moat outside, dark hills beyond
  const prof = (f) => {
    const g = G(f), L = WALL(f);
    return [[-(L + 14000), g + 2600], [-(L + 5000), g + 600], [-(L + 1300), g + 30], [-(L + 900), g - 260], [-(L + 350), g - 260], [-(L + 200), g],
      [0, g], [L + 200, g], [L + 350, g - 260], [L + 900, g - 260], [L + 1300, g + 30], [L + 5000, g + 600], [L + 14000, g + 2600]];
  };
  strip(geo, fr, (f) => prof(f).map(([l, y]) => [l, y, 0, 1]), {
    displace: (p, j, n) => (j <= 1 || j >= n - 2 ? (fbm3(p[0] / 3000, 0, p[2] / 3000, 3) - 0.4) * 1600 : 0),
    color: (p, j, f) => {
      const n = 13;
      if (j <= 2 || j >= n - 3) return mix([0.04, 0.07, 0.05], [0.07, 0.1, 0.07], fbm3(p[0] / 1500, 0, p[2] / 1500));
      if (j === 3 || j === 4 || j === n - 5 || j === n - 4) return [0.05, 0.05, 0.08];
      // flagstones
      const k = (Math.floor(p[0] / 220) + Math.floor(p[2] / 220)) & 1;
      return k ? [0.2, 0.2, 0.23] : [0.17, 0.17, 0.2];
    },
  });
  // moat water
  const moatMat = waterMaterial([0.0, 0.02, 0.06], [0.2, 0.35, 0.8]);
  for (const s of [-1, 1]) {
    const m = flowStrip(fr, (f) => s * (WALL(f) + (s < 0 ? 900 : 350)), (f) => s * (WALL(f) + (s < 0 ? 350 : 900)), (f) => G(f) - 200, moatMat);
    group.add(m);
  }

  // curtain walls with crenellations, a wall walk and torches
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i], b = fr[i + 1];
    for (const s of [-1, 1]) {
      const la = s * WALL(a), lb = s * WALL(b);
      const ga = G(a), gb = G(b), ta = wallTop(a), tb = wallTop(b);
      const inA = s * -1 * 0, thick = 220;
      geo.quad(at(a, la, ga), at(b, lb, gb), at(b, lb, tb), at(a, la, ta), stone(at(a, la, ga)));
      geo.quad(at(a, la + s * thick, ga), at(a, la + s * thick, ta), at(b, lb + s * thick, tb), at(b, lb + s * thick, gb), STONE_B);
      geo.quad(at(a, la, ta), at(b, lb, tb), at(b, lb + s * thick, tb), at(a, la + s * thick, ta), [0.22, 0.22, 0.25]);
      // merlons
      for (let k = 0; k < 2; k++) {
        const u = (k + 0.25) / 2;
        const p = mix(at(a, la, ta), at(b, lb, tb), u);
        geo.box(add(add(p, scale(a.r, s * thick * 0.5)), [0, 90, 0]), [thick, 180, 130], Math.atan2(a.f[0], a.f[2]), STONE_A);
      }
      if (i % 4 === 0) {
        const p = at(a, la - s * 30, (ga + ta) * 0.5 + 300);
        geo.cyl(p, add(p, [0, 140, 0]), 14, 22, 5, [0.2, 0.12, 0.08]);
        lights.dot(add(p, [0, 190, 0]), [1.0, 0.55, 0.15], 110, 7 + rng() * 5, rng());
        lights.dot(add(p, [0, 190, 0]), [1.0, 0.35, 0.05], 160, 0, 0);
      }
      if (i % 3 === 1 && rng() < 0.6) {
        // arrow-slit windows glowing from inside
        const p = at(a, la - s * 4, ga + 900 + rng() * 700);
        geo.box(p, [20, 160, 50], Math.atan2(a.r[0], a.r[2]), [1.0, 0.6, 0.25], 0.9);
      }
    }
  }

  // round towers with conical roofs, banners and stained glass
  for (let i = 6; i < fr.length; i += Math.max(6, Math.round(12 / density))) {
    const f = fr[i];
    for (const s of [-1, 1]) {
      if (rng() < 0.2) continue;
      const base = at(f, s * (WALL(f) + 120), G(f) - 200);
      const h = wallTop(f) - G(f) + 900 + rng() * 1400;
      const r = 380 + rng() * 160;
      tower(geo, lights, base, h, r, rng, f, s);
    }
  }

  // stone bridges spanning the courtyard high above the ride
  for (let i = 10; i < fr.length - 10; i += Math.round(28 / Math.max(0.6, density))) {
    if (rng() < 0.3) continue;
    const f = fr[i];
    const y = wallTop(f) + 300;
    const L = WALL(f);
    const steps = 16;
    for (let k = 0; k < steps; k++) {
      const u0 = k / steps, u1 = (k + 1) / steps;
      const y0 = y + Math.sin(u0 * Math.PI) * 600, y1 = y + Math.sin(u1 * Math.PI) * 600;
      const p0 = at(f, -L + 2 * L * u0, y0), p1 = at(f, -L + 2 * L * u1, y1);
      const d = scale(f.f, 260);
      geo.quad(sub(p0, d), sub(p1, d), add(p1, d), add(p0, d), STONE_A);
      geo.quad(sub(add(p0, [0, -260, 0]), d), add(add(p0, [0, -260, 0]), d), add(add(p1, [0, -260, 0]), d), sub(add(p1, [0, -260, 0]), d), STONE_B);
      geo.quad(sub(p0, d), sub(add(p0, [0, -260, 0]), d), sub(add(p1, [0, -260, 0]), d), sub(p1, d), stone(p0));
      geo.quad(add(p0, d), add(p1, d), add(add(p1, [0, -260, 0]), d), add(add(p0, [0, -260, 0]), d), stone(p0));
    }
    lights.dot(at(f, 0, y + 650), [1.0, 0.55, 0.2], 140, 8, rng());
  }

  // the keep: a hero building outside the walls
  const kf = fr[Math.floor(fr.length * (0.35 + rng() * 0.3))];
  const ks = rng() < 0.5 ? -1 : 1;
  const kb = at(kf, ks * (WALL(kf) + 4200), G(kf) - 100);
  const kh = 5200 + rng() * 1800;
  geo.box(add(kb, [0, kh / 2, 0]), [3000, kh, 3000], Math.atan2(kf.f[0], kf.f[2]), STONE_A);
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cs = Math.cos(Math.atan2(kf.f[0], kf.f[2])), sn = Math.sin(Math.atan2(kf.f[0], kf.f[2]));
    const off = [dx * 1500 * cs + dz * 1500 * sn, 0, -dx * 1500 * sn + dz * 1500 * cs];
    tower(geo, lights, add(kb, off), kh + 1200, 520, rng, kf, ks);
  }
  for (let k = 0; k < 10; k++) {
    const p = add(kb, add(scale(kf.r, -ks * 1505), [0, 800 + k * 420, 0]));
    geo.box(add(p, scale(kf.f, (rng() - 0.5) * 2000)), [10, 260, 140], Math.atan2(kf.r[0], kf.r[2]), GLASS[Math.floor(rng() * GLASS.length)], 0.9);
  }

  // gatehouses at every thread-the-needle gate
  for (const n of map.needles || []) gatehouse(geo, lights, n, rng);

  const mat = propMaterial({ dir: [-0.35, 0.4, -0.85], color: [0.42, 0.48, 0.7], ambient: [0.16, 0.15, 0.22], lamp: 0.55, lampColor: [1.0, 0.7, 0.45] });
  finish(group, geo, mat);
  finishLights(group, lights);
  group.userData.mats.push(moatMat);
  return group;
}

function tower(geo, lights, base, h, r, rng, f, s) {
  const top = add(base, [0, h, 0]);
  geo.cyl(base, top, r, r * 0.95, 10, STONE_A);
  // crown and merlons
  geo.cyl(top, add(top, [0, 120, 0]), r * 1.12, r * 1.12, 10, STONE_B);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    geo.box(add(top, [Math.cos(a) * r * 1.05, 200, Math.sin(a) * r * 1.05]), [110, 160, 110], a, STONE_A);
  }
  // conical roof, flag and banner
  const roofTop = add(top, [0, 120 + r * 2.2, 0]);
  geo.cyl(add(top, [0, 120, 0]), roofTop, r * 1.18, 0, 10, ROOF);
  geo.cyl(roofTop, add(roofTop, [0, 420, 0]), 8, 6, 4, [0.6, 0.6, 0.6]);
  const flagC = [[0.9, 0.15, 0.2], [0.2, 0.3, 0.9], [0.95, 0.75, 0.2]][Math.floor(rng() * 3)];
  const fp = add(roofTop, [0, 300, 0]);
  const fd = scale(f.f, -260);
  geo.quad(fp, add(fp, fd), add(add(fp, fd), [0, -150, 0]), add(fp, [0, -150, 0]), flagC, 0.15, [0, 0.8, 0.8, 0]);
  // stained-glass windows facing the course
  const toward = scale(f.r, -s);
  for (let k = 0; k < 3; k++) {
    const wy = h * (0.45 + k * 0.17);
    geo.box(add(add(base, scale(toward, r * 0.98)), [0, wy, 0]), [12, 240, 120], Math.atan2(toward[0], toward[2]) + Math.PI / 2, GLASS[Math.floor(rng() * GLASS.length)], 0.95);
  }
  lights.dot(add(roofTop, [0, 440, 0]), [1.0, 0.2, 0.15], 60, 0.5, rng());
}

function gatehouse(geo, lights, n, rng) {
  RIDE_OFF = true;
  try { gatehouseInner(geo, lights, n, rng); } finally { RIDE_OFF = false; }
}

function gatehouseInner(geo, lights, n, rng) {
  const c = n.gapCenter, R = n.right, F = n.fwd;
  const P = (lat, y, fwd = 0) => [c[0] + R[0] * lat + F[0] * fwd, y, c[2] + R[2] * lat + F[2] * fwd];
  const half = n.size / 2;
  const slotA = n.slotLat - half, slotB = n.slotLat + half;
  const yaw = Math.atan2(F[0], F[2]);
  const T = 140; // visual wall half-thickness (the collision slab is a little thinner)
  const block = (l0, l1, y0, y1) => {
    const corners = [P(l0, y0, -T), P(l1, y0, -T), P(l1, y0, T), P(l0, y0, T)];
    const tops = corners.map((p) => [p[0], y1, p[2]]);
    const col = mix(STONE_B, STONE_A, rng());
    for (let k = 0; k < 4; k++) geo.quad(corners[k], corners[(k + 1) % 4], tops[(k + 1) % 4], tops[k], col);
    geo.quad(tops[0], tops[1], tops[2], tops[3], STONE_B);
  };
  block(-n.reach, slotA, n.yBot, n.yTop);
  block(slotB, n.reach, n.yBot, n.yTop);
  if (n.lintel != null) block(slotA, slotB, c[1] + n.lintel, n.yTop);
  // crenellations along the top
  for (let l = -n.reach; l < n.reach; l += 280) {
    if (l > slotA - 100 && l < slotB + 100 && n.lintel == null) continue;
    geo.box(P(l + 70, n.yTop + 90), [140, 180, T * 2], yaw, STONE_A);
  }
  // flanking towers right beside the slot
  for (const l of [slotA - 260, slotB + 260]) {
    const base = P(l, n.yBot);
    geo.cyl(base, add(base, [0, n.yTop - n.yBot + 500, 0]), 230, 220, 8, STONE_A);
    const top = add(base, [0, n.yTop - n.yBot + 500, 0]);
    geo.cyl(top, add(top, [0, 700, 0]), 270, 0, 8, ROOF);
  }
  // portcullis raised above the opening, glowing edge so the slot reads at speed
  const pt = n.lintel != null ? c[1] + n.lintel : n.yTop;
  for (let l = slotA + 30; l < slotB; l += 60) geo.line(P(l, pt - 10, -T - 5), P(l, pt - 260, -T - 5), [0.35, 0.33, 0.3]);
  geo.line(P(slotA, n.yBot + 200, -T - 6), P(slotA, pt, -T - 6), [1.6, 0.8, 0.3]);
  geo.line(P(slotB, n.yBot + 200, -T - 6), P(slotB, pt, -T - 6), [1.6, 0.8, 0.3]);
  // torches either side
  for (const l of [slotA - 60, slotB + 60]) {
    const p = P(l, c[1] - 150, -T - 30);
    lights.dot(p, [1.0, 0.55, 0.15], 130, 8 + rng() * 4, rng());
    lights.dot(p, [1.0, 0.35, 0.05], 190, 0, 0);
  }
}

// ---------------------------------------------------------------------------
// Set pieces: the buildings you ride through, and boost rings
// ---------------------------------------------------------------------------

const SET_LOOK = {
  temple: { outer: [0.36, 0.4, 0.28], trim: [1.0, 0.65, 0.2], light: [1.0, 0.55, 0.15], steps: 6, rise: 2600 },
  ruin: { outer: [0.26, 0.34, 0.24], trim: [0.3, 1.0, 0.45], light: [0.4, 1.0, 0.5], steps: 3, rise: 1500, vines: true },
  hall: { outer: [0.36, 0.36, 0.4], trim: [1.0, 0.55, 0.2], light: [1.0, 0.6, 0.25], roof: true, glass: true, rise: 1800 },
  hangar: { outer: [0.4, 0.45, 0.55], trim: [0.3, 0.9, 1.0], light: [1.0, 0.85, 0.3], blink: 1.2, rise: 1600 },
  vault: { outer: [0.1, 0.16, 0.13], trim: [1.0, 0.2, 0.15], light: [1.0, 0.2, 0.15], blink: 0.8, rise: 900 },
  atrium: { outer: [0.12, 0.16, 0.3], trim: [1.0, 0.3, 0.85], light: [0.3, 0.9, 1.0], tower: 9000, rise: 600 },
  lavatube: { outer: [0.1, 0.06, 0.06], trim: [1.0, 0.35, 0.05], light: [1.0, 0.4, 0.08], rock: true, rise: 900 },
  seacave: { outer: [0.32, 0.2, 0.3], trim: [0.3, 1.0, 0.9], light: [0.3, 1.0, 0.9], rock: true, rise: 1000 },
  crystal: { outer: [0.16, 0.2, 0.32], trim: [0.5, 0.9, 1.0], light: [0.5, 0.9, 1.0], rock: true, crystals: true, rise: 900 },
  glowworm: { outer: [0.08, 0.1, 0.13], trim: [0.3, 0.8, 1.0], light: [0.4, 0.85, 1.0], rock: true, worms: true, rise: 900 },
  sandstone: { outer: [0.5, 0.24, 0.14], trim: [1.0, 0.6, 0.3], light: [1.0, 0.55, 0.2], rock: true, rise: 1000 },
  warpgate: { outer: [0.1, 0.03, 0.18], trim: [1.0, 0.3, 0.9], light: [0.4, 0.9, 1.0], rings: true, rise: 0 },
};

export function buildSetPieces(map, quality = 'high') {
  RIDE = rideEnvelope(map);
  try { return buildSetPiecesInner(map, quality); } finally { RIDE = null; }
}

function buildSetPiecesInner(map, quality) {
  const structures = map.structures || [], boosts = map.boosts || [];
  if (!structures.length && !boosts.length && !(map.needles || []).length) return null;
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand((map.theme?.seed || 7) + 991);
  const density = DENSITY[quality] ?? 1;

  for (const st of structures) {
    if (map.line[st.from + 1]?.tunnel?.interior) continue; // inside a building already: no outer shell
    const A = map.line[st.from], Z = map.line[st.to];
    const look = SET_LOOK[st.kind] || SET_LOOK.temple;
    const t = A.tunnel || Z.tunnel || map.line[st.from + 1].tunnel;
    const dx = Z.p[0] - A.p[0], dz = Z.p[2] - A.p[2];
    const len = Math.hypot(dx, dz) || 1;
    const f = [dx / len, 0, dz / len], r = [-dz / len, 0, dx / len];
    const slope = (A.p[1] - Z.p[1]) / len;
    const ridge = (s) => A.p[1] - slope * s;
    const P = (s, lat, y) => [A.p[0] + f[0] * s + r[0] * lat, y, A.p[2] + f[2] * s + r[2] * lat];
    const L = A.width + t.side;
    const top = (s) => ridge(s) + t.top;
    const bot = (s) => ridge(s) - A.height - (t.bottom ?? 520);
    const yaw = Math.atan2(f[0], f[2]);
    // a solid-looking mass around the corridor: side blocks below the roof line, roof above
    const slab = (s0, s1, l0, l1, y0fn, y1fn, col, glow = 0) => {
      const c = [P(s0, l0, y0fn(s0)), P(s0, l1, y0fn(s0)), P(s1, l1, y0fn(s1)), P(s1, l0, y0fn(s1))];
      const u = [P(s0, l0, y1fn(s0)), P(s0, l1, y1fn(s0)), P(s1, l1, y1fn(s1)), P(s1, l0, y1fn(s1))];
      for (let k = 0; k < 4; k++) geo.quad(c[k], c[(k + 1) % 4], u[(k + 1) % 4], u[k], col, glow);
      geo.quad(u[0], u[1], u[2], u[3], mix(col, [0, 0, 0], 0.2), glow);
    };
    if (look.rock) {
      for (let k = 0; k < 40 * density; k++) {
        const s = rng() * len, side = rng() < 0.5 ? -1 : 1;
        const rad = 350 + rng() * 500;
        const up = rng() < 0.4;
        const c = up ? P(s, (rng() - 0.5) * L * 1.6, top(s) + rad * 0.8) : P(s, side * (L + rad * 0.8), ridge(s) - rng() * A.height);
        geo.blob(c, rad, mix(look.outer, [0, 0, 0], rng() * 0.4), 0, rng, 0.8);
      }
    } else if (!look.rings) {
      const steps = look.steps || 1;
      for (let k = 0; k < steps; k++) {
        const inset = k * 240;
        const w0 = L + 40, w1 = L + 1300 - inset;
        if (w1 <= w0 + 100) break;
        const hTop = (s) => top(s) + 200 + (k + 1) * (look.rise / steps);
        const col = mix(look.outer, [0.2, 0.2, 0.2], (k % 2) * 0.2);
        slab(-inset * 0.2, len + inset * 0.2, -w1, -w0, bot, hTop, col);
        slab(-inset * 0.2, len + inset * 0.2, w0, w1, bot, hTop, col);
        slab(-inset * 0.2, len + inset * 0.2, -w0, w0, (s) => top(s) + 40, hTop, col);
        geo.line(P(0, -w1, hTop(0)), P(0, w1, hTop(0)), look.trim);
        geo.line(P(len, -w1, hTop(len)), P(len, w1, hTop(len)), look.trim);
      }
      if (look.roof) {
        const yR = (s) => top(s) + look.rise + 260;
        for (let k = 0; k < 10; k++) {
          const s0 = (k / 10) * len, s1 = ((k + 1) / 10) * len;
          geo.quad(P(s0, -L - 1300, yR(s0)), P(s1, -L - 1300, yR(s1)), P(s1, 0, yR(s1) + 1400), P(s0, 0, yR(s0) + 1400), ROOF);
          geo.quad(P(s0, L + 1300, yR(s0)), P(s0, 0, yR(s0) + 1400), P(s1, 0, yR(s1) + 1400), P(s1, L + 1300, yR(s1)), ROOF);
        }
      }
      if (look.tower) slab(0, len, -L - 900, L + 900, (s) => top(s) + look.rise, (s) => top(s) + look.tower, look.outer);
      // doorway trim at the entrance and exit
      for (const s of [0, len]) {
        geo.line(P(s, -L, bot(s) + A.height), P(s, -L, top(s)), look.trim);
        geo.line(P(s, L, bot(s) + A.height), P(s, L, top(s)), look.trim);
        geo.line(P(s, -L, top(s)), P(s, L, top(s)), look.trim);
      }
    }
    // inside: a glowing strip along the ceiling so the interior reads at speed
    for (let s = 0; s < len; s += 400) {
      geo.line(P(s, -L * 0.5, top(s) - 8), P(Math.min(len, s + 400), -L * 0.5, top(Math.min(len, s + 400)) - 8), look.trim);
      geo.line(P(s, L * 0.5, top(s) - 8), P(Math.min(len, s + 400), L * 0.5, top(Math.min(len, s + 400)) - 8), look.trim);
    }
    // inside: lights along the walls (torches, lamps, glowworms...)
    for (let s = 300; s < len; s += 650) {
      for (const side of [-1, 1]) {
        const p = P(s, side * (L - 30), ridge(s) + t.top * 0.35);
        lights.dot(p, look.light, look.worms ? 30 : 140, look.blink ?? (st.kind === 'temple' || st.kind === 'hall' ? 7 + rng() * 4 : 0), rng());
        lights.dot(p, look.light, 220, 0, 0);
        if (look.glass && rng() < 0.7) geo.box(P(s + 200, side * (L - 6), ridge(s) + t.top * 0.15), [12, 300, 160], yaw + Math.PI / 2, GLASS[Math.floor(rng() * GLASS.length)], 0.95);
      }
      if (look.worms) for (let k = 0; k < 14; k++) lights.dot(P(s + rng() * 600, (rng() - 0.5) * 2 * L, top(s) - 20), [0.4, 0.85, 1.0], 18, 0, 0);
      if (look.crystals && rng() < 0.8) {
        const side = rng() < 0.5 ? -1 : 1;
        const base = P(s, side * (L - 20), top(s) - 10);
        geo.cyl(base, add(base, [-r[0] * side * 160, -260, -r[2] * side * 160]), 50, 0, 5, look.light, 0.8);
      }
      if (look.vines) for (let k = 0; k < 3; k++) {
        const v = P(s + rng() * 600, (rng() - 0.5) * 2 * L, top(s));
        geo.line(v, add(v, [0, -(150 + rng() * 300), 0]), [0.2, 0.8, 0.35]);
      }
    }
    if (look.rings) {
      for (let s = 0; s <= len; s += 500) {
        const c = P(s, 0, (top(s) + bot(s)) / 2);
        const R = Math.max(L, (top(s) - bot(s)) / 2) + 60;
        let prev = null;
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const p = add(c, add(scale(r, Math.cos(a) * R), [0, Math.sin(a) * R, 0]));
          if (prev) geo.line(prev, p, s % 1000 ? look.trim : look.light);
          prev = p;
        }
      }
    }
    // temple entrance guardians
    if (st.kind === 'temple' || st.kind === 'ruin') {
      for (const side of [-1, 1]) {
        const b = P(-150, side * (L + 420), bot(0) + A.height * 0.4);
        geo.box(add(b, [0, 380, 0]), [420, 760, 380], yaw, look.outer);
        geo.box(add(b, [0, 800, 0]), [460, 80, 420], yaw, mix(look.outer, [0, 0, 0], 0.3));
        lights.dot(add(add(b, [0, 520, 0]), scale(f, -200)), look.trim, 45, 0, 0);
      }
    }
  }

  drawNeedleWalls(geo, lights, map, rng);

  const mat = propMaterial({ dir: [-0.35, 0.5, -0.8], color: [0.5, 0.5, 0.6], ambient: [0.22, 0.2, 0.26], lamp: 0.6, lampColor: [1.0, 0.75, 0.5] });
  finish(group, geo, mat);
  finishLights(group, lights);

  // boost rings: glowing, spinning hoops where you fly through
  const ringMats = [];
  for (const b of boosts) {
    const ring = new THREE.Group();
    ring.position.set(...b.center);
    ring.rotation.y = (b.heading * Math.PI) / 180;
    const col = new THREE.Color(...(b.color || [0.3, 1, 1]));
    const torus = new THREE.Mesh(new THREE.TorusGeometry(b.radius * 0.8, 26, 10, 48), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4), fog: true }));
    const inner = new THREE.Mesh(new THREE.TorusGeometry(b.radius * 0.62, 10, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.3, 0.9).multiplyScalar(2), fog: true }));
    ring.add(torus, inner);
    group.add(ring);
    ringMats.push(inner);
  }
  const base = group.userData.update;
  group.userData.update = (time, cam) => {
    base(time, cam);
    ringMats.forEach((m, i) => { m.rotation.z = time * 2 + i; m.scale.setScalar(1 + Math.sin(time * 5 + i) * 0.05); });
  };
  return group;
}

// ----------------------------------------------------------------- temple complex (Lost Temple)

const T_STONE = [0.3, 0.33, 0.26];
const T_STONE2 = [0.24, 0.27, 0.21];
const T_GLOW = [0.25, 1.0, 0.55];
const T_GOLD = [1.0, 0.7, 0.25];

function buildTempleComplex(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 7102);
  const T = map.temple;
  const line = map.line;
  // dense samples of the ride (a bit below the ridge, where riders are)
  const samples = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i].p, b = line[i + 1].p;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 400));
    for (let k = 0; k < n; k++) {
      const u = k / n;
      samples.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - line[i].height * 0.4, a[2] + (b[2] - a[2]) * u]);
    }
  }
  /** Is a surface tile at p in the way of the ride? (cut a hole there) */
  const blocked = (p, r = 2400, vy = r) => samples.some((s) => Math.abs(s[1] - p[1]) < vy && (s[0] - p[0]) ** 2 + (s[2] - p[2]) ** 2 < r * r);
  const pc = T.pyramid.center;

  // --- jungle floor (with a hole where the ride dives underground)
  const G = T.ground;
  const RG = 42000, NA = 72, NR = 22;
  const rad = (k) => 1500 + (RG - 1500) * Math.pow(k / NR, 1.4);
  for (let k = 0; k < NR; k++) for (let j = 0; j < NA; j++) {
    const a0 = (j / NA) * Math.PI * 2, a1 = ((j + 1) / NA) * Math.PI * 2;
    const r0 = rad(k), r1 = rad(k + 1);
    const P = (r, a) => { const x = pc[0] + Math.cos(a) * r, z = pc[1] + Math.sin(a) * r; return [x, G + (r > 20000 ? (fbm3(x / 4000, 0, z / 4000, 2) - 0.3) * 3000 * ((r - 20000) / 22000) : 0), z]; };
    const c = P((r0 + r1) / 2, (a0 + a1) / 2);
    if (blocked(c, 2600)) continue;
    const col = mix([0.03, 0.1, 0.05], [0.06, 0.15, 0.07], fbm3(c[0] / 2500, 0, c[2] / 2500));
    geo.quad(P(r0, a0), P(r1, a0), P(r1, a1), P(r0, a1), col);
  }

  // --- the pyramid: stepped tiers, four grand stairways, a summit shrine
  // (sized to stay clear of the ride that circles it)
  const tiers = 11, base = T.pyramid.half ?? 8200, topHalf = Math.min(1400, base * 0.2);
  RIDE_OFF = true;
  const H = T.pyramid.top - G;
  for (let k = 0; k < tiers; k++) {
    const y0 = G + (H * k) / tiers, y1 = G + (H * (k + 1)) / tiers;
    const half = base + (topHalf - base) * (k / tiers);
    geo.box([pc[0], (y0 + y1) / 2, pc[1]], [half * 2, y1 - y0, half * 2], 0, k % 2 ? T_STONE : T_STONE2);
    // glowing glyph band on each tier
    const e = half + 6, y = y0 + (y1 - y0) * 0.55;
    const corners = [[-e, -e], [e, -e], [e, e], [-e, e]].map(([x, z]) => [pc[0] + x, y, pc[1] + z]);
    for (let q = 0; q < 4; q++) geo.line(corners[q], corners[(q + 1) % 4], k % 3 === 0 ? scale(T_GOLD, 1.6) : scale(T_GLOW, 0.9));
    // braziers on the tier corners
    if (k % 2 === 0) for (const c of corners) lights.dot(add(c, [0, (y1 - y0) * 0.6, 0]), [1.0, 0.55, 0.15], 140, 6 + rng() * 4, rng());
  }
  // stairways up the middle of each face
  for (let s = 0; s < 4; s++) {
    const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][s];
    for (let k = 0; k < tiers * 3; k++) {
      const u = k / (tiers * 3);
      const half = base + (topHalf - base) * u;
      const y = G + H * u;
      geo.box([pc[0] + dir[0] * (half + 150), y + H / (tiers * 6), pc[1] + dir[1] * (half + 150)], [dir[0] ? 300 : 1400, H / (tiers * 3), dir[1] ? 300 : 1400], 0, [0.36, 0.38, 0.3]);
    }
  }
  // summit shrine with an eternal flame
  const sTop = T.pyramid.top;
  geo.box([pc[0], sTop + 600, pc[1]], [2000, 1200, 2000], 0, T_STONE);
  geo.box([pc[0], sTop + 1300, pc[1]], [2400, 200, 2400], 0, T_STONE2);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) geo.cyl([pc[0] + x * 1000, sTop + 1400, pc[1] + z * 1000], [pc[0] + x * 1000, sTop + 2400, pc[1] + z * 1000], 120, 110, 8, T_STONE);
  geo.box([pc[0], sTop + 2500, pc[1]], [2400, 200, 2400], 0, T_STONE2);
  for (let k = 0; k < 40; k++) lights.flow([pc[0] + (rng() - 0.5) * 600, sTop + 1500, pc[1] + (rng() - 0.5) * 600], [pc[0] + (rng() - 0.5) * 900, sTop + 2300 + rng() * 1500, pc[1] + (rng() - 0.5) * 900], [1, 0.5 + rng() * 0.3, 0.1], 110, 0.6 + rng(), rng());
  lights.dot([pc[0], sTop + 1700, pc[1]], [1, 0.6, 0.2], 600, 0, 0);
  RIDE_OFF = false;

  // --- the stone tower you start on
  const sp = map.spawn.pos;
  for (let k = 0; k < 6; k++) {
    const y1 = sp[1] - 60 - k * ((sp[1] - G) / 6), y0 = y1 - (sp[1] - G) / 6;
    const half = 360 + k * 140;
    geo.box([sp[0], (y0 + y1) / 2, sp[2]], [half * 2, y1 - y0, half * 2], 0, k % 2 ? T_STONE : T_STONE2);
    if (k < 5) lights.dot([sp[0] + half + 20, y1 - 150, sp[2]], [1, 0.55, 0.15], 110, 7, rng());
  }

  // --- jungle around the pyramid
  for (let i = 0; i < Math.round(160 * density); i++) {
    const a = rng() * Math.PI * 2, r = T.pyramid.ringR + 2500 + rng() * 24000;
    const x = pc[0] + Math.cos(a) * r, z = pc[1] + Math.sin(a) * r;
    const h = 1600 + rng() * 2400;
    if (blocked([x, G + h * 0.6, z], 1800) || blocked([x, G + 300, z], 1800)) continue;
    jungleTree(geo, lights, [x, G - 20, z], h, 500 + rng() * 600, rng);
  }
  for (let i = 0; i < Math.round(300 * density); i++) {
    const a = rng() * Math.PI * 2, r = 9000 + rng() * 20000;
    const p = [pc[0] + Math.cos(a) * r, G, pc[1] + Math.sin(a) * r];
    if (blocked(p, 1500)) continue;
    if (rng() < 0.6) fern(geo, p, 200 + rng() * 250, rng); else mushroom(geo, p, 60 + rng() * 120, rng);
  }

  // --- the chambers under the temple
  const water = [];
  for (const R of T.rooms) chamber(geo, lights, R, blocked, rng, density, water);

  const mat = propMaterial({ dir: [-0.35, 0.32, -0.88], color: [0.35, 0.42, 0.55], ambient: [0.26, 0.27, 0.22], lamp: 1.1, lampColor: [1.0, 0.7, 0.4] });
  finish(group, geo, mat);
  finishLights(group, lights);
  for (const w of water) { group.add(w); group.userData.mats.push(w.material); }
  return group;
}

function chamber(geo, lights, R, blocked, rng, density, water) {
  const c = R.center, NA = 64;
  const ang = (j) => (j / NA) * Math.PI * 2;
  const at2 = (r, a, y) => [c[0] + Math.cos(a) * r, y, c[1] + Math.sin(a) * r];
  const Hh = R.top - R.bottom;
  const NV = Math.max(4, Math.round(Hh / 1200));
  const inner = R.kind === 'idol' ? R.radius - 3600 : 0;
  // walls (holes where the ride enters and leaves)
  for (let j = 0; j < NA; j++) for (let v = 0; v < NV; v++) {
    const a0 = ang(j), a1 = ang(j + 1), y0 = R.bottom + (Hh * v) / NV, y1 = R.bottom + (Hh * (v + 1)) / NV;
    if (blocked(at2(R.wallR, (a0 + a1) / 2, (y0 + y1) / 2), 2600)) continue;
    const col = mix(T_STONE2, T_STONE, ((j + v) % 3) / 3) ;
    geo.quad(at2(R.wallR, a0, y0), at2(R.wallR, a1, y0), at2(R.wallR, a1, y1), at2(R.wallR, a0, y1), col);
  }
  // ceiling and floor rings
  const NR = 6;
  for (const [y, col] of [[R.top, T_STONE2], [R.bottom, [0.2, 0.22, 0.17]]]) {
    for (let k = 0; k < NR; k++) for (let j = 0; j < NA; j++) {
      const r0 = inner + ((R.wallR - inner) * k) / NR, r1 = inner + ((R.wallR - inner) * (k + 1)) / NR;
      const a0 = ang(j), a1 = ang(j + 1);
      // only cut ceilings/floors where the ride actually passes through them
      if (blocked(at2((r0 + r1) / 2, (a0 + a1) / 2, y), 2600, 700)) continue;
      geo.quad(at2(r0, a0, y), at2(r1, a0, y), at2(r1, a1, y), at2(r0, a1, y), col);
    }
  }
  // glowing rune bands and torches around the walls
  for (let v = 1; v < NV; v++) {
    const y = R.bottom + (Hh * v) / NV;
    for (let j = 0; j < NA; j++) {
      const p0 = at2(R.wallR - 10, ang(j), y), p1 = at2(R.wallR - 10, ang(j + 1), y);
      if (blocked(p0, 2600)) continue;
      geo.line(p0, p1, v % 2 ? scale(T_GLOW, 0.8) : scale(T_GOLD, 1.2));
      if (j % 4 === 0 && v === Math.floor(NV / 2)) lights.dot(at2(R.wallR - 80, ang(j), y + 250), [1, 0.55, 0.15], 160, 6 + rng() * 4, rng());
    }
  }
  if (R.kind === 'pillars') {
    // two rings of colossal columns, inside and outside the ride
    for (const rr of [R.radius - 2300, R.radius + 2300]) {
      for (let j = 0; j < 16; j++) {
        const a = (j / 16) * Math.PI * 2 + (rr > R.radius ? 0.1 : 0);
        const b0 = at2(rr, a, R.bottom), b1 = at2(rr, a, R.top);
        if (blocked(at2(rr, a, (R.bottom + R.top) / 2), 1500)) continue;
        geo.cyl(b0, b1, 420, 380, 10, T_STONE);
        geo.box(add(b1, [0, -200, 0]), [1100, 400, 1100], a, T_STONE2);
        geo.box(add(b0, [0, 200, 0]), [1100, 400, 1100], a, T_STONE2);
        for (let k = 1; k < 4; k++) {
          const y = R.bottom + (Hh * k) / 4;
          for (let q = 0; q < 10; q++) {
            const aa = (q / 10) * Math.PI * 2, bb = ((q + 1) / 10) * Math.PI * 2;
            geo.line([b0[0] + Math.cos(aa) * 405, y, b0[2] + Math.sin(aa) * 405], [b0[0] + Math.cos(bb) * 405, y, b0[2] + Math.sin(bb) * 405], scale(T_GLOW, 1.2));
          }
        }
        lights.dot(at2(rr, a, R.top - 900), [1, 0.6, 0.2], 200, 0, 0);
      }
    }
  } else if (R.kind === 'flooded') {
    // a glowing pool fills the chamber, with half-sunken statues
    const wy = R.bottom + 300;
    const pos = [], flow = [];
    for (let j = 0; j < NA; j++) {
      const a0 = ang(j), a1 = ang(j + 1);
      const A = at2(0, a0, wy), B = at2(R.wallR, a0, wy), C = at2(R.wallR, a1, wy);
      pos.push(...A, ...B, ...C);
      flow.push(0, R.wallR * 3, R.wallR * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
    const m = new THREE.Mesh(g, waterMaterial([0.0, 0.05, 0.05], [0.15, 0.9, 0.7]));
    m.frustumCulled = false;
    water.push(m);
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * Math.PI * 2;
      const p = at2(R.wallR - 900, a, wy - 200);
      if (blocked(add(p, [0, 1200, 0]), 1800)) continue;
      geo.box(add(p, [0, 900, 0]), [700, 1800, 600], a, T_STONE);
      geo.box(add(p, [0, 2100, 0]), [600, 700, 600], a, T_STONE2);
      lights.dot(add(p, [-Math.cos(a) * 320, 2150, -Math.sin(a) * 320]), [0.3, 1, 0.6], 70, 0, 0);
    }
    for (let k = 0; k < 120 * density; k++) {
      const p = at2(rng() * R.wallR, rng() * Math.PI * 2, wy + 20);
      lights.dot(p, rng() < 0.5 ? [0.3, 1, 0.7] : [1, 0.4, 0.8], 40, 0.3 + rng(), rng());
    }
  } else if (R.kind === 'idol') {
    // the colossal idol pillar at the centre of the great hall
    const pr = inner - 150;
    const b0 = at2(0, 0, R.bottom), b1 = at2(0, 0, R.top);
    geo.cyl(b0, b1, pr, pr * 0.92, 16, [0.4, 0.38, 0.3]);
    // vertical gold seams and a glowing crown so the idol reads from anywhere in the hall
    for (let q = 0; q < 16; q++) {
      const a = (q / 16) * Math.PI * 2;
      geo.line(at2(pr + 12, a, R.bottom), at2(pr * 0.93 + 12, a, R.top), q % 2 ? scale(T_GOLD, 1.3) : scale(T_GLOW, 0.8));
    }
    for (let q = 0; q < 24; q++) {
      const a = (q / 24) * Math.PI * 2;
      lights.dot(at2(pr + 300, a, R.top - 400), T_GOLD, 260, 0, 0);
      lights.dot(at2(pr + 300, a, R.bottom + 600), [1, 0.5, 0.15], 260, 5 + rng() * 4, rng());
    }
    for (let y = R.bottom + 1500; y < R.top; y += 1500) {
      let prev = null;
      for (let q = 0; q <= 32; q++) {
        const a = (q / 32) * Math.PI * 2;
        const p = at2(pr + 15, a, y);
        if (prev) geo.line(prev, p, (y / 1500) % 2 < 1 ? scale(T_GOLD, 1.6) : scale(T_GLOW, 1.4));
        prev = p;
      }
    }
    // four giant stone faces with glowing eyes, staring out at the ride
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      for (const yy of [R.top - 2600, R.bottom + Hh * 0.45]) {
        const fp = at2(pr + 200, a, yy);
        geo.box(fp, [900, 1600, 1400], -a, T_STONE2);
        const out = [Math.cos(a), 0, Math.sin(a)], side = [-Math.sin(a), 0, Math.cos(a)];
        for (const s of [-1, 1]) lights.dot(add(add(fp, scale(out, 470)), add(scale(side, s * 320), [0, 300, 0])), [0.3, 1.0, 0.5], 180, 0, 0);
        geo.box(add(add(fp, scale(out, 460)), [0, -350, 0]), [40, 120, 700], -a, scale(T_GOLD, 0.8), 0.9);
      }
    }
    // shafts of light falling from the ceiling
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const p = at2(R.radius + 1600, a, R.top);
      for (let q = 0; q < 12; q++) lights.flow(add(p, [(rng() - 0.5) * 300, -10, (rng() - 0.5) * 300]), add(p, [(rng() - 0.5) * 300, -Hh, (rng() - 0.5) * 300]), [1, 0.9, 0.6], 60, 0.15 + rng() * 0.1, rng());
    }
  }
}

// ----------------------------------------------------------------- banger landmarks

const GROUND = {
  canyon: [[0.36, 0.17, 0.1], [0.5, 0.26, 0.14]], volcano: [[0.05, 0.035, 0.04], [0.12, 0.07, 0.07]],
  castle: [[0.04, 0.08, 0.05], [0.07, 0.11, 0.07]], cave: [[0.05, 0.06, 0.09], [0.12, 0.13, 0.18]],
  servers: [[0.02, 0.05, 0.04], [0.04, 0.08, 0.06]],
};
const THEME_OF = { lighthouse: 'beach', spire: 'canyon', geode: 'cave', skyscraper: 'city', reactor: 'station', mainframe: 'servers', volcanocone: 'volcano', blackhole: 'vortex', keep: 'castle' };

function buildLandmarkScene(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 1);
  const spin = [];
  const theme = THEME_OF[t.landmark];
  const G = map.ground;
  const xs = map.line.map((e) => e.p[0]), zs = map.line.map((e) => e.p[2]);
  const pad = 14000;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, z0 = Math.min(...zs) - pad, z1 = Math.max(...zs) + pad;

  // ground (terrain themes)
  const gc = GROUND[theme];
  if (gc) {
    const T = 3000;
    for (let x = x0; x < x1; x += T) for (let z = z0; z < z1; z += T) {
      const h = (px, pz) => G + (fbm3(px / 9000, 0, pz / 9000, 3) - 0.5) * (theme === 'cave' ? 600 : 1200);
      const c = mix(gc[0], gc[1], fbm3(x / 4000, 0, z / 4000, 2));
      geo.quad([x, h(x, z), z], [x, h(x, z + T), z + T], [x + T, h(x + T, z + T), z + T], [x + T, h(x + T, z), z], c);
    }
  }
  // lava sea under the volcano map, glowing grid under servers
  if (theme === 'volcano') {
    const lm = lavaMaterial();
    const pos = [], flow = [];
    const y = G - 300;
    for (let x = x0; x < x1; x += 8000) for (let z = z0; z < z1; z += 8000) {
      if (fbm3(x / 20000, 0, z / 20000, 2) < 0.52) continue;
      pos.push(x, y + 320, z, x, y + 320, z + 8000, x + 8000, y + 320, z + 8000, x, y + 320, z, x + 8000, y + 320, z + 8000, x + 8000, y + 320, z);
      flow.push(0, 1, 2, 0, 2, 1);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow.map((v) => v * 5000), 1));
      const m = new THREE.Mesh(g, lm); m.frustumCulled = false; group.add(m); spin.push(() => {}); (group.userData.mats ??= []).push(lm);
    }
  }

  // scattered props that set the scene (the ride filter keeps them off the track)
  const n = Math.round(140 * density);
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0);
    const p = [x, G, z];
    if (theme === 'canyon') { if (rng() < 0.25) mesa(geo, p, 1200 + rng() * 2000, 2000 + rng() * 4000, rng); else if (rng() < 0.6) hoodoo(geo, p, 800 + rng() * 1500, rng); else saguaro(geo, p, 400 + rng() * 400, rng); }
    else if (theme === 'volcano') { if (rng() < 0.5) geo.blob(add(p, [0, 100, 0]), 200 + rng() * 500, mix(BASALT, [0.15, 0.08, 0.09], rng()), 0, rng, 0.7); else { const h = 600 + rng() * 2400; geo.cyl(p, add(p, [0, h, 0]), 120 + rng() * 150, 0, 5, [0.12, 0.05, 0.14]); geo.line(p, add(p, [0, h, 0]), [1.2, 0.3, 1.4]); } lights.flow(add(p, [0, 100, 0]), add(p, [(rng() - 0.5) * 600, 3000, (rng() - 0.5) * 600]), [1, 0.45, 0.1], 30, 0.15, rng()); }
    else if (theme === 'castle') { if (rng() < 0.6) jungleTree(geo, lights, p, 1200 + rng() * 1500, 400 + rng() * 400, rng); else { geo.cyl(p, add(p, [0, 1800, 0]), 300, 280, 8, STONE_A); geo.cyl(add(p, [0, 1800, 0]), add(p, [0, 2700, 0]), 340, 0, 8, ROOF); lights.dot(add(p, [0, 1400, 0]), [1, 0.55, 0.15], 110, 7, rng()); } }
    else if (theme === 'cave') { const h = 1500 + rng() * 5000; geo.cyl(p, add(p, [0, h, 0]), 200 + rng() * 400, 0, 6, [0.12, 0.12, 0.17]); if (rng() < 0.4) { const tip = add(p, [(rng() - 0.5) * 500, 800 + rng() * 1200, (rng() - 0.5) * 500]); geo.cyl(p, tip, 150 + rng() * 150, 0, 5, [[0.3, 1, 1], [0.6, 0.5, 1], [0.4, 0.8, 1]][Math.floor(rng() * 3)], 0.8); } }
    else if (theme === 'servers') { const h = 2000 + rng() * 5000, w = 600 + rng() * 600; geo.box(add(p, [0, h / 2, 0]), [w, h, w], 0, [0.05, 0.06, 0.07]); for (let k = 0; k < 12 * density; k++) lights.dot(add(p, [(rng() - 0.5) * w, rng() * h, w / 2 + 5]), [[0.2, 1, 0.45], [0.2, 0.8, 1], [1, 0.7, 0.2]][Math.floor(rng() * 3)], 30, rng() < 0.6 ? 1 + rng() * 3 : 0, rng()); }
    else if (theme === 'beach') { if (rng() < 0.5) { const isl = [x, (map.theme.seaY ?? G) - 100, z]; geo.blob(isl, 700 + rng() * 900, [0.95, 0.65, 0.55], 0, rng, 0.35); palm(geo, add(isl, [0, 250, 0]), 700 + rng() * 600, rng, [NEON_GREEN, NEON_CYAN, NEON_PINK][Math.floor(rng() * 3)]); } }
    else if (theme === 'station' || theme === 'vortex') { const y = G + rng() * (map.line[0].p[1] - G + 8000); geo.blob([x, y, z], 200 + rng() * 900, [0.2, 0.18, 0.24], 0, rng, 0.8); }
  }

  for (const L of map.landmarks || []) landmark(geo, lights, spin, group, L, map, rng);

  const light = theme === 'beach' ? { dir: [0, 0.35, -1], color: [0.8, 0.45, 0.45], ambient: [0.42, 0.26, 0.4] }
    : theme === 'canyon' ? { dir: [0.35, 0.7, -0.6], color: [0.42, 0.5, 0.8], ambient: [0.2, 0.13, 0.15], lamp: 0.35, lampColor: [1, 0.6, 0.4] }
      : { dir: [-0.35, 0.5, -0.8], color: [0.45, 0.45, 0.55], ambient: [0.2, 0.2, 0.24], lamp: 0.6, lampColor: [1, 0.75, 0.5] };
  const mat = propMaterial(light);
  finish(group, geo, mat, (time) => { for (const s of spin) s(time); });
  finishLights(group, lights);
  return group;
}

function landmark(geo, lights, spin, group, L, map, rng) {
  const c = L.center, R = Math.max(2500, L.clear);
  const G = map.ground;
  const P = (dx, y, dz) => [c[0] + dx, y, c[1] + dz];
  const top = L.lineTop;
  RIDE_OFF = true; // landmarks are sized to the clear zone inside the ride
  try {
    switch (L.kind) {
      case 'lighthouse': {
        const sea = map.theme.seaY ?? G;
        for (let k = 0; k < 14; k++) geo.blob(P((rng() - 0.5) * R * 0.9, sea - 200 + rng() * 600, (rng() - 0.5) * R * 0.9), R * (0.18 + rng() * 0.15), mix([0.3, 0.18, 0.26], [0.45, 0.28, 0.32], rng()), 0, rng, 0.6);
        const h0 = sea + 400, h1 = top + 9000, r0 = R * 0.62;
        const bands = 12;
        for (let k = 0; k < bands; k++) {
          const y0 = h0 + ((h1 - h0) * k) / bands, y1 = h0 + ((h1 - h0) * (k + 1)) / bands;
          const ra = r0 * (1 - 0.35 * (k / bands)), rb = r0 * (1 - 0.35 * ((k + 1) / bands));
          geo.cyl(P(0, y0, 0), P(0, y1, 0), ra, rb, 16, k % 2 ? [0.95, 0.92, 0.95] : [0.95, 0.2, 0.45]);
          for (let q = 0; q < 16; q++) { const a0 = (q / 16) * Math.PI * 2, a1 = ((q + 1) / 16) * Math.PI * 2; geo.line(P(Math.cos(a0) * (ra + 8), y0, Math.sin(a0) * (ra + 8)), P(Math.cos(a1) * (ra + 8), y0, Math.sin(a1) * (ra + 8)), [0.3, 1.4, 1.6]); }
        }
        const lr = r0 * 0.7;
        geo.cyl(P(0, h1, 0), P(0, h1 + 300, 0), lr * 1.3, lr * 1.3, 16, [0.2, 0.2, 0.25]);
        geo.cyl(P(0, h1 + 300, 0), P(0, h1 + 1300, 0), lr, lr, 16, [1.0, 0.9, 0.6], 1);
        geo.cyl(P(0, h1 + 1300, 0), P(0, h1 + 2200, 0), lr * 1.2, 0, 16, [0.95, 0.2, 0.45]);
        lights.dot(P(0, h1 + 800, 0), [1, 0.95, 0.7], 900, 0, 0);
        // rotating beam
        const beam = new THREE.Mesh(new THREE.ConeGeometry(1600, 40000, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.6).multiplyScalar(0.5), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        beam.geometry.translate(0, -20000, 0); beam.geometry.rotateZ(Math.PI / 2);
        const pivot = new THREE.Group(); pivot.position.set(...P(0, h1 + 800, 0)); pivot.add(beam); group.add(pivot);
        spin.push((t) => { pivot.rotation.y = t * 0.6; });
        break;
      }
      case 'seastacks': {
        const sea = map.theme.seaY ?? G;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + rng(), d = rng() * R * 0.6;
          const b0 = P(Math.cos(a) * d, sea - 300, Math.sin(a) * d);
          const h = top - sea + 1500 + rng() * 3000;
          geo.cyl(b0, add(b0, [0, h, 0]), R * 0.16, R * 0.1, 8, mix([0.26, 0.14, 0.22], [0.38, 0.22, 0.3], rng()));
          palm(geo, add(b0, [0, h, 0]), 700, rng, [NEON_GREEN, NEON_CYAN, NEON_PINK][k % 3]);
        }
        break;
      }
      case 'spire': {
        let y = G - 200, r = R * 0.9;
        while (y < top + 7000) {
          const h = 900 + rng() * 900;
          geo.cyl(P((rng() - 0.5) * 200, y, (rng() - 0.5) * 200), P((rng() - 0.5) * 200, y + h, (rng() - 0.5) * 200), r, r * 0.9, 10, strataColor([c[0], y, c[1]]));
          y += h; r *= 0.9;
        }
        geo.blob(P(0, y + 200, 0), r * 1.3, [0.45, 0.2, 0.12], 0, rng, 0.5);
        for (let k = 0; k < 6; k++) lights.dot(P(Math.cos(k) * r, y + 100, Math.sin(k) * r), [1, 0.55, 0.2], 120, 6, rng());
        break;
      }
      case 'arch': {
        const span = R * 0.8, rise = top - G + 3500, th = Math.min(1200, R * 0.15);
        for (let k = 0; k < 20; k++) {
          const a0 = (k / 20) * Math.PI, a1 = ((k + 1) / 20) * Math.PI;
          geo.cyl(P(-Math.cos(a0) * span, G + Math.sin(a0) * rise, 0), P(-Math.cos(a1) * span, G + Math.sin(a1) * rise, 0), th, th, 8, strataColor([c[0], G + Math.sin(a0) * rise, c[1]]));
        }
        break;
      }
      case 'geode': case 'geode2': {
        const big = L.kind === 'geode';
        const base = P(0, G, 0), rr = R * (big ? 0.55 : 0.45);
        for (let k = 0; k < 10; k++) geo.blob(P((rng() - 0.5) * rr * 2, G + 200, (rng() - 0.5) * rr * 2), rr * (0.4 + rng() * 0.3), [0.1, 0.1, 0.15], 0, rng, 0.6);
        const cols = [[0.4, 1.0, 1.0], [0.7, 0.5, 1.0], [0.5, 0.8, 1.0]];
        geo.cyl(base, P(0, top + (big ? 6000 : 3500), 0), rr, 0, 6, cols[0], 0.85);
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2, lean = 0.35 + rng() * 0.3;
          const len = (top - G) * (0.5 + rng() * 0.5);
          geo.cyl(P(Math.cos(a) * rr * 0.4, G, Math.sin(a) * rr * 0.4), P(Math.cos(a) * len * lean, G + len, Math.sin(a) * len * lean), rr * (0.25 + rng() * 0.2), 0, 6, cols[k % 3], 0.8);
        }
        for (let k = 0; k < 40; k++) lights.dot(P((rng() - 0.5) * rr * 3, G + rng() * (top - G + 4000), (rng() - 0.5) * rr * 3), cols[k % 3], 160, 0, 0);
        break;
      }
      case 'skyscraper': case 'skyscraper2': {
        const street = map.theme.streetY ?? G;
        let w = R * 1.3 * (L.kind === 'skyscraper' ? 1 : 0.85);
        let y = street;
        const hTot = top - street + (L.kind === 'skyscraper' ? 14000 : 9000);
        const tiers = 4;
        for (let k = 0; k < tiers; k++) {
          const h = hTot / tiers;
          geo.box(P(0, y + h / 2, 0), [w, h, w], 0, [0.03, 0.025, 0.06]);
          const col = [[0.3, 1.4, 1.6], [1.6, 0.3, 1.2], [1.6, 1.2, 0.3]][k % 3];
          for (let yy = y + 300; yy < y + h; yy += 450) {
            const e = w / 2 + 6;
            const pts = [P(-e, yy, -e), P(e, yy, -e), P(e, yy, e), P(-e, yy, e)];
            for (let q = 0; q < 4; q++) geo.line(pts[q], pts[(q + 1) % 4], scale(col, 0.45));
          }
          for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) geo.line(P(sx * w / 2, y, sz * w / 2), P(sx * w / 2, y + h, sz * w / 2), col);
          y += h; w *= 0.72;
        }
        geo.cyl(P(0, y, 0), P(0, y + 4000, 0), 120, 20, 6, [0.5, 0.5, 0.55]);
        lights.dot(P(0, y + 4050, 0), [1, 0.1, 0.1], 300, 0.7, 0);
        break;
      }
      case 'reactor': case 'reactor2': {
        const rc = R * 0.52 * (L.kind === 'reactor' ? 1 : 0.8);
        const cy = (top + L.lineBot) / 2;
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(rc, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 1.8), fog: true }));
        core.position.set(...P(0, cy, 0)); group.add(core);
        const rings = [];
        for (let k = 0; k < 3; k++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(rc * (1.35 + k * 0.25), rc * 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(...[[1, 0.3, 0.9], [0.3, 1, 1], [1, 0.8, 0.3]][k]).multiplyScalar(2), fog: true }));
          ring.position.copy(core.position); group.add(ring); rings.push(ring);
        }
        spin.push((t) => { rings.forEach((r, i) => { r.rotation.x = t * (0.4 + i * 0.2); r.rotation.y = t * (0.3 - i * 0.15); }); core.scale.setScalar(1 + Math.sin(t * 4) * 0.03); });
        geo.cyl(P(0, cy - rc * 6, 0), P(0, cy - rc, 0), rc * 0.2, rc * 0.3, 8, STEEL_B);
        geo.cyl(P(0, cy + rc, 0), P(0, cy + rc * 6, 0), rc * 0.3, rc * 0.2, 8, STEEL_B);
        for (let k = 0; k < 40; k++) lights.flow(P(0, cy - rc * 5, 0), P((rng() - 0.5) * rc, cy, (rng() - 0.5) * rc), [0.4, 1, 1], 80, 0.5 + rng(), rng());
        break;
      }
      case 'mainframe': case 'mainframe2': {
        const w = R * 1.25 * (L.kind === 'mainframe' ? 1 : 0.85);
        const y0 = L.lineBot - 4000, y1 = top + 5000;
        geo.box(P(0, (y0 + y1) / 2, 0), [w, y1 - y0, w], 0, [0.04, 0.05, 0.06]);
        for (let yy = y0; yy < y1; yy += 260) {
          const e = w / 2 + 6;
          for (const [ax, az, bx, bz] of [[-e, -e, e, -e], [e, -e, e, e], [e, e, -e, e], [-e, e, -e, -e]]) {
            if (rng() < 0.15) geo.line(P(ax, yy, az), P(bx, yy, bz), [0.1, 0.6, 0.3]);
            if (rng() < 0.5 * 1) lights.dot(P(ax + (bx - ax) * rng(), yy + 60, az + (bz - az) * rng()), [[0.2, 1, 0.45], [0.2, 0.8, 1], [1, 0.7, 0.2]][Math.floor(rng() * 3)], 22, rng() < 0.6 ? 1 + rng() * 4 : 0, rng());
          }
        }
        for (let k = 0; k < 60; k++) { const a = rng() * Math.PI * 2; const p = P(Math.cos(a) * w * 0.55, y0, Math.sin(a) * w * 0.55); lights.flow(p, add(p, [0, y1 - y0, 0]), [0.3, 1, 0.6], 70, 0.15 + rng() * 0.25, rng()); }
        break;
      }
      case 'volcanocone': {
        const peak = top + 9000, base = R * 1.0;
        const rAt = (y) => base * (1 - 0.8 * (y - G) / (peak - G));
        let prev = null;
        for (let l = 0; l <= 8; l++) {
          const y = G + ((peak - G) * l) / 8;
          const ring = [];
          for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; const r = rAt(y) * (0.9 + rng() * 0.15); ring.push(P(Math.cos(a) * r, y, Math.sin(a) * r)); }
          if (prev) for (let k = 0; k < 20; k++) geo.quad(prev[k], prev[(k + 1) % 20], ring[(k + 1) % 20], ring[k], mix(BASALT, [0.16, 0.08, 0.09], rng()));
          prev = ring;
        }
        for (let k = 0; k < 20; k++) geo.tri(prev[k], prev[(k + 1) % 20], P(0, peak - 400, 0), [1.4, 0.4, 0.06], [1.4, 0.4, 0.06], [1.6, 0.8, 0.2], 1);
        for (let k = 0; k < 6; k++) { const a = rng() * Math.PI * 2; let p = P(Math.cos(a) * rAt(peak), peak, Math.sin(a) * rAt(peak)); for (let s = 1; s <= 8; s++) { const y = peak - ((peak - G) * s) / 8; const q = P(Math.cos(a) * rAt(y) * 1.01, y, Math.sin(a) * rAt(y) * 1.01); geo.cyl(p, q, 160, 160, 5, [1.3, 0.35, 0.05], 1); p = q; } }
        for (let k = 0; k < 80; k++) lights.flow(P((rng() - 0.5) * 800, peak, (rng() - 0.5) * 800), P((rng() - 0.5) * 6000, peak + 4000 + rng() * 8000, (rng() - 0.5) * 6000), [1, 0.45, 0.1], 200, 0.15 + rng() * 0.25, rng());
        lights.dot(P(0, peak, 0), [1, 0.5, 0.1], 1500, 0, 0);
        break;
      }
      case 'lavafall': {
        const w = R * 0.6;
        geo.blob(P(0, top + 2000, 0), w, BASALT, 0, rng, 1.2);
        geo.cyl(P(0, top + 1500, 0), P(0, G, 0), w * 0.3, w * 0.4, 10, [1.4, 0.4, 0.06], 1);
        for (let k = 0; k < 60; k++) lights.flow(P((rng() - 0.5) * w * 0.6, top + 1500, (rng() - 0.5) * w * 0.6), P((rng() - 0.5) * w, G, (rng() - 0.5) * w), [1, 0.6, 0.15], 120, 0.3 + rng() * 0.3, rng());
        break;
      }
      case 'blackhole': case 'star': {
        const cy = (top + L.lineBot) / 2;
        const rr = R * 0.45;
        if (L.kind === 'blackhole') {
          const hole = new THREE.Mesh(new THREE.SphereGeometry(rr, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
          hole.position.set(...P(0, cy, 0)); group.add(hole);
          const disk = new THREE.Group(); disk.position.copy(hole.position); disk.rotation.x = 0.35;
          for (let k = 0; k < 5; k++) {
            const ring = new THREE.Mesh(new THREE.RingGeometry(rr * (1.3 + k * 0.35), rr * (1.55 + k * 0.35), 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(...[[1, 0.9, 0.5], [1, 0.6, 0.2], [1, 0.3, 0.6], [0.7, 0.3, 1], [0.3, 0.6, 1]][k]).multiplyScalar(2.2 - k * 0.3), side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
            ring.rotation.x = Math.PI / 2; disk.add(ring);
          }
          group.add(disk);
          spin.push((t) => { disk.rotation.y = t * 0.5; });
          const halo = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.05, rr * 0.04, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.5).multiplyScalar(2.5), fog: false }));
          halo.position.copy(hole.position); group.add(halo); spin.push(() => halo.lookAt(halo.position.clone().add(new THREE.Vector3(0, 0, 1))));
        } else {
          const star = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.1, 0.5), fog: false }));
          star.position.set(...P(0, cy, 0)); group.add(star);
          spin.push((t) => star.scale.setScalar(1 + Math.sin(t * 2) * 0.03));
          for (let k = 0; k < 80; k++) { const a = rng() * Math.PI * 2, b2 = rng() * Math.PI - Math.PI / 2; const d = [Math.cos(a) * Math.cos(b2), Math.sin(b2), Math.sin(a) * Math.cos(b2)]; lights.flow(add(P(0, cy, 0), scale(d, rr)), add(P(0, cy, 0), scale(d, rr * 2.2)), [1, 0.6, 0.2], 200, 0.3 + rng() * 0.4, rng()); }
        }
        break;
      }
      case 'keep': case 'gatetower': {
        if (L.kind === 'keep') {
          const w = R * 1.3, h = top - G + 6000;
          geo.box(P(0, G + h / 2, 0), [w, h, w], 0, STONE_A);
          for (let x = -w / 2; x <= w / 2; x += 400) for (const s of [-1, 1]) { geo.box(P(x, G + h + 120, s * w / 2), [220, 240, 220], 0, STONE_B); geo.box(P(s * w / 2, G + h + 120, x), [220, 240, 220], 0, STONE_B); }
          for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) tower(geo, lights, P(sx * w / 2, G, sz * w / 2), h + 1500, Math.min(900, w * 0.14), rng, { r: [1, 0, 0], f: [0, 0, 1] }, 1);
          for (let k = 0; k < 24; k++) { const side = k % 4, u = (rng() - 0.5) * w * 0.8, y = G + h * (0.3 + rng() * 0.6); const p = side === 0 ? P(u, y, -w / 2 - 6) : side === 1 ? P(u, y, w / 2 + 6) : side === 2 ? P(-w / 2 - 6, y, u) : P(w / 2 + 6, y, u); geo.box(p, side < 2 ? [140, 280, 14] : [14, 280, 140], 0, GLASS[k % GLASS.length], 0.95); }
          lights.dot(P(0, G + h + 600, 0), [1, 0.5, 0.15], 500, 6, 0);
        } else {
          const d = R * 0.55;
          for (const s of [-1, 1]) tower(geo, lights, P(s * d, G, 0), top - G + 3000, Math.min(1100, R * 0.18), rng, { r: [1, 0, 0], f: [0, 0, 1] }, s);
          for (let k = 0; k < 12; k++) { const a0 = (k / 12) * Math.PI, a1 = ((k + 1) / 12) * Math.PI; geo.cyl(P(-Math.cos(a0) * d, top + 800 + Math.sin(a0) * 1500, 0), P(-Math.cos(a1) * d, top + 800 + Math.sin(a1) * 1500, 0), 300, 300, 6, STONE_A); }
        }
        break;
      }
      default: break;
    }
  } finally { RIDE_OFF = false; }
}

// ---------------------------------------------------------------------------
// Needle walls drawn as part of the world (rock faces, towers, bulkheads...)
// ---------------------------------------------------------------------------

const NEEDLE_STYLE = {
  beach: 'rock', canyon: 'rock', cave: 'rock', volcano: 'rock',
  city: 'tower', station: 'bulkhead', servers: 'bulkhead', jungle: 'stone', castle: 'stone', vortex: 'energy',
};
const ROCK_COL = {
  beach: (p) => mix([0.3, 0.17, 0.26], [0.46, 0.28, 0.34], fbm3(p[0] / 700, p[1] / 500, p[2] / 700, 3)),
  canyon: (p) => strataColor(p),
  cave: (p) => mix([0.07, 0.08, 0.12], [0.2, 0.2, 0.28], fbm3(p[0] / 600, p[1] / 600, p[2] / 600, 3)),
  volcano: (p) => mix(BASALT, [0.17, 0.09, 0.09], fbm3(p[0] / 600, p[1] / 500, p[2] / 600, 3)),
};

function needleThemeKey(map) {
  const t = map.theme?.type;
  if (t === 'landmark') return THEME_OF[map.theme.landmark];
  if (t === 'temple-complex') return 'jungle';
  if (t === 'interior') return 'castle';
  if (t === 'castle') return null; // generated castle maps draw gatehouses already
  return t || null;
}

function drawNeedleWalls(geo, lights, map, rng) {
  const key = needleThemeKey(map);
  const style = NEEDLE_STYLE[key];
  if (!style) return;
  RIDE_OFF = true;
  try {
    for (const n of map.needles || []) {
      const c = n.gapCenter, R = n.right, F = n.fwd;
      const P = (lat, y, fw) => [c[0] + R[0] * lat + F[0] * fw, y, c[2] + R[2] * lat + F[2] * fw];
      const half = n.size / 2;
      const sA = n.slotLat - half, sB = n.slotLat + half;
      const parts = [[-n.reach, sA, n.yBot], [sB, n.reach, n.yBot]];
      if (n.lintel != null) parts.push([sA, sB, c[1] + n.lintel]);
      const T = { rock: 650, tower: 900, bulkhead: 380, stone: 520, energy: 80 }[style];
      for (const [l0, l1, y0] of parts) wallPiece(geo, lights, P, l0, l1, y0, n.yTop, T, style, key, rng, n);
      // the slot glows so it reads at speed
      const glow = { rock: [1.6, 0.9, 0.4], tower: [0.4, 1.6, 1.8], bulkhead: [1.8, 0.9, 0.2], stone: [1.6, 0.8, 0.3], energy: [1.8, 0.4, 1.6] }[style];
      const yA = c[1] - 1400, yB = c[1] + 1400;
      for (const fw of [-T - 8, T + 8]) {
        geo.line(P(sA, yA, fw), P(sA, yB, fw), glow);
        geo.line(P(sB, yA, fw), P(sB, yB, fw), glow);
      }
      for (const l of [sA - 80, sB + 80]) lights.dot(P(l, c[1] + 700, -T - 40), glow.map((v) => v / 1.8), 120, 0, 0);
    }
  } finally { RIDE_OFF = false; }
}

function wallPiece(geo, lights, P, l0, l1, y0, y1, T, style, key, rng, n) {
  const NX = Math.max(2, Math.ceil((l1 - l0) / 700)), NY = Math.max(2, Math.ceil((y1 - y0) / 700));
  const col = style === 'rock' ? ROCK_COL[key] : style === 'tower' ? () => [0.03, 0.025, 0.06]
    : style === 'bulkhead' ? (p) => (Math.floor((p[1] - y0) / 600) % 2 ? STEEL_A : STEEL_B)
      : style === 'stone' ? (p) => mix(T_STONE2, T_STONE, ((Math.floor(p[1] / 260) + Math.floor((p[0] + p[2]) / 520)) & 1) * 0.6 + 0.2)
        : () => [0.25, 0.05, 0.3];
  const glow = style === 'energy' ? 0.55 : 0;
  // front and back faces (rock bulges outward, away from the slab)
  for (const side of [-1, 1]) {
    const grid = [];
    for (let i = 0; i <= NX; i++) {
      const row = [];
      for (let j = 0; j <= NY; j++) {
        const lat = l0 + ((l1 - l0) * i) / NX, y = y0 + ((y1 - y0) * j) / NY;
        let fw = side * T;
        if (style === 'rock') {
          const p0 = P(lat, y, 0);
          const edge = Math.min(1, Math.min(lat - l0, l1 - lat) / 600); // keep slot edges straight
          fw += side * fbm3(p0[0] / 900, p0[1] / 700, p0[2] / 900, 3) * 900 * edge;
        }
        row.push(P(lat, y, fw));
      }
      grid.push(row);
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const a = grid[i][j], b = grid[i + 1][j], cc = grid[i + 1][j + 1], d = grid[i][j + 1];
      const cl = col(a);
      if (side < 0) { geo.tri(a, cc, b, cl, cl, cl, glow); geo.tri(a, d, cc, cl, cl, cl, glow); }
      else { geo.tri(a, b, cc, cl, cl, cl, glow); geo.tri(a, cc, d, cl, cl, cl, glow); }
    }
  }
  // the sides (slot edges and outer ends) and the top
  for (const l of [l0, l1]) geo.quad(P(l, y0, -T), P(l, y0, T), P(l, y1, T), P(l, y1, -T), col(P(l, y0, 0)), glow);
  geo.quad(P(l0, y1, -T), P(l1, y1, -T), P(l1, y1, T), P(l0, y1, T), col(P(l0, y1, 0)), glow);

  // style details
  if (style === 'tower') {
    const cols = [[0.3, 1.4, 1.6], [1.6, 0.3, 1.2], [1.6, 1.2, 0.3]];
    const wc = cols[Math.floor(rng() * 3)];
    for (let y = y0 + 400; y < y1; y += 420) for (const fw of [-T - 6, T + 6]) geo.line(P(l0, y, fw), P(l1, y, fw), scale(wc, 0.35));
    for (const fw of [-T - 6, T + 6]) for (const l of [l0, l1]) geo.line(P(l, y0, fw), P(l, y1, fw), wc);
    lights.dot(P((l0 + l1) / 2, y1 + 80, 0), [1, 0.1, 0.1], 120, 0.7, rng());
  } else if (style === 'bulkhead') {
    for (let y = y0; y < y1; y += 600) for (const fw of [-T - 6, T + 6]) geo.line(P(l0, y, fw), P(l1, y, fw), [0.3, 0.5, 0.8]);
    // hazard stripes along the slot edge
    const edgeL = Math.abs(l1 - n.slotLat) < Math.abs(l0 - n.slotLat) ? l1 : l0;
    const dir = edgeL === l1 ? -1 : 1;
    for (let y = n.gapCenter[1] - 1400; y < n.gapCenter[1] + 1400; y += 200) for (const fw of [-T - 7, T + 7]) geo.line(P(edgeL, y, fw), P(edgeL + dir * 160, y + 160, fw), [1.8, 1.2, 0.1]);
  } else if (style === 'stone') {
    for (let y = y0 + 900; y < y1; y += 1300) for (const fw of [-T - 6, T + 6]) geo.line(P(l0, y, fw), P(l1, y, fw), [0.3, 1.1, 0.6]);
    const edgeL = Math.abs(l1 - n.slotLat) < Math.abs(l0 - n.slotLat) ? l1 : l0;
    lights.dot(P(edgeL + (edgeL === l1 ? -90 : 90), n.gapCenter[1] + 300, -T - 60), [1, 0.55, 0.15], 140, 7 + rng() * 4, rng());
  } else if (style === 'energy') {
    for (let y = y0; y < y1; y += 500) for (const fw of [-T - 6, T + 6]) geo.line(P(l0, y, fw), P(l1, y, fw), [1.4, 0.3, 1.4]);
  }
}

// ----------------------------------------------------------------- interiors (ride inside a landmark)

function buildInterior(map, t, density) {
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 5);
  const line = map.line;
  RIDE_OFF = true; // everything here is placed on the walls/floor/ceiling of the enclosure
  try {
    for (let i = 0; i < line.length - 1; i++) {
      const e = line[i], f = line[i + 1], tn = e.tunnel;
      if (!tn || !tn.interior) continue;
      const dx = f.p[0] - e.p[0], dz = f.p[2] - e.p[2];
      const len = Math.hypot(dx, dz) || 1;
      const F = [dx / len, 0, dz / len], R = [-dz / len, 0, dx / len];
      const Lw = e.width + tn.side;
      const at2 = (s, lat, dy) => { const u = s / len; return [e.p[0] + dx * u + R[0] * lat, e.p[1] + (f.p[1] - e.p[1]) * u + dy, e.p[2] + dz * u + R[2] * lat]; };
      const floorY = -e.height - (tn.bottom ?? 600), ceilY = tn.top ?? 750;
      // corners built from each point's own section (same as the walls) so curves leave no gaps
      const rv = (pt) => [Math.cos((pt.h * Math.PI) / 180), 0, -Math.sin((pt.h * Math.PI) / 180)];
      const cor = (pt, lat, dy) => { const r = rv(pt); return [pt.p[0] + r[0] * lat, pt.p[1] + dy, pt.p[2] + r[2] * lat]; };
      const Lf = f.width + tn.side, fFloor = -f.height - (tn.bottom ?? 600);
      // stone footing: the ramp's base edges run down into the floor
      if (map.engrained && !f.gap) {
        const fc = [0.42, 0.4, 0.37];
        for (const side of [-1, 1]) {
          const a0 = cor(e, side * e.width, -e.height), a1 = cor(f, side * f.width, -f.height);
          const b0 = cor(e, side * (e.width + 120), floorY + 2), b1 = cor(f, side * (f.width + 120), fFloor + 2);
          geo.quad(a0, a1, b1, b0, fc);
        }
      }
      // floor (you never ride down there: touching it is a fall)
      geo.quad(cor(e, -Lw, floorY), cor(f, -Lf, fFloor), cor(f, Lf, fFloor), cor(e, Lw, floorY), map.look?.floor || (tn.interior === 'crypt' ? [0.12, 0.11, 0.13] : [0.2, 0.16, 0.14]));
      if (tn.interior === 'hall') {
        // red carpet runner and banners, stained glass, chandeliers
        geo.quad(cor(e, -Lw * 0.25, floorY + 6), cor(f, -Lf * 0.25, fFloor + 6), cor(f, Lf * 0.25, fFloor + 6), cor(e, Lw * 0.25, floorY + 6), map.look?.carpet || [0.4, 0.04, 0.06]);
        for (let s = 300; s < len; s += 900) {
          for (const side of [-1, 1]) {
            const wl = side * (Lw - 20);
            geo.box(at2(s, wl, ceilY * 0.45), [40, 1000, 360], Math.atan2(F[0], F[2]), [[0.6, 0.08, 0.12], [0.15, 0.2, 0.6], [0.5, 0.4, 0.1]][Math.floor(rng() * 3)], 0.15);
            geo.box(at2(s + 450, side * (Lw - 8), ceilY * 0.75), [12, 700, 300], Math.atan2(F[0], F[2]), GLASS[Math.floor(rng() * GLASS.length)], 0.95);
            lights.dot(at2(s + 450, side * (Lw - 120), ceilY * 0.2), [1, 0.55, 0.15], 140, 7 + rng() * 4, rng());
            lights.dot(at2(s + 450, side * (Lw - 120), ceilY * 0.2), [1, 0.35, 0.05], 260, 0, 0);
          }
          if ((s / 900) % 2 < 1) {
            const cc = at2(s, 0, ceilY - 500);
            for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; lights.dot(add(cc, [Math.cos(a) * 260, 0, Math.sin(a) * 260]), [1, 0.75, 0.4], 90, 0, 0); }
            geo.line(at2(s, 0, ceilY), cc, [0.5, 0.4, 0.3]);
          }
        }
        // ceiling beams
        for (let s = 0; s < len; s += 700) geo.line(at2(s, -Lw, ceilY - 10), at2(s, Lw, ceilY - 10), [0.6, 0.35, 0.2]);
      } else {
        // shaft and crypt: torches and arched ribs
        for (let s = 200; s < len; s += 650) {
          for (const side of [-1, 1]) {
            lights.dot(at2(s, side * (Lw - 40), ceilY * 0.3), [1, 0.55, 0.15], 120, 7 + rng() * 4, rng());
            lights.dot(at2(s, side * (Lw - 40), ceilY * 0.3), [1, 0.35, 0.05], 220, 0, 0);
          }
          let prev = null;
          for (let k = 0; k <= 8; k++) {
            const a = (k / 8) * Math.PI;
            const p = at2(s, -Math.cos(a) * (Lw - 5), floorY + (ceilY - floorY) * (0.55 + 0.45 * Math.sin(a)));
            if (prev) geo.line(prev, p, tn.interior === 'crypt' ? [0.3, 0.9, 0.6] : [1.2, 0.6, 0.25]);
            prev = p;
          }
          if (tn.interior === 'crypt' && rng() < 0.5) {
            // candles and coffins along the floor
            geo.box(at2(s, (rng() < 0.5 ? -1 : 1) * Lw * 0.7, floorY + 120), [300, 240, 700], Math.atan2(F[0], F[2]), [0.25, 0.24, 0.27]);
            lights.dot(at2(s + 150, Lw * 0.6, floorY + 300), [1, 0.8, 0.4], 60, 9, rng());
          }
        }
      }
    }
    // the keep's outer shell: towers and walls around the whole interior
    const xs = line.map((e) => e.p[0]), zs = line.map((e) => e.p[2]), ys = line.map((e) => e.p[1]);
    const x0 = Math.min(...xs) - 3000, x1 = Math.max(...xs) + 3000, z0 = Math.min(...zs) - 3000, z1 = Math.max(...zs) + 3000;
    const yb = Math.min(...ys) - 3000, yt = Math.max(...ys) + 3000;
    for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) tower(geo, lights, [px, yb, pz], yt - yb + 2000, 1400, rng, { r: [1, 0, 0], f: [0, 0, 1] }, 1);
  } finally { RIDE_OFF = false; }
  const mat = propMaterial({ dir: [-0.3, 0.5, -0.8], color: [0.4, 0.4, 0.5], ambient: [0.28, 0.24, 0.24], lamp: 1.1, lampColor: [1.0, 0.7, 0.45] });
  finish(group, geo, mat);
  finishLights(group, lights);
  return group;
}
