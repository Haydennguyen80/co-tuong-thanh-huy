// Quản lý một ván cờ: lịch sử nước đi, đi lại, xác định kết quả theo luật.
import { Position, START_FEN, RED, BLACK, moveFrom, moveTo, makeMove } from './xiangqi.js';
import { moveToVN } from './notation.js';

export const REASONS = {
  checkmate: 'Chiếu bí',
  stalemate: 'Hết nước đi',
  perpetual: 'Phạm luật trường chiếu',
  repetition: 'Lặp lại thế cờ 3 lần',
  nocapture: '60 nước không ăn quân',
  material: 'Cả hai không còn quân tấn công',
  timeout: 'Hết giờ',
  resign: 'Đầu hàng',
  agreed: 'Hai bên đồng ý hòa',
  abandon: 'Đối thủ rời trận',
};

export const sideName = (c) => (c === RED ? 'Đỏ' : 'Đen');

export class Game {
  constructor(startFen = START_FEN) {
    this.startFen = startFen;
    this.pos = Position.fromFen(startFen);
    this.startTurn = this.pos.turn;
    this.moves = []; // { m, vn, short, captured, check }
    this.keys = [this.pos.hashKey()];
    this.hashes = [];
    this.result = null; // { winner: RED|BLACK|null, reason }
  }

  get turn() { return this.pos.turn; }
  get ply() { return this.moves.length; }
  get lastMove() { return this.moves.length ? this.moves[this.moves.length - 1].m : 0; }

  legalMovesFrom(sq) { return this.pos.legalMoves().filter((m) => moveFrom(m) === sq); }

  isLegal(m) { return this.pos.legalMoves().includes(m); }

  play(m) {
    if (this.result || !this.isLegal(m)) return null;
    const vn = moveToVN(this.pos, m), short = moveToVN(this.pos, m, true);
    this.hashes.push({ lo: this.pos.hashLo, hi: this.pos.hashHi });
    const captured = this.pos.makeMove(m);
    const check = this.pos.inCheck();
    const rec = { m, vn, short, captured, check };
    this.moves.push(rec);
    this.keys.push(this.pos.hashKey());
    this.result = this.computeResult();
    return rec;
  }

  playFromTo(from, to) { return this.play(makeMove(from, to)); }

  undo() {
    if (!this.moves.length) return null;
    this.pos.undoMove();
    this.keys.pop(); this.hashes.pop();
    this.result = null;
    return this.moves.pop();
  }

  setResult(winner, reason) { if (!this.result) this.result = { winner, reason }; }

  computeResult() {
    const pos = this.pos, side = pos.turn;
    if (pos.legalMoves().length === 0) {
      return { winner: side ^ 1, reason: pos.inCheck() ? 'checkmate' : 'stalemate' };
    }
    const n = this.moves.length, key = this.keys[n];
    let count = 0, prev = -1;
    for (let i = n - 2; i >= 0; i -= 2) if (this.keys[i] === key) { count++; if (prev < 0) prev = i; }
    if (count >= 2) {
      // Xét chu kỳ từ lần xuất hiện gần nhất: ai chiếu liên tục mà bên kia không thì xử thua
      let moverAll = true, oppAll = true;
      for (let i = n; i > prev; i--) {
        const gaveCheck = this.moves[i - 1].check;
        if ((n - i) % 2 === 0) moverAll = moverAll && gaveCheck; else oppAll = oppAll && gaveCheck;
      }
      const mover = side ^ 1;
      if (moverAll && !oppAll) return { winner: side, reason: 'perpetual' };
      if (oppAll && !moverAll) return { winner: mover, reason: 'perpetual' };
      return { winner: null, reason: 'repetition' };
    }
    let quiet = 0;
    for (let i = n - 1; i >= 0 && !this.moves[i].captured; i--) quiet++;
    if (quiet >= 120) return { winner: null, reason: 'nocapture' };
    if (!pos.hasAttackers(RED) && !pos.hasAttackers(BLACK)) return { winner: null, reason: 'material' };
    return null;
  }

  // Thế cờ sau k nước (k từ 0..ply), trả về Position mới
  positionAt(k) {
    const p = Position.fromFen(this.startFen);
    for (let i = 0; i < k; i++) p.makeMove(this.moves[i].m);
    return p;
  }

  moveList() { return this.moves.map((r) => r.m); }

  toJSON() { return { startFen: this.startFen, moves: this.moveList(), result: this.result }; }

  static fromJSON(data) {
    const g = new Game(data.startFen || START_FEN);
    for (const m of data.moves || []) if (!g.play(m)) break;
    if (data.result) g.result = data.result;
    return g;
  }
}

export function resultText(result, perspective = null) {
  if (!result) return '';
  const why = REASONS[result.reason] || '';
  if (result.winner === null || result.winner === undefined) return `Hòa — ${why}`;
  if (perspective === null) return `${sideName(result.winner)} thắng — ${why}`;
  return (result.winner === perspective ? 'Bạn thắng' : 'Bạn thua') + ` — ${why}`;
}

export { moveFrom, moveTo };
