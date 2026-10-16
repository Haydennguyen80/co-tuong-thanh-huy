// Ký hiệu nước đi kiểu Việt Nam: "Pháo 2 bình 5", "Mã 8 tấn 7", "Xe trước thoái 2".
import { KING, ADVISOR, BISHOP, KNIGHT, ROOK, CANNON, PAWN, RED, colorOf, typeOf, rowOf, colOf, moveFrom, moveTo } from './xiangqi.js';

export const NAME_VN = ['', 'Tướng', 'Sĩ', 'Tượng', 'Mã', 'Xe', 'Pháo', 'Tốt'];
export const SHORT_VN = ['', 'Tg', 'S', 'T', 'M', 'X', 'P', 'B'];
export const CHAR_RED = ['', '帥', '仕', '相', '傌', '俥', '炮', '兵'];
export const CHAR_BLACK = ['', '將', '士', '象', '馬', '車', '砲', '卒'];
export const pieceChar = (p) => (colorOf(p) === RED ? CHAR_RED : CHAR_BLACK)[typeOf(p)];
export const pieceName = (p) => NAME_VN[typeOf(p)];

const fileNo = (col, color) => (color === RED ? 9 - col : col + 1);

// pos: thế cờ TRƯỚC khi đi. Trả về chuỗi đầy đủ; short=true trả về dạng gọn "P2-5".
export function moveToVN(pos, m, short = false) {
  if (!m) return '';
  const from = moveFrom(m), to = moveTo(m);
  const p = pos.board[from];
  if (!p) return '?';
  const t = typeOf(p), color = colorOf(p);
  const fr = rowOf(from), fc = colOf(from), tr = rowOf(to), tc = colOf(to);
  const fwd = color === RED ? fr - tr : tr - fr; // >0 là tiến

  // Phân biệt khi có nhiều quân cùng loại trên cùng một cột
  let qualifier = '';
  if (t !== KING) {
    const same = [];
    for (let r = 0; r < 10; r++) if (pos.board[r * 9 + fc] === p) same.push(r);
    if (same.length > 1) {
      same.sort((a, b) => (color === RED ? a - b : b - a)); // quân phía trước đứng đầu
      const idx = same.indexOf(fr);
      if (same.length === 2) qualifier = idx === 0 ? 'trước' : 'sau';
      else qualifier = idx === 0 ? 'trước' : idx === same.length - 1 ? 'sau' : 'giữa';
    }
  }

  const straight = t === KING || t === ROOK || t === CANNON || t === PAWN;
  let action, num;
  if (fr === tr) { action = 'bình'; num = fileNo(tc, color); }
  else {
    action = fwd > 0 ? 'tấn' : 'thoái';
    num = straight ? Math.abs(fr - tr) : fileNo(tc, color);
  }
  if (short) {
    const sym = action === 'bình' ? '-' : action === 'tấn' ? '.' : '/';
    const head = qualifier ? SHORT_VN[t] + (qualifier === 'trước' ? 't' : qualifier === 'sau' ? 's' : 'g') : SHORT_VN[t] + fileNo(fc, color);
    return head + sym + num;
  }
  const head = qualifier ? `${NAME_VN[t]} ${qualifier}` : `${NAME_VN[t]} ${fileNo(fc, color)}`;
  return `${head} ${action} ${num}`;
}

// Danh sách nước đi dạng chuỗi từ thế cờ pos (không làm thay đổi pos)
export function lineToVN(pos, moves, short = false) {
  const out = [];
  let made = 0;
  for (const m of moves) {
    if (!pos.genMoves().includes(m) || !pos.isLegal(m)) break;
    out.push(moveToVN(pos, m, short));
    pos.makeMove(m); made++;
  }
  while (made--) pos.undoMove();
  return out;
}

export function formatScore(score) {
  if (score > 29000) return `Chiếu bí sau ${Math.ceil((30000 - score) / 2)} nước`;
  if (score < -29000) return `Bị chiếu bí sau ${Math.ceil((30000 + score) / 2)} nước`;
  const v = score / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}
