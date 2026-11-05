// Game session: physics world, run timer, stages, ghost, endless streaming.
import * as THREE from 'three';
import { Brush } from './physics/brush.js';
import { World, Trigger } from './physics/world.js';
import { Movement, Player, HULL, EYE_OFFSET } from './physics/movement.js';
import { V3 } from './physics/vec.js';
import { buildBrushMesh, buildGate, buildZoneBox, faceMaterial } from './render/worldMesh.js';
import { disposeTree } from './render/renderer.js';
import { EndlessTrack } from './maps/endless.js';
import { SurfBot } from './sim/bot.js';
import * as store from './storage.js';

export const TICK = 1 / 100;
export const GHOST_STEP = 2; // record every 2 ticks (50 Hz)
const START_SPEED_CAP = 350;

export class Game {
  /**
   * @param {import('./render/renderer.js').Renderer} renderer
   * @param {import('./audio.js').AudioEngine} audio
   * @param {object} settings live settings object
   * @param {object} ev callbacks: setView(yaw,pitch), onFinish(r), onStage(info), onReset(), onStart(), onEndlessOver(r), onHint(text)
   */
  constructor(renderer, audio, settings, ev) {
    this.r = renderer;
    this.audio = audio;
    this.settings = settings;
    this.ev = ev;
    this.player = new Player();
    this.prevPos = new V3();
    this.loaded = false;
    this.ghostMesh = buildGhostMesh();
    this.r.scene.add(this.ghostMesh);
    this.ghostMesh.visible = false;
    this.demoYaw = 0;
    this.demoPitch = -0.12;
    this.fov = 74;
  }

  // ------------------------------------------------------------------ loading

  _reset(mode) {
    this.mode = mode;
    this.world = new World();
    this.mv = new Movement(this.world, { autobhop: this.settings.autobhop, airaccelerate: this.settings.airaccelerate });
    this.root = new THREE.Group();
    this.animated = [];
    this.root.userData.update = (t) => {
      faceMaterial().uniforms.uTime.value = t;
      for (const a of this.animated) a.userData.update(t);
    };
    this.r.setWorld(this.root);
    this.triggers = [];
    this.startTrig = null;
    this.ghostFrames = null;
    this.rec = [];
    this.syncGood = 0; this.syncTotal = 0;
    this.trail = [];
    this.loaded = true;
  }

  /** Load a hand-made map. */
  loadMap(map, { demo = false } = {}) {
    this._reset('map');
    this.demo = demo;
    this.map = map;
    this._pb = undefined;
    this.stages = map.stages;
    const brushes = map.brushes.map((b) => this.world.add(new Brush(b.points, b)));
    this.root.add(buildBrushMesh(brushes));
    let minY = 0;
    for (const b of brushes) minY = Math.min(minY, b.min.y);
    this.r.setFloorY(minY - 9000);
    for (const t of map.triggers) {
      const trig = new Trigger(t.min, t.max, t);
      this.triggers.push(trig);
      if (t.type === 'start') {
        this.startTrig = trig;
        const z = buildZoneBox(t);
        this.root.add(z); this.animated.push(z);
      } else if (t.type === 'teleport' || t.type === 'end') {
        const g = buildGate(t, t.type === 'end');
        this.root.add(g); this.animated.push(g);
      }
    }
    if (!demo) this.ghostFrames = this.settings.ghost ? store.loadGhost(map.id) : null;
    this.restart();
  }

  /** Start an endless run with a seed. */
  loadEndless(seed, { demo = false } = {}) {
    this._reset('endless');
    this.demo = demo;
    this.seed = seed;
    this.track = new EndlessTrack(seed);
    this.pieceGroups = new Map();
    this.pieceBrushes = new Map();
    const first = this.track.begin();
    this._addPiece(first);
    const sz = this.track.startZone;
    this.startTrig = new Trigger(sz.min, sz.max, { type: 'start' });
    const z = buildZoneBox(sz);
    this.root.add(z); this.animated.push(z);
    for (let i = 0; i < 5; i++) this._addPiece(this.track.next());
    this.stages = [{ pos: this.track.spawn.pos, yaw: 0, resetY: -Infinity }];
    this.map = { id: 'endless', name: 'Endless', stages: this.stages };
    this.endlessBest = store.getEndlessBest().score;
    this.restart();
  }

