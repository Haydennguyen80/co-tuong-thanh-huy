// Máy chơi cờ: tìm kiếm alpha-beta (PVS), đào sâu dần, bảng chuyển vị, tìm kiếm tĩnh.
import { Position, PIECE_VALUE, KING, RED, moveFrom, moveTo, typeOf } from './xiangqi.js';

export const MATE = 30000;
export const MATE_BOUND = 29000;
const EXACT = 1, LOWER = 2, UPPER = 3;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Mức độ khó: depth = độ sâu cố định, time = thời gian nghĩ (ms), noise = độ "lỏng tay"
export const LEVELS = [
  null,
  { name: 'Mới tập', depth: 1, noise: 220 },
  { name: 'Dễ', depth: 2, noise: 120 },
  { name: 'Trung bình yếu', depth: 3, noise: 60 },
  { name: 'Trung bình', depth: 4, noise: 25 },
  { name: 'Khá', time: 600 },
  { name: 'Giỏi', time: 1500 },
  { name: 'Rất giỏi', time: 3000 },
  { name: 'Cao thủ', time: 6000 },
];

export class Engine {
  constructor(ttBits = 19) {
    const size = 1 << ttBits;
    this.mask = size - 1;
    this.ttKey = new Int32Array(size);
    this.ttMove = new Int16Array(size);
    this.ttScore = new Int16Array(size);
    this.ttDepth = new Int8Array(size);
    this.ttFlag = new Int8Array(size);
    this.history = new Int32Array(90 * 128);
    this.killers = [];
    for (let i = 0; i < 128; i++) this.killers.push([0, 0]);
  }

  clear() {
    this.ttKey.fill(0); this.ttFlag.fill(0); this.history.fill(0);
    for (const k of this.killers) { k[0] = 0; k[1] = 0; }
  }

  evaluate(pos) {
    const s = pos.score;
    return (pos.turn === RED ? s : -s) + 10;
  }

  // ---------- Bảng chuyển vị ----------
  probe(pos) {
    const i = pos.hashHi & this.mask;
    if (this.ttFlag[i] && this.ttKey[i] === (pos.hashLo | 0)) return i;
    return -1;
  }

  store(pos, depth, flag, score, move, ply) {
    const i = pos.hashHi & this.mask;
    if (this.ttFlag[i] && this.ttKey[i] === (pos.hashLo | 0) && this.ttDepth[i] > depth && flag !== EXACT) return;
    if (score > MATE_BOUND) score += ply; else if (score < -MATE_BOUND) score -= ply;
    this.ttKey[i] = pos.hashLo | 0;
    this.ttDepth[i] = Math.max(-1, Math.min(127, depth));
    this.ttFlag[i] = flag;
    this.ttScore[i] = score;
    this.ttMove[i] = move;
  }

  // ---------- Hỗ trợ ----------
  isRepetition(pos) {
    const lo = pos.hashLo | 0, hi = pos.hashHi | 0;
    for (let i = this.repLo.length - 3; i >= 0 && i >= this.repLo.length - 120; i -= 2) {
      if (this.repLo[i] === lo && this.repHi[i] === hi) return true;
    }
    return false;
  }

  pushRep(pos) { this.repLo.push(pos.hashLo | 0); this.repHi.push(pos.hashHi | 0); }
  popRep() { this.repLo.pop(); this.repHi.pop(); }

