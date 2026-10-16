// Nhạc thiền tự tạo bằng Web Audio — không dùng tệp nhạc nên không vướng bản quyền.
// Gồm: đàn tranh gảy giai điệu ngũ cung (La thứ), nền trầm đổi hợp âm theo câu,
// mõ gỗ giữ nhịp chậm (64 nhịp/phút), chuông chùa ngân đầu mỗi vòng và chuông nhỏ cuối câu.

const HZ = {
  E2: 82.41, B2: 123.47, G2: 98, A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196, A3: 220,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880,
};

export const BPM = 64;
const BEAT = 60 / BPM;
const PHRASE_BEATS = 8;

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
// Hợp âm nền (quãng năm mở, hợp không khí thiền)
const CHORD = { Am: ['A2', 'E3', 'A3'], C: ['C3', 'G3', 'C4'], G: ['G2', 'D3', 'G3'], Em: ['E2', 'B2', 'E3'], Dm: ['D3', 'A3', 'D4'] };
const ROOT = { Am: 'A', C: 'C', G: 'G', Em: 'E', Dm: 'D' };
const A_CHORDS = ['Am', 'C', 'G', 'Am'];

// Thang âm ngũ cung La thứ, từ thấp đến cao
const SCALE = ['G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5'];
const RHYTHMS = [
  [1, 1, 1, 1, 1.5, 0.5, 2], [2, 1, 1, 2, 2], [1, 0.5, 0.5, 1, 1, 1, 1, 2], [1.5, 0.5, 1, 1, 1.5, 0.5, 2],
  [1, 1, 2, 1, 1, 2], [0.5, 0.5, 1, 1, 1, 0.5, 0.5, 1, 2], [2, 2, 1, 1, 2], [1, 1, 1, 0.5, 0.5, 2, 2],
];
const SLOW_RHYTHMS = [[2, 2, 4], [3, 1, 4], [4, 2, 2], [2, 1, 1, 4]];

function rng(seed) {
  let x = (seed * 2654435761) % 2147483647 || 1;
  return () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
}

// Tự sáng tác một câu nhạc: đi chủ yếu từng bậc, kết vào nốt gốc của hợp âm
function composePhrase(r, chord, lo, hi, rhythms, startIdx) {
  const rhythm = rhythms[Math.floor(r() * rhythms.length)];
  let idx = Math.max(lo, Math.min(hi, startIdx));
  const notes = [];
  rhythm.forEach((len, k) => {
    if (k === rhythm.length - 1) {
      // nốt cuối: gần nhất với nốt gốc của hợp âm
      let best = idx, bd = 99;
      for (let j = lo; j <= hi; j++) if (SCALE[j][0] === ROOT[chord] && Math.abs(j - idx) < bd) { bd = Math.abs(j - idx); best = j; }
      idx = best;
    } else if (k > 0) {
      const step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(r() * 7)];
      idx = Math.max(lo, Math.min(hi, idx + step));
    }
    notes.push([SCALE[idx], len]);
  });
  return { notes, end: idx };
}

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

// ---------- Sáo trúc ----------
function flute(ctx, out, t, freq, dur, vel = 0.13) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2;
  const g2 = ctx.createGain(); g2.gain.value = 0.12;
  const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
  const vibG = ctx.createGain(); vibG.gain.setValueAtTime(0, t); vibG.gain.linearRampToValueAtTime(freq * 0.006, t + 0.5);
  vib.connect(vibG); vibG.connect(o.frequency); vibG.connect(o2.frequency);
  const g = ctx.createGain();
  const end = t + dur;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.14);
  g.gain.setValueAtTime(vel * 0.9, Math.max(t + 0.15, end - 0.35)); g.gain.linearRampToValueAtTime(0, end + 0.25);
  o.connect(g); o2.connect(g2).connect(g); g.connect(out);
  // hơi thở
  const len = Math.floor(ctx.sampleRate * (dur + 0.3));
  const nb = ctx.createBuffer(1, len, ctx.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
  const ns = ctx.createBufferSource(); ns.buffer = nb;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 2; bp.Q.value = 6;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(vel * 0.25, t + 0.08); ng.gain.linearRampToValueAtTime(vel * 0.06, t + 0.4); ng.gain.linearRampToValueAtTime(0, end + 0.2);
  ns.connect(bp).connect(ng).connect(out);
  for (const x of [o, o2, vib]) { x.start(t); x.stop(end + 0.4); }
  ns.start(t); ns.stop(end + 0.3);
}

