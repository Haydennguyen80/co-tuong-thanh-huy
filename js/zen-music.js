// Nhạc thiền tự tạo bằng Web Audio — không dùng tệp nhạc nên không vướng bản quyền.
// Gồm: đàn tranh gảy giai điệu ngũ cung (La thứ), nền trầm đổi hợp âm theo câu,
// mõ gỗ giữ nhịp chậm (64 nhịp/phút), chuông chùa ngân đầu mỗi vòng và chuông nhỏ cuối câu.

const HZ = {
  G2: 98, A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196, A3: 220,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880,
};

export const BPM = 64;
const BEAT = 60 / BPM;
const PHRASE_BEATS = 8;
const CYCLE_BEATS = 32;

// 4 câu nhạc, mỗi câu 8 nhịp: [nốt, số nhịp]
const PHRASES = [
  [['E5', 1], ['D5', 1], ['C5', 1], ['A4', 1], ['G4', 1.5], ['A4', 0.5], ['C5', 2]],
  [['D5', 1], ['E5', 1], ['G5', 1], ['E5', 1], ['D5', 1.5], ['C5', 0.5], ['A4', 2]],
  [['A4', 1], ['C5', 1], ['D5', 1], ['E5', 0.5], ['D5', 0.5], ['C5', 1], ['A4', 1], ['G4', 2]],
  [['E4', 1], ['G4', 1], ['A4', 1], ['C5', 1], ['D5', 1], ['C5', 0.5], ['D5', 0.5], ['A4', 2]],
];
// Bè đệm (vòng chẵn): nốt thấp hơn, nhẹ hơn, gảy lệch nửa nhịp
const HARMONY = [
  [['A3', 2], ['E4', 2], ['C4', 2], ['E4', 2]],
  [['G3', 2], ['D4', 2], ['E4', 2], ['C4', 2]],
  [['A3', 2], ['C4', 2], ['G3', 2], ['D4', 2]],
  [['C4', 2], ['E4', 2], ['G3', 2], ['A3', 2]],
];
// Hợp âm nền cho từng câu
const CHORDS = [['A2', 'E3', 'A3'], ['C3', 'G3', 'C4'], ['G2', 'D3', 'G3'], ['A2', 'E3', 'A3']];

// ---------- Tiếng vang ----------
const reverbCache = new WeakMap();
function reverbBuffer(ctx) {
  if (reverbCache.has(ctx)) return reverbCache.get(ctx);
  const len = Math.floor(ctx.sampleRate * 3.2);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 2.4);
  }
  reverbCache.set(ctx, buf);
  return buf;
}
export function makeReverb(ctx) {
  const c = ctx.createConvolver();
  c.buffer = reverbBuffer(ctx);
  return c;
}

// ---------- Đàn tranh (Karplus-Strong) ----------
const pluckCache = new WeakMap();
function pluckBuffer(ctx, freq) {
  let m = pluckCache.get(ctx);
  if (!m) { m = new Map(); pluckCache.set(ctx, m); }
  if (m.has(freq)) return m.get(freq);
  const sr = ctx.sampleRate, N = Math.max(2, Math.round(sr / freq)), len = Math.floor(sr * 3.6);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const ring = new Float32Array(N);
  let seed = Math.round(freq * 13);
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < N; i++) ring[i] = rnd() * 2 - 1;
  for (let k = 0; k < 2; k++) for (let i = 0; i < N; i++) ring[i] = 0.5 * (ring[i] + ring[(i + 1) % N]); // dịu tiếng gảy
  const g = Math.pow(0.001, 1 / (freq * 2.8)); // ngân khoảng 2,8 giây
  let idx = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx], nxt = ring[(idx + 1) % N];
    d[i] = cur;
    ring[idx] = g * 0.5 * (cur + nxt);
    idx = (idx + 1) % N;
    if (Math.abs(cur) > peak) peak = Math.abs(cur);
  }
  const fade = Math.floor(sr * 0.25);
  for (let i = 0; i < len; i++) { d[i] /= peak || 1; if (i > len - fade) d[i] *= (len - i) / fade; }
  m.set(freq, buf);
  return buf;
}

function pluck(ctx, out, t, freq, vel, pan = 0) {
  const src = ctx.createBufferSource();
  src.buffer = pluckBuffer(ctx, freq);
  const g = ctx.createGain(); g.gain.value = vel;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = Math.min(6000, freq * 7);
  let node = src.connect(tone).connect(g);
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
  node.connect(out);
  src.start(t);
  src.stop(t + 3.6);
}

