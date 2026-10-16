// Đồng hồ cờ hai bên. baseMs = null nghĩa là không giới hạn thời gian.
export const TIME_CONTROLS = [
  { id: 'none', label: 'Không giới hạn', base: null, inc: 0 },
  { id: '5+3', label: '5 phút + 3 giây', base: 5, inc: 3 },
  { id: '10', label: '10 phút', base: 10, inc: 0 },
  { id: '10+5', label: '10 phút + 5 giây', base: 10, inc: 5 },
  { id: '15', label: '15 phút', base: 15, inc: 0 },
  { id: '15+10', label: '15 phút + 10 giây', base: 15, inc: 10 },
  { id: '20', label: '20 phút', base: 20, inc: 0 },
  { id: '30', label: '30 phút', base: 30, inc: 0 },
  { id: '45', label: '45 phút', base: 45, inc: 0 },
  { id: '60', label: '60 phút', base: 60, inc: 0 },
];

export const findTimeControl = (id) => TIME_CONTROLS.find((t) => t.id === id) || TIME_CONTROLS[0];

export class Clock {
  constructor(tc, { onTick, onFlag } = {}) {
    this.tc = tc;
    this.unlimited = tc.base === null;
    this.remaining = this.unlimited ? [0, 0] : [tc.base * 60000, tc.base * 60000];
    this.inc = (tc.inc || 0) * 1000;
    this.active = null; this.last = 0; this.timer = null;
    this.onTick = onTick; this.onFlag = onFlag;
  }

  now() { return performance.now(); }

  start(side) {
    this.settle();
    this.active = side; this.last = this.now();
    if (!this.timer) this.timer = setInterval(() => this.tick(), 100);
    this.emit();
  }

  // Bên `side` vừa đi xong: cộng giây và chuyển đồng hồ
  punch(side) {
    this.settle();
    if (!this.unlimited) this.remaining[side] += this.inc;
    this.active = side ^ 1; this.last = this.now();
    if (!this.timer) this.timer = setInterval(() => this.tick(), 100);
    this.emit();
  }

  settle() {
    if (this.active === null) return;
    const t = this.now();
    const dt = t - this.last;
    this.last = t;
    if (this.unlimited) this.remaining[this.active] += dt; // đếm thời gian đã dùng
    else this.remaining[this.active] -= dt;
  }

  tick() {
    if (this.active === null) return;
    this.settle();
    if (!this.unlimited && this.remaining[this.active] <= 0) {
      this.remaining[this.active] = 0;
      const side = this.active;
      this.stop();
      this.emit();
      if (this.onFlag) this.onFlag(side);
      return;
    }
    this.emit();
  }

  pause() { this.settle(); this.active = null; }

  stop() {
    this.settle();
    this.active = null;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  set(times) { this.settle(); this.remaining = [...times]; this.emit(); }

  emit() { if (this.onTick) this.onTick(this.remaining, this.active); }

  static format(ms, unlimited = false) {
    if (ms < 0) ms = 0;
    const totalSec = unlimited ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
    if (!unlimited && ms < 10000) return (ms / 1000).toFixed(1);
    const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
}
