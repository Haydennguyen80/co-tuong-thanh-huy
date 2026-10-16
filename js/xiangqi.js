// Luật cờ tướng: bàn cờ, sinh nước đi, kiểm tra chiếu, FEN, mã băm Zobrist.
// Bàn cờ 10 hàng x 9 cột, ô = hàng*9 + cột. Hàng 0 là hàng cuối của Đen (phía trên),
// hàng 9 là hàng cuối của Đỏ (phía dưới).

export const KING = 1, ADVISOR = 2, BISHOP = 3, KNIGHT = 4, ROOK = 5, CANNON = 6, PAWN = 7;
export const RED = 0, BLACK = 1;
export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

export const colorOf = (p) => p >> 3;
export const typeOf = (p) => p & 7;
export const makePiece = (type, color) => type | (color << 3);
export const rowOf = (sq) => (sq / 9) | 0;
export const colOf = (sq) => sq % 9;
export const SQ = (r, c) => r * 9 + c;
export const moveFrom = (m) => m & 127;
export const moveTo = (m) => m >> 7;
export const makeMove = (from, to) => from | (to << 7);

const FEN_TYPES = { k: KING, a: ADVISOR, b: BISHOP, e: BISHOP, n: KNIGHT, h: KNIGHT, r: ROOK, c: CANNON, p: PAWN };
const TYPE_FEN = ['', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];

