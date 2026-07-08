// Procedural audio — every sound is synthesized in WebAudio, no asset files.
// Continuous layers (wind / sea / rain / eclipse drone) are looped noise or
// oscillators whose gains and filters are driven per-frame from update();
// one-shots subscribe to game events and build short throwaway node chains.
//
// The AudioContext is created on the first pointer lock (a click gesture, so
// autoplay policy is satisfied) and suspends while the game is paused.
import { on } from './events.js';

export function createAudio() {
  let ctx = null;
  let master = null; // final volume (mute lives here)
  let muffle = null; // lowpass: clouds and the maw swallow the highs
  let sfx = null; // everything routes through this bus
  let noiseBuffer = null;
  let layers = null; // { wind, sea, rain, drone }
  let muted = false;
  let volume = 0.8;
  let muffleTarget = 20000;
  let eatenActive = false;
  let inCloudNow = false;
  let chargeStop = null; // kills the sunray charge tone on fire/abort

  // ---------------------------------------------------------------- setup

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);

    muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 20000;
    muffle.Q.value = 0.5;
    muffle.connect(master);

    sfx = ctx.createGain();
    sfx.connect(muffle);

    // one shared 2 s noise loop feeds every noise layer
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const noiseLayer = (filterType, freq, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(sfx);
      src.start();
      return { filter, gain };
    };

    // eclipse drone: two barely-detuned triangles beat against each other
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 400;
    for (const f of [55, 55.7]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.connect(droneFilter);
      osc.start();
    }
    droneFilter.connect(droneGain).connect(sfx);

    layers = {
      wind: noiseLayer('bandpass', 500, 0.6),
      sea: noiseLayer('lowpass', 300),
      rain: noiseLayer('highpass', 2800),
      drone: { gain: droneGain, target: 0 },
    };
  }

  function setLocked(locked) {
    if (locked) {
      ensure();
      if (ctx.state !== 'running') ctx.resume();
    } else if (ctx && ctx.state === 'running') {
      ctx.suspend();
    }
  }

  // ------------------------------------------------------- one-shot helpers

  function tone({ type = 'sine', f0, f1 = f0, dur, gain, attack = 0.005,
    release = 0.1, curve = 'exp', dest = sfx, detune = 0 }) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(Math.max(f0, 1), t);
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    else osc.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + release + 0.05);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
    return { osc, g };
  }

  function noiseBurst({ filterType = 'bandpass', f0, f1 = f0, q = 1, dur, gain,
    attack = 0.004, release = 0.15 }) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(f0, 1), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    src.connect(filter).connect(g).connect(sfx);
    src.start(t);
    src.stop(t + dur + release + 0.05);
    src.onended = () => { src.disconnect(); filter.disconnect(); g.disconnect(); };
  }

  const ready = () => !!ctx && ctx.state === 'running';

  // ----------------------------------------------------------- event sounds

  on('jump', () => {
    if (!ready()) return;
    noiseBurst({ f0: 500, f1: 1400, q: 1, dur: 0.22, gain: 0.22, release: 0.25 });
  });

  on('dash', () => {
    if (!ready()) return;
    noiseBurst({ f0: 900, f1: 4200, q: 1.5, dur: 0.16, gain: 0.38, attack: 0.003, release: 0.2 });
    tone({ type: 'square', f0: 300, f1: 140, dur: 0.12, gain: 0.08 });
  });

  on('land', ({ intensity, fx }) => {
    if (!ready() || !fx) return;
    tone({ f0: 90, f1: 35, dur: 0.25, gain: 0.25 + 0.45 * intensity, release: 0.3 });
    noiseBurst({ filterType: 'lowpass', f0: 600, dur: 0.1, gain: 0.25 * intensity });
  });

  on('bounce', () => {
    if (!ready()) return;
    tone({ type: 'triangle', f0: 160, f1: 680, dur: 0.2, gain: 0.32, release: 0.2 });
    tone({ f0: 80, f1: 340, dur: 0.2, gain: 0.15, release: 0.2 });
  });

  on('sunray', ({ phase }) => {
    if (!ready()) return;
    if (phase === 'charge') {
      // rising tremolo tone, held until fire/abort
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.linearRampToValueAtTime(900, t + 1.2);
      const g = ctx.createGain();
      g.gain.value = 0.1;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 9;
      const depth = ctx.createGain();
      depth.gain.value = 0.05;
      lfo.connect(depth).connect(g.gain);
      osc.connect(g).connect(sfx);
      osc.start(t);
      lfo.start(t);
      chargeStop = () => {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
        osc.stop(ctx.currentTime + 0.15);
        lfo.stop(ctx.currentTime + 0.15);
        osc.onended = () => { osc.disconnect(); g.disconnect(); lfo.disconnect(); depth.disconnect(); };
        chargeStop = null;
      };
    } else {
      if (chargeStop) chargeStop();
      if (phase === 'fire') {
        tone({ type: 'square', f0: 1600, f1: 220, dur: 0.1, gain: 0.3 });
        noiseBurst({ filterType: 'highpass', f0: 2000, dur: 0.08, gain: 0.2 });
      }
    }
  });

  on('rayhit', () => {
    if (!ready()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 128) - 1) * 4);
    shaper.curve = curve;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    osc.connect(shaper).connect(g).connect(sfx);
    osc.start(t);
    osc.stop(t + 0.7);
    osc.onended = () => { osc.disconnect(); shaper.disconnect(); g.disconnect(); };
    noiseBurst({ filterType: 'lowpass', f0: 900, dur: 0.12, gain: 0.3 });
  });

  on('scare', () => {
    if (!ready()) return;
    tone({ type: 'sawtooth', f0: 440, f1: 414, dur: 0.5, gain: 0.1, curve: 'lin', release: 0.55 });
    tone({ type: 'sawtooth', f0: 467, f1: 439, dur: 0.5, gain: 0.1, curve: 'lin', release: 0.55 });
  });

  on('eaten', () => {
    if (!ready()) return;
    eatenActive = true;
    tone({ type: 'sawtooth', f0: 110, f1: 28, dur: 0.8, gain: 0.45, release: 0.4 });
  });

  on('respawn', () => {
    if (!ready()) return;
    eatenActive = false;
    tone({ f0: 280, f1: 520, dur: 0.08, gain: 0.16 });
  });

  on('win', () => {
    if (!ready()) return;
    [523, 659, 784, 1047].forEach((f, k) => {
      setTimeout(() => ready() && tone({ type: 'triangle', f0: f, dur: 0.25, gain: 0.2, release: 0.3 }), k * 120);
    });
  });

  on('windenter', () => {
    if (!ready()) return;
    noiseBurst({ f0: 600, q: 0.8, dur: 0.25, gain: 0.28, attack: 0.25, release: 0.6 });
  });

  on('eclipse', ({ phase }) => {
    if (!ready()) return;
    if (phase === 'warn') tone({ f0: 170, f1: 330, dur: 1.1, gain: 0.12, curve: 'lin', release: 0.3 });
    if (layers) layers.drone.target = phase === 'dark' ? 0.18 : 0;
  });

  // --------------------------------------------------------------- update

  const lerpRate = (current, target, rate, dt) =>
    current + (target - current) * (1 - Math.exp(-rate * dt));

  function update(dt, params) {
    if (!ready() || !layers) return;
    const { speed = 0, velY = 0, inCloud = false, seaProx = 1000, storm = 0 } = params;

    inCloudNow = inCloud;
    muffleTarget = inCloudNow ? 750 : eatenActive ? 240 : 20000;
    muffle.frequency.value = lerpRate(muffle.frequency.value, muffleTarget, 8, dt);

    const fall = Math.max(0, Math.min(1, (-velY - 35) / 95));
    const rush = Math.max(0, Math.min(1, (speed - 8) / 55));
    layers.wind.filter.frequency.value = 400 + 6 * speed;
    layers.wind.gain.gain.value = rush * rush * 0.3 + fall * 0.3;

    layers.sea.filter.frequency.value = 260 + 240 * storm;
    layers.sea.gain.gain.value =
      0.3 * Math.max(0, Math.min(1, 1 - seaProx / 130)) + 0.1 * storm;

    layers.rain.gain.gain.value = 0.22 * Math.max(0, (storm - 0.25) / 0.75);

    layers.drone.gain.gain.value = lerpRate(
      layers.drone.gain.gain.value, layers.drone.target,
      layers.drone.target > 0 ? 2.5 : 2, dt);
  }

  // ----------------------------------------------------------------- api

  function applyMaster() {
    if (master) master.gain.value = muted ? 0 : volume;
  }

  return {
    setLocked,
    update,
    toggleMute: () => { muted = !muted; applyMaster(); return muted; },
    setMuted: (v) => { muted = v; applyMaster(); },
    setVolume: (v) => { volume = v; applyMaster(); },
    muted: () => muted,
    state: () => (ctx ? ctx.state : 'none'),
  };
}
