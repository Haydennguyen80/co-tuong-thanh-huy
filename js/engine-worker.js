// Chạy máy cờ trong luồng riêng để giao diện không bị đứng.
import { Engine, historyFrom } from './engine.js';

const engine = new Engine(19);

self.onmessage = (e) => {
  const { id, type, startFen, moves = [] } = e.data;
  try {
    const { pos, history } = historyFrom(startFen, moves);
    let result;
    if (type === 'move') {
      result = engine.pickMove(pos, e.data.level, history);
    } else if (type === 'analyze') {
      result = { lines: engine.analyze(pos, { timeMs: e.data.timeMs, lines: e.data.lines || 3, history }) };
    } else if (type === 'search') {
      result = engine.search(pos, { timeMs: e.data.timeMs, maxDepth: e.data.maxDepth || 64, history });
    } else if (type === 'clear') {
      engine.clear();
      result = {};
    } else throw new Error('Lệnh không rõ: ' + type);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
