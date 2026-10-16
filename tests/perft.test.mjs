import { Position, START_FEN } from '../js/xiangqi.js';
import assert from 'node:assert/strict';
function perft(pos, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of pos.genMoves()) { if (!pos.isLegal(m)) continue; pos.makeMove(m); n += perft(pos, d - 1); pos.undoMove(); }
  return n;
}
const pos = Position.fromFen(START_FEN);
const h0 = pos.hashKey();
const expected = [1, 44, 1920, 79666, 3290240];
const maxD = +(process.env.PERFT_DEPTH || 4);
for (let d = 1; d <= maxD; d++) {
  const t = Date.now(); const n = perft(pos, d);
  console.log(`perft(${d}) = ${n} (${Date.now() - t}ms)`);
  assert.equal(n, expected[d]);
}
assert.equal(pos.hashKey(), h0);
assert.equal(pos.toFen(), START_FEN);
const extra = [
  ['r1ba1a3/4kn3/2n1b4/pNp1p1p1p/4c4/6P2/P1P2R2P/1CcC5/9/2BAKAB2 w - - 0 1', [38, 1128, 43929, 1339047]],
  ['1cbak4/9/n2a5/2p1p3p/5cp2/2n2N3/6PCP/3AB4/2C6/3A1K1N1 w - - 0 1', [7, 281, 8620, 326201]],
  ['5a3/3k5/3aR4/9/5r3/5n3/9/3A1A3/5K3/2BC2B2 w - - 0 1', [25, 424, 9850, 202884]],
];
for (const [fen, counts] of extra) {
  const p = Position.fromFen(fen);
  counts.forEach((c, i) => assert.equal(perft(p, i + 1), c, fen + ' depth ' + (i + 1)));
}
console.log('perft OK');
