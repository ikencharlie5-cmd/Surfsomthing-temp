// Slipstream: app bootstrap and state machine.
import { Renderer } from './render/renderer.js';
import { setLineResolution } from './render/worldMesh.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Game, TICK } from './game.js';
import { UI, randomSeed, dailySeed } from './ui.js';
import { MAPS, THEMES, getMap, isUnlocked } from './maps/index.js';
import { online, submitScore, topScores, cleanName } from './online.js';
import * as store from './storage.js';

const canvas = document.getElementById('view');
const settings = store.loadSettings();
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
const input = new Input(canvas, settings);

let state = 'menu'; // menu | playing | paused | finished
let currentMap = null;
let lockedBefore = [];
let pendingNext = null;
let pendingRun = null;

/** Post the last finished run to the global leaderboard (if set up). */
async function postRun() {
  if (!online.enabled || !pendingRun) return;
  if (!cleanName(settings.playerName)) { ui.setGlobalResult('Add your name to post this time globally:', true); return; }
  const run = pendingRun;
  ui.setGlobalResult('Posting to the global leaderboard…');
  const res = await submitScore(run.map, { player: settings.playerName, ...run });
  if (pendingRun !== run) return;
  pendingRun = null;
  if (res.ok) ui.setGlobalResult(`Global rank #${res.rank} on ${run.map.name}`);
  else if (res.error === 'implausible') ui.setGlobalResult('That time looks impossible, so it wasn\'t posted.');
  else ui.setGlobalResult('Couldn\'t reach the global leaderboard (saved locally).');
}
const unlocked = (m) => isUnlocked(m, store.hasFinished);
/** Next playable map after the current one (prefers anything just unlocked). */
function nextMap(justUnlocked = []) {
  if (justUnlocked.length) return justUnlocked[0];
  const idx = MAPS.indexOf(currentMap);
  return MAPS.slice(idx + 1).find(unlocked) || null;
}
let currentSeed = null;

const game = new Game(renderer, audio, settings, {
  setView(yaw, pitch) { input.yaw = yaw; input.pitch = pitch; },
  onStart() { ui.message('GO!', 0.8); },
  onHint(text) { ui.hint(text, 12); },
  onReset() { ui.message('RESTART', 0.8); showStageHint(true); },
  onScrub(loss) { ui.scrub(loss); audio.play('scrub'); },
  onComboEnd(points) { if (points > 300) ui.split(null, `COMBO ${points.toLocaleString()}`); },
  onFinish(r) {
    state = 'finished';
    input.unlock();
    const newly = lockedBefore.filter(unlocked);
    lockedBefore = MAPS.filter((m) => !unlocked(m));
    r.unlocked = newly;
    if (newly.length) setTimeout(() => audio.play('record'), 700);
    pendingNext = nextMap(newly);
    pendingRun = { map: currentMap, timeMs: r.time * 1000, topSpeed: r.topSpeed, combo: r.combo };
    setTimeout(() => {
      ui.showFinish(r, currentMap, !!pendingNext, newly.length ? `Play ${pendingNext.name}` : 'Next map');
      postRun();
    }, 250);
  },
  onEndlessOver(r) {
    state = 'finished';
    input.unlock();
    setTimeout(() => ui.showEndlessOver(r), 600);
  },
});

const ui = new UI(settings, {
  onAction: handleAction,
  onSettingsChange(s) { applySettings(s); store.saveSettings(s); },
  onHover() { audio.play('hover'); },
});

function applySettings(s) {
  renderer.setQuality(s.quality, s.renderScale, s.particles);
  renderer.setFov(s.fov);
  audio.setVolumes(s.volume, s.music, s.sfx);
  if (game.mv) { game.mv.cv.autobhop = s.autobhop; game.mv.cv.airaccelerate = s.airaccelerate; }
  if (!s.ghost) game.ghostMesh.visible = false;
}

function showStageHint(short = false) {
  if (!currentMap || game.mode !== 'map') return;
  const c = currentMap.checkpoints[game.run.cp];
  if (c?.hint) ui.hint(c.hint, short ? 7 : 14);
}

// ---------------------------------------------------------------------------

