// Turns collision brushes into neon meshes: shaded faces + glowing edges.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SUN_DIR, FOG_COLOR, FOG_NEAR, FOG_FAR } from './renderer.js';

const KIND = { surf: 0, floor: 1, wall: 2, building: 3, stone: 4 };

let sharedFaceMat = null;
const lineMats = new Set();

export function faceMaterial() {
  if (sharedFaceMat) return sharedFaceMat;
  sharedFaceMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: SUN_DIR },
      uFogColor: { value: FOG_COLOR },
      uFogNear: FOG_NEAR,
      uFogFar: FOG_FAR,
    },
    vertexShader: FACE_VS,
    fragmentShader: FACE_FS,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  return sharedFaceMat;
}

export function setLineResolution(res, ratio) {
  for (const m of lineMats) { m.resolution.copy(res); m.linewidth = 2.2 * Math.max(1, ratio * 0.9); }
}

/**
 * Build a group of meshes for a list of Brush objects.
 * @param {import('../physics/brush.js').Brush[]} brushes
 */
export function buildBrushMesh(brushes) {
  const pos = [], nrm = [], col = [], kind = [];
  const linePos = [], lineCol = [];
  for (const br of brushes) {
    if (br.meta.hidden) continue; // invisible collision shell (themed maps draw their own rock)
    const c = br.meta.color || [1, 0.2, 0.8];
    const k = KIND[br.meta.kind] ?? 0;
    const edgeScale = br.meta.edge ?? 1;
    for (const f of br.faces) {
      const poly = f.poly;
      const isSurf = f.n.y > 0.05 && f.n.y < 0.7;
      const fk = f.n.y >= 0.7 ? 1 : isSurf ? 0 : 2; // 2 = wall/underside
      for (let i = 1; i < poly.length - 1; i++) {
        for (const p of [poly[0], poly[i], poly[i + 1]]) {
          pos.push(p.x, p.y, p.z);
          nrm.push(f.n.x, f.n.y, f.n.z);
          col.push(c[0], c[1], c[2]);
          kind.push(k === 4 ? 4 : k === 3 ? (f.n.y > 0.7 ? 1 : 3) : k === 2 ? 2 : k === 1 && fk === 0 ? 0 : fk);
        }
      }
    }
    // glowing edges: skip edges between near-coplanar faces of the same brush
    for (const [a, b, f] of br.edges()) {
      // underside edges are dimmer
      const low = Math.min(a.y, b.y) < (br.max.y + br.min.y) / 2 && Math.abs(a.y - b.y) < 1 ? 0.35 : 1;
      linePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      let e = 2.4 * low * edgeScale;
      // ramp segments: keep the long ridge/base lines bright, dim the
      // cross-section lines between segments (they pile up into glare)
      const d = br.meta.dir;
      if (d) {
        const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
        const el = Math.hypot(ex, ey, ez) || 1;
        if (Math.abs((ex * d[0] + ey * d[1] + ez * d[2]) / el) < 0.5) e *= 0.28;
      }
      lineCol.push(c[0] * e, c[1] * e, c[2] * e, c[0] * e, c[1] * e, c[2] * e);
    }
  }
  const group = new THREE.Group();
  if (pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, faceMaterial()));
  }
  if (linePos.length) {
    const lg = new LineSegmentsGeometry();
    lg.setPositions(linePos);
    lg.setColors(lineCol);
    const lm = new LineMaterial({ vertexColors: true, linewidth: 2.2, worldUnits: false, fog: true, transparent: false });
    lineMats.add(lm);
    lm.addEventListener('dispose', () => lineMats.delete(lm));
    const ls = new LineSegments2(lg, lm);
    ls.computeLineDistances();
    group.add(ls);
  }
  return group;
}

/** Glowing line segments (flat arrays of positions and colours). */
export function neonLines(pos, col, width = 2.2) {
  const g = new LineSegmentsGeometry();
  g.setPositions(pos);
  g.setColors(col);
  const m = new LineMaterial({ vertexColors: true, linewidth: width, worldUnits: false, fog: true });
  lineMats.add(m);
  m.addEventListener('dispose', () => lineMats.delete(m));
  const ls = new LineSegments2(g, m);
  ls.frustumCulled = false;
  return ls;
}

