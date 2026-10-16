import { Position, START_FEN, makeMove, SQ } from '../js/xiangqi.js';
import { Engine, historyFrom } from '../js/engine.js';
import { buildAdvice, grade } from '../js/coach.js';
import { Game } from '../js/game.js';
import assert from 'node:assert/strict';

const eng = new Engine(18);
function advise(fen, move) {
  const before = Position.fromFen(fen);
  const lines = eng.analyze(before.clone(), { timeMs: 900, lines: 3 });
  let found = lines.find((l) => l.move === move), playedScore, replyPV = [];
  if (found) { playedScore = found.score; replyPV = found.pv.slice(1); }
  else { const p = before.clone(); p.makeMove(move); const r = eng.search(p, { timeMs: 600 }); playedScore = -r.score; replyPV = r.pv; }
  return buildAdvice({ before, played: move, lines, playedScore, replyPV });
}
// Hớ: Xe đỏ đi vào chỗ bị Xe đen ăn
const fen = '3k5/9/r8/9/9/9/9/2R6/9/4K4 w - - 0 1';
const bad = advise(fen, makeMove(SQ(7, 2), SQ(7, 0)));
console.log(bad.grade.label, '|', bad.summary, '|', bad.points.join(' / '), '|', bad.evalText);
assert.ok(['mistake', 'blunder'].includes(bad.grade.tone));
assert.ok(bad.points.some((p) => p.includes('ăn Xe')));
const good = advise(START_FEN, makeMove(SQ(7, 7), SQ(7, 4)));
console.log(good.grade.label, '|', good.summary, '|', good.points.join(' / '));
assert.ok(['best', 'good', 'ok'].includes(good.grade.tone));
assert.equal(grade(100, 100, true), 'best');
assert.equal(grade(100, -500, false), 'blunder');
assert.equal(grade(29990, 200, false), 'mistake');

// Luật trường chiếu: Đỏ chiếu liên tục, lặp 3 lần -> Đỏ thua
const g = new Game('3k5/9/9/9/9/9/9/9/9/R4K3 w - - 0 1');
const seq = [[SQ(9, 0), SQ(9, 3)], [SQ(0, 3), SQ(0, 4)], [SQ(9, 3), SQ(9, 4)], [SQ(0, 4), SQ(0, 3)],
  [SQ(9, 4), SQ(9, 3)], [SQ(0, 3), SQ(0, 4)], [SQ(9, 3), SQ(9, 4)], [SQ(0, 4), SQ(0, 3)],
  [SQ(9, 4), SQ(9, 3)]];
for (const [a, b] of seq) assert.ok(g.play(makeMove(a, b)), 'nước không hợp lệ ' + a + '-' + b);
console.log('kết quả:', g.result);
assert.deepEqual(g.result, { winner: 1, reason: 'perpetual' });

// Chiếu bí
const g3 = new Game('4k4/9/4P4/9/9/9/9/9/9/R3K4 w - - 0 1');
g3.play(makeMove(SQ(9, 0), SQ(0, 0)));
assert.deepEqual(g3.result, { winner: 0, reason: 'checkmate' });
// Hết quân tấn công -> hòa
const g4 = new Game('3k5/9/9/9/9/9/9/9/4p4/3K5 w - - 0 1');
g4.play(makeMove(SQ(9, 3), SQ(8, 3)));
assert.ok(g4.legalMovesFrom(SQ(8, 3)) !== null);
console.log('coach OK');
