// Âm thanh tổng hợp bằng Web Audio (không cần tệp âm thanh).
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
// Tự tạo bằng Web Audio (không dùng tệp nhạc, không vướng bản quyền):
// nền trầm êm + tiếng đàn ngũ cung ngân nhẹ + tiếng chuông chùa thỉnh thoảng.
let musicNodes = null;
let reverbBuf = null;

// Mỗi lần gọi tạo một bộ vang riêng (dùng chung dữ liệu tiếng vang)
function makeReverb(a) {
  if (!reverbBuf) {
    const len = Math.floor(a.sampleRate * 3.5);
    reverbBuf = a.createBuffer(2, len, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = reverbBuf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
  }
  const rv = a.createConvolver();
  rv.buffer = reverbBuf;
  return rv;
}

// Tiếng chuông chùa: các họa âm không đều, ngân dài
function templeBell(a, out, t, base = 128, gain = 0.5) {
  const partials = [[0.56, 0.5, 9], [1, 1, 8], [2.0, 0.55, 6], [2.76, 0.4, 5], [5.4, 0.18, 3], [8.9, 0.08, 2]];
  for (const [ratio, amp, dur] of partials) {
    const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = base * ratio;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.1);
  }
}

function chime(a, out, t, freq, gain = 0.09) {
  for (const [mult, amp] of [[1, 1], [2, 0.18], [3, 0.06]]) {
    const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = freq * mult;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(g).connect(out); o.start(t); o.stop(t + 3.4);
  }
}

const PENTA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33]; // La thứ ngũ cung

export const music = {
  get playing() { return !!musicNodes; },
  start() {
    const a = ac(); if (!a || musicNodes) return;
    const master = a.createGain(); master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.55, a.currentTime + 3);
    const rv = makeReverb(a);
    const wet = a.createGain(); wet.gain.value = 0.6;
    master.connect(a.destination);
    rv.connect(wet).connect(master);
    const dry = a.createGain(); dry.gain.value = 0.7; dry.connect(master);
    const bus = a.createGain(); bus.connect(dry); bus.connect(rv);
    // Nền trầm
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const padGain = a.createGain(); padGain.gain.value = 0.05;
    lp.connect(padGain).connect(bus);
    const oscs = [110, 164.81, 220, 110.4].map((f, i) => {
      const o = a.createOscillator(); o.type = i === 3 ? 'triangle' : 'sine'; o.frequency.value = f; o.connect(lp); o.start(); return o;
    });
    const lfo = a.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = a.createGain(); lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(padGain.gain); lfo.start();
    // Tiếng đàn và tiếng chuông theo nhịp thong thả
    let nextChime = a.currentTime + 1.5, nextBell = a.currentTime + 2;
    const timer = setInterval(() => {
      const now = a.currentTime;
      while (nextChime < now + 1) {
        chime(a, bus, nextChime, PENTA[Math.floor(Math.random() * PENTA.length)], 0.07 + Math.random() * 0.04);
        if (Math.random() < 0.35) chime(a, bus, nextChime + 0.45, PENTA[Math.floor(Math.random() * 5)], 0.05);
        nextChime += 2.6 + Math.random() * 4.5;
      }
      if (nextBell < now + 1) { templeBell(a, bus, nextBell, 128, 0.32); nextBell += 38 + Math.random() * 30; }
    }, 400);
    musicNodes = { master, oscs, lfo, timer };
  },
  stop() {
    if (!musicNodes) return;
    const a = ac();
    const { master, oscs, lfo, timer } = musicNodes;
    musicNodes = null;
    clearInterval(timer);
    master.gain.cancelScheduledValues(a.currentTime);
    master.gain.setValueAtTime(master.gain.value, a.currentTime);
    master.gain.linearRampToValueAtTime(0, a.currentTime + 1.2);
    setTimeout(() => { for (const o of [...oscs, lfo]) { try { o.stop(); } catch { /* đã dừng */ } } master.disconnect(); }, 1400);
  },
  // Gõ chuông (nút chuông ở trang chủ)
  bell() {
    const a = ac(); if (!a) return;
    const out = a.createGain(); out.gain.value = 0.9;
    const rv = makeReverb(a); const wet = a.createGain(); wet.gain.value = 0.5;
    out.connect(a.destination); out.connect(rv); rv.connect(wet).connect(a.destination);
    templeBell(a, out, a.currentTime + 0.02, 140, 0.55);
  },
};