/** Glowing ribs (tunnel frames) from map.ribs. */
export function buildRibs(ribs) {
  const pos = [], col = [];
  for (const r of ribs) {
    for (let i = 0; i < r.segs.length; i += 6) {
      pos.push(...r.segs.slice(i, i + 6));
      const c = r.color;
      col.push(c[0] * 1.9, c[1] * 1.9, c[2] * 1.9, c[0] * 1.9, c[1] * 1.9, c[2] * 1.9);
    }
  }
  const g = new LineSegmentsGeometry();
  g.setPositions(pos);
  g.setColors(col);
  const m = new LineMaterial({ vertexColors: true, linewidth: 2.2, worldUnits: false, fog: true });
  lineMats.add(m);
  m.addEventListener('dispose', () => lineMats.delete(m));
  return new LineSegments2(g, m);
}

/** Floating checkpoint marker: a slim spinning diamond over the respawn point. */
export function buildCheckpointMarker(cp) {
  const g = new THREE.Group();
  g.position.set(cp.pos[0], cp.pos[1] + 160, cp.pos[2]);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 1.2), wireframe: true, fog: true });
  const d = new THREE.Mesh(new THREE.OctahedronGeometry(45, 0), mat);
  d.scale.set(1, 1.8, 1);
  g.add(d);
  g.userData.update = (t) => { d.rotation.y = t * 1.5; d.position.y = Math.sin(t * 2) * 12; };
  return g;
}

/** Decorations that don't collide: crystals, etc. */
export function buildDecor(decor) {
  const g = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(1, 0);
  const byColor = new Map();
  for (const d of decor) {
    const key = d.color.join(',');
    if (!byColor.has(key)) byColor.set(key, []);
    byColor.get(key).push(d);
  }
  for (const [key, list] of byColor) {
    const col = new THREE.Color(...key.split(',').map(Number));
    const solid = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.35), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }), list.length);
    const wire = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.8), wireframe: true, fog: true }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((d, i) => {
      e.set(d.rot[0], d.rot[1], d.rot[2]);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(...d.pos), q, new THREE.Vector3(d.scale[0], d.scale[1], d.scale[2]));
      solid.setMatrixAt(i, m);
      wire.setMatrixAt(i, m);
    });
    g.add(solid, wire);
  }
  return g;
}

/** Glowing portal ring for the finish gate. */
export function buildGate(trigger, end = false) {
  const g = new THREE.Group();
  const c = trigger.center;
  g.position.set(c[0], c[1], c[2]);
  g.rotation.y = ((trigger.heading || 0) * Math.PI) / 180;
  const color = end ? new THREE.Color(1.0, 0.85, 0.2) : new THREE.Color(0.1, 1.0, 0.65);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(trigger.radius || 700, 26, 12, 96),
    new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3), fog: false }),
  );
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry((trigger.radius || 700) * 0.88, 8, 8, 96),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.2, 0.8).multiplyScalar(2.5), fog: false }),
  );
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry((trigger.radius || 700) * 0.98, 64),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: color } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main(){ vec2 c = vUv-0.5; float r = length(c)*2.0; float a = atan(c.y,c.x);
          float s = 0.5+0.5*sin(a*6.0 + r*14.0 - uTime*4.0);
          float alpha = (0.12 + 0.25*s*r) * smoothstep(1.0,0.85,r);
          gl_FragColor = vec4(uColor*(0.6+s), alpha); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    }),
  );
  g.add(ring, ring2, disc);
  g.userData.update = (t) => {
    ring2.rotation.z = t * 0.6;
    disc.material.uniforms.uTime.value = t;
    const s = 1 + Math.sin(t * 3) * 0.02;
    ring.scale.set(s, s, s);
  };
  return g;
}

