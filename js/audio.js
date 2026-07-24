// audio.js — all sounds synthesized with the Web Audio API. No audio files.
// Engine = two detuned oscillators whose pitch follows speed.
// Crash = burst of filtered noise. Near-miss = quick band-passed whoosh.

export function createAudio() {
  let ctx = null;
  let engineOsc1, engineOsc2, engineGain, engineFilter;
  let started = false;

  // Must be called from a user gesture (click / keypress) to satisfy autoplay rules.
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    // --- engine drone ---
    engineOsc1 = ctx.createOscillator();
    engineOsc2 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc2.type = 'square';

    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 500;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0;

    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);

    engineOsc1.start();
    engineOsc2.start();
  }

  function startEngine() {
    if (!ctx || started) return;
    started = true;
    engineGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.5);
  }

  function stopEngine() {
    if (!ctx || !started) return;
    started = false;
    engineGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
  }

  // speed01: 0..1 normalized speed
  function setEngineSpeed(speed01) {
    if (!ctx) return;
    const base = 55 + speed01 * 160;          // 55–215 Hz
    engineOsc1.frequency.value = base;
    engineOsc2.frequency.value = base * 1.5 + 3; // slightly detuned harmonic
    engineFilter.frequency.value = 300 + speed01 * 900;
  }

  function crash() {
    if (!ctx) return;
    stopEngine();
    const dur = 0.5;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2; // decaying noise
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();

    // low thump underneath
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, ctx.currentTime);
    thump.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.4, ctx.currentTime);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    thump.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    thump.start();
    thump.stop(ctx.currentTime + 0.45);
  }

  function whoosh() {
    if (!ctx) return;
    const dur = 0.25;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t); // hump envelope
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + dur);
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  return { init, startEngine, stopEngine, setEngineSpeed, crash, whoosh };
}
