// DOM UI: screens, settings form, leaderboards, HUD.
import * as store from './storage.js';
import { keyLabel } from './input.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function fmtTime(t, showMs = true) {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = showMs ? s.toFixed(3).padStart(6, '0') : Math.floor(s).toString().padStart(2, '0');
  return `${String(m).padStart(2, '0')}:${ss}`;
}
export function fmtDelta(d) {
  const sign = d < 0 ? '-' : '+';
  return sign + Math.abs(d).toFixed(2);
}

const ACTION_LABELS = {
  forward: 'Forward', back: 'Back', left: 'Strafe left', right: 'Strafe right',
  jump: 'Jump', restart: 'Restart run', stage: 'Back to stage', ghost: 'Toggle ghost',
};

export class UI {
  constructor(settings, handlers) {
    this.settings = settings;
    this.h = handlers; // { onAction(action, data), onSettingsChange(settings) }
    this.stack = [];
    this.current = 'menu';
    this.hintTimer = 0;
    this.msgTimer = 0;
    this.splitTimer = 0;
    this.lbTab = null;

    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      this.h.onAction(b.dataset.action, b.dataset);
    });
    document.addEventListener('mouseover', (e) => {
      const b = e.target.closest('button, .card');
      if (b && b !== this._lastHover) { this._lastHover = b; this.h.onHover?.(); }
    });
    this._bindSettings();
    this._buildKeybinds();
    this.hud = {
      root: $('#hud'), timer: $('#hud-timer'), map: $('#hud-map'), stage: $('#hud-stage'), pb: $('#hud-pb'),
      split: $('#hud-split'), hint: $('#hud-hint'), msg: $('#hud-center-msg'), speed: $('#hud-speed'),
      bar: $('#hud-speedbar-fill'), sync: $('#hud-sync-val'), keys: $('#hud-keys'), fps: $('#fps'),
      bottom: $('#hud-bottom'),
    };
  }

  // ------------------------------------------------------------------ screens
  show(id) {
    for (const s of $$('.screen')) s.classList.toggle('hidden', s.id !== id);
    this.current = id;
  }
  hideAll() { for (const s of $$('.screen')) s.classList.add('hidden'); this.current = null; }
  push(id) { this.stack.push(this.current); this.show(id); }
  back() { const prev = this.stack.pop(); if (prev) this.show(prev); else this.show('menu'); }
  showHud(on) { this.hud.root.classList.toggle('hidden', !on); }

  renderMaps(maps) {
    const list = $('#map-list');
    list.innerHTML = '';
    for (const m of maps) {
      const pb = store.getBoard(m.id)[0];
      const card = document.createElement('div');
      card.className = 'card';
      card.tabIndex = 0;
      card.dataset.action = 'play-map';
      card.dataset.map = m.id;
      card.innerHTML = `
        <div class="diff ${m.difficulty}">${m.difficulty}</div>
        <div class="title">${esc(m.name)}</div>
        <div class="desc">${esc(m.description)}</div>
        <div class="muted small">${m.stages.length} stages</div>
        <div class="pb">${pb ? 'PB ' + fmtTime(pb.time) : 'No time set'}</div>`;
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.h.onAction('play-map', { map: m.id }); });
      list.appendChild(card);
    }
  }

  renderEndless() {
    const best = store.getEndlessBest();
    $('#endless-best').textContent = best.score ? `Best: ${best.score} ramps (seed "${best.seed}")` : 'No record yet';
    const inp = $('#endless-seed');
    if (!inp.value) inp.value = randomSeed();
  }
  endlessSeed() { return $('#endless-seed').value.trim() || randomSeed(); }
  setEndlessSeed(s) { $('#endless-seed').value = s; }

  renderLeaderboards(maps) {
    const tabs = $('#lb-tabs');
    tabs.innerHTML = '';
    const ids = [...maps.map((m) => [m.id, m.name]), ['endless', 'Endless']];
    if (!this.lbTab) this.lbTab = ids[0][0];
    for (const [id, name] of ids) {
      const b = document.createElement('button');
      b.textContent = name;
      b.className = id === this.lbTab ? 'active' : '';
      b.onclick = () => { this.lbTab = id; this.renderLeaderboards(maps); };
      tabs.appendChild(b);
    }
    const body = $('#lb-body');
    if (this.lbTab === 'endless') {
      const best = store.getEndlessBest();
      body.innerHTML = best.score
        ? `<table class="lb"><tr><th>Best</th><th>Seed</th><th>Time</th><th>Date</th></tr>
           <tr><td class="t">${best.score} ramps</td><td>${esc(best.seed)}</td><td>${fmtTime(best.time)}</td><td>${new Date(best.date).toLocaleDateString()}</td></tr></table>`
        : '<p class="muted">No endless runs yet.</p>';
      return;
    }
    const board = store.getBoard(this.lbTab);
    if (!board.length) { body.innerHTML = '<p class="muted">No times yet. Go set one!</p>'; return; }
    body.innerHTML = `<table class="lb"><tr><th>#</th><th>Time</th><th>Date</th></tr>${board.map((e, i) =>
      `<tr><td>${i + 1}</td><td class="t">${fmtTime(e.time)}</td><td>${new Date(e.date).toLocaleString()}</td></tr>`).join('')}</table>`;
  }

  showFinish(r, map, hasNext) {
    const title = $('#finish-title');
    title.textContent = r.pb ? (r.prevBest ? 'New personal best!' : 'First clear!') : r.rank ? `Finished · #${r.rank}` : 'Finished';
    title.classList.toggle('record', r.pb);
    $('#finish-time').textContent = fmtTime(r.time);
    const bits = [];
    if (r.prevBest != null) bits.push(`${r.pb ? 'Previous best' : 'Personal best'} ${fmtTime(r.prevBest)} (${fmtDelta(r.time - r.prevBest)})`);
    if (r.sync != null) bits.push(`Sync ${r.sync}%`);
    $('#finish-detail').textContent = bits.join(' · ');
    const sp = $('#finish-splits');
    sp.innerHTML = '';
    r.splits.forEach((t, i) => {
      const pbt = r.pbSplits?.[i];
      const d = pbt != null ? t - pbt : null;
      const row = document.createElement('div');
      row.className = 'split';
      row.innerHTML = `<span>Stage ${i + 2}</span><span>${fmtTime(t)} <span class="d ${d == null ? '' : d < 0 ? 'good' : 'bad'}">${d == null ? '' : fmtDelta(d)}</span></span>`;
      sp.appendChild(row);
    });
    const next = $('#finish-next');
    next.textContent = 'Next map';
    next.classList.toggle('hidden', !hasNext);
    next.dataset.action = 'next';
    this.show('finish');
  }

  showEndlessOver(r) {
    const title = $('#finish-title');
    title.textContent = r.record ? 'New endless record!' : 'Wiped out';
    title.classList.toggle('record', r.record);
    $('#finish-time').textContent = `${r.score} ramp${r.score === 1 ? '' : 's'}`;
    $('#finish-detail').textContent = `Best ${r.best} · Seed "${r.seed}" · ${fmtTime(r.time)}`;
    $('#finish-splits').innerHTML = '';
    const next = $('#finish-next');
    next.textContent = 'New seed';
    next.dataset.action = 'endless-new';
    next.classList.remove('hidden');
    this.show('finish');
  }

  // ------------------------------------------------------------------ settings
  _bindSettings() {
    const s = this.settings;
    const bindRange = (id, key, fmt = (v) => v) => {
      const el = $('#' + id);
      const out = el.parentElement.querySelector('output');
      const set = () => { out.textContent = fmt(+el.value); };
      el.value = s[key];
      set();
      el.addEventListener('input', () => { s[key] = +el.value; set(); this.h.onSettingsChange(s); });
      this._refreshers.push(() => { el.value = s[key]; set(); });
    };
    const bindCheck = (id, key) => {
      const el = $('#' + id);
      el.checked = !!s[key];
      el.addEventListener('change', () => { s[key] = el.checked; this.h.onSettingsChange(s); });
      this._refreshers.push(() => { el.checked = !!s[key]; });
    };
    this._refreshers = [];
    bindRange('set-sens', 'sensitivity', (v) => v.toFixed(2));
    bindRange('set-fov', 'fov', (v) => v + '°');
    bindCheck('set-invert', 'invertY');
    bindCheck('set-raw', 'rawInput');
    bindCheck('set-speedfov', 'speedFov');
    const q = $('#set-quality');
    q.value = s.quality;
    q.addEventListener('change', () => { s.quality = q.value; s.qualityLocked = true; this.h.onSettingsChange(s); });
    this._refreshers.push(() => { q.value = s.quality; });
    bindRange('set-scale', 'renderScale', (v) => Math.round(v * 100) + '%');
    bindCheck('set-particles', 'particles');
    bindCheck('set-fps', 'showFps');
    bindCheck('set-ghost', 'ghost');
    bindCheck('set-autobhop', 'autobhop');
    bindCheck('set-keys', 'showKeys');
    bindCheck('set-hints', 'hints');
    bindRange('set-aa', 'airaccelerate', (v) => String(v));
    bindRange('set-vol', 'volume', (v) => Math.round(v * 100) + '%');
    bindRange('set-music', 'music', (v) => Math.round(v * 100) + '%');
    bindRange('set-sfx', 'sfx', (v) => Math.round(v * 100) + '%');
  }

  refreshSettings() {
    this._refreshers.forEach((f) => f());
    this._buildKeybinds();
  }

  _buildKeybinds() {
    const root = $('#keybinds');
    root.innerHTML = '';
    for (const action of Object.keys(ACTION_LABELS)) {
      const row = document.createElement('div');
      row.className = 'keybind';
      const label = document.createElement('span');
      label.textContent = ACTION_LABELS[action];
      const btn = document.createElement('button');
      btn.textContent = keyLabel(this.settings.keys[action]);
      btn.onclick = (e) => {
        e.stopPropagation();
        btn.classList.add('listening');
        btn.textContent = 'Press a key…';
        const onKey = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          cleanup();
          if (ev.code !== 'Escape') this.settings.keys[action] = ev.code;
          this.h.onSettingsChange(this.settings);
          this._buildKeybinds();
        };
        const onMouse = (ev) => {
          if (ev.target === btn && ev.button === 0) return; // the click that started listening
          ev.preventDefault();
          cleanup();
          this.settings.keys[action] = 'Mouse' + ev.button;
          this.h.onSettingsChange(this.settings);
          this._buildKeybinds();
        };
        const onWheel = () => {
          if (action !== 'jump') return;
          cleanup();
          this.settings.keys[action] = 'Wheel';
          this.h.onSettingsChange(this.settings);
          this._buildKeybinds();
        };
        const cleanup = () => {
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('mousedown', onMouse, true);
          window.removeEventListener('wheel', onWheel, true);
        };
        window.addEventListener('keydown', onKey, true);
        setTimeout(() => window.addEventListener('mousedown', onMouse, true), 0);
        window.addEventListener('wheel', onWheel, true);
      };
      row.append(label, btn);
      root.appendChild(row);
    }
  }

  // ------------------------------------------------------------------ HUD
  setHudMap(name) { this.hud.map.textContent = name; }

  hint(text, seconds = 10) {
    if (!text || !this.settings.hints) { this.hud.hint.classList.add('hidden'); return; }
    this.hud.hint.textContent = text;
    this.hud.hint.classList.remove('hidden');
    this.hintTimer = seconds;
  }

  message(text, seconds = 1.3) {
    const m = this.hud.msg;
    m.textContent = text;
    m.classList.remove('hidden');
    m.style.animation = 'none'; void m.offsetWidth; m.style.animation = '';
    this.msgTimer = seconds;
  }

  split(delta, label) {
    const el = this.hud.split;
    el.className = '';
    if (delta == null) { el.textContent = label; el.classList.add('neutral'); }
    else { el.textContent = `${label} ${fmtDelta(delta)}`; el.classList.add(delta < 0 ? 'good' : 'bad'); }
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this.splitTimer = 3;
  }

  updateHud(h, dt, extra) {
    const H = this.hud;
    if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) H.hint.classList.add('hidden'); }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) H.msg.classList.add('hidden'); }
    if (this.splitTimer > 0) { this.splitTimer -= dt; if (this.splitTimer <= 0) H.split.classList.add('hidden'); }

    if (extra.mode === 'endless') {
      H.timer.textContent = h.status === 'start' ? 'READY' : fmtTime(h.time);
      H.stage.textContent = `RAMP ${h.piece}`;
      H.pb.textContent = extra.best ? `BEST ${extra.best}` : '';
    } else {
      H.timer.textContent = h.status === 'start' ? 'START' : fmtTime(h.time);
      H.stage.textContent = `STAGE ${h.stage + 1}/${h.stages}`;
      H.pb.textContent = extra.pb != null ? `PB ${fmtTime(extra.pb)}` : '';
    }
    H.timer.classList.toggle('idle', h.status === 'start');
    const sp = Math.round(h.speed);
    H.speed.textContent = sp;
    const k = Math.min(1, sp / 3500);
    H.bar.style.width = (k * 100).toFixed(1) + '%';
    const glow = sp > 2500 ? 'var(--yellow)' : sp > 1400 ? 'var(--pink)' : 'var(--cyan)';
    H.bottom.style.setProperty('--speed-glow', glow);
    H.sync.textContent = h.sync == null ? '--' : h.sync + '%';
    H.keys.classList.toggle('hidden', !this.settings.showKeys);
    if (this.settings.showKeys && extra.input) {
      for (const el of H.keys.children) this._keyState(el, extra.input);
    }
  }

  _keyState(el, input) {
    if (el.dataset.k) el.classList.toggle('on', input.held(el.dataset.k));
    for (const c of el.children) this._keyState(c, input);
  }

  fps(v) {
    this.hud.fps.classList.toggle('hidden', !this.settings.showFps);
    if (this.settings.showFps) this.hud.fps.textContent = `${v} FPS`;
  }
}

const WORDS = ['neon', 'drift', 'pulse', 'laser', 'nova', 'echo', 'surge', 'chrome', 'flux', 'vapor', 'orbit', 'prism', 'turbo', 'glow', 'static', 'zenith'];
export function randomSeed() {
  const w = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${w()}-${w()}-${Math.floor(Math.random() * 1000)}`;
}
export function dailySeed() {
  const d = new Date();
  return `daily-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
