// Âm thanh tổng hợp bằng Web Audio (không cần tệp âm thanh).
import { ZenMusic, templeBell, makeReverb } from './zen-music.js';
let ctx = null;
let enabled = true;

export function setSoundEnabled(v) { enabled = v; }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Tiếng gõ quân gỗ
function knock(t0, gain = 0.6, freq = 900) {
  const a = ac(); if (!a) return;
  const len = 0.09;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
  const src = a.createBufferSource(); src.buffer = buf;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 2.5;
  const g = a.createGain(); g.gain.value = gain;
  src.connect(bp).connect(g).connect(a.destination);
  src.start(a.currentTime + t0);
}

function tone(t0, freq, dur = 0.15, gain = 0.15, type = 'sine') {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = a.createGain();
  const t = a.currentTime + t0;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}

export const sound = {
  unlock() { ac(); },
  move() { if (enabled) knock(0, 0.7, 1100); },
  capture() { if (enabled) { knock(0, 0.9, 700); knock(0.06, 0.6, 1300); } },
  check() { if (enabled) { tone(0, 880, 0.18, 0.18, 'triangle'); tone(0.16, 1175, 0.25, 0.18, 'triangle'); } },
  win() { if (enabled) [523, 659, 784, 1047].forEach((f, i) => tone(i * 0.13, f, 0.3, 0.16, 'triangle')); },
  lose() { if (enabled) [440, 392, 330].forEach((f, i) => tone(i * 0.18, f, 0.35, 0.14, 'sine')); },
  notify() { if (enabled) tone(0, 988, 0.12, 0.12, 'sine'); },
  tick() { if (enabled) tone(0, 1500, 0.04, 0.05, 'square'); },
};

// ======================= NHẠC THIỀN =======================
// Bản nhạc thiền có tiết tấu (xem zen-music.js): đàn tranh, mõ gỗ, nền trầm, chuông chùa.

let player = null;
let volume = 0.8;

export const music = {
  get playing() { return !!player; },
  setVolume(v) { volume = v; if (player) player.setVolume(v); },
  start() {
    const a = ac(); if (!a || player) return;
    player = new ZenMusic(a, a.destination, volume, Math.floor(Math.random() * 1000));
    player.start();
  },
  stop() {
    if (!player) return;
    player.stop();
    player = null;
  },
  // Gõ chuông (nút chuông ở trang chủ)
  bell() {
    const a = ac(); if (!a) return;
    const out = a.createGain(); out.gain.value = Math.max(0.5, volume);
    const rv = makeReverb(a); const wet = a.createGain(); wet.gain.value = 0.5;
    out.connect(a.destination); out.connect(rv); rv.connect(wet).connect(a.destination);
    templeBell(a, out, a.currentTime + 0.02, 140, 0.6);
  },
};
