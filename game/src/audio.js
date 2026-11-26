export function createAudio() {
  let ctx = null;
  let masterGain = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineFilter = null;
  let engineGain = null;
  let windFilter = null;
  let windGain = null;
  let liftOsc = null;
  let liftGain = null;
  let muted = false;
  let started = false;

  function ensureStarted() {
    if (started) {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 0.45;
    masterGain.connect(ctx.destination);

    // Warm bush-plane flat-four engine hum (two detuned oscillators through lowpass filter).
    engineOsc1 = ctx.createOscillator();
    engineOsc2 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc2.type = 'triangle';
    engineOsc1.frequency.value = 58;
    engineOsc2.frequency.value = 116;

    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 240;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;

    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);

    // Synthesized noise buffer for airflow wind rush & crash bursts.
    const bufLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let seed = 1337;
    for (let i = 0; i < bufLen; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 1073741823.5) - 1;
    }

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;

    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 480;
    windFilter.Q.value = 1.1;

    windGain = ctx.createGain();
    windGain.gain.value = 0.0;

    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(masterGain);

    // Soft airy harmonic shimmer when surfing ridge lift.
    liftOsc = ctx.createOscillator();
    liftOsc.type = 'sine';
    liftOsc.frequency.value = 528;
    liftGain = ctx.createGain();
    liftGain.gain.value = 0.0;
    liftOsc.connect(liftGain);
    liftGain.connect(masterGain);

    engineOsc1.start();
    engineOsc2.start();
    windSrc.start();
    liftOsc.start();
    started = true;
  }

  function setMuted(flag) {
    muted = Boolean(flag);
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : 0.45, ctx.currentTime, 0.03);
    }
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  function update(state, active) {
    if (!started || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (!active || state.crashed) {
      engineGain.gain.setTargetAtTime(0, now, 0.08);
      windGain.gain.setTargetAtTime(0, now, 0.08);
      liftGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    const powered = state.fuel > 0;
    const rpm = powered ? 0.25 + state.throttle * 0.75 : 0.1;
    engineOsc1.frequency.setTargetAtTime(42 + rpm * 68, now, 0.06);
    engineOsc2.frequency.setTargetAtTime(84 + rpm * 138, now, 0.06);
    engineFilter.frequency.setTargetAtTime(160 + rpm * 420, now, 0.06);
    engineGain.gain.setTargetAtTime(powered ? 0.09 + rpm * 0.14 : 0.025, now, 0.06);

    const speedRatio = Math.min(1.4, state.speed / 50);
    windFilter.frequency.setTargetAtTime(260 + speedRatio * 980, now, 0.08);
    windGain.gain.setTargetAtTime(0.02 + speedRatio * 0.14 + (state.airbrake ? 0.06 : 0), now, 0.08);

    const liftTarget = state.liftActive ? 0.045 : 0;
    liftOsc.frequency.setTargetAtTime(460 + state.liftRate * 28, now, 0.09);
    liftGain.gain.setTargetAtTime(liftTarget, now, 0.12);
  }

  function playRingChime(ringIdx = 0) {
    if (!started || !ctx || muted) return;
    const now = ctx.currentTime;
    const base = 523.25 * Math.pow(1.06, ringIdx);
    [1, 1.25, 1.5].forEach((mult, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base * mult, now + i * 0.055);
      g.gain.setValueAtTime(0.001, now + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.055 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0008, now + i * 0.055 + 0.34);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.36);
    });
  }

  function playTouchdown(soft = true) {
    if (!started || !ctx || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(soft ? 115 : 145, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.22);
    g.gain.setValueAtTime(soft ? 0.28 : 0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  function playScrape() {
    if (!started || !ctx || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(62, now + 0.28);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  function playCrash() {
    if (!started || !ctx || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(98, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 0.65);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  function playComplete() {
    if (!started || !ctx || muted) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      g.gain.setValueAtTime(0.16, now + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.52);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.55);
    });
  }

  return {
    ensureStarted,
    toggleMute,
    setMuted,
    isMuted: () => muted,
    update,
    playRingChime,
    playTouchdown,
    playScrape,
    playCrash,
    playComplete,
  };
}