/*
 * Bố cục một vòng (~4 phút 30 giây, mỗi câu 8 nhịp ≈ 7,5 giây):
 * Dạo đầu → A → A' (bè đệm) → B (mới, cao) → Chuyển (sáo trúc) → C (trầm) → B' → A'' (luyến láy + sáo) → Kết
 * Mỗi vòng dùng "hạt giống" khác nên đoạn dạo, B, chuyển, C, kết luôn là giai điệu mới.
 */
const SECTIONS = [
  { name: 'intro', chords: ['Am', 'G', 'C', 'Am'], mo: 'none', bells: [0] },
  { name: 'A', chords: A_CHORDS, mo: 'all', bells: [0], small: [1, 3] },
  { name: "A'", chords: A_CHORDS, mo: 'all', harmony: true, small: [3] },
  { name: 'B', chords: ['C', 'G', 'Am', 'Em'], mo: 'all', small: [1, 3] },
  { name: 'interlude', chords: ['Am', 'G', 'C', 'Am'], mo: 'half', bells: [0, 2] },
  { name: 'C', chords: ['Dm', 'Am', 'G', 'Am'], mo: 'soft', small: [3] },
  { name: "B'", chords: ['C', 'G', 'Am', 'Em'], mo: 'all', harmony: true, bells: [0] },
  { name: "A''", chords: A_CHORDS, mo: 'all', ornament: true, small: [1, 3] },
  { name: 'outro', chords: ['Am', 'C', 'G', 'Am'], mo: 'fade', bells: [0, 3] },
];
const PHRASES_PER_SECTION = 4;
const LOOP_PHRASES = SECTIONS.length * PHRASES_PER_SECTION;

// Dựng kế hoạch cho cả một vòng: danh sách câu nhạc với nốt cụ thể
function buildLoop(loop) {
  const r = rng(loop * 7919 + 17);
  const plan = [];
  let last = 6;
  let bMelody = null;
  for (const sec of SECTIONS) {
    const phrases = [];
    sec.chords.forEach((ch, i) => {
      const ph = { sec, chord: ch, i, pluck: [], flute: [], harmony: [] };
      if (sec.name.startsWith('A')) {
        ph.pluck = PHRASES[i].map(([n, l]) => [n, l]);
        if (sec.harmony) ph.harmony = HARMONY[i];
        if (sec.ornament) ph.flute = [[PHRASES[i][0][0], 3], [PHRASES[i][PHRASES[i].length - 1][0], 4]].map(([n, l]) => [SCALE[Math.max(0, SCALE.indexOf(n) - 2)], l]);
      } else if (sec.name === 'B') {
        const c = composePhrase(r, ch, 5, 11, RHYTHMS, last); ph.pluck = c.notes; last = c.end;
      } else if (sec.name === "B'") {
        ph.pluck = bMelody ? bMelody[i] : composePhrase(r, ch, 5, 11, RHYTHMS, last).notes;
        ph.harmony = [[CHORD[ch][2], 2], [CHORD[ch][1], 2], [CHORD[ch][2], 4]].map(([n, l]) => [HZ[n] ? n : 'A3', l]);
      } else if (sec.name === 'C') {
        const c = composePhrase(r, ch, 1, 7, RHYTHMS, Math.min(last, 6)); ph.pluck = c.notes; last = c.end;
        ph.flute = composePhrase(r, ch, 4, 9, SLOW_RHYTHMS, 6).notes;
      } else if (sec.name === 'interlude') {
        ph.flute = composePhrase(r, ch, 4, 10, SLOW_RHYTHMS, 7).notes;
        ph.pluck = [[CHORD[ch][2], 4], [CHORD[ch][1], 4]];
      } else { // dạo đầu và kết: đàn thưa
        const c = composePhrase(r, ch, 3, 9, SLOW_RHYTHMS, last); ph.pluck = c.notes; last = c.end;
      }
      phrases.push(ph);
    });
    if (sec.name === 'B') bMelody = phrases.map((p) => p.pluck);
    plan.push(...phrases);
  }
  return plan;
}