  _addPiece(piece) {
    const brushes = piece.brushes.map((b) => this.world.add(new Brush(b.points, b)));
    const g = buildBrushMesh(brushes);
    this.root.add(g);
    this.pieceGroups.set(piece.index, g);
    this.pieceBrushes.set(piece.index, brushes);
  }

  _removePiece(index) {
    const g = this.pieceGroups.get(index);
    if (!g) return;
    this.root.remove(g);
    disposeTree(g);
    for (const b of this.pieceBrushes.get(index)) this.world.remove(b);
    this.pieceGroups.delete(index);
    this.pieceBrushes.delete(index);
  }

  unload() {
    this.loaded = false;
    this.r.setWorld(null);
    this.ghostMesh.visible = false;
  }

  // ------------------------------------------------------------------ run control

  restart() {
    this.run = { status: 'start', ticks: 0, stage: 0, splits: [], resets: 0 };
    this.rec = [];
    this.syncGood = 0; this.syncTotal = 0;
    this.trail = [];
    if (this.mode === 'endless') {
      this.progress = new SurfBot(this.track.line);
      this.piece = 0;
      this.distance = 0;
    }
    this._spawnAt(0);
    this.bot = null;
    this.mv.cv.autobhop = this.settings.autobhop;
    this.mv.cv.airaccelerate = this.settings.airaccelerate;
  }

  _spawnAt(stageIndex) {
    const st = this.stages[stageIndex];
    this.player.teleport(st.pos);
    this.prevPos.copy(this.player.pos);
    this.ev.setView?.(st.yaw, 0);
    this.demoYaw = st.yaw;
    this.trail = [];
    this._chaseReset = true;
    this.bot = null;
  }

  toStageStart() {
    if (this.run.status === 'finished' || this.run.status === 'dead') return;
    if (this.mode === 'endless') { this.restart(); return; }
    this._spawnAt(this.run.stage);
    this.audio.play('reset');
  }

  // ------------------------------------------------------------------ simulation

  /** One fixed physics tick. */
  tick(cmd) {
    if (!this.loaded) return;
    const run = this.run;
    if (run.status === 'finished' || run.status === 'dead') return;
    const p = this.player;
    if (this.demo || this.autopilot) {
      if (!this.bot) this._newBot();
      cmd = { ...this.bot.command(p), mouseDX: 0 };
      if (this.autopilot) this.ev.setView?.(cmd.yaw, cmd.pitch ?? 0);
    }
    this.prevPos.copy(p.pos);
    const wasGround = p.onGround;
    const vy = p.vel.y;
    const jumped = this.mv.tick(p, cmd, TICK);
    if (jumped && !this.demo) this.audio.play('jump');
    if (!wasGround && p.onGround && vy < -350 && !this.demo) this.audio.play('land');

    // strafe sync: in the air, does the strafe key match the mouse direction?
    if (!p.onGround && cmd.side !== 0 && cmd.mouseDX) {
      this.syncTotal++;
      if (Math.sign(cmd.side) === Math.sign(cmd.mouseDX)) this.syncGood++;
    }

    // start zone
    if (this.startTrig) {
      const inStart = this.startTrig.touches(p.pos, HULL);
      if (inStart) {
        if (run.status !== 'start') {
          run.status = 'start'; run.ticks = 0; run.stage = 0; run.splits = []; this.rec = [];
          this.syncGood = this.syncTotal = 0;
        }
        const hs = Math.hypot(p.vel.x, p.vel.z);
        if (hs > START_SPEED_CAP) { p.vel.x *= START_SPEED_CAP / hs; p.vel.z *= START_SPEED_CAP / hs; }
      } else if (run.status === 'start') {
        run.status = 'running';
        run.ticks = 0;
        this.rec = [];
        if (!this.demo) { this.audio.play('start'); this.ev.onStart?.(); }
      }
    }

    if (run.status === 'running') {
      run.ticks++;
      if (run.ticks % GHOST_STEP === 0) this.rec.push(p.pos.x, p.pos.y, p.pos.z, cmd.yaw);
    }

    if (this.mode === 'map') this._mapTriggers(p);
    else this._endlessProgress(p);
  }

