// input.js — keyboard (arrows / WASD) + touch swipes, normalized into
// discrete steer events and held accelerate/brake flags.

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

  // ----- touch: swipe to steer, hold top/bottom half for speed/brake, tap = confirm -----
  let touchStart = null;
  // Any real UI control must not also generate steer/jump/confirm. Classic bug:
  // tap "Quit to menu" → click sets mode=menu, same touch also sets confirm →
  // next frame startGame() restarts. Same for env picker / resume / etc.
  const onUiEl = (el) => el && el.closest && !!el.closest(
    'button, a, input, select, textarea, label, .overlay, #env-picker'
  );

  window.addEventListener('touchstart', (e) => {
    if (onUiEl(e.target)) {
      touchStart = null;
      return;
    }
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (onUiEl(e.target)) {
      touchStart = null;
      state.accel = false;
      state.brake = false;
      return;
    }
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const dtMs = performance.now() - touchStart.time;

    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) state.steerLeft = true; else state.steerRight = true;
    } else if (dtMs < 250 && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      // quick tap = jump while playing, confirm on menus (main decides via mode)
      state.jump = true;
      state.confirm = true;
    }
    state.accel = false;
    state.brake = false;
    touchStart = null;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (onUiEl(e.target) || !touchStart) return;
    // holding a finger in the top/bottom quarter of the screen = accel / brake
    const t = e.changedTouches[0];
    const h = window.innerHeight;
    state.accel = t.clientY < h * 0.3;
    state.brake = t.clientY > h * 0.7;
  }, { passive: true });

  // ----- API -----
  // Reads and clears the one-shot events; held flags stay live.
  function poll() {
    const out = {
      steerLeft: state.steerLeft,
      steerRight: state.steerRight,
      accel: state.accel,
      brake: state.brake,
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