const DEMO_MAPS = ['neon-drift', 'night-tunnel', 'canyon-run'];
let demoIndex = Math.floor(Math.random() * DEMO_MAPS.length);
function renderRecords() {
  ui.renderLeaderboards(MAPS, THEMES, (id) => topScores(id), online.enabled);
}

function startDemo() {
  const demoMap = getMap(DEMO_MAPS[demoIndex++ % DEMO_MAPS.length]);
  game.loadMap(demoMap, { demo: true });
  currentMap = null;
  ui.showHud(false);
  audio.setMusicIntensity(0.35);
}

function startMap(map) {
  if (!map || !unlocked(map)) return;
  lockedBefore = MAPS.filter((m) => !unlocked(m));
  currentMap = map;
  currentSeed = null;
  game.loadMap(map);
  ui.setHudMap(map.name);
  beginPlay();
  showStageHint();
}

function startEndless(seed) {
  currentMap = null;
  currentSeed = seed;
  game.loadEndless(seed);
  ui.setHudMap(`Endless · ${seed}`);
  beginPlay();
}

function beginPlay() {
  state = 'playing';
  ui.hideAll();
  ui.showHud(true);
  input.enabled = true;
  audio.start();
  audio.musicOn(true);
  audio.setMusicIntensity(1);
  input.lock();
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  ui.stack = [];
  ui.show('pause');
}

function resume() {
  state = 'playing';
  ui.hideAll();
  input.lock();
  // Chrome refuses to re-lock right after Esc; fall back to click-to-play
  setTimeout(() => { if (state === 'playing' && !input.locked) ui.show('clicktoplay'); }, 400);
}

function quitToMenu() {
  state = 'menu';
  input.enabled = false;
  input.unlock();
  ui.stack = [];
  ui.show('menu');
  startDemo();
}

function handleAction(action, data) {
  audio.start();
  if (!audio.music?.timer) { audio.musicOn(true); }
  audio.play('click');
  switch (action) {
    case 'maps': ui.renderMaps(MAPS, unlocked, THEMES); ui.push('maps'); break;
    case 'endless': ui.renderEndless(); ui.push('endless'); break;
    case 'endless-random': ui.setEndlessSeed(randomSeed()); break;
    case 'endless-daily': ui.setEndlessSeed(dailySeed()); break;
    case 'endless-go': startEndless(ui.endlessSeed()); break;
    case 'endless-new': startEndless(randomSeed()); break;
    case 'leaderboards': renderRecords(); ui.push('leaderboards'); break;
    case 'save-name':
      settings.playerName = cleanName(ui.nameInput());
      store.saveSettings(settings);
      postRun();
      break;
    case 'lb-clear':
      if (ui.lbTab && ui.lbTab !== 'endless' && confirm('Clear all times and the ghost for this map?')) {
        store.clearBoard(ui.lbTab); renderRecords();
      } else if (ui.lbTab === 'endless' && confirm('Clear your endless record?')) {
        store.setEndlessBest({ score: 0, seed: null }); renderRecords();
      }
      break;
    case 'settings': ui.refreshSettings(); ui.push('settings'); break;
    case 'settings-reset':
      if (confirm('Reset all settings to defaults?')) {
        Object.assign(settings, structuredClone(store.DEFAULT_SETTINGS), { qualityLocked: false });
        store.saveSettings(settings); applySettings(settings); ui.refreshSettings();
      }
      break;
    case 'howto': ui.push('howto'); break;
    case 'back': ui.back(); break;
    case 'play-map': startMap(getMap(data.map)); break;
    case 'resume': resume(); break;
    case 'restart': game.restart(); resume(); showStageHint(); break;
    case 'retry':
      if (currentSeed) startEndless(currentSeed);
      else if (currentMap) startMap(currentMap);
      break;
    case 'next': startMap(pendingNext); break;
    case 'quit': quitToMenu(); break;
    default: break;
  }
}