  _mapTriggers(p) {
    const run = this.run;
    for (const t of this.triggers) {
      if (t.stage !== run.stage || !t.touches(p.pos, HULL)) continue;
      if (t.type === 'teleport') {
        run.stage = t.target;
        const time = run.ticks * TICK;
        run.splits[t.target - 1] = time;
        this._spawnAt(run.stage);
        this.bot = null;
        if (!this.demo) {
          this.audio.play('stage');
          const pbSplits = this.pbEntry()?.splits;
          const pbt = pbSplits ? pbSplits[t.target - 1] : null;
          this.ev.onStage?.({ stage: run.stage, time, delta: pbt != null && run.status === 'running' ? time - pbt : null });
        }
        return;
      }
      if (t.type === 'end') {
        if (this.demo) { this.restart(); return; }
        this._finish();
        return;
      }
    }
    if (p.pos.y < this.stages[run.stage].resetY) {
      run.resets++;
      this._spawnAt(run.stage);
      this.bot = null;
      if (!this.demo) { this.audio.play('reset'); this.ev.onReset?.(); }
    }
  }

  _finish() {
    const run = this.run;
    if (run.status !== 'running') { // touched the end without a timed run (shouldn't happen)
      this.restart();
      return;
    }
    run.status = 'finished';
    const time = run.ticks * TICK;
    const prevPb = this.pbEntry();
    const res = store.submitTime(this.map.id, time, run.splits.slice());
    this._pb = undefined;
    if (res.pb) store.saveGhost(this.map.id, new Float32Array(this.rec));
    if (res.pb && this.settings.ghost) this.ghostFrames = new Float32Array(this.rec);
    this.audio.play(res.pb ? 'record' : 'finish');
    this.ev.onFinish?.({ time, ...res, splits: run.splits.slice(), pbSplits: prevPb?.splits || null, sync: this.syncPct() });
  }

  _endlessProgress(p) {
    const run = this.run;
    const idx = this.progress._locate(p.pos);
    const tr = this.track;
    while (this.piece + 1 < tr.pieces.length && idx >= tr.pieces[this.piece + 1].lineFrom + 1) this.piece++;
    // stream pieces
    while (tr.count - this.piece < 6) this._addPiece(tr.next());
    for (const k of [...this.pieceGroups.keys()]) if (k < this.piece - 2) this._removePiece(k);
    // distance travelled along the guide line (1 unit = 1.905 cm)
    const lp = tr.line[idx];
    this.distance = Math.max(this.distance, idx);
    this.r.setFloorY(lp.p[1] - 12000);
    if (p.pos.y < lp.p[1] - (lp.width * 1.6) - 1800) {
      if (this.demo) { this.loadEndless(this.seed, { demo: true }); return; }
      run.status = 'dead';
      const best = store.getEndlessBest();
      const score = this.piece;
      const record = score > best.score;
      if (record) store.setEndlessBest({ score, seed: this.seed, time: run.ticks * TICK, date: Date.now() });
      this.endlessBest = Math.max(best.score, score);
      this.audio.play(record ? 'record' : 'over');
      this.ev.onEndlessOver?.({ score, best: Math.max(best.score, score), record, seed: this.seed, time: run.ticks * TICK, prevBest: best });
    }
  }

  _newBot() {
    const line = this.mode === 'endless' ? this.track.line : this.stages[this.run.stage].line;
    this.bot = new SurfBot(line, { offset: 0.45 });
  }

  /** Personal-best entry for the current map (cached). */
  pbEntry() {
    if (this.mode !== 'map') return null;
    if (this._pb === undefined) this._pb = store.getBoard(this.map.id)[0] || null;
    return this._pb;
  }
  syncPct() { return this.syncTotal > 20 ? Math.round((100 * this.syncGood) / this.syncTotal) : null; }

  // ------------------------------------------------------------------ rendering

