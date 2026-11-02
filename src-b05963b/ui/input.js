// Unified input: touch (floating stick + buttons), keyboard and gamepad → one snapshot per frame.
const BTN = ['jump', 'attack', 'dash', 'special', 'flask', 'interact'];

export function createInput(root) {
  const held = Object.fromEntries(BTN.map((b) => [b, false]));
  const pressed = Object.fromEntries(BTN.map((b) => [b, false]));
  const keys = new Set();
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  let lastY = 0;
  let touchUsed = false;

  // ---------------- keyboard ----------------
  const KEYMAP = {
    Space: 'jump', KeyK: 'jump', KeyZ: 'jump', ArrowUp: null,
    KeyJ: 'attack', KeyX: 'attack', KeyL: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyC: 'dash',
    KeyI: 'special', KeyV: 'special', KeyH: 'flask', KeyQ: 'flask', KeyE: 'interact', Enter: 'interact',
  };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    const b = KEYMAP[e.code];
    if (b) { held[b] = true; pressed[b] = true; e.preventDefault(); }
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    keys.delete(e.code);
    const b = KEYMAP[e.code];
    if (b) held[b] = false;
  });
  const releaseAll = () => {
    keys.clear(); BTN.forEach((b) => (held[b] = false));
    resetStick();
    for (const el of root.querySelectorAll('[data-btn].down')) el.classList.remove('down');
  };
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // ---------------- touch ----------------
  const stickEl = root.querySelector('#stick');
  const knobEl = root.querySelector('#stick .knob');
  const zone = root.querySelector('#stick-zone');
  // stick radius in px; the stick graphic scales with the screen (--ui), so its reach does too
  const uiScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
  let R = 56;

  // A new touch on the stick zone always takes over: if the old touch's "up" was lost (a menu opened mid-drag,
  // iOS cancelled the gesture), refusing new touches is what left the stick stuck in one direction.
  zone.addEventListener('pointerdown', (e) => {
    touchUsed = true; document.body.classList.add('touch');
    R = 56 * uiScale();
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
    stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px';
    stickEl.classList.add('active');
    zone.classList.remove('teach'); document.body.classList.add('stick-used');
    zone.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { // drag the stick origin along so it never feels stuck
      stick.ox += (dx / d) * (d - R); stick.oy += (dy / d) * (d - R);
      dx = e.clientX - stick.ox; dy = e.clientY - stick.oy;
      stickEl.style.left = stick.ox + 'px'; stickEl.style.top = stick.oy + 'px';
    }
    stick.x = dx / R; stick.y = -dy / R;
    knobEl.style.transform = `translate(${(dx * 56) / R}px, ${(dy * 56) / R}px)`;
  });
  const resetStick = () => {
    stick.id = null; stick.x = stick.y = 0;
    knobEl.style.transform = ''; stickEl.classList.remove('active');
  };
  const endStick = (e) => { if (e.pointerId === stick.id) resetStick(); };
  zone.addEventListener('pointerup', endStick);
  zone.addEventListener('pointercancel', endStick);
  zone.addEventListener('lostpointercapture', endStick);
  // Backups: the release can land outside the zone once capture is gone.
  addEventListener('pointerup', endStick, true);
  addEventListener('pointercancel', endStick, true);

  for (const el of root.querySelectorAll('[data-btn]')) {
    const b = el.dataset.btn;
    const down = (e) => {
      touchUsed = true; document.body.classList.add('touch');
      held[b] = true; pressed[b] = true; el.classList.add('down');
      el.setPointerCapture?.(e.pointerId);
      if (navigator.vibrate && b === 'attack') navigator.vibrate(8);
      e.preventDefault(); e.stopPropagation();
    };
    const up = (e) => { held[b] = false; el.classList.remove('down'); e.preventDefault(); };
    el.addEventListener('lostpointercapture', () => { held[b] = false; el.classList.remove('down'); });
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  // ---------------- gamepad ----------------
  const padPrev = {};
  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const map = { jump: [0], attack: [2], dash: [1, 5, 7], special: [3], flask: [4, 6], interact: [] };
      const out = { x: Math.abs(gp.axes[0]) > 0.2 ? gp.axes[0] : 0, y: Math.abs(gp.axes[1]) > 0.3 ? -gp.axes[1] : 0 };
      if (gp.buttons[14]?.pressed) out.x = -1;
      if (gp.buttons[15]?.pressed) out.x = 1;
      if (gp.buttons[12]?.pressed) out.y = 1;
      if (gp.buttons[13]?.pressed) out.y = -1;
      for (const [b, idx] of Object.entries(map)) {
        const on = idx.some((i) => gp.buttons[i]?.pressed);
        out[b] = on;
        out[b + 'Pressed'] = on && !padPrev[b];
        padPrev[b] = on;
      }
      return out;
    }
    return null;
  }

  return {
    get touch() { return touchUsed; },
    snapshot() {
      let x = stick.x, y = stick.y;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x = -1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x = 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y = 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y = -1;
      const pad = readPad();
      const s = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
      for (const b of BTN) {
        s[b] = held[b] || !!pad?.[b];
        s[b + 'Pressed'] = pressed[b] || !!pad?.[b + 'Pressed'];
        pressed[b] = false;
      }
      if (pad) { if (pad.x) s.x = pad.x; if (pad.y) s.y = pad.y; }
      s.upPressed = s.y > 0.6 && lastY <= 0.6;
      lastY = s.y;
      return s;
    },
    // Called on every screen change (menus, shrines, shops): drop all touches so nothing carries over.
    clear() { BTN.forEach((b) => { pressed[b] = false; held[b] = false; }); resetStick(); for (const el of root.querySelectorAll('[data-btn].down')) el.classList.remove('down'); },
  };
}
