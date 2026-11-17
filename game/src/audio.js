// audio.js: every sound is synthesized with WebAudio — no audio files, no network. A small
// synth helper builds short blips, sweeps and noise bursts, and a quiet bass pulse keeps a
// heartbeat under play. The context is created on the first user gesture; muted state persists.

const MUTE_KEY = 'emberfall.muted';

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicTimer = 0;
  let musicOn = false;
  let muted = false;
  try { muted = window.localStorage.getItem(MUTE_KEY) === '1'; } catch { muted = false; }

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* audio is decoration; never break the game */ }
  }

  function noise(dur, vol, lowpass) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    } catch { /* decoration only */ }
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    isMuted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shoot() { tone(720, 0.09, 'square', 0.10, 240); },
    hit() { tone(180, 0.08, 'sawtooth', 0.12, 90); },
    kill() { tone(520, 0.16, 'triangle', 0.16, 90); noise(0.12, 0.10, 1800); },
    hurt() { tone(140, 0.25, 'sawtooth', 0.20, 60); noise(0.2, 0.14, 900); },
    pickup() { tone(660, 0.10, 'sine', 0.16, 990); tone(990, 0.14, 'sine', 0.12, 1320); },
    dash() { noise(0.14, 0.12, 3200); },
    nova() { tone(90, 0.5, 'sawtooth', 0.22, 30); noise(0.5, 0.20, 1200); },
    waveClear() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.15), i * 90)); },
    bossRoar() { tone(70, 0.7, 'sawtooth', 0.22, 45); noise(0.6, 0.12, 600); },
    gameOver() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.16), i * 160)); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.16), i * 110)); },
    // A slow two-note bass pulse, stepped from the game loop so it stays in time with play.
    musicTick(dt, intensity) {
      if (!ctx || muted || !musicOn) return;
      musicTimer -= dt;
      if (musicTimer > 0) return;
      musicTimer = 0.5 - Math.min(0.18, intensity * 0.02);
      tone(55 + (Math.random() < 0.3 ? 13.75 : 0), 0.42, 'sine', 0.10);
    },
    startMusic() { musicOn = true; },
    stopMusic() { musicOn = false; },
  };
}