  /**
   * Position the camera and ghost for a frame.
   * @param {number} alpha interpolation factor between last two ticks
   * @param {{yaw:number,pitch:number}} view
   */
  frame(alpha, view, dt) {
    if (!this.loaded) return;
    const p = this.player;
    const cam = this.r.camera;
    const x = this.prevPos.x + (p.pos.x - this.prevPos.x) * alpha;
    const y = this.prevPos.y + (p.pos.y - this.prevPos.y) * alpha;
    const z = this.prevPos.z + (p.pos.z - this.prevPos.z) * alpha;
    cam.position.set(x, y + EYE_OFFSET, z);
    if (this.demo) {
      // cinematic chase camera: behind and above the bot, looking along its velocity
      const vx = p.vel.x, vz = p.vel.z;
      const sp = Math.hypot(vx, vz);
      const want = sp > 200 ? Math.atan2(-vx, -vz) : this.demoYaw;
      let d = want - this.demoYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.demoYaw += d * Math.min(1, dt * 2.0);
      const fx = -Math.sin(this.demoYaw), fz = -Math.cos(this.demoYaw);
      const back = 520, up = 230;
      const tx = x - fx * back, ty = y + up, tz = z - fz * back;
      if (!this.chase || this.chase.distanceToSquared(cam.position) > 4e6 || this._chaseReset) {
        this.chase = new THREE.Vector3(tx, ty, tz);
        this._chaseReset = false;
      }
      const k = Math.min(1, dt * 6);
      this.chase.x += (tx - this.chase.x) * k;
      this.chase.y += (ty - this.chase.y) * k;
      this.chase.z += (tz - this.chase.z) * k;
      cam.position.copy(this.chase);
      cam.lookAt(x + fx * 900, y + 20, z + fz * 900);
      this.ghostMesh.visible = true;
      this.ghostMesh.position.set(x, y, z);
      this.ghostMesh.rotation.y = this.demoYaw;
      this.ghostMesh.userData.trail.visible = false;
      this.r.speed = Math.hypot(p.vel.x, p.vel.z);
      return;
    }
    cam.rotation.set(view.pitch, view.yaw, 0);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const base = this.r.baseFov || 74;
    const target = base + (this.settings.speedFov ? Math.min(1, Math.max(0, (speed - 500) / 2500)) * 9 : 0);
    this.fov += (target - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.r.speed = speed;
    this._ghostFrame(alpha);
  }

  _ghostFrame(alpha) {
    const g = this.ghostMesh;
    const f = this.ghostFrames;
    const run = this.run;
    g.userData.trail.visible = true;
    if (!f || this.demo || !this.settings.ghost || this.mode !== 'map' || !(run.status === 'running' || run.status === 'start')) {
      g.visible = false;
      return;
    }
    const n = f.length / 4;
    const t = run.status === 'start' ? 0 : (run.ticks + alpha) / GHOST_STEP;
    const i = Math.min(n - 1, Math.floor(t));
    const j = Math.min(n - 1, i + 1);
    const k = t - Math.floor(t);
    const gx = f[i * 4] + (f[j * 4] - f[i * 4]) * k;
    const gy = f[i * 4 + 1] + (f[j * 4 + 1] - f[i * 4 + 1]) * k;
    const gz = f[i * 4 + 2] + (f[j * 4 + 2] - f[i * 4 + 2]) * k;
    const jump = Math.abs(f[j * 4] - f[i * 4]) + Math.abs(f[j * 4 + 2] - f[i * 4 + 2]) > 3000;
    g.visible = true;
    g.position.set(gx, gy, gz);
    g.rotation.y = f[i * 4 + 3];
    // trail
    const trail = this.trail;
    const last = trail[trail.length - 1];
    if (jump || (last && Math.abs(last.x - gx) + Math.abs(last.z - gz) > 3000)) trail.length = 0;
    if (!last || Math.abs(last.x - gx) + Math.abs(last.y - gy) + Math.abs(last.z - gz) > 20) {
      trail.push(new THREE.Vector3(gx, gy, gz));
      if (trail.length > 90) trail.shift();
    }
    const line = g.userData.trail;
    const arr = line.geometry.attributes.position.array;
    for (let q = 0; q < 90; q++) {
      const v = trail[Math.min(q, trail.length - 1)] || g.position;
      arr[q * 3] = v.x - gx; arr[q * 3 + 1] = v.y - gy; arr[q * 3 + 2] = v.z - gz;
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.setDrawRange(0, trail.length);
    line.rotation.y = -g.rotation.y;
  }

  /** HUD snapshot. */
  hud() {
    const p = this.player;
    const run = this.run;
    return {
      speed: Math.hypot(p.vel.x, p.vel.z),
      time: run.ticks * TICK,
      status: run.status,
      stage: run.stage,
      stages: this.stages.length,
      sync: this.syncPct(),
      surfing: p.surfing,
      piece: this.piece,
      seed: this.seed,
    };
  }
}

function buildGhostMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(16, 40, 4, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.6, 0.75), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  const wire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CapsuleGeometry(16, 40, 2, 6)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(0.3, 1.3, 1.5), transparent: true, opacity: 0.55 }),
  );
  const visor = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 2) }));
  visor.position.set(0, 26, -15);
  g.add(body, wire, visor);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(90 * 3), 3));
  const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.2, 1.6, 2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  trail.frustumCulled = false;
  g.add(trail);
  g.userData.trail = trail;
  return g;
}
