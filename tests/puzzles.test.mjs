// Kiểm tra mọi bài cờ thế: máy (với độ sâu app dùng) phải tìm ra chiếu bí đúng số nước.
import { Position } from '../js/xiangqi.js';
import { Engine, MATE } from '../js/engine.js';
import { PUZZLES } from '../js/puzzles.js';
import assert from 'node:assert/strict';
const eng = new Engine(18);
for (const p of PUZZLES) {
  const pos = Position.fromFen(p.fen);
  eng.clear();
  const t = Date.now();
  const r = eng.search(pos, { timeMs: 15000, maxDepth: 2 * p.mateIn + 1 });
  const plies = MATE - r.score;
  assert.equal(plies, 2 * p.mateIn - 1, `Bài ${p.id}: tìm ra ${plies} nửa nước`);
  if (Date.now() - t > 3000) console.log(`Bài ${p.id} chậm: ${Date.now() - t}ms`);
}
console.log(`puzzles OK (${PUZZLES.length} bài)`);
