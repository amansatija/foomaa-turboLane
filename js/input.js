// input.js — keyboard (arrows / WASD) + touch swipes, normalized into
// discrete steer events and held accelerate/brake flags.

export function createInput() {
  const state = {
    steerLeft: false,    // consumed as one-shot events
    steerRight: false,
    accel: false,        // held
    brake: false,        // held
    confirm: false,      // Enter / tap — one-shot
  };

  // ----- keyboard -----
  const keyMap = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    Enter: 'confirm', ' ': 'confirm',
  };

  window.addEventListener('keydown', (e) => {
    const k = keyMap[e.key];
    if (!k) return;
    e.preventDefault();
    if (k === 'left' && !e.repeat) state.steerLeft = true;
    if (k === 'right' && !e.repeat) state.steerRight = true;
    if (k === 'up') state.accel = true;
    if (k === 'down') state.brake = true;
    if (k === 'confirm' && !e.repeat) state.confirm = true;
  });

  window.addEventListener('keyup', (e) => {
    const k = keyMap[e.key];
    if (!k) return;
    if (k === 'up') state.accel = false;
    if (k === 'down') state.brake = false;
  });

  // ----- touch: swipe to steer, hold top/bottom half for speed/brake, tap = confirm -----
  let touchStart = null;

  window.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const dtMs = performance.now() - touchStart.time;

    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) state.steerLeft = true; else state.steerRight = true;
    } else if (dtMs < 250 && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      state.confirm = true; // quick tap
    }
    state.accel = false;
    state.brake = false;
    touchStart = null;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
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
      confirm: state.confirm,
    };
    state.steerLeft = state.steerRight = state.confirm = false;
    return out;
  }

  return { poll };
}
