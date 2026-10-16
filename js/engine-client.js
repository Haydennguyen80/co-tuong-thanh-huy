// Gửi việc cho máy cờ (Web Worker) và nhận kết quả dạng Promise.
export class EngineClient {
  constructor() { this.seq = 0; this.pending = new Map(); this.start(); }

  start() {
    this.worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      ok ? p.resolve(result) : p.reject(new Error(error));
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'Lỗi máy cờ'));
      this.pending.clear();
    };
  }

  request(msg) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id });
    });
  }

  // Hủy mọi việc đang tính (ví dụ khi người chơi đi lại hoặc thoát ván)
  cancel() {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
    this.pending.clear();
    this.start();
  }

  get busy() { return this.pending.size > 0; }

  bestMove(startFen, moves, level) { return this.request({ type: 'move', startFen, moves, level }); }
  analyze(startFen, moves, timeMs = 1500, lines = 3) { return this.request({ type: 'analyze', startFen, moves, timeMs, lines }); }
  search(startFen, moves, timeMs = 1000, maxDepth = 64) { return this.request({ type: 'search', startFen, moves, timeMs, maxDepth }); }
}