// ---------- Mõ gỗ ----------
function woodblock(ctx, out, t, vel) {
  for (const [f, a, d] of [[820, 1, 0.09], [1330, 0.35, 0.05]]) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.15, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.02);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * a, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.05);
  }
}

// ---------- Chuông ----------
export function templeBell(ctx, out, t, base = 128, gain = 0.5) {
  for (const [ratio, amp, dur] of [[0.56, 0.5, 10], [1, 1, 9], [2.0, 0.55, 7], [2.76, 0.4, 5.5], [5.4, 0.18, 3.5], [8.9, 0.08, 2]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.1);
  }
}

function smallBell(ctx, out, t, gain = 0.12) {
  for (const [ratio, amp, dur] of [[1, 1, 3], [2.76, 0.4, 1.8], [5.4, 0.15, 1]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1046.5 * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.1);
  }
}

// ---------- Nền trầm ----------
function pad(ctx, out, t, notes, dur, gain = 0.07) {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 1.6);
  g.gain.setValueAtTime(gain, t + dur - 0.4); g.gain.linearRampToValueAtTime(0, t + dur + 1.6);
  lp.connect(g).connect(out);
  notes.forEach((n, i) => {
    for (const det of [-3, 3]) {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = HZ[n]; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 1.8);
    }
  });
}

/**
 * Bộ phát nhạc. ctx: AudioContext (hoặc OfflineAudioContext để xuất file nghe thử).
 */
export class ZenMusic {
  constructor(ctx, destination, volume = 0.8) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.4;
    this.fade = ctx.createGain(); this.fade.gain.value = 1;
    this.bus = ctx.createGain();
    const dry = ctx.createGain(); dry.gain.value = 0.85;
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    const rv = makeReverb(ctx);
    this.bus.connect(dry).connect(comp);
    this.bus.connect(rv).connect(wet).connect(comp);
    comp.connect(this.fade).connect(this.master).connect(destination);
    this.nextBeat = 0;
    this.t0 = 0;
  }

  setVolume(v) { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

  // Lên lịch mọi sự kiện có thời điểm trong [đã lên lịch, tEnd)
  scheduleUntil(tEnd) {
    const ctx = this.ctx, bus = this.bus;
    while (this.t0 + this.nextBeat * BEAT < tEnd) {
      const b = this.nextBeat, t = this.t0 + b * BEAT;
      const cycle = Math.floor(b / CYCLE_BEATS), c = b % CYCLE_BEATS, p = Math.floor(c / PHRASE_BEATS), pb = c % PHRASE_BEATS;
      // Mõ: gõ mỗi nhịp, nhấn ở phách đầu ô nhịp
      woodblock(ctx, bus, t, pb % 4 === 0 ? 0.32 : 0.16);
      if (pb === 0) {
        pad(ctx, bus, t, CHORDS[p], PHRASE_BEATS * BEAT);
        // Giai điệu đàn tranh của câu này
        let off = 0;
        for (const [n, len] of PHRASES[p]) {
          const vel = (off === 0 ? 0.62 : 0.5) + ((b + off * 3) % 5) * 0.015;
          pluck(ctx, bus, t + off * BEAT, HZ[n], vel, -0.15);
          off += len;
        }
        // Vòng chẵn thêm bè đệm
        if (cycle % 2 === 1) {
          let o2 = 0.5;
          for (const [n, len] of HARMONY[p]) { pluck(ctx, bus, t + o2 * BEAT, HZ[n], 0.32, 0.25); o2 += len; }
        }
        // Chuông chùa ngân đầu mỗi vòng (và giữa vòng ở vòng lẻ)
        if (p === 0 || (p === 2 && cycle % 2 === 1)) templeBell(ctx, bus, t, 128, p === 0 ? 0.42 : 0.3);
      }
      // Chuông nhỏ ở cuối câu 2 và câu 4
      if ((p === 1 || p === 3) && pb === 6) smallBell(ctx, bus, t + BEAT * 0.5);
      this.nextBeat++;
    }
  }

  start() {
    const ctx = this.ctx;
    this.t0 = ctx.currentTime + 0.25;
    this.nextBeat = 0;
    this.fade.gain.setValueAtTime(0, ctx.currentTime);
    this.fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    this.scheduleUntil(ctx.currentTime + 1.5);
    this.timer = setInterval(() => this.scheduleUntil(ctx.currentTime + 1.5), 300);
  }

  stop() {
    const ctx = this.ctx;
    clearInterval(this.timer);
    this.fade.gain.cancelScheduledValues(ctx.currentTime);
    this.fade.gain.setValueAtTime(this.fade.gain.value, ctx.currentTime);
    this.fade.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
    const m = this.master;
    setTimeout(() => m.disconnect(), 1500);
  }
}