/** Translucent start-zone box. */
export function buildZoneBox(t, color = [0.2, 1, 0.55]) {
  const min = new THREE.Vector3(...t.min), max = new THREE.Vector3(...t.max);
  const size = max.clone().sub(min), center = min.clone().add(max).multiplyScalar(0.5);
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(...color) }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec3 vP;
      void main(){ float h = vP.y / ${size.y.toFixed(1)} + 0.5; float a = (1.0-h)*0.06 * (0.8+0.2*sin(uTime*3.0 + h*10.0));
        gl_FragColor = vec4(uColor*1.5, a); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
  }));
  g.add(box);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(...color).multiplyScalar(1.2) }));
  g.add(edges);
  g.position.copy(center);
  g.userData.update = (t2) => { box.material.uniforms.uTime.value = t2; };
  return g;
}

// ---------------------------------------------------------------------------

const FACE_VS = /* glsl */`
attribute vec3 color;
attribute float aKind;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vKind;
varying float vDepth;
void main() {
  vColor = color;
  vNormal = normal;
  vKind = aKind;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FACE_FS = /* glsl */`
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vKind;
varying float vDepth;

float grid(vec2 p, float w) {
  vec2 g = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), 1e-4);
  return 1.0 - min(min(g.x, g.y) / w, 1.0);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndl = max(dot(N, uSun), 0.0);
  float hemi = N.y * 0.5 + 0.5;
  float fres = pow(1.0 - abs(dot(N, V)), 3.0);

  // triplanar-ish grid on the two axes most perpendicular to the normal
  vec3 an = abs(N);
  vec2 uv = an.x > an.z ? vWorld.zy : vWorld.xy;
  if (an.y > 0.7) uv = vWorld.xz;
  float g = grid(uv / 128.0, 1.0);
  float g2 = grid(uv / 512.0, 1.3);
  // distance fade for the fine grid to avoid shimmering
  float gf = 1.0 - smoothstep(2500.0, 9000.0, vDepth);

  vec3 c;
  if (vKind < 0.5) {
    // surfable slope: deep tint with a soft gradient + grid + energy pulse
    vec3 base = mix(vColor * 0.03, vColor * 0.13, hemi);
    base *= 0.45 + 0.8 * ndl;
    float pulse = smoothstep(0.94, 1.0, sin(vWorld.y * 0.012 + uTime * 3.0));
    c = base + vColor * (g * 0.16 * gf + g2 * 0.3 + pulse * 0.14) + vColor * fres * 0.05;
    // sunset reflection
    c += vec3(1.0, 0.35, 0.3) * pow(max(dot(reflect(-V, N), uSun), 0.0), 32.0) * 0.35;
  } else if (vKind < 1.5) {
    // platforms: dark glass with bright grid
    vec3 base = vec3(0.02, 0.015, 0.06) + vColor * 0.04;
    c = base + vColor * (g * 0.5 * gf + g2 * 0.6);
  } else if (vKind > 3.5) {
    // stone ramps built into a structure: lit masonry blocks
    vec2 bp = uv / vec2(260.0, 130.0);
    bp.x += floor(bp.y) * 0.5;
    vec2 bf = fract(bp);
    float mortar = 1.0 - step(0.06, bf.x) * step(0.08, bf.y);
    float var = fract(sin(dot(floor(bp), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 st = vColor * (0.75 + 0.35 * var) * (0.35 + 0.75 * ndl) * (0.6 + 0.5 * hemi);
    c = mix(st, st * 0.35, mortar * gf) + vColor * fres * 0.08;
  } else if (vKind > 2.5) {
    // buildings: dark facades with a grid of lit windows
    vec2 cell = floor(uv / vec2(90.0, 120.0));
    vec2 f = fract(uv / vec2(90.0, 120.0));
    float win = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.75);
    float on = step(0.55, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
    float flick = 0.85 + 0.15 * sin(uTime * 3.0 + cell.x * 7.0 + cell.y);
    c = vec3(0.012, 0.008, 0.03) + vColor * win * on * 0.75 * flick * (1.0 - smoothstep(6000.0, 30000.0, vDepth) * 0.6);
  } else {
    // walls/undersides
    c = vColor * 0.03 + vec3(0.01, 0.0, 0.03) + vColor * fres * 0.15;
  }
  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  c = mix(c, uFogColor, fog);
  gl_FragColor = vec4(c, 1.0);
}`;