input.onLockChange = (locked) => {
  if (locked) { if (state === 'playing') ui.hideAll(); return; }
  if (state === 'playing') pause();
};
input.onPress = (action) => {
  if (state !== 'playing') return;
  if (action === 'restart') { game.restart(); showStageHint(true); }
  else if (action === 'stage') game.toStageStart();
  else if (action === 'ghost') {
    settings.ghost = !settings.ghost;
    store.saveSettings(settings);
    if (settings.ghost && currentMap) game.ghostFrames = store.loadGhost(currentMap.id);
    ui.message(settings.ghost ? 'GHOST ON' : 'GHOST OFF', 0.8);
  }
};
document.getElementById('clicktoplay').addEventListener('click', () => { input.lock(); });
canvas.addEventListener('click', () => { if (state === 'playing' && !input.locked) input.lock(); });
// first gesture anywhere starts audio/music
window.addEventListener('pointerdown', () => { if (!audio.started) { audio.start(); audio.musicOn(true); audio.setMusicIntensity(state === 'menu' ? 0.35 : 1); } }, { once: true });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state === 'paused' && ui.current === 'pause') { e.preventDefault(); }
  if (e.code === 'Escape' && state !== 'playing' && ui.current !== 'menu' && ui.current !== 'pause' && ui.current !== 'finish') ui.back();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') { input.unlock(); pause(); } });

// ---------------------------------------------------------------------------
// main loop: fixed 100 Hz physics, interpolated rendering

let last = performance.now();
let acc = 0;
let fpsFrames = 0, fpsTime = 0;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  const simulate = state === 'menu' || (state === 'playing' && input.locked);
  if (simulate) {
    acc += dt;
    let steps = 0;
    while (acc >= TICK && steps < 12) {
      const cmd = state === 'playing' ? input.command() : null;
      game.tick(cmd || idleCmd);
      acc -= TICK;
      steps++;
    }
    if (steps >= 12) acc = 0;
  }
  const alpha = simulate ? acc / TICK : 1;
  game.frame(alpha, input, dt);
  setLineResolution(renderer.lineResolution, renderer.pixelRatio);
  renderer.render(dt);

  if (state === 'playing' || state === 'paused' || state === 'finished') {
    const h = game.hud();
    ui.updateHud(h, dt, {
      mode: game.mode,
      pb: game.pbEntry()?.time ?? null,
      best: game.mode === 'endless' ? game.endlessBest : 0,
      input,
    });
    audio.updateMotion(h.speed, h.surfing, state === 'playing');
  } else {
    audio.updateMotion(0, false, false);
  }
  fpsFrames++; fpsTime += dt;
  if (fpsTime > 0.5) { ui.fps(Math.round(fpsFrames / fpsTime)); fpsFrames = 0; fpsTime = 0; }
  autoQuality(dt);
}

// Step graphics quality down automatically on slow machines (e.g. low-end
// Chromebooks) unless the player picked a quality themselves.
const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];
const aq = { time: 0, frames: 0, warmup: 1.5, steps: 0 };
function autoQuality(dt) {
  if (settings.qualityLocked || aq.steps >= 2 || document.hidden) return;
  if (aq.warmup > 0) { aq.warmup -= dt; return; }
  aq.time += dt; aq.frames++;
  if (aq.time < 3) return;
  const fps = aq.frames / aq.time;
  aq.time = 0; aq.frames = 0;
  const i = QUALITY_ORDER.indexOf(settings.quality);
  if (fps < 40 && i > 0) {
    settings.quality = QUALITY_ORDER[i - 1];
    if (settings.quality === 'low') settings.renderScale = Math.min(settings.renderScale, 0.85);
    aq.steps++;
    aq.warmup = 1;
    applySettings(settings);
    store.saveSettings(settings);
    ui.refreshSettings();
    console.info(`[slipstream] ${fps.toFixed(0)} FPS: lowered quality to ${settings.quality}`);
  } else if (fps >= 55) {
    aq.steps = 2; // running well, stop checking
  }
}
const idleCmd = { forward: 0, side: 0, jump: false, yaw: 0, pitch: 0, mouseDX: 0 };

applySettings(settings);
startDemo();
ui.show('menu');
document.getElementById('loading').classList.add('hidden');
requestAnimationFrame(loop);

// expose for debugging in the console
window.slipstream = { game, renderer, settings, MAPS, input, ui };
