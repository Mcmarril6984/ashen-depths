// Tiny synthesized sound effects (WebAudio), so the game needs no audio files.
let ctx = null, master = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('ad.muted') === '1'; } catch { /* storage blocked */ }

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('ad.muted', muted ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
export const isMuted = () => muted;

function tone({ f0, f1 = f0, dur = 0.1, type = 'sine', vol = 0.3, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise({ dur = 0.1, vol = 0.3, f0 = 2000, f1 = f0, q = 1, type = 'bandpass', delay = 0 }) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.02);
}

let comboPitch = 1, coinPitch = 1, lastCoin = 0;
export function setCombo(n) { comboPitch = 1 + Math.min(n, 12) * 0.04; }

const SFX = {
  swing: () => noise({ dur: 0.11, vol: 0.22, f0: 700 * (0.9 + Math.random() * 0.25), f1: 3400, q: 2.2 }),
  hit: () => {
    const v = 0.9 + Math.random() * 0.2, p = comboPitch * v;
    noise({ dur: 0.07, vol: 0.45, f0: 2400 * p, f1: 500, q: 1.2 });
    tone({ f0: 190 * p, f1: 55, dur: 0.11, type: 'square', vol: 0.16 });
    tone({ f0: 70, f1: 40, dur: 0.09, type: 'sine', vol: 0.35 });
  },
  hit3: () => {
    noise({ dur: 0.16, vol: 0.55, f0: 1600, f1: 200, q: 0.8 });
    tone({ f0: 120, f1: 35, dur: 0.22, type: 'sawtooth', vol: 0.22 });
    tone({ f0: 60, f1: 30, dur: 0.2, type: 'sine', vol: 0.5 });
  },
  crit: () => {
    SFX.hit();
    tone({ f0: 1760, f1: 2400, dur: 0.12, type: 'triangle', vol: 0.12, delay: 0.02 });
    tone({ f0: 2640, f1: 3200, dur: 0.1, type: 'sine', vol: 0.08, delay: 0.05 });
  },
  pogo: () => { tone({ f0: 330, f1: 660, dur: 0.12, type: 'triangle', vol: 0.15 }); noise({ dur: 0.06, vol: 0.25, f0: 3000, f1: 1200 }); },
  kill: () => { noise({ dur: 0.3, vol: 0.5, f0: 1400, f1: 150 }); tone({ f0: 240, f1: 35, dur: 0.3, type: 'sawtooth', vol: 0.18 }); tone({ f0: 55, f1: 28, dur: 0.35, type: 'sine', vol: 0.55 }); },
  hurt: () => { tone({ f0: 300, f1: 80, dur: 0.25, type: 'sawtooth', vol: 0.25 }); noise({ dur: 0.15, vol: 0.3, f0: 600, f1: 200 }); },
  jump: () => tone({ f0: 220, f1: 420, dur: 0.09, type: 'triangle', vol: 0.12 }),
  dash: () => noise({ dur: 0.18, vol: 0.3, f0: 400, f1: 2500, q: 0.8 }),
  coin: () => {
    const now = ctx.currentTime; coinPitch = now - lastCoin < 0.35 ? Math.min(2, coinPitch * 1.06) : 1; lastCoin = now;
    tone({ f0: 1300 * coinPitch, dur: 0.05, type: 'square', vol: 0.05 }); tone({ f0: 1900 * coinPitch, dur: 0.08, type: 'square', vol: 0.04, delay: 0.04 });
  },
  chest: () => [523, 659, 784, 1046].forEach((f, i) => tone({ f0: f, dur: 0.18, type: 'triangle', vol: 0.15, delay: i * 0.07 })),
  heal: () => [392, 523, 659].forEach((f, i) => tone({ f0: f, dur: 0.3, type: 'sine', vol: 0.18, delay: i * 0.08 })),
  flask: () => tone({ f0: 300, f1: 600, dur: 0.5, type: 'sine', vol: 0.1 }),
  block: () => tone({ f0: 900, f1: 700, dur: 0.12, type: 'square', vol: 0.12 }),
  parry: () => tone({ f0: 1400, f1: 900, dur: 0.15, type: 'triangle', vol: 0.15 }),
  break: () => noise({ dur: 0.2, vol: 0.35, f0: 500, f1: 150, q: 0.7 }),
  fire: () => { noise({ dur: 0.35, vol: 0.3, f0: 300, f1: 1500, q: 0.6 }); tone({ f0: 120, f1: 300, dur: 0.3, type: 'sawtooth', vol: 0.08 }); },
  slam: () => { tone({ f0: 90, f1: 30, dur: 0.45, type: 'sine', vol: 0.5 }); noise({ dur: 0.4, vol: 0.35, f0: 300, f1: 60, type: 'lowpass' }); },
  shrine: () => [262, 330, 392, 523, 659].forEach((f, i) => tone({ f0: f, dur: 0.6, type: 'sine', vol: 0.12, delay: i * 0.09 })),
  door: () => { tone({ f0: 70, f1: 50, dur: 0.8, type: 'sawtooth', vol: 0.15 }); noise({ dur: 0.8, vol: 0.2, f0: 200, f1: 80, type: 'lowpass' }); },
  boss: () => { tone({ f0: 55, f1: 40, dur: 1.4, type: 'sawtooth', vol: 0.3 }); tone({ f0: 82, f1: 60, dur: 1.4, type: 'sawtooth', vol: 0.2 }); },
  select: () => tone({ f0: 660, f1: 880, dur: 0.08, type: 'triangle', vol: 0.12 }),
  death: () => { tone({ f0: 330, f1: 55, dur: 1.2, type: 'sawtooth', vol: 0.25 }); noise({ dur: 1, vol: 0.2, f0: 800, f1: 100 }); },
};

export function sfx(name) {
  if (!ctx || muted || !SFX[name]) return;
  try { SFX[name](); } catch { /* ignore audio errors */ }
}