const inBoard = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
const inPalace = (r, c, color) => c >= 3 && c <= 5 && (color === RED ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
const ownSide = (r, color) => (color === RED ? r >= 5 : r <= 4);

// ---------- Bảng nước đi dựng sẵn ----------
const KING_MOVES = [[], []], ADV_MOVES = [[], []], BISHOP_MOVES = [[], []], PAWN_MOVES = [[], []];
const KNIGHT_MOVES = [], KNIGHT_ATTACKERS = [], RAYS = [];
const PAWN_ATTACKERS = [[], []]; // PAWN_ATTACKERS[màu tốt][ô bị tấn công] = các ô tốt đứng
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const KNIGHT_D = [[-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0], [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]];

for (let sq = 0; sq < 90; sq++) { KNIGHT_ATTACKERS[sq] = []; PAWN_ATTACKERS[0][sq] = []; PAWN_ATTACKERS[1][sq] = []; }
for (let sq = 0; sq < 90; sq++) {
  const r = rowOf(sq), c = colOf(sq);
  for (const color of [RED, BLACK]) {
    KING_MOVES[color][sq] = ORTHO.filter(([dr, dc]) => inPalace(r + dr, c + dc, color)).map(([dr, dc]) => SQ(r + dr, c + dc));
    ADV_MOVES[color][sq] = DIAG.filter(([dr, dc]) => inPalace(r + dr, c + dc, color)).map(([dr, dc]) => SQ(r + dr, c + dc));
    BISHOP_MOVES[color][sq] = DIAG.filter(([dr, dc]) => inBoard(r + 2 * dr, c + 2 * dc) && ownSide(r + 2 * dr, color))
      .map(([dr, dc]) => [SQ(r + 2 * dr, c + 2 * dc), SQ(r + dr, c + dc)]);
    const fwd = color === RED ? -1 : 1;
    const pm = [];
    if (inBoard(r + fwd, c)) pm.push(SQ(r + fwd, c));
    if (!ownSide(r, color)) { if (c > 0) pm.push(SQ(r, c - 1)); if (c < 8) pm.push(SQ(r, c + 1)); }
    PAWN_MOVES[color][sq] = pm;
    for (const to of pm) PAWN_ATTACKERS[color][to].push(sq);
  }
  KNIGHT_MOVES[sq] = [];
  for (const [dr, dc, lr, lc] of KNIGHT_D) {
    if (!inBoard(r + dr, c + dc)) continue;
    const to = SQ(r + dr, c + dc), leg = SQ(r + lr, c + lc);
    KNIGHT_MOVES[sq].push([to, leg]);
    KNIGHT_ATTACKERS[to].push([sq, leg]);
  }
  RAYS[sq] = ORTHO.map(([dr, dc]) => {
    const ray = [];
    for (let rr = r + dr, cc = c + dc; inBoard(rr, cc); rr += dr, cc += dc) ray.push(SQ(rr, cc));
    return ray;
  });
}

// ---------- Zobrist ----------
let seed = 0x9E3779B9;
function rnd32() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
export const ZOB_LO = new Uint32Array(16 * 90), ZOB_HI = new Uint32Array(16 * 90);
for (let i = 0; i < 16 * 90; i++) { ZOB_LO[i] = rnd32(); ZOB_HI[i] = rnd32(); }
const ZOB_SIDE_LO = rnd32(), ZOB_SIDE_HI = rnd32();

// ---------- Bảng giá trị quân + vị trí (theo phía Đỏ, hàng 0 = phía Đen) ----------
export const PIECE_VALUE = [0, 0, 200, 200, 400, 900, 450, 100];
const PST = [];
PST[PAWN] = [
  0, 3, 6, 9, 12, 9, 6, 3, 0,
  18, 36, 56, 80, 120, 80, 56, 36, 18,
  14, 26, 42, 60, 80, 60, 42, 26, 14,
  10, 20, 30, 34, 40, 34, 30, 20, 10,
  6, 12, 18, 18, 20, 18, 18, 12, 6,
  2, 0, 8, 0, 8, 0, 8, 0, 2,
  0, 0, -2, 0, 4, 0, -2, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0];
PST[KNIGHT] = [
  4, 8, 16, 12, 4, 12, 16, 8, 4,
  4, 10, 28, 16, 8, 16, 28, 10, 4,
  12, 14, 16, 20, 18, 20, 16, 14, 12,
  8, 24, 18, 24, 20, 24, 18, 24, 8,
  6, 16, 14, 18, 16, 18, 14, 16, 6,
  4, 12, 16, 14, 12, 14, 16, 12, 4,
  2, 6, 8, 6, 10, 6, 8, 6, 2,
  4, 2, 8, 8, 4, 8, 8, 2, 4,
  0, 2, 4, 4, -2, 4, 4, 2, 0,
  0, -4, 0, 0, 0, 0, 0, -4, 0];
PST[ROOK] = [
  14, 14, 12, 18, 16, 18, 12, 14, 14,
  16, 20, 18, 24, 26, 24, 18, 20, 16,
  12, 12, 12, 18, 18, 18, 12, 12, 12,
  12, 18, 16, 22, 22, 22, 16, 18, 12,
  12, 14, 12, 18, 18, 18, 12, 14, 12,
  12, 16, 14, 20, 20, 20, 14, 16, 12,
  6, 10, 8, 14, 14, 14, 8, 10, 6,
  4, 8, 6, 14, 12, 14, 6, 8, 4,
  8, 4, 8, 16, 8, 16, 8, 4, 8,
  -2, 10, 6, 14, 12, 14, 6, 10, -2];
PST[CANNON] = [
  6, 4, 0, -10, -12, -10, 0, 4, 6,
  2, 2, 0, -4, -14, -4, 0, 2, 2,
  2, 2, 0, -10, -8, -10, 0, 2, 2,
  0, 0, -2, 4, 10, 4, -2, 0, 0,
  0, 0, 0, 2, 8, 2, 0, 0, 0,
  -2, 0, 4, 2, 6, 2, 4, 0, -2,
  0, 0, 0, 2, 4, 2, 0, 0, 0,
  4, 0, 8, 6, 10, 6, 8, 0, 4,
  0, 2, 4, 6, 6, 6, 4, 2, 0,
  0, 0, 2, 6, 6, 6, 2, 0, 0];
PST[ADVISOR] = new Array(90).fill(0); PST[ADVISOR][SQ(8, 4)] = 4;
PST[BISHOP] = new Array(90).fill(0); PST[BISHOP][SQ(7, 4)] = 4; PST[BISHOP][SQ(9, 2)] = 1; PST[BISHOP][SQ(9, 6)] = 1;
PST[KING] = new Array(90).fill(0); PST[KING][SQ(8, 4)] = -4; PST[KING][SQ(7, 4)] = -10;
PST[KING][SQ(9, 3)] = -2; PST[KING][SQ(9, 5)] = -2; PST[KING][SQ(8, 3)] = -6; PST[KING][SQ(8, 5)] = -6;
PST[KING][SQ(7, 3)] = -12; PST[KING][SQ(7, 5)] = -12;

// VAL[quân][ô]: điểm theo phía Đỏ (Đỏ dương, Đen âm)
export const VAL = [];
for (let p = 0; p < 16; p++) VAL[p] = new Int16Array(90);
for (let t = 1; t <= 7; t++) {
  for (let sq = 0; sq < 90; sq++) {
    const mirror = SQ(9 - rowOf(sq), colOf(sq));
    VAL[makePiece(t, RED)][sq] = PIECE_VALUE[t] + PST[t][sq];
    VAL[makePiece(t, BLACK)][sq] = -(PIECE_VALUE[t] + PST[t][mirror]);
  }
}

export class Position {
  constructor() {
    this.board = new Int8Array(90);
    this.turn = RED;
    this.kingSq = [-1, -1];
    this.hashLo = 0; this.hashHi = 0;
    this.score = 0; // điểm theo phía Đỏ (dùng cho máy)
    this.stack = []; // lịch sử để đi lại
  }

  static fromFen(fen) {
    const pos = new Position();
    const [placement, side] = fen.trim().split(/\s+/);
    const rows = placement.split('/');
    if (rows.length !== 10) throw new Error('FEN không hợp lệ');
    rows.forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { c += +ch; continue; }
        const t = FEN_TYPES[ch.toLowerCase()];
        if (!t || c > 8) throw new Error('FEN không hợp lệ');
        pos.put(SQ(r, c), makePiece(t, ch === ch.toUpperCase() ? RED : BLACK));
        c++;
      }
      if (c !== 9) throw new Error('FEN không hợp lệ');
    });
    if (side === 'b') { pos.turn = BLACK; pos.hashLo ^= ZOB_SIDE_LO; pos.hashHi ^= ZOB_SIDE_HI; }
    if (pos.kingSq[0] < 0 || pos.kingSq[1] < 0) throw new Error('Thiếu Tướng');
    return pos;
  }

  toFen() {
    let out = '';
    for (let r = 0; r < 10; r++) {
      let empty = 0;
      for (let c = 0; c < 9; c++) {
        const p = this.board[SQ(r, c)];
        if (!p) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        const ch = TYPE_FEN[typeOf(p)];
        out += colorOf(p) === RED ? ch.toUpperCase() : ch;
      }
      if (empty) out += empty;
      if (r < 9) out += '/';
    }
    return out + (this.turn === RED ? ' w' : ' b') + ' - - 0 1';
  }

  clone() { return Position.fromFen(this.toFen()); }

  put(sq, p) {
    this.board[sq] = p;
    this.hashLo ^= ZOB_LO[p * 90 + sq]; this.hashHi ^= ZOB_HI[p * 90 + sq];
    this.score += VAL[p][sq];
    if (typeOf(p) === KING) this.kingSq[colorOf(p)] = sq;
  }

  remove(sq) {
    const p = this.board[sq];
    this.board[sq] = 0;
    this.hashLo ^= ZOB_LO[p * 90 + sq]; this.hashHi ^= ZOB_HI[p * 90 + sq];
    this.score -= VAL[p][sq];
    return p;
  }

  makeMove(m) {
    const from = moveFrom(m), to = moveTo(m);
    const captured = this.board[to];
    this.stack.push(m | (captured << 14));
    if (captured) this.remove(to);
    this.put(to, this.remove(from));
    this.turn ^= 1; this.hashLo ^= ZOB_SIDE_LO; this.hashHi ^= ZOB_SIDE_HI;
    return captured;
  }

  undoMove() {
    const e = this.stack.pop();
    const m = e & 16383, captured = e >> 14;
    const from = moveFrom(m), to = moveTo(m);
    this.turn ^= 1; this.hashLo ^= ZOB_SIDE_LO; this.hashHi ^= ZOB_SIDE_HI;
    this.put(from, this.remove(to));
    if (captured) this.put(to, captured);
  }

  makeNull() { this.stack.push(-1); this.turn ^= 1; this.hashLo ^= ZOB_SIDE_LO; this.hashHi ^= ZOB_SIDE_HI; }
  undoNull() { this.stack.pop(); this.turn ^= 1; this.hashLo ^= ZOB_SIDE_LO; this.hashHi ^= ZOB_SIDE_HI; }

  // Ô sq có bị bên `by` tấn công không (dùng cho ô Tướng; có tính luật "lộ mặt tướng")
  isAttacked(sq, by) {
    const b = this.board;
    const rays = RAYS[sq];
    for (let d = 0; d < 4; d++) {
      const ray = rays[d];
      let i = 0;
      for (; i < ray.length; i++) if (b[ray[i]]) break;
      if (i >= ray.length) continue;
      const p = b[ray[i]];
      if (colorOf(p) === by) {
        const t = typeOf(p);
        if (t === ROOK) return true;
        if (t === KING && d < 2) return true; // hai tướng đối mặt
      }
      for (i++; i < ray.length; i++) {
        const q = b[ray[i]];
        if (q) { if (q === makePiece(CANNON, by)) return true; break; }
      }
    }
    const kn = KNIGHT_ATTACKERS[sq], enemyKnight = makePiece(KNIGHT, by);
    for (let i = 0; i < kn.length; i++) if (b[kn[i][0]] === enemyKnight && !b[kn[i][1]]) return true;
    const pa = PAWN_ATTACKERS[by][sq], enemyPawn = makePiece(PAWN, by);
    for (let i = 0; i < pa.length; i++) if (b[pa[i]] === enemyPawn) return true;
    const ka = KING_MOVES[by][sq], enemyKing = makePiece(KING, by);
    for (let i = 0; i < ka.length; i++) if (b[ka[i]] === enemyKing) return true;
    return false;
  }

  inCheck(color = this.turn) { return this.isAttacked(this.kingSq[color], color ^ 1); }

  // Sinh nước đi giả hợp lệ (chưa kiểm tra tự chiếu). capturesOnly: chỉ nước ăn quân.
  genMoves(capturesOnly = false) {
    const b = this.board, me = this.turn, out = [];
    const add = (from, to) => {
      const q = b[to];
      if (q) { if (colorOf(q) !== me) out.push(from | (to << 7)); }
      else if (!capturesOnly) out.push(from | (to << 7));
    };
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq];
      if (!p || colorOf(p) !== me) continue;
      switch (typeOf(p)) {
        case KING: for (const to of KING_MOVES[me][sq]) add(sq, to); break;
        case ADVISOR: for (const to of ADV_MOVES[me][sq]) add(sq, to); break;
        case BISHOP: for (const [to, eye] of BISHOP_MOVES[me][sq]) if (!b[eye]) add(sq, to); break;
        case KNIGHT: for (const [to, leg] of KNIGHT_MOVES[sq]) if (!b[leg]) add(sq, to); break;
        case PAWN: for (const to of PAWN_MOVES[me][sq]) add(sq, to); break;
        case ROOK:
          for (const ray of RAYS[sq]) for (const to of ray) {
            if (b[to]) { if (colorOf(b[to]) !== me) out.push(sq | (to << 7)); break; }
            if (!capturesOnly) out.push(sq | (to << 7));
          }
          break;
        case CANNON:
          for (const ray of RAYS[sq]) {
            let i = 0;
            for (; i < ray.length; i++) { if (b[ray[i]]) break; if (!capturesOnly) out.push(sq | (ray[i] << 7)); }
            for (i++; i < ray.length; i++) {
              const q = b[ray[i]];
              if (q) { if (colorOf(q) !== me) out.push(sq | (ray[i] << 7)); break; }
            }
          }
          break;
      }
    }
    return out;
  }

  // Nước đi có để Tướng mình bị chiếu không
  isLegal(m) {
    const me = this.turn;
    this.makeMove(m);
    const ok = !this.isAttacked(this.kingSq[me], me ^ 1);
    this.undoMove();
    return ok;
  }

  legalMoves() { return this.genMoves().filter((m) => this.isLegal(m)); }

  // Có còn quân tấn công (Xe, Mã, Pháo, Tốt) không
  hasAttackers(color) {
    for (let sq = 0; sq < 90; sq++) {
      const p = this.board[sq];
      if (p && colorOf(p) === color) { const t = typeOf(p); if (t === ROOK || t === KNIGHT || t === CANNON || t === PAWN) return true; }
    }
    return false;
  }

  hashKey() { return this.hashHi.toString(36) + ':' + (this.hashLo >>> 0).toString(36); }
}
