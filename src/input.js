// Keyboard + pointer-lock mouse input.
export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.down = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;
    this.mouseDX = 0; // accumulated since last tick (for sync)
    this.onPress = null; // (action) => void
    this.onLockChange = null;
    this.enabled = false;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) {
        const a = this.actionFor(e.code);
        if (a && this.onPress) this.onPress(a);
      }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = this.settings.sensitivity * 0.022 * (Math.PI / 180);
      // ignore absurd spikes some browsers emit when locking
      const dx = Math.abs(e.movementX) > 800 ? 0 : e.movementX;
      const dy = Math.abs(e.movementY) > 800 ? 0 : e.movementY;
      this.yaw -= dx * s;
      this.pitch -= dy * s * (this.settings.invertY ? -1 : 1);
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
      this.mouseDX += dx;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.down.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.enabled || !this.locked) return;
      // mouse buttons can be bound too
      const code = 'Mouse' + e.button;
      const a = this.actionFor(code);
      if (a && this.onPress) this.onPress(a);
      this.down.add(code);
    });
    document.addEventListener('mouseup', (e) => this.down.delete('Mouse' + e.button));
    document.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      // scroll-wheel jump (classic bhop bind) when jump is bound to the wheel
      if (this.settings.keys.jump === 'Wheel') { this.wheelJump = 3; }
      e.preventDefault?.();
    }, { passive: true });
  }

  actionFor(code) {
    const k = this.settings.keys;
    for (const a in k) if (k[a] === code) return a;
    return null;
  }

  lock() {
    if (this.locked) return;
    const opts = this.settings.rawInput ? { unadjustedMovement: true } : undefined;
    try {
      const p = this.canvas.requestPointerLock(opts);
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* ignore */ } });
    } catch {
      try { this.canvas.requestPointerLock(); } catch { /* ignore */ }
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  held(action) { return this.down.has(this.settings.keys[action]); }

  /** Build a movement command for this tick. */
  command() {
    let jump = this.held('jump');
    if (this.wheelJump > 0) { jump = true; this.wheelJump--; }
    const cmd = {
      forward: (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0),
      side: (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0),
      jump,
      yaw: this.yaw,
      pitch: this.pitch,
      mouseDX: this.mouseDX,
    };
    this.mouseDX = 0;
    return cmd;
  }
}

export function keyLabel(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Mouse0') return 'Mouse L';
  if (code === 'Mouse1') return 'Mouse M';
  if (code === 'Mouse2') return 'Mouse R';
  if (code === 'Space') return 'Space';
  const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (arrows[code]) return arrows[code];
  return code.replace('Left', ' L').replace('Right', ' R');
}