/**
 * Bộ phát nhạc. ctx: AudioContext (hoặc OfflineAudioContext để xuất file nghe thử).
 */
export class ZenMusic {
  constructor(ctx, destination, volume = 0.8, seed = 0) {
    this.ctx = ctx;
    this.seed = seed;
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
    this.loops = new Map();
  }

  setVolume(v) { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

  phraseAt(index) {
    const loop = Math.floor(index / LOOP_PHRASES) + this.seed;
    if (!this.loops.has(loop)) { this.loops.set(loop, buildLoop(loop)); if (this.loops.size > 3) this.loops.delete(this.loops.keys().next().value); }
    return this.loops.get(loop)[index % LOOP_PHRASES];
  }

  // Lên lịch mọi sự kiện có thời điểm trong [đã lên lịch, tEnd)
  scheduleUntil(tEnd) {
    const ctx = this.ctx, bus = this.bus;
    while (this.t0 + this.nextBeat * BEAT < tEnd) {
      const b = this.nextBeat, t = this.t0 + b * BEAT;
      const pIdx = Math.floor(b / PHRASE_BEATS), pb = b % PHRASE_BEATS;
      const ph = this.phraseAt(pIdx), sec = ph.sec;
      // Mõ gỗ
      const accent = pb % 4 === 0;
      if (sec.mo === 'all') woodblock(ctx, bus, t, accent ? 0.32 : 0.16);
      else if (sec.mo === 'soft') woodblock(ctx, bus, t, accent ? 0.2 : 0.1);
      else if (sec.mo === 'half' && pb % 2 === 0) woodblock(ctx, bus, t, accent ? 0.26 : 0.14);
      else if (sec.mo === 'fade' && pb % 2 === 0) woodblock(ctx, bus, t, 0.2 * (1 - ph.i / 4));
      if (pb === 0) {
        pad(ctx, bus, t, CHORD[ph.chord], PHRASE_BEATS * BEAT, sec.name === 'intro' || sec.name === 'outro' ? 0.09 : 0.07);
        let off = 0;
        for (const [n, len] of ph.pluck) {
          const vel = (off === 0 ? 0.62 : 0.5) + ((b + off * 3) % 5) * 0.015;
          if (sec.ornament && len >= 1 && off > 0 && (b + off) % 3 === 0) {
            const up = SCALE[Math.min(SCALE.length - 1, SCALE.indexOf(n) + 1)];
            pluck(ctx, bus, t + off * BEAT - 0.11, HZ[up], vel * 0.55, -0.15);
          }
          pluck(ctx, bus, t + off * BEAT, HZ[n], vel, -0.15);
          off += len;
        }
        let oh = 0.5;
        for (const [n, len] of ph.harmony) { pluck(ctx, bus, t + oh * BEAT, HZ[n], 0.32, 0.25); oh += len; }
        let of = 0;
        for (const [n, len] of ph.flute) { flute(ctx, bus, t + of * BEAT, HZ[n], len * BEAT * 0.95); of += len; }
        if (sec.bells && sec.bells.includes(ph.i)) templeBell(ctx, bus, t, 128, sec.name === 'outro' && ph.i === 3 ? 0.5 : 0.38);
      }
      if (sec.small && sec.small.includes(ph.i) && pb === 6) smallBell(ctx, bus, t + BEAT * 0.5);
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

export const LOOP_SECONDS = LOOP_PHRASES * PHRASE_BEATS * BEAT;
