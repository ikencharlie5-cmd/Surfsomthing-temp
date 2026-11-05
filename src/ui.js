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
  jump: 'Jump', restart: 'Restart run', stage: 'Restart (alt key)', ghost: 'Toggle ghost',
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
      bottom: $('#hud-bottom'), combo: $('#hud-combo'), scrub: $('#hud-scrub'), graph: $('#hud-graph'),
    };
    this.graphCtx = this.hud.graph.getContext('2d');
    this.scrubTimer = 0;
    this.lastMult = 1;
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

  renderMaps(maps, isUnlocked, themes) {
    const list = $('#map-list');
    list.innerHTML = '';
    const nameOf = (id) => maps.find((x) => x.id === id)?.name || id;
    // theme tabs with progress (finished maps out of the theme's five)
    const tabs = $('#map-tabs');
    tabs.innerHTML = '';
    if (!this.mapTab) this.mapTab = themes[0].id;
    for (const th of themes) {
      const inTheme = maps.filter((m) => m.group === th.id);
      const done = inTheme.filter((m) => store.hasFinished(m.id)).length;
      const btn = document.createElement('button');
      btn.innerHTML = `${esc(th.label)}<span class="prog">${done}/${inTheme.length}</span>`;
      btn.className = th.id === this.mapTab ? 'active' : '';
      btn.onclick = () => { this.mapTab = th.id; this.renderMaps(maps, isUnlocked, themes); };
      tabs.appendChild(btn);
    }
    const theme = themes.find((t) => t.id === this.mapTab);
    $('#map-theme-blurb').textContent = theme?.blurb || '';
    for (const m of maps.filter((x) => x.group === this.mapTab)) {
      const pb = store.getBoard(m.id)[0];
      const open = isUnlocked(m);
      const card = document.createElement('div');
      card.className = 'card' + (open ? '' : ' locked');
      card.tabIndex = 0;
      card.dataset.map = m.id;
      if (open) card.dataset.action = 'play-map';
      const extras = [
        m.needles?.length ? `${m.needles.length} needle${m.needles.length > 1 ? 's' : ''}` : '',
        m.jumps?.length ? `${m.jumps.length} long jump${m.jumps.length > 1 ? 's' : ''}` : '',
        m.forks?.length ? `${m.forks.length} fast line${m.forks.length > 1 ? 's' : ''}` : '',
        m.cvars?.gravity ? 'low gravity' : '',
      ].filter(Boolean).join(' · ');
      if (!open) {
        const need = m.unlock.after.filter((id) => !store.hasFinished(id)).map(nameOf);
        card.innerHTML = `
          <div class="diff ${m.difficulty}">${m.difficulty}</div>
          <div class="title"><span class="lock"></span>${esc(m.name)}</div>
          <div class="desc">${esc(m.description)}</div>
          <div class="req">Finish ${need.map(esc).join(' + ')} to unlock</div>`;
        list.appendChild(card);
        continue;
      }
      card.innerHTML = `
        ${m.unlock && !pb ? '<div class="new-badge">NEW</div>' : ''}
        <div class="diff ${m.difficulty}">${m.difficulty}</div>
        <div class="title">${esc(m.name)}</div>
        <div class="desc">${esc(m.description)}</div>
        <div class="muted small">${extras || '&nbsp;'}</div>
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

  /**
   * Records: pick a theme, then a map (or Endless); Local or Global.
   * fetchGlobal(mapId) -> Promise<rows|null> is supplied by main.
   */
  renderLeaderboards(maps, themes, fetchGlobal, onlineOn) {
    const tabs = $('#lb-tabs');
    tabs.innerHTML = '';
    const groups = [...themes.map((t) => [t.id, t.label]), ['endless', 'Endless']];
    if (!this.lbGroup) this.lbGroup = groups[0][0];
    for (const [id, label] of groups) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = id === this.lbGroup ? 'active' : '';
      b.onclick = () => { this.lbGroup = id; this.lbTab = null; this.renderLeaderboards(maps, themes, fetchGlobal, onlineOn); };
      tabs.appendChild(b);
    }
    const mapTabs = $('#lb-maps');
    mapTabs.innerHTML = '';
    const body = $('#lb-body');
    const modeTabs = $('#lb-mode');
    modeTabs.innerHTML = '';
    if (this.lbGroup === 'endless') {
      this.lbTab = 'endless';
      const best = store.getEndlessBest();
      body.innerHTML = best.score
        ? `<table class="lb"><tr><th>Best</th><th>Seed</th><th>Time</th><th>Date</th></tr>
           <tr><td class="t">${best.score} ramps</td><td>${esc(best.seed)}</td><td>${fmtTime(best.time)}</td><td>${new Date(best.date).toLocaleDateString()}</td></tr></table>`
        : '<p class="muted">No endless runs yet.</p>';
      return;
    }
    const inTheme = maps.filter((m) => m.group === this.lbGroup);
    if (!this.lbTab || !inTheme.some((m) => m.id === this.lbTab)) this.lbTab = inTheme[0].id;
    for (const m of inTheme) {
      const b = document.createElement('button');
      b.textContent = m.name;
      b.className = m.id === this.lbTab ? 'active' : '';
      b.onclick = () => { this.lbTab = m.id; this.renderLeaderboards(maps, themes, fetchGlobal, onlineOn); };
      mapTabs.appendChild(b);
    }
    this.lbMode = this.lbMode || (onlineOn ? 'global' : 'local');
    for (const [mode, label] of [['local', 'This device'], ['global', 'Global']]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = mode === this.lbMode ? 'active' : '';
      b.onclick = () => { this.lbMode = mode; this.renderLeaderboards(maps, themes, fetchGlobal, onlineOn); };
      modeTabs.appendChild(b);
    }
    if (this.lbMode === 'global') {
      if (!onlineOn) { body.innerHTML = '<p class="muted">Global leaderboards aren\'t set up yet (see README: Online leaderboards).</p>'; return; }
      body.innerHTML = '<p class="muted">Loading global times…</p>';
      const want = this.lbTab;
      fetchGlobal(want).then((rows) => {
        if (this.lbTab !== want || this.lbMode !== 'global') return;
        if (!rows || !rows.length) { body.innerHTML = '<p class="muted">No global times yet. Be the first!</p>'; return; }
        body.innerHTML = `<table class="lb"><tr><th>#</th><th>Player</th><th>Time</th><th>Top speed</th><th>Date</th></tr>${rows.map((e, i) =>
          `<tr><td>${i + 1}</td><td class="who">${esc(e.player)}</td><td class="t">${fmtTime(e.time_ms / 1000)}</td><td>${e.top_speed} u/s</td><td>${new Date(e.created_at).toLocaleDateString()}</td></tr>`).join('')}</table>`;
      }).catch(() => { if (this.lbTab === want) body.innerHTML = '<p class="muted">Couldn\'t reach the global leaderboard. Check your connection.</p>'; });
      return;
    }
    const board = store.getBoard(this.lbTab);
    if (!board.length) { body.innerHTML = '<p class="muted">No times yet. Go set one!</p>'; return; }
    body.innerHTML = `<table class="lb"><tr><th>#</th><th>Time</th><th>Top speed</th><th>Date</th></tr>${board.map((e, i) =>
      `<tr><td>${i + 1}</td><td class="t">${fmtTime(e.time)}</td><td>${e.topSpeed ? e.topSpeed + ' u/s' : '-'}</td><td>${new Date(e.date).toLocaleString()}</td></tr>`).join('')}</table>`;
  }

  /** Finish screen: show global rank / status, or ask for a name. */
  setGlobalResult(text, askName = false) {
    $('#finish-global').textContent = text || '';
    $('#finish-name').classList.toggle('hidden', !askName);
    if (askName) { const i = $('#name-input'); i.value = this.settings.playerName || ''; setTimeout(() => i.focus(), 50); }
  }
  nameInput() { return $('#name-input').value; }

  showFinish(r, map, hasNext, nextLabel = 'Next map') {
    const title = $('#finish-title');
    title.textContent = r.pb ? (r.prevBest ? 'New personal best!' : 'First clear!') : r.rank ? `Finished · #${r.rank}` : 'Finished';
    title.classList.toggle('record', r.pb);
    $('#finish-time').textContent = fmtTime(r.time);
    const bits = [];
    if (r.prevBest != null) bits.push(`${r.pb ? 'Previous best' : 'Personal best'} ${fmtTime(r.prevBest)} (${fmtDelta(r.time - r.prevBest)})`);
    bits.push(`Top speed ${r.topSpeed} u/s`, `Best combo ${r.combo}`);
    if (r.resets) bits.push(`${r.resets} fall${r.resets > 1 ? 's' : ''}`);
    if (r.sync != null) bits.push(`Sync ${r.sync}%`);
    $('#finish-detail').textContent = bits.join(' · ');
    const sp = $('#finish-splits');
    sp.innerHTML = '';
    if (r.unlocked?.length) {
      const u = document.createElement('div');
      u.className = 'unlocked';
      u.textContent = `UNLOCKED: ${r.unlocked.map((m) => m.name).join(', ')}`;
      sp.appendChild(u);
    }
    r.splits.forEach((t, i) => {
      const pbt = r.pbSplits?.[i];
      const d = pbt != null ? t - pbt : null;
      const row = document.createElement('div');
      row.className = 'split';
      row.innerHTML = `<span>Split ${i + 1}</span><span>${fmtTime(t)} <span class="d ${d == null ? '' : d < 0 ? 'good' : 'bad'}">${d == null ? '' : fmtDelta(d)}</span></span>`;
      sp.appendChild(row);
    });
    const next = $('#finish-next');
    next.textContent = nextLabel;
    next.classList.toggle('hidden', !hasNext);
    next.dataset.action = 'next';
    this.setGlobalResult('');
    this.show('finish');
  }

  showEndlessOver(r) {
    const title = $('#finish-title');
    title.textContent = r.record ? 'New endless record!' : 'Wiped out';
    title.classList.toggle('record', r.record);
    $('#finish-time').textContent = `${r.score} ramp${r.score === 1 ? '' : 's'}`;
    $('#finish-detail').textContent = `Best ${r.best} · Seed "${r.seed}" · ${fmtTime(r.time)} · Top ${r.topSpeed} u/s · Best combo ${r.combo}`;
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
    const nameEl = $('#set-name');
    nameEl.value = s.playerName || '';
    nameEl.addEventListener('change', () => { s.playerName = nameEl.value.trim().slice(0, 16); this.h.onSettingsChange(s); });
    this._refreshers.push(() => { nameEl.value = s.playerName || ''; });
    bindCheck('set-ghost', 'ghost');
    bindCheck('set-autobhop', 'autobhop');
    bindCheck('set-keys', 'showKeys');
    bindCheck('set-hints', 'hints');
    bindCheck('set-graph', 'speedGraph');
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
      H.stage.textContent = `${Math.round(h.progress * 100)}%`;
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
    this._combo(h);
    if (this.scrubTimer > 0) { this.scrubTimer -= dt; if (this.scrubTimer <= 0) H.scrub.classList.add('hidden'); }
    H.graph.classList.toggle('hidden', this.settings.speedGraph === false);
    if (this.settings.speedGraph !== false) this._graph(h);
    H.keys.classList.toggle('hidden', !this.settings.showKeys);
    if (this.settings.showKeys && extra.input) {
      for (const el of H.keys.children) this._keyState(el, extra.input);
    }
  }

  scrub(loss) {
    const el = this.hud.scrub;
    el.textContent = `SCRUBBED -${loss}`;
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this.scrubTimer = 1.1;
  }

  _combo(h) {
    const el = this.hud.combo;
    const c = h.combo;
    if (!c || c.points < 1 || h.status !== 'running') { el.classList.add('hidden'); this.lastMult = 1; return; }
    el.classList.remove('hidden');
    el.classList.toggle('fading', c.below > 0);
    el.children[0].textContent = 'x' + c.mult;
    el.children[1].textContent = Math.round(c.points).toLocaleString();
    el.children[3].firstElementChild.style.width = (c.mult >= 10 ? 100 : ((c.time % 3) / 3) * 100).toFixed(0) + '%';
    if (c.mult !== this.lastMult) {
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      this.lastMult = c.mult;
    }
  }

  /** Speed over the last 6 seconds, with scrubs marked in red. */
  _graph(h) {
    const ctx = this.graphCtx;
    const W = 240, Hh = 70, N = h.hist.length;
    ctx.clearRect(0, 0, W, Hh);
    ctx.fillStyle = 'rgba(10, 4, 24, 0.45)';
    ctx.fillRect(0, 0, W, Hh);
    const max = 3500;
    const y = (v) => Hh - 4 - (Math.min(v, max) / max) * (Hh - 10);
    // combo threshold line
    ctx.strokeStyle = 'rgba(255, 225, 77, 0.35)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(0, y(1200)); ctx.lineTo(W, y(1200)); ctx.stroke();
    ctx.setLineDash([]);
    const grad = ctx.createLinearGradient(0, Hh, 0, 0);
    grad.addColorStop(0, '#00f0ff'); grad.addColorStop(0.5, '#ff2bd6'); grad.addColorStop(1, '#ffe14d');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const count = Math.min(N, h.histPos);
    for (let k = 0; k < count; k++) {
      const v = h.hist[(h.histPos - count + k) % N];
      const x = W - (count - k) * (W / N);
      if (k === 0) ctx.moveTo(x, y(v)); else ctx.lineTo(x, y(v));
    }
    ctx.stroke();
    ctx.fillStyle = '#ff4466';
    for (const m of h.scrubs) {
      const age = h.histPos - m;
      if (age < 0 || age >= N) continue;
      const x = W - age * (W / N);
      ctx.fillRect(x - 1, 2, 2, Hh - 4);
    }
    ctx.fillStyle = 'rgba(236, 230, 255, 0.55)';
    ctx.font = '10px Orbitron, sans-serif';
    ctx.fillText('SPEED', 6, 12);
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
