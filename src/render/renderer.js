// Rendering: renderer + post-processing + synthwave environment.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const SUN_DIR = new THREE.Vector3(0, 0.07, -1).normalize();
export const FOG_COLOR = new THREE.Color(0.32, 0.05, 0.3);
export const FOG_NEAR = { value: 9000 };
export const FOG_FAR = { value: 60000 };
const DEFAULT_ENV = { sky: true, mountains: true, floor: true, floorMode: 'grid', fogColor: [0.32, 0.05, 0.3], fogNear: 9000, fogFar: 60000, gridColor: null };

const QUALITY = {
  low: { ratio: 0.85, bloom: false, bloomScale: 0, particles: 300 },
  medium: { ratio: 1.0, bloom: true, bloomScale: 0.5, particles: 600 },
  high: { ratio: 1.5, bloom: true, bloomScale: 1.0, particles: 900 },
  ultra: { ratio: 2.0, bloom: true, bloomScale: 1.0, particles: 1400 },
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    // The neon palette is authored as display values: no tone mapping or
    // sRGB encode, so the bloom and no-bloom paths look identical.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG_COLOR, 9000, 60000);
    this.camera = new THREE.PerspectiveCamera(74, 1, 4, 400000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.time = 0;
    this.speed = 0;
    this.quality = 'high';
    this.renderScale = 1;

    this._buildEnvironment();
    this._buildPost();

    this.world = null;
    this.vel = new THREE.Vector3();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q, renderScale = 1, particlesOn = true) {
    this.quality = QUALITY[q] ? q : 'high';
    this.renderScale = renderScale;
    const Q = QUALITY[this.quality];
    this.particles.visible = particlesOn;
    this.streaks.visible = particlesOn;
    this.particles.geometry.setDrawRange(0, Q.particles);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const Q = QUALITY[this.quality];
    const ratio = Math.min(window.devicePixelRatio || 1, Q.ratio) * this.renderScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    const bs = Q.bloomScale || 0.5;
    this.bloom.resolution.set(w * ratio * bs, h * ratio * bs);
    this.bloom.setSize(Math.max(1, Math.floor(w * ratio * bs)), Math.max(1, Math.floor(h * ratio * bs)));
    this.pixelRatio = ratio;
    this.lineResolution.set(w * ratio, h * ratio);
  }

  /** horizontal FOV at 4:3 like CS -> vertical FOV */
  setFov(hfov43) {
    const v = 2 * Math.atan(Math.tan((hfov43 * Math.PI) / 360) * 0.75);
    this.baseFov = (v * 180) / Math.PI;
  }

  setWorld(group) {
    if (this.world) {
      this.scene.remove(this.world);
      disposeTree(this.world);
    }
    this.world = group;
    if (group) this.scene.add(group);
  }

  /** Per-map look: open sky, or an enclosed space with close fog. */
  setEnv(env = {}) {
    const e = { ...DEFAULT_ENV, ...env };
    FOG_COLOR.setRGB(...e.fogColor);
    FOG_NEAR.value = e.fogNear;
    FOG_FAR.value = e.fogFar;
    this.scene.fog.color.copy(FOG_COLOR);
    this.scene.fog.near = e.fogNear;
    this.scene.fog.far = e.fogFar;
    this.sky.visible = !!e.sky;
    this.sky.material.uniforms.uMode.value = e.sky === 'space' ? 1 : e.sky === 'desert' ? 2 : 0;
    this.floor.visible = e.floor;
    this.floor.material.uniforms.uSea.value = e.floorMode === 'sea' ? 1 : e.floorMode === 'city' ? 2 : 0;
    this.mountains.visible = e.mountains;
    this.scene.background = e.sky ? null : FOG_COLOR.clone();
    const fu = this.floor.material.uniforms;
    fu.uGridColor.value.set(...(e.gridColor || [0, 0, 0]));
    fu.uGridFixed.value = e.gridColor ? 1 : 0;
    fu.uFadeFar.value = e.sky === true ? 140000 : e.fogFar * 1.2;
  }

  setFloorY(y) { this.floor.position.y = y; this.mountains.position.y = y; }

  _buildPost() {
    this.lineResolution = new THREE.Vector2(1, 1);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.15, 1.05);
    this.composer.addPass(this.bloom);
    this.finalPass = new ShaderPass(FinalShader);
    this.composer.addPass(this.finalPass);
  }

  _buildEnvironment() {
    // --- sky dome ---
    const skyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR }, uMode: { value: 0 } },
      vertexShader: SKY_VS, fragmentShader: SKY_FS,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300000, 48, 24), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // --- neon grid floor ---
    const floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uFog: { value: FOG_COLOR }, uCam: { value: new THREE.Vector3() },
        uGridColor: { value: new THREE.Color() }, uGridFixed: { value: 0 }, uFadeFar: { value: 140000 }, uSea: { value: 0 }, uSunDir: { value: SUN_DIR },
      },
      vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, fog: false,
      transparent: false,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.scale.set(600000, 600000, 1);
    this.floor.position.y = -15000;
    this.floor.frustumCulled = false;
    this.scene.add(this.floor);

    // --- wireframe mountain ring ---
    this.mountains = buildMountains();
    this.scene.add(this.mountains);

    // --- floating speed particles ---
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const palette = [[0, 0.95, 1], [1, 0.2, 0.8], [1, 0.9, 0.3], [0.6, 0.3, 1]];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random();
      const c = palette[i % palette.length];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pm = new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uBox: { value: 5000 }, uPx: { value: 1 }, uSpeed: { value: 0 } },
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.particles = new THREE.Points(pg, pm);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    // --- speed streaks: lines stretched along your velocity ---
    const S = 700;
    const sp = new Float32Array(S * 2 * 3), se = new Float32Array(S * 2), sc = new Float32Array(S * 2 * 3);
    for (let i = 0; i < S; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      const c = palette[i % palette.length];
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        sp[j * 3] = x; sp[j * 3 + 1] = y; sp[j * 3 + 2] = z;
        se[j] = k;
        sc[j * 3] = c[0]; sc[j * 3 + 1] = c[1]; sc[j * 3 + 2] = c[2];
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aEnd', new THREE.BufferAttribute(se, 1));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.streaks = new THREE.LineSegments(sg, new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3() }, uBox: { value: 3600 }, uAmt: { value: 0 } },
      vertexShader: STREAK_VS, fragmentShader: STREAK_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.streaks.frustumCulled = false;
    this.scene.add(this.streaks);
  }

  render(dt) {
    this.time += dt;
    const cam = this.camera;
    this.sky.position.copy(cam.position);
    this.sky.material.uniforms.uTime.value = this.time;
    this.floor.material.uniforms.uTime.value = this.time;
    this.floor.material.uniforms.uCam.value.copy(cam.position);
    this.floor.position.x = cam.position.x; this.floor.position.z = cam.position.z;
    this.mountains.position.x = cam.position.x; this.mountains.position.z = cam.position.z;
    const pu = this.particles.material.uniforms;
    pu.uCam.value.copy(cam.position);
    pu.uPx.value = this.pixelRatio * (window.innerHeight / 900);
    pu.uSpeed.value = this.speed;
    const su = this.streaks.material.uniforms;
    su.uCam.value.copy(cam.position);
    su.uVel.value.copy(this.vel);
    su.uAmt.value = Math.min(1, Math.max(0, (this.speed - 900) / 1800));
    this.finalPass.uniforms.uSpeed.value = Math.min(1, Math.max(0, (this.speed - 900) / 2200));
    this.finalPass.uniforms.uTime.value = this.time;
    if (this.world && this.world.userData.update) this.world.userData.update(this.time, cam);

    if (QUALITY[this.quality].bloom) this.composer.render(dt);
    else this.renderer.render(this.scene, cam);
  }
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

