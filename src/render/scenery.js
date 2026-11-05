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
  // Layout (lat > 0 is the rider's open side):
  //   ... ocean to the horizon | surf | wet sand | beach (under the course) | boardwalk | road | palms | low hills
  const group = new THREE.Group();
  const geo = new Geo();
  const lights = new Lights();
  const rng = rand(t.seed || 3);
  let fr = frames(map.line, 320);
  fr = extendFrames(fr, 9000, 16000, 320);
  for (const f of fr) f.r = [-f.r[0], 0, -f.r[2]];
  const seaY = t.seaY;
  const SHORE = 2600; // shoreline offset from the course centre line (open side)
  const W = (f) => f.e.width;
  const dune = (p) => (fbm3(p[0] / 1400, 0, p[2] / 1400, 3) - 0.5) * 70;
  const hill = (p) => fbm3(p[0] / 6000, 0, p[2] / 6000, 3);
  const prof = (f) => {
    const w = W(f);
    return [
      [-(w + 26000), seaY + 2400], [-(w + 16000), seaY + 1300], [-(w + 9000), seaY + 300],
      [-(w + 6200), seaY + 70], [-(w + 4300), seaY + 55], [-(w + 3000), seaY + 50],
      [0, seaY + 40], [SHORE * 0.6, seaY + 30], [SHORE, seaY + 4], [SHORE + 500, seaY - 60], [SHORE + 1400, seaY - 260],
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
    return seaY + 40;
  };

  // terrain: bright sunset sand, dunes, hills fading into the haze
  strip(geo, fr, (f) => prof(f).map(([l, y], j) => [l, y, 0, 1]), {
    displace: (p, j) => (j <= 2 ? (hill(p) - 0.3) * 2600 * (j === 0 ? 1 : j === 1 ? 0.6 : 0.25) : j <= 7 ? dune(p) : 0),
    color: (p, j) => {
      if (j <= 2) return mix([0.55, 0.25, 0.45], [0.75, 0.38, 0.5], hill(p));
      if (j >= 8) return [0.42, 0.28, 0.32];
      if (j === 3) return [0.32, 0.4, 0.22];
      const k = fbm3(p[0] / 900, 0, p[2] / 900, 2);
      return mix([0.95, 0.62, 0.52], [1.0, 0.74, 0.6], k);
    },
  });

  // road (behind the boardwalk) with traffic and street lamps
  const roadA = (f) => -(W(f) + 4900), roadB = (f) => -(W(f) + 4300);
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i], b = fr[i + 1];
    const ya = seaY + 62, yb = seaY + 62;
    geo.quad(at(a, roadA(a), ya), at(a, roadB(a), ya), at(b, roadB(b), yb), at(b, roadA(b), yb), [0.07, 0.05, 0.09]);
    if (i % 2 === 0) geo.line(at(a, (roadA(a) + roadB(a)) / 2, ya + 3), at(b, (roadA(b) + roadB(b)) / 2, yb + 3), [1.4, 1.0, 0.3]);
    if (i % 3 === 0) {
      const p = at(a, roadB(a) + 60, ya);
      geo.cyl(p, add(p, [0, 520, 0]), 9, 7, 5, [0.12, 0.08, 0.14]);
      lights.dot(add(p, [0, 540, 0]), [1.0, 0.65, 0.3], 70);
    }
  }
  for (let i = 0; i < fr.length - 12; i += 6) {
    const a = fr[i], b = fr[i + 12];
    const n = Math.round(2 * density);
    for (let k = 0; k < n; k++) {
      const sp = 0.05 + rng() * 0.05;
      lights.flow(at(a, roadB(a) - 160, seaY + 100), at(b, roadB(b) - 160, seaY + 100), [1, 0.95, 0.8], 60, sp, rng());
      lights.flow(at(b, roadA(b) + 160, seaY + 100), at(a, roadA(a) + 160, seaY + 100), [1, 0.15, 0.2], 55, sp, rng());
    }
  }

  // boardwalk along the top of the beach, lamps and neon beach shops
  for (let i = 0; i < fr.length - 1; i++) {
    const a = fr[i], b = fr[i + 1];
    const l0 = (f) => -(W(f) + 3000), l1 = (f) => -(W(f) + 3600);
    const y = seaY + 120;
    geo.quad(at(a, l0(a), y), at(a, l1(a), y), at(b, l1(b), y), at(b, l0(b), y), [0.42, 0.26, 0.2]);
    geo.line(at(a, l0(a), y + 4), at(b, l0(b), y + 4), [1.5, 0.55, 0.3]);
    if (i % 4 === 0) {
      const p = at(a, l0(a) + 40, y);
      geo.cyl(p, add(p, [0, 380, 0]), 8, 6, 5, [0.15, 0.08, 0.15]);
      geo.blob(add(p, [0, 400, 0]), 24, i % 8 ? NEON_PINK : NEON_CYAN, 1, rng);
    }
    if (i % 9 === 4 && rng() < 0.85 * density) beachShop(geo, at(a, l1(a) - 450, y), Math.atan2(a.r[0], a.r[2]), rng);
  }

  // palms: groves behind the road, rows along the boardwalk, a few on the sand
  const leafCols = [NEON_GREEN, NEON_CYAN, NEON_PINK];
  for (let i = 0; i < fr.length; i++) {
    const f = fr[i];
    const spots = [];
    if (i % 2 === 0) spots.push(-(W(f) + 3800 + rng() * 300));
    if (rng() < 0.9 * density) spots.push(-(W(f) + 5200 + rng() * 3500));
    if (rng() < 0.5 * density) spots.push(-(W(f) + 5200 + rng() * 3500));
    if (rng() < 0.18 * density) spots.push(-W(f) + rng() * (SHORE * 0.8));
    for (const lat of spots) {
      const base = at(f, lat, 0);
      base[1] = groundY(f, lat) + (lat > -(W(f) + 3000) ? dune(base) : 0) - 15;
      palm(geo, base, 650 + rng() * 800, rng, leafCols[Math.floor(rng() * leafCols.length)]);
    }
    // umbrellas, towels and surfboards on the sand
    if (rng() < 0.45 * density) {
      const lat = -W(f) * 0.5 + rng() * SHORE * 0.75;
      const base = at(f, lat, 0); base[1] = groundY(f, lat) + dune(base);
      umbrella(geo, base, rng);
    }
    if (rng() < 0.15 * density) {
      const lat = SHORE * (0.3 + rng() * 0.4);
      const base = at(f, lat, 0); base[1] = groundY(f, lat) + dune(base);
      surfboard(geo, base, rng);
    }
  }

  // lifeguard towers near the water
  for (const k of [0.2, 0.5, 0.8]) {
    const f = fr[Math.floor(fr.length * k)];
    lifeguardTower(geo, at(f, SHORE * 0.55, groundY(f, SHORE * 0.55)), Math.atan2(f.r[0], f.r[2]), rng);
  }
  // parked vintage cars along the road
  for (const k of [0.15, 0.42, 0.7, 0.9]) {
    const f = fr[Math.floor(fr.length * k)];
    vintageCar(geo, at(f, roadB(f) + 240, seaY + 62), Math.atan2(f.f[0], f.f[2]));
  }

  // the pier: from the sand far out into the ocean, lamps and a neon arch
  const pf = fr[Math.floor(fr.length * 0.62)];
  const pierY = seaY + 170;
  const p0 = SHORE * 0.4, p1 = SHORE + 7500;
  const nP = 34;
  for (let k = 0; k < nP; k++) {
    const l0 = p0 + ((p1 - p0) * k) / nP, l1 = p0 + ((p1 - p0) * (k + 1)) / nP;
    geo.quad(at(pf, l0, pierY), at(pf, l1, pierY), add(at(pf, l1, pierY), scale(pf.f, 420)), add(at(pf, l0, pierY), scale(pf.f, 420)), [0.4, 0.24, 0.18]);
    if (k % 2 === 0) for (const side of [0, 420]) {
      const q = add(at(pf, l0, pierY), scale(pf.f, side));
      geo.cyl(add(q, [0, -500, 0]), q, 20, 20, 5, [0.2, 0.1, 0.12]);
      if (k % 4 === 0) {
        geo.cyl(q, add(q, [0, 380, 0]), 9, 7, 5, [0.15, 0.08, 0.15]);
        lights.dot(add(q, [0, 400, 0]), k % 8 ? [1, 0.3, 0.8] : [0.2, 0.95, 1], 90);
      }
    }
  }
  geo.line(at(pf, p0, pierY + 5), at(pf, p1, pierY + 5), [1.8, 0.5, 1.4]);
  geo.line(add(at(pf, p0, pierY + 5), scale(pf.f, 420)), add(at(pf, p1, pierY + 5), scale(pf.f, 420)), [1.8, 0.5, 1.4]);
  const archC = add(at(pf, p1 - 150, pierY), scale(pf.f, 210));
  for (let k = 0; k < 18; k++) {
    const a0 = (k / 18) * Math.PI, a1 = ((k + 1) / 18) * Math.PI;
    geo.line(add(archC, add(scale(pf.f, Math.cos(a0) * 320), [0, Math.sin(a0) * 480, 0])), add(archC, add(scale(pf.f, Math.cos(a1) * 320), [0, Math.sin(a1) * 480, 0])), [2.2, 0.4, 1.6]);
  }

  // sailboats with mast lights out at sea
  for (let i = 0; i < Math.round(12 * density); i++) {
    const f = fr[Math.floor(rng() * fr.length)];
    const base = at(f, SHORE + 5000 + rng() * 30000, seaY + 10);
    sailboat(geo, base, rng);
    lights.dot(add(base, [0, 1150, 0]), [1, 0.9, 0.7], 120, 0, 0);
  }

  // the neon hotel you drop in from
  const sp = map.spawn.pos, f0 = fr.find((f) => !f.ext) || fr[0];
  const topY = sp[1] - 90;
  const hw = 900;
  // set back so the platform overhangs the front like a diving board
  const hc = [sp[0] - f0.f[0] * (hw - 60), 0, sp[2] - f0.f[2] * (hw - 60)];
  geo.box([hc[0], (seaY + topY) / 2, hc[2]], [hw * 2, topY - seaY, hw * 2], Math.atan2(f0.f[0], f0.f[2]), [0.12, 0.06, 0.16]);
  for (let y = seaY + 400; y < topY; y += 420) {
    const yaw = Math.atan2(f0.f[0], f0.f[2]);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const corner = (x, z) => [hc[0] + x * cs + z * sn, y, hc[2] - x * sn + z * cs];
    const c = (y / 420) % 2 < 1 ? [1.6, 0.4, 1.3] : [0.4, 1.4, 1.7];
    const pts = [corner(-hw - 5, -hw - 5), corner(hw + 5, -hw - 5), corner(hw + 5, hw + 5), corner(-hw - 5, hw + 5)];
    for (let k = 0; k < 4; k++) geo.line(pts[k], pts[(k + 1) % 4], c);
    for (let k = 0; k < 6; k++) lights.dot(mix(pts[0], pts[1], (k + 0.5) / 6), [1, 0.85, 0.6], 50, 0, 0);
  }
  group.add(textSign('HOTEL', [hc[0] - f0.f[0] * (hw + 20), topY - 500, hc[2] - f0.f[2] * (hw + 20)], { p: [hc[0] - f0.f[0] * 9000, 0, hc[2] - f0.f[2] * 9000] }, 1500, 330, '#ff3ad8', '#ffe14d'));

  // rolling surf along the shore
  group.add(surfZone(fr, SHORE, seaY));

  const mat = propMaterial({ dir: [0, 0.35, -1], color: [0.75, 0.42, 0.42], ambient: [0.42, 0.26, 0.4] });
  finish(group, geo, mat);
  finishLights(group, lights);
  (group.userData.mats ??= []).push(group.children.find((c) => c.userData.surf)?.material);
  group.userData.mats = group.userData.mats.filter(Boolean);

  // signs: neon title by the start, retro billboards along the road
  const s0 = fr[Math.min(fr.length - 1, 30)];
  group.add(textSign('VAPOR COAST', at(s0, -(W(s0) + 3300), seaY + 1300), s0, 3600, 720, '#ff3ad8', '#00f0ff'));
  for (const k of [0.35, 0.75]) {
    const sb = fr[Math.floor(fr.length * k)];
    group.add(billboard(at(sb, -(W(sb) + 5600), seaY + 1800), sb, 2600, 1300));
  }
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
    const A0 = at(a, shore - 250, seaY + 6), A1 = at(a, shore + D, seaY + 6), B0 = at(b, shore - 250, seaY + 6), B1 = at(b, shore + D, seaY + 6);
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

