// Rendering: renderer + post-processing + synthwave environment.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const SUN_DIR = new THREE.Vector3(0, 0.07, -1).normalize();
export const FOG_COLOR = new THREE.Color(0.32, 0.05, 0.3);

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
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q, renderScale = 1, particlesOn = true) {
    this.quality = QUALITY[q] ? q : 'high';
    this.renderScale = renderScale;
    const Q = QUALITY[this.quality];
    this.particles.visible = particlesOn;
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
      uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR } },
      vertexShader: SKY_VS, fragmentShader: SKY_FS,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300000, 48, 24), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // --- neon grid floor ---
    const floorMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFog: { value: FOG_COLOR }, uCam: { value: new THREE.Vector3() } },
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
  float fade = 1.0 - smoothstep(20000.0, 140000.0, dist);
  vec3 base = vec3(0.02, 0.0, 0.05);
  vec3 lc = mix(vec3(1.0, 0.15, 0.8), vec3(0.0, 0.9, 1.0), 0.5 + 0.5 * sin(vWorld.x * 0.00002 + uTime * 0.2));
  vec3 col = base + lc * (l * 0.55 + big * 1.1) * fade;
  // horizon haze
  col = mix(col, uFog * 1.2, smoothstep(30000.0, 200000.0, dist));
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