function buildMountains() {
  const group = new THREE.Group();
  const segs = 160, rows = 6;
  const R0 = 140000, R1 = 190000;
  const verts = [];
  const hAt = (i, j) => {
    const a = (i / segs) * Math.PI * 2;
    const n = Math.sin(a * 7) * 0.5 + Math.sin(a * 13 + 1.3) * 0.3 + Math.sin(a * 29 + 0.7) * 0.2;
    const ridge = Math.max(0, n * 0.5 + 0.5);
    const rowF = Math.sin((j / rows) * Math.PI);
    return (6000 + ridge * 26000 * (0.6 + 0.4 * Math.sin(a * 3 + 2))) * rowF * (0.7 + 0.3 * Math.abs(Math.sin(i * 12.9898 + j * 78.233)));
  };
  const P = [];
  for (let j = 0; j <= rows; j++) {
    const r = R0 + (R1 - R0) * (j / rows);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      P.push([Math.cos(a) * r, j === 0 || j === rows ? 0 : hAt(i % segs, j), Math.sin(a) * r]);
    }
  }
  const idx = (i, j) => j * (segs + 1) + i;
  const tri = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < segs; i++) {
    tri.push(idx(i, j), idx(i + 1, j), idx(i, j + 1), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1));
  }
  const g = new THREE.BufferGeometry();
  P.forEach((p) => verts.push(...p));
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(tri);
  const solid = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x07010f, fog: false }));
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.ShaderMaterial({
    vertexShader: `varying float vH; void main(){ vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: `varying float vH; void main(){ float t = clamp(vH/26000.0,0.0,1.0); vec3 c = mix(vec3(0.55,0.1,0.9), vec3(1.0,0.25,0.75), t); gl_FragColor = vec4(c*(0.55+0.9*t),1.0);} `,
    fog: false,
  }));
  solid.frustumCulled = wire.frustumCulled = false;
  group.add(solid, wire);
  return group;
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}`;

const SKY_FS = /* glsl */`
uniform float uTime;
uniform vec3 uSun;
uniform float uMode;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.012, 0.004, 0.05);
  vec3 mid = vec3(0.16, 0.02, 0.28);
  vec3 horizon = vec3(0.95, 0.22, 0.45);
  vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
  col = mix(col, zenith, smoothstep(0.18, 0.75, h));
  // warmer toward the sun
  float sunAmt = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.45, 0.15) * pow(sunAmt, 8.0) * 0.45 * (1.0 - smoothstep(0.0, 0.4, h));
  if (h < 0.0) col = mix(horizon * 0.5, vec3(0.03, 0.0, 0.06), smoothstep(0.0, -0.25, h));

  // the striped synthwave sun
  vec3 toSun = d - uSun * dot(d, uSun);
  float ang = acos(clamp(dot(d, uSun), -1.0, 1.0));
  float R = 0.16;
  if (ang < R) {
    float y = (d.y - uSun.y) / R; // -1 bottom .. 1 top
    vec3 sc = mix(vec3(1.0, 0.12, 0.55), vec3(1.0, 0.85, 0.25), smoothstep(-0.8, 0.8, y));
    float stripes = 1.0;
    if (y < 0.15) {
      float k = (0.15 - y);
      float band = fract(k * 7.0 - uTime * 0.15);
      stripes = step(k * 0.55, band);
    }
    float edge = smoothstep(R, R - 0.004, ang);
    col = mix(col, sc * 1.0, edge * stripes);
  }
  // glow halo
  col += vec3(1.0, 0.3, 0.55) * pow(max(dot(d, uSun), 0.0), 60.0) * 0.35;

  // stars
  if (h > 0.03) {
    vec2 uv = vec2(atan(d.z, d.x) * 180.0, h * 260.0);
    vec2 cell = floor(uv);
    float r = hash(cell);
    if (r > 0.985) {
      vec2 f = fract(uv) - 0.5;
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r * 4.0) + r * 50.0);
      float s = smoothstep(0.22, 0.0, length(f)) * tw * smoothstep(0.03, 0.3, h);
      col += vec3(0.8, 0.85, 1.0) * s * 1.6;
    }
  }
  if (uMode > 1.5) {
    // desert night: deep blue, a huge moon and a sky full of stars
    col = mix(vec3(0.12, 0.06, 0.2), vec3(0.01, 0.02, 0.07), smoothstep(-0.02, 0.5, h));
    if (h < 0.0) col = vec3(0.05, 0.03, 0.08);
    vec2 uv3 = vec2(atan(d.z, d.x) * 260.0, h * 340.0);
    float r3 = hash(floor(uv3));
    if (h > 0.02 && r3 > 0.965) {
      float tw = 0.55 + 0.45 * sin(uTime * (1.5 + r3 * 3.0) + r3 * 70.0);
      col += vec3(0.85, 0.9, 1.0) * smoothstep(0.3, 0.0, length(fract(uv3) - 0.5)) * tw * 1.5 * smoothstep(0.02, 0.2, h);
    }
    float band = exp(-pow(dot(d, normalize(vec3(0.6, 0.3, 0.75))) * 5.0, 2.0));
    col += vec3(0.25, 0.18, 0.4) * band * 0.35 * smoothstep(0.0, 0.3, h);
    vec3 mc = normalize(vec3(-0.35, 0.32, -0.88));
    float ma = acos(clamp(dot(d, mc), -1.0, 1.0));
    float MR = 0.11;
    col += vec3(0.6, 0.65, 0.9) * pow(max(dot(d, mc), 0.0), 120.0) * 0.6;
    if (ma < MR) {
      vec3 q = (d - mc) / MR;
      float crater = smoothstep(0.55, 0.75, fract(sin(dot(floor(q.xy * 6.0), vec2(12.9, 78.2))) * 43758.5));
      col = mix(vec3(0.95, 0.93, 0.85), vec3(0.7, 0.7, 0.75), crater * 0.6) * smoothstep(MR, MR - 0.003, ma);
    }
  } else if (uMode > 0.5) {
    // deep space: black, dense stars, nebula and a ringed planet
    col = vec3(0.004, 0.003, 0.012);
    vec2 uv2 = vec2(atan(d.z, d.x) * 220.0, asin(clamp(d.y, -1.0, 1.0)) * 220.0);
    float r2 = hash(floor(uv2));
    if (r2 > 0.975) {
      float s2 = smoothstep(0.3, 0.0, length(fract(uv2) - 0.5)) * (0.5 + 0.5 * sin(uTime * 2.0 + r2 * 40.0));
      col += mix(vec3(0.6, 0.7, 1.0), vec3(1.0, 0.8, 0.9), r2) * s2 * 1.4;
    }
    float neb = sin(d.x * 3.0 + d.y * 5.0) * sin(d.z * 4.0 - d.y * 2.0);
    col += vec3(0.25, 0.04, 0.35) * smoothstep(0.2, 1.0, neb) * 0.5 + vec3(0.0, 0.1, 0.2) * smoothstep(0.3, 1.0, -neb) * 0.4;
    vec3 pc = normalize(vec3(0.5, 0.25, -0.8));
    float pa = acos(clamp(dot(d, pc), -1.0, 1.0));
    float PR = 0.22;
    if (pa < PR) {
      float lit = clamp(dot(normalize(d - pc * 0.9), normalize(vec3(-1.0, 0.6, 0.2))) * 0.5 + 0.5, 0.0, 1.0);
      float bands = 0.5 + 0.5 * sin((d.y - pc.y) * 90.0);
      col = mix(vec3(0.05, 0.02, 0.12), mix(vec3(0.5, 0.15, 0.6), vec3(1.0, 0.45, 0.6), bands), lit) * smoothstep(PR, PR - 0.004, pa);
    }
    // ring
    vec3 rn = normalize(vec3(0.15, 1.0, 0.2));
    vec3 toP = d - pc;
    float ry = dot(toP, rn);
    float rr = length(toP - rn * ry);
    if (abs(ry) < 0.006 && rr > 0.27 && rr < 0.42 && !(pa < PR && dot(toP, normalize(vec3(0.0, 0.0, 1.0))) > 0.0)) {
      col = mix(col, vec3(0.9, 0.7, 1.0) * (0.6 + 0.4 * sin(rr * 160.0)), 0.8);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const FLOOR_VS = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FLOOR_FS = /* glsl */`
uniform float uTime;
uniform vec3 uFog;
uniform vec3 uCam;
uniform vec3 uGridColor;
uniform float uGridFixed;
uniform float uFadeFar;
uniform float uSea;
uniform vec3 uSunDir;
varying vec3 vWorld;
float gridLine(vec2 p, float w) {
  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
  return 1.0 - min(min(g.x, g.y) / w, 1.0);
}
void main() {
  vec2 p = vWorld.xz / 1500.0;
  float l = gridLine(p, 1.2);
  float big = gridLine(vWorld.xz / 12000.0, 1.6);
  float dist = length(vWorld.xz - uCam.xz);
  float fade = 1.0 - smoothstep(uFadeFar * 0.15, uFadeFar, dist);
  vec3 base = vec3(0.02, 0.0, 0.05);
  vec3 lc = mix(vec3(1.0, 0.15, 0.8), vec3(0.0, 0.9, 1.0), 0.5 + 0.5 * sin(vWorld.x * 0.00002 + uTime * 0.2));
  lc = mix(lc, uGridColor, uGridFixed);
  vec3 col = base + lc * (l * 0.55 + big * 1.1) * fade;
  if (uSea > 1.5) {
    // city streets: asphalt blocks, glowing road markings every 3000 units
    vec2 q = vWorld.xz / 3000.0;
    vec2 cellp = fract(q);
    vec2 dEdge = min(cellp, 1.0 - cellp) * 3000.0; // distance to the nearest road centre line
    float road = step(min(dEdge.x, dEdge.y), 260.0);
    float side = smoothstep(300.0, 270.0, min(dEdge.x, dEdge.y)) - road;
    float centre = (1.0 - smoothstep(0.0, 14.0, min(dEdge.x, dEdge.y))) * step(0.5, fract((vWorld.x + vWorld.z) / 400.0));
    vec3 asphalt = vec3(0.025, 0.02, 0.04);
    vec3 block = vec3(0.045, 0.03, 0.06) + vec3(0.3, 0.05, 0.4) * 0.15 * gridLine(vWorld.xz / 500.0, 1.0);
    col = mix(block, asphalt, road);
    col += vec3(1.0, 0.25, 0.8) * side * 0.6 * fade;
    col += vec3(1.0, 0.75, 0.2) * centre * road * 1.2 * fade;
  } else if (uSea > 0.5) {
    // synthwave ocean: deep teal with shimmering sun-glint lines
    float wave = sin(vWorld.x * 0.0011 + uTime * 1.3) * sin(vWorld.z * 0.0008 - uTime * 0.9);
    float glint = smoothstep(0.85, 1.0, sin(vWorld.z * 0.004 + wave * 3.0 + uTime));
    // reflect the view ray off a wavy surface and catch the sunset
    vec3 V = normalize(vWorld - uCam);
    vec3 N = normalize(vec3(sin(vWorld.x * 0.004 + uTime) * 0.06 + wave * 0.03, 1.0, cos(vWorld.z * 0.003 - uTime * 0.8) * 0.06));
    vec3 Rf = reflect(V, N);
    float sunPath = pow(max(dot(Rf, normalize(uSunDir)), 0.0), 90.0);
    float horizonGlow = pow(max(dot(Rf, normalize(uSunDir)), 0.0), 6.0);
    col = vec3(0.02, 0.07, 0.12) + vec3(0.05, 0.22, 0.32) * (0.5 + 0.5 * wave) * 0.5;
    col = mix(col, vec3(0.45, 0.12, 0.35), smoothstep(8000.0, 120000.0, dist) * 0.8);
    col += vec3(1.0, 0.55, 0.45) * horizonGlow * 0.35;
    col += vec3(1.0, 0.8, 0.5) * sunPath * (0.6 + glint * 1.6) * 1.4;
    col += vec3(1.0, 0.45, 0.6) * glint * 0.12 * fade;
    col += lc * l * 0.12 * fade;
  }
  // horizon haze
  col = mix(col, uFog * 1.2, smoothstep(uFadeFar * 0.2, uFadeFar * 1.4, dist));
  gl_FragColor = vec4(col, 1.0);
}`;

const PARTICLE_VS = /* glsl */`
uniform vec3 uCam;
uniform float uBox;
uniform float uPx;
uniform float uSpeed;
attribute vec3 color;
varying vec3 vColor;
varying float vFade;
void main() {
  vec3 p = position * uBox;
  p = mod(p - uCam, uBox) - uBox * 0.5 + uCam;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = length(p - uCam);
  vFade = 1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d);
  vColor = color;
  gl_PointSize = clamp(9000.0 / -mv.z, 1.0, 14.0) * uPx;
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FS = /* glsl */`
varying vec3 vColor;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c));
  gl_FragColor = vec4(vColor * a * vFade * 1.4, a * vFade);
}`;

const STREAK_VS = /* glsl */`
uniform vec3 uCam;
uniform vec3 uVel;
uniform float uBox;
attribute float aEnd;
attribute vec3 color;
varying vec3 vColor;
varying float vA;
void main() {
  vec3 p = position * uBox;
  p = mod(p - uCam, uBox) - uBox * 0.5 + uCam;
  // stretch each streak backwards along the velocity (0.05 s worth)
  p -= uVel * 0.05 * aEnd;
  float d = length(p - uCam);
  vA = (1.0 - smoothstep(uBox * 0.25, uBox * 0.5, d)) * smoothstep(150.0, 500.0, d) * (1.0 - aEnd * 0.9);
  vColor = color;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const STREAK_FS = /* glsl */`
uniform float uAmt;
varying vec3 vColor;
varying float vA;
void main() {
  gl_FragColor = vec4(vColor * vA * uAmt * 1.6, vA * uAmt);
}`;

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uSpeed: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSpeed; uniform float uTime; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      float ca = 0.0025 * uSpeed * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      // subtle scanlines
      col *= 0.97 + 0.03 * sin(gl_FragCoord.y * 1.5);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