function beachShop(geo, base, yaw, rng) {
  const cols = [NEON_PINK, NEON_CYAN, NEON_YEL, NEON_GREEN];
  const c = cols[Math.floor(rng() * cols.length)];
  geo.box(add(base, [0, 220, 0]), [700, 440, 450], yaw, [0.35, 0.2, 0.32]);
  geo.box(add(base, [0, 470, 0]), [800, 40, 560], yaw, [0.2, 0.1, 0.18]);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const L = (x, y, z) => add(base, [x * cs + z * sn, y, -x * sn + z * cs]);
  geo.line(L(-400, 445, 280), L(400, 445, 280), scale(c, 1.8));
  geo.line(L(-400, 445, -280), L(400, 445, -280), scale(c, 1.8));
  geo.box(L(0, 300, 228), [500, 160, 6], yaw, scale(c, 0.6), 0.9);
}

function umbrella(geo, base, rng) {
  const cols = [NEON_PINK, NEON_CYAN, NEON_YEL, [1, 0.5, 0.2]];
  const c = cols[Math.floor(rng() * cols.length)];
  const top = add(base, [0, 260, 0]);
  geo.cyl(base, top, 6, 6, 4, [0.9, 0.9, 0.9]);
  const n = 8, r = 190;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    geo.tri(add(top, [0, 40, 0]), add(top, [Math.cos(a0) * r, -50, Math.sin(a0) * r]), add(top, [Math.cos(a1) * r, -50, Math.sin(a1) * r]), k % 2 ? c : [1, 0.95, 0.95], k % 2 ? c : [1, 0.95, 0.95], k % 2 ? c : [1, 0.95, 0.95], 0.25);
  }
  const ta = rng() * Math.PI;
  geo.box(add(base, [Math.cos(ta) * 200, 3, Math.sin(ta) * 200]), [140, 4, 280], ta, cols[Math.floor(rng() * cols.length)], 0.15);
}

