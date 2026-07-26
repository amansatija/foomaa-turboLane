// input.js — keyboard (arrows / WASD) + touch swipes, normalized into
// discrete steer/jump events and held accelerate/brake/nitro flags.
// Touch (Temple Run style): swipe L/R = lane change, swipe up = jump,
// swipe down = brake pulse. No "hold top of screen" accel.

export function createInput() {
  const state = {
    steerLeft: false,    // consumed as one-shot events
    steerRight: false,
    accel: false,        // held
    brake: false,        // held
    nitro: false,        // held
    jump: false,         // one-shot (Space / JUMP btn)
    confirm: false,      // Enter / tap — one-shot
    pause: false,        // one-shot (P / Escape)
  };

  // ----- keyboard -----
  const keyMap = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    Enter: 'confirm',
    ' ': 'jump',
    Shift: 'nitro', n: 'nitro', N: 'nitro',
    p: 'pause', P: 'pause', Escape: 'pause',
  };

  window.addEventListener('keydown', (e) => {
    const k = keyMap[e.key];
    if (!k) return;
    e.preventDefault();
    if (k === 'left' && !e.repeat) state.steerLeft = true;
    if (k === 'right' && !e.repeat) state.steerRight = true;
    if (k === 'up') state.accel = true;
    if (k === 'down') state.brake = true;
    if (k === 'nitro') state.nitro = true;
    if (k === 'jump' && !e.repeat) state.jump = true;
    if (k === 'confirm' && !e.repeat) state.confirm = true;
    if (k === 'pause' && !e.repeat) state.pause = true;
  });

  window.addEventListener('keyup', (e) => {
    const k = keyMap[e.key];
    if (!k) return;
    if (k === 'up') state.accel = false;
    if (k === 'down') state.brake = false;
    if (k === 'nitro') state.nitro = false;
  });

  // ----- on-screen nitro button (touch / mouse hold) -----
  const nitroBtn = document.getElementById('nitro-btn');
  if (nitroBtn) {
    const press = (e) => { e.preventDefault(); state.nitro = true; };
    const release = (e) => { e.preventDefault(); state.nitro = false; };
    nitroBtn.addEventListener('touchstart', press, { passive: false });
    nitroBtn.addEventListener('touchend', release, { passive: false });
    nitroBtn.addEventListener('touchcancel', release, { passive: false });
    nitroBtn.addEventListener('mousedown', press);
    nitroBtn.addEventListener('mouseup', release);
    nitroBtn.addEventListener('mouseleave', release);
  }

  // ----- on-screen jump button (one-shot press) -----
  const jumpBtn = document.getElementById('jump-btn');
  if (jumpBtn) {
    const press = (e) => { e.preventDefault(); state.jump = true; };
    jumpBtn.addEventListener('touchstart', press, { passive: false });
    jumpBtn.addEventListener('mousedown', press);
  }

  // ----- on-screen pause button (one-shot; mobile has no P/ESC) -----
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) {
    const press = (e) => { e.preventDefault(); state.pause = true; };
    pauseBtn.addEventListener('touchstart', press, { passive: false });
    pauseBtn.addEventListener('mousedown', press);
  }

  // ----- touch: Temple Run-style swipes (L/R steer, up jump, down brake) -----
  // Swipe up must NOT accel — that was the old "hold top of screen" speed control.
  const SWIPE_MIN = 40;       // px before a swipe counts
  const TAP_MAX = 12;         // px max movement for a tap
  const TAP_MS = 250;
  const BRAKE_PULSE_MS = 220; // swipe-down brake lasts long enough to feel
  let touchStart = null;
  let gestureFired = false;   // one action per finger-down
  let touchBrakeUntil = 0;    // performance.now() deadline for swipe-down brake

  // Any real UI control must not also generate steer/jump/confirm. Classic bug:
  // tap "Quit to menu" → click sets mode=menu, same touch also sets confirm →
  // next frame startGame() restarts. Same for env picker / resume / etc.
  const onUiEl = (el) => el && el.closest && !!el.closest(
    'button, a, input, select, textarea, label, .overlay, #env-picker'
  );

  function applySwipe(dx, dy) {
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < SWIPE_MIN && ady < SWIPE_MIN) return false;
    if (adx >= ady) {
      // horizontal: lane change
      if (dx < 0) state.steerLeft = true; else state.steerRight = true;
    } else if (dy < 0) {
      // swipe up → jump (Temple Run style)
      state.jump = true;
    } else {
      // swipe down → timed brake pulse (separate from keyboard ↓/S hold)
      touchBrakeUntil = performance.now() + BRAKE_PULSE_MS;
    }
    return true;
  }

  window.addEventListener('touchstart', (e) => {
    if (onUiEl(e.target)) {
      touchStart = null;
      gestureFired = false;
      return;
    }
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
    gestureFired = false;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (onUiEl(e.target) || !touchStart || gestureFired) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    // Fire as soon as the swipe is clear so jump feels immediate
    if (applySwipe(dx, dy)) gestureFired = true;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (onUiEl(e.target)) {
      touchStart = null;
      gestureFired = false;
      return;
    }
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const dtMs = performance.now() - touchStart.time;

    if (!gestureFired) {
      if (applySwipe(dx, dy)) {
        // swipe completed on lift
      } else if (dtMs < TAP_MS && Math.abs(dx) < TAP_MAX && Math.abs(dy) < TAP_MAX) {
        // quick tap = jump while playing, confirm on menus (main decides via mode)
        state.jump = true;
        state.confirm = true;
      }
    }

    touchStart = null;
    gestureFired = false;
  }, { passive: true });

  window.addEventListener('touchcancel', () => {
    touchStart = null;
    gestureFired = false;
  }, { passive: true });

  // ----- API -----
  // Reads and clears the one-shot events; held flags stay live.
  function poll() {
    const touchBrake = touchBrakeUntil > 0 && performance.now() < touchBrakeUntil;
    if (touchBrakeUntil && !touchBrake) touchBrakeUntil = 0;
    const out = {
      steerLeft: state.steerLeft,
      steerRight: state.steerRight,
      accel: state.accel,
      brake: state.brake || touchBrake,
      nitro: state.nitro,
      jump: state.jump,
      confirm: state.confirm,
      pause: state.pause,
    };
    state.steerLeft = state.steerRight = state.confirm = state.jump = state.pause = false;
    return out;
  }

  return { poll };
}
