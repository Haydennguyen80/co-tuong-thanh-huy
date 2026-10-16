import { Position, START_FEN, moveFrom, moveTo } from '../js/xiangqi.js';
import { Engine, MATE, MATE_BOUND } from '../js/engine.js';
import { moveToVN } from '../js/notation.js';
import assert from 'node:assert/strict';

const eng = new Engine(18);
// 1) Khai cuộc: máy phải trả về nước hợp lệ trong thời gian cho phép
let pos = Position.fromFen(START_FEN);
let r = eng.search(pos, { timeMs: 1500 });
console.log('khai cuộc:', moveToVN(pos, r.move), 'điểm', r.score, 'độ sâu', r.depth, 'nodes', r.nodes, Math.round(r.time) + 'ms');
assert.ok(pos.legalMoves().includes(r.move));
assert.ok(r.depth >= 5, 'độ sâu quá thấp');

// 2) Chiếu bí 1 nước: Xe đỏ xuống hàng cuối
pos = Position.fromFen('3k5/9/9/9/9/9/9/9/R8/4K4 w - - 0 1');
pos = Position.fromFen('4k4/9/4P4/9/9/9/9/9/9/R3K4 w - - 0 1');
r = eng.search(pos, { timeMs: 1000 });
console.log('bí 1:', moveToVN(pos, r.move), r.score);
assert.ok(r.score > MATE_BOUND);
pos.makeMove(r.move);
assert.equal(pos.legalMoves().length, 0);

// 3) Không để mất Xe: Đỏ đi, Xe đỏ đang bị Mã đen bắt
pos = Position.fromFen('2bakab2/9/9/9/4n4/9/3R5/9/9/2BAKAB2 w - - 0 1');
r = eng.search(pos, { timeMs: 800 });
console.log('cứu Xe:', moveToVN(pos, r.move), r.score);
assert.ok(r.score > 250);
pos.makeMove(r.move);
assert.ok(!pos.legalMoves().some((m) => moveTo(m) === moveFrom(r.move) || pos.board[moveTo(m)] === 5), 'Xe vẫn bị bắt');

// 4) Ăn quân treo
pos = Position.fromFen('2bakab2/9/9/4p4/9/2r6/9/2R6/9/2BAKAB2 w - - 0 1');
r = eng.search(pos, { timeMs: 500 });
console.log('ăn Xe:', moveToVN(pos, r.move), r.score);
assert.equal(moveTo(r.move), 2 + 5 * 9);
console.log('engine OK');