function surfboard(geo, base, rng) {
  const cols = [NEON_PINK, NEON_CYAN, NEON_YEL];
  const c = cols[Math.floor(rng() * cols.length)];
  const yaw = rng() * Math.PI;
  geo.box(add(base, [0, 130, 0]), [70, 260, 12], yaw, [0.95, 0.9, 0.9]);
  geo.box(add(base, [0, 130, 0]), [20, 250, 14], yaw, c, 0.8);
}

function sailboat(geo, base, rng) {
  const yaw = rng() * Math.PI * 2;
  geo.box(add(base, [0, 40, 0]), [160, 80, 520], yaw, [0.3, 0.2, 0.3]);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const L = (x, y, z) => add(base, [x * cs + z * sn, y, -x * sn + z * cs]);
  geo.cyl(L(0, 80, 0), L(0, 1150, 0), 8, 6, 4, [0.8, 0.8, 0.8]);
  geo.tri(L(0, 1100, 0), L(0, 150, 0), L(0, 150, 260), [0.95, 0.85, 0.9], [0.95, 0.85, 0.9], [0.95, 0.85, 0.9], 0.2);
  geo.tri(L(0, 950, 0), L(0, 150, 0), L(0, 150, -220), [0.9, 0.6, 0.8], [0.9, 0.6, 0.8], [0.9, 0.6, 0.8], 0.2);
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