  orderScores(pos, moves, ttMove, ply) {
    const b = pos.board, scores = new Int32Array(moves.length);
    const k = this.killers[ply] || [0, 0];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i], victim = b[moveTo(m)];
      if (m === ttMove) scores[i] = 10000000;
      else if (victim) {
        const at = typeOf(b[moveFrom(m)]);
        scores[i] = 1000000 + PIECE_VALUE[typeOf(victim)] * 10 - (at === KING ? 0 : PIECE_VALUE[at] / 10);
      } else if (m === k[0]) scores[i] = 900000;
      else if (m === k[1]) scores[i] = 800000;
      else scores[i] = this.history[m] || 0;
    }
    return scores;
  }

  static pickNext(moves, scores, start) {
    let best = start;
    for (let j = start + 1; j < moves.length; j++) if (scores[j] > scores[best]) best = j;
    if (best !== start) {
      const tm = moves[start]; moves[start] = moves[best]; moves[best] = tm;
      const ts = scores[start]; scores[start] = scores[best]; scores[best] = ts;
    }
    return moves[start];
  }

  checkTime() {
    if (this.stopTime && now() >= this.stopTime) this.stopped = true;
  }

  // ---------- Tìm kiếm tĩnh (chỉ ăn quân, hoặc thoát chiếu) ----------
  quiesce(pos, alpha, beta, ply, qply) {
    if ((++this.nodes & 2047) === 0) this.checkTime();
    if (this.stopped) return 0;
    const inCheck = pos.inCheck();
    let best;
    let moves;
    if (inCheck) {
      if (qply > 6 || ply > 120) return this.evaluate(pos);
      best = -MATE + ply;
      moves = pos.genMoves(false);
    } else {
      const stand = this.evaluate(pos);
      if (stand >= beta || ply > 120) return stand;
      if (stand > alpha) alpha = stand;
      best = stand;
      moves = pos.genMoves(true);
    }
    const scores = this.orderScores(pos, moves, 0, Math.min(ply, 127));
    const me = pos.turn;
    for (let i = 0; i < moves.length; i++) {
      const m = Engine.pickNext(moves, scores, i);
      pos.makeMove(m);
      if (pos.isAttacked(pos.kingSq[me], me ^ 1)) { pos.undoMove(); continue; }
      const score = -this.quiesce(pos, -beta, -alpha, ply + 1, qply + 1);
      pos.undoMove();
      if (this.stopped) return 0;
      if (score > best) {
        best = score;
        if (score > alpha) { alpha = score; if (score >= beta) break; }
      }
    }
    return best;
  }

  // ---------- Tìm kiếm chính ----------
  negamax(pos, depth, alpha, beta, ply, allowNull) {
    if ((++this.nodes & 2047) === 0) this.checkTime();
    if (this.stopped) return 0;
    if (this.isRepetition(pos)) return 0;
    if (ply >= 100) return this.evaluate(pos);

    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(pos, alpha, beta, ply, 0);

    // Cắt tỉa theo khoảng cách chiếu bí
    alpha = Math.max(alpha, -MATE + ply);
    beta = Math.min(beta, MATE - ply - 1);
    if (alpha >= beta) return alpha;

    const pvNode = beta - alpha > 1;
    let ttMove = 0;
    const ti = this.probe(pos);
    if (ti >= 0) {
      ttMove = this.ttMove[ti];
      if (this.ttDepth[ti] >= depth && !pvNode) {
        let s = this.ttScore[ti];
        if (s > MATE_BOUND) s -= ply; else if (s < -MATE_BOUND) s += ply;
        const f = this.ttFlag[ti];
        if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
      }
    }

    // Nước trống (null move)
    if (allowNull && !inCheck && !pvNode && depth >= 3 && beta < MATE_BOUND && pos.hasAttackers(pos.turn)
        && this.evaluate(pos) >= beta) {
      const R = depth > 6 ? 3 : 2;
      pos.makeNull(); this.repLo.push(NaN); this.repHi.push(NaN);
      const s = -this.negamax(pos, depth - 1 - R, -beta, -beta + 1, ply + 1, false);
      this.popRep(); pos.undoNull();
      if (this.stopped) return 0;
      if (s >= beta && s < MATE_BOUND) return beta;
    }

    const moves = pos.genMoves(false);
    const scores = this.orderScores(pos, moves, ttMove, Math.min(ply, 127));
    const me = pos.turn, alpha0 = alpha;
    let best = -MATE - 1, bestMove = 0, legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = Engine.pickNext(moves, scores, i);
      const isCapture = pos.board[moveTo(m)] !== 0;
      pos.makeMove(m);
      if (pos.isAttacked(pos.kingSq[me], me ^ 1)) { pos.undoMove(); continue; }
      legal++;
      this.pushRep(pos);
      let score;
      if (legal === 1) {
        score = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        let r = 0;
        if (depth >= 3 && legal > 4 && !isCapture && !inCheck && scores[i] < 800000) r = legal > 10 ? 2 : 1;
        score = -this.negamax(pos, depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && r) score = -this.negamax(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
      }
      this.popRep();
      pos.undoMove();
      if (this.stopped) return 0;
      if (score > best) {
        best = score; bestMove = m;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) {
            if (!isCapture) {
              const k = this.killers[Math.min(ply, 127)];
              if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
              this.history[m] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (!legal) return -MATE + ply; // Hết nước đi = thua (cả bị chiếu bí lẫn bị vây)
    const flag = best >= beta ? LOWER : best > alpha0 ? EXACT : UPPER;
    this.store(pos, depth, flag, best, bestMove, ply);
    return best;
  }

  // Tìm ở gốc trên danh sách nước cho trước
  searchRoot(pos, rootMoves, depth, alpha, beta) {
    let best = -MATE - 1, bestMove = rootMoves[0].move;
    for (let i = 0; i < rootMoves.length; i++) {
      const rm = rootMoves[i];
      pos.makeMove(rm.move);
      this.pushRep(pos);
      let score;
      if (i === 0) score = -this.negamax(pos, depth - 1, -beta, -alpha, 1, true);
      else {
        score = -this.negamax(pos, depth - 1, -alpha - 1, -alpha, 1, true);
        if (score > alpha && score < beta) score = -this.negamax(pos, depth - 1, -beta, -alpha, 1, true);
      }
      this.popRep();
      pos.undoMove();
      if (this.stopped) break;
      rm.score = score;
      if (score > best) {
        best = score; bestMove = rm.move;
        if (score > alpha) alpha = score;
      }
    }
    return { best, bestMove };
  }

  extractPV(pos, first, maxLen = 12) {
    const pv = [first];
    const seen = new Set();
    pos.makeMove(first);
    let made = 1;
    seen.add(pos.hashKey());
    while (pv.length < maxLen) {
      const ti = this.probe(pos);
      if (ti < 0) break;
      const m = this.ttMove[ti];
      if (!m || !pos.genMoves().includes(m) || !pos.isLegal(m)) break;
      pos.makeMove(m); made++;
      const k = pos.hashKey();
      if (seen.has(k)) { pos.undoMove(); made--; break; }
      seen.add(k);
      pv.push(m);
    }
    while (made--) pos.undoMove();
    return pv;
  }

  /**
   * Tìm nước đi tốt nhất.
   * opts: { history: [{lo,hi}] các thế cờ trước đó, timeMs, maxDepth, exclude: [nước bị loại], onInfo }
   * Trả về { move, score, depth, pv, nodes } (điểm theo phía bên đang đi, đơn vị 1/100 Tốt)
   */
  search(pos, opts = {}) {
    const { timeMs = 1000, maxDepth = 64, exclude = [], history = [], onInfo } = opts;
    this.nodes = 0; this.stopped = false;
    this.repLo = history.map((h) => h.lo | 0); this.repHi = history.map((h) => h.hi | 0);
    this.pushRep(pos);
    for (const k of this.killers) { k[0] = 0; k[1] = 0; }
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 2;
    const start = now();
    this.stopTime = timeMs ? start + timeMs : 0;

    const rootMoves = pos.legalMoves().filter((m) => !exclude.includes(m)).map((move) => ({ move, score: -MATE - 1 }));
    if (!rootMoves.length) return { move: 0, score: pos.inCheck() ? -MATE : -MATE, depth: 0, pv: [], nodes: 0 };
    const ti = this.probe(pos);
    if (ti >= 0) {
      const idx = rootMoves.findIndex((r) => r.move === this.ttMove[ti]);
      if (idx > 0) rootMoves.unshift(rootMoves.splice(idx, 1)[0]);
    }
    let result = { move: rootMoves[0].move, score: 0, depth: 0, pv: [rootMoves[0].move], nodes: 0 };
    if (rootMoves.length === 1 && timeMs) { // chỉ có một nước: vẫn tính nhanh để có điểm
      this.stopTime = start + Math.min(timeMs, 150);
    }
    for (let depth = 1; depth <= maxDepth; depth++) {
      // Cửa sổ hút (aspiration)
      let alpha = -MATE - 1, beta = MATE + 1;
      if (depth >= 4 && Math.abs(result.score) < MATE_BOUND) { alpha = result.score - 60; beta = result.score + 60; }
      let r;
      for (;;) {
        r = this.searchRoot(pos, rootMoves, depth, alpha, beta);
        if (this.stopped) break;
        if (r.best <= alpha) { alpha = -MATE - 1; continue; }
        if (r.best >= beta) { beta = MATE + 1; continue; }
        break;
      }
      if (this.stopped && depth > 1) break;
      rootMoves.sort((a, b) => b.score - a.score);
      result = { move: r.bestMove, score: r.best, depth, nodes: this.nodes };
      this.store(pos, depth, EXACT, r.best, r.bestMove, 0);
      result.pv = this.extractPV(pos, r.bestMove);
      if (onInfo) onInfo({ ...result, time: now() - start });
      if (this.stopped) break;
      if (Math.abs(r.best) > MATE_BOUND && depth > (MATE - Math.abs(r.best)) + 2) break; // đã thấy chiếu bí
      if (timeMs && now() - start > timeMs * 0.55) break; // không đủ thời gian cho lượt sâu hơn
    }
    result.nodes = this.nodes;
    result.time = now() - start;
    return result;
  }

  // Điểm của từng nước ở gốc với độ sâu cố định (dùng cho mức dễ)
  scoreAllMoves(pos, depth, history = []) {
    this.nodes = 0; this.stopped = false; this.stopTime = 0;
    this.repLo = history.map((h) => h.lo | 0); this.repHi = history.map((h) => h.hi | 0);
    this.pushRep(pos);
    const out = [];
    for (const m of pos.legalMoves()) {
      pos.makeMove(m); this.pushRep(pos);
      const s = depth <= 1 ? -this.quiesce(pos, -MATE - 1, MATE + 1, 1, 0) : -this.negamax(pos, depth - 1, -MATE - 1, MATE + 1, 1, true);
      this.popRep(); pos.undoMove();
      out.push({ move: m, score: s });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  // Máy chọn nước theo mức độ khó
  pickMove(pos, level, history = []) {
    const L = LEVELS[Math.max(1, Math.min(8, level))];
    if (L.time) return this.search(pos, { timeMs: L.time, history });
    const scored = this.scoreAllMoves(pos, L.depth, history);
    if (!scored.length) return { move: 0, score: -MATE, pv: [] };
    // Không bao giờ bỏ lỡ nước chiếu bí ngay
    if (scored[0].score > MATE_BOUND) return { move: scored[0].move, score: scored[0].score, pv: [scored[0].move] };
    let best = null, bestVal = -Infinity;
    for (const s of scored) {
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 2; // gần chuẩn
      const v = s.score + g * L.noise;
      if (v > bestVal) { bestVal = v; best = s; }
    }
    return { move: best.move, score: best.score, pv: [best.move] };
  }

  // Phân tích nhiều phương án (multi-PV)
  analyze(pos, { timeMs = 1500, lines = 3, history = [] } = {}) {
    const out = [];
    const exclude = [];
    const legalCount = pos.legalMoves().length;
    const n = Math.min(lines, legalCount);
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? timeMs * 0.5 : (timeMs * 0.5) / Math.max(1, n - 1);
      const r = this.search(pos, { timeMs: t, exclude, history });
      if (!r.move) break;
      out.push(r);
      exclude.push(r.move);
    }
    return out;
  }
}

export function historyFrom(startFen, moves) {
  const pos = Position.fromFen(startFen);
  const history = [];
  for (const m of moves) { history.push({ lo: pos.hashLo, hi: pos.hashHi }); pos.makeMove(m); }
  return { pos, history };
}
