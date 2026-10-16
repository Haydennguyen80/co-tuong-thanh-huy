// Sinh bài cờ thế ngẫu nhiên và kiểm chứng bằng máy: Đỏ đi trước, chiếu bí đúng N nước, nước đầu duy nhất.
import { Position, KING, ADVISOR, BISHOP, KNIGHT, ROOK, CANNON, PAWN, RED, BLACK, makePiece, SQ } from '../js/xiangqi.js';
import { Engine, MATE, MATE_BOUND } from '../js/engine.js';

let s = +(process.argv[2] || 12345);
const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rand() * a.length)];
const eng = new Engine(20);
const want = { 1: 6, 2: 12, 3: 12 };
const found = { 1: [], 2: [], 3: [] };
const ADV_B = [SQ(0, 3), SQ(0, 5), SQ(1, 4), SQ(2, 3), SQ(2, 5)];
const BIS_B = [SQ(0, 2), SQ(0, 6), SQ(2, 0), SQ(2, 4), SQ(2, 8), SQ(4, 2), SQ(4, 6)];
const KING_B = [SQ(0, 3), SQ(0, 4), SQ(0, 5), SQ(1, 3), SQ(1, 4), SQ(1, 5), SQ(2, 4)];
const KING_R = [SQ(9, 3), SQ(9, 4), SQ(9, 5), SQ(8, 4)];
let tries = 0;
while ((found[1].length < want[1] || found[2].length < want[2] || found[3].length < want[3]) && tries < 200000) {
  tries++;
  const board = new Array(90).fill(0);
  const place = (sq, p) => { if (board[sq]) return false; board[sq] = p; return true; };
  place(pick(KING_B), makePiece(KING, BLACK));
  place(pick(KING_R), makePiece(KING, RED));
  const nAdv = Math.floor(rand() * 3), nBis = Math.floor(rand() * 3);
  for (let i = 0; i < nAdv; i++) place(pick(ADV_B), makePiece(ADVISOR, BLACK));
  for (let i = 0; i < nBis; i++) place(pick(BIS_B), makePiece(BISHOP, BLACK));
  if (rand() < 0.5) place(SQ(Math.floor(rand() * 5) + 5, Math.floor(rand() * 9)), makePiece(pick([PAWN, PAWN, ROOK, KNIGHT, CANNON]), BLACK));
  if (rand() < 0.4) { const t = pick([PAWN, KNIGHT, CANNON]); place(SQ(t === PAWN ? 3 + Math.floor(rand() * 2) : Math.floor(rand() * 4), Math.floor(rand() * 9)), makePiece(t, BLACK)); }
  const nAtt = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < nAtt; i++) {
    const t = pick([ROOK, ROOK, KNIGHT, KNIGHT, CANNON, CANNON, PAWN]);
    const r = t === PAWN ? Math.floor(rand() * 4) : Math.floor(rand() * 7);
    place(SQ(r, Math.floor(rand() * 9)), makePiece(t, RED));
  }
  // Số quân mỗi loại phải hợp lệ (Xe/Mã/Pháo tối đa 2)
  const cnt = {};
  for (const p of board) if (p) cnt[p] = (cnt[p] || 0) + 1;
  if (Object.entries(cnt).some(([p, n]) => ((p & 7) >= KNIGHT && (p & 7) <= CANNON && n > 2) || ((p & 7) === PAWN && n > 5))) continue;
  // dựng FEN
  let fen = '';
  const ch = ['', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];
  for (let r = 0; r < 10; r++) {
    let e = 0;
    for (let c = 0; c < 9; c++) { const p = board[SQ(r, c)]; if (!p) { e++; continue; } if (e) { fen += e; e = 0; } const x = ch[p & 7]; fen += (p >> 3) ? x : x.toUpperCase(); }
    if (e) fen += e; if (r < 9) fen += '/';
  }
  fen += ' w - - 0 1';
  let pos;
  try { pos = Position.fromFen(fen); } catch { continue; }
  // Đen không đang bị chiếu, Đỏ không bị chiếu, Đỏ phải có nước
  if (pos.inCheck(BLACK) || pos.inCheck(RED) || !pos.legalMoves().length) continue;
  // Tốt đỏ phải ở vị trí hợp lệ (đã qua sông hoặc hàng 5-6) - đã đảm bảo r<4
  eng.clear();
  const r = eng.search(pos, { timeMs: 0, maxDepth: 5 });
  if (r.score <= MATE_BOUND) continue;
  const plies = MATE - r.score;
  const n = (plies + 1) / 2;
  if (!found[n] || found[n].length >= want[n]) continue;
  // Nước đầu duy nhất
  const r2 = eng.search(pos, { timeMs: 0, maxDepth: plies, exclude: [r.move] });
  if (r2.score > MATE_BOUND && MATE - r2.score <= plies) continue;
  // Bài phải "có vấn đề": không có quá nhiều nước chiếu
  found[n].push(fen);
  process.stderr.write(`mate-in-${n}: ${fen}\n`);
}
console.log(JSON.stringify(found, null, 1));
