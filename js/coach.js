// "Thầy" tư vấn: chấm điểm nước đi, so với nước tốt nhất và giải thích bằng tiếng Việt.
import { Position, RED, KING, ADVISOR, BISHOP, KNIGHT, ROOK, CANNON, PAWN, typeOf, colorOf, rowOf, colOf, moveFrom, moveTo } from './xiangqi.js';
import { MATE, MATE_BOUND } from './engine.js';
import { moveToVN, lineToVN, NAME_VN, formatScore } from './notation.js';
import { sideName } from './game.js';

export const GRADES = {
  best: { label: 'Nước hay nhất', icon: '⭐', tone: 'best' },
  good: { label: 'Nước tốt', icon: '✅', tone: 'good' },
  ok: { label: 'Tạm được', icon: '👍', tone: 'ok' },
  inaccuracy: { label: 'Thiếu chính xác', icon: '⚠️', tone: 'inaccuracy' },
  mistake: { label: 'Sai lầm', icon: '❌', tone: 'mistake' },
  blunder: { label: 'Hớ nặng', icon: '💥', tone: 'blunder' },
  forced: { label: 'Nước duy nhất', icon: '🔒', tone: 'good' },
};

const isMate = (s) => Math.abs(s) > MATE_BOUND;
const matePlies = (s) => MATE - Math.abs(s);

export function grade(bestScore, playedScore, isBest, legalCount = 2) {
  if (legalCount === 1) return 'forced';
  if (isBest) return 'best';
  // Bỏ lỡ chiếu bí hoặc tự đi vào thế bị chiếu bí
  if (playedScore < -MATE_BOUND && bestScore > -MATE_BOUND) return 'blunder';
  if (bestScore > MATE_BOUND && playedScore < MATE_BOUND) return playedScore > 300 ? 'inaccuracy' : 'mistake';
  if (bestScore > MATE_BOUND && playedScore > MATE_BOUND) return matePlies(playedScore) - matePlies(bestScore) <= 2 ? 'good' : 'ok';
  const loss = Math.max(0, clampScore(bestScore) - clampScore(playedScore));
  if (loss <= 15) return 'best';
  if (loss <= 40) return 'good';
  if (loss <= 90) return 'ok';
  if (loss <= 200) return 'inaccuracy';
  if (loss <= 450) return 'mistake';
  return 'blunder';
}

const clampScore = (s) => Math.max(-3000, Math.min(3000, s));

// Điểm theo phía Đỏ -> câu mô tả thế cờ
export function evalSentence(redScore) {
  if (redScore > MATE_BOUND) return `Đỏ có đường chiếu bí sau ${Math.ceil(matePlies(redScore) / 2)} nước`;
  if (redScore < -MATE_BOUND) return `Đen có đường chiếu bí sau ${Math.ceil(matePlies(redScore) / 2)} nước`;
  const v = Math.abs(redScore) / 100;
  if (v < 0.4) return 'Thế cờ cân bằng';
  const who = redScore > 0 ? 'Đỏ' : 'Đen';
  if (v < 1.2) return `${who} nhỉnh hơn một chút (${formatScore(Math.abs(redScore))})`;
  if (v < 3) return `${who} ưu thế (${formatScore(Math.abs(redScore))})`;
  return `${who} ưu thế lớn (${formatScore(Math.abs(redScore))})`;
}

// Lý do một nước đi hay: ăn quân, chiếu, phát triển quân...
export function moveReasons(pos, m, lineScore = null) {
  const out = [];
  const from = moveFrom(m), to = moveTo(m);
  const p = pos.board[from], victim = pos.board[to];
  const t = typeOf(p), me = colorOf(p);
  const fr = rowOf(from), tr = rowOf(to), tc = colOf(to);
  if (lineScore !== null && lineScore > MATE_BOUND) out.push(`dẫn tới chiếu bí sau ${Math.ceil(matePlies(lineScore) / 2)} nước`);
  if (victim) out.push(`ăn ${NAME_VN[typeOf(victim)]} của đối phương`);
  pos.makeMove(m);
  const check = pos.inCheck();
  const replies = pos.legalMoves().length;
  pos.undoMove();
  if (check) out.push(replies <= 2 ? 'chiếu Tướng, đối phương gần như không còn đường thoát' : 'chiếu Tướng, giành quyền chủ động');
  if (!victim && !check) {
    const homeRow = me === RED ? 9 : 0;
    const crossed = me === RED ? tr <= 4 : tr >= 5;
    if (t === ROOK && fr === homeRow && tr !== homeRow) out.push('đưa Xe ra sớm để kiểm soát hàng, cột trống');
    else if (t === ROOK && fr === homeRow) out.push('xuất Xe sang cột thoáng');
    else if (t === CANNON && tc === 4) out.push('đặt Pháo đầu, gây sức ép lên trung lộ');
    else if (t === KNIGHT && Math.abs(fr - homeRow) <= 1) out.push('lên Mã, phát triển quân');
    else if (t === KNIGHT && crossed) out.push('Mã qua sông, uy hiếp vùng Tướng đối phương');
    else if (t === PAWN && crossed && (me === RED ? fr >= 5 : fr <= 4)) out.push('Tốt qua sông, có thể đi ngang và tăng sức tấn công');
    else if (t === PAWN) out.push('đẩy Tốt mở đường cho Mã');
    else if (t === ADVISOR || t === BISHOP) out.push('củng cố phòng thủ quanh Tướng');
    else if (t === KING) out.push('đưa Tướng tránh chỗ nguy hiểm');
  }
  return out;
}

function pvText(pos, pv, plies = 6) {
  return lineToVN(pos, pv.slice(0, plies)).join(' → ');
}

// Phương án dạng danh sách có màu bên đi: [{ vn, color }]
function pvItems(pos, pv, plies = 6) {
  return lineToVN(pos, pv.slice(0, plies)).map((vn, i) => ({ vn, color: (pos.turn + i) % 2 }));
}

/**
 * Dựng lời tư vấn cho nước vừa đi.
 * before: Position trước nước đi; played: nước đã đi;
 * lines: các phương án tốt nhất [{move, score, pv}] (điểm theo bên đi);
 * playedScore: điểm của nước đã đi (theo bên đi); replyPV: phương án đối phương đáp lại.
 */
export function buildAdvice({ before, played, lines, playedScore, replyPV = [] }) {
  const pos = before.clone();
  const mover = pos.turn;
  const legalCount = pos.legalMoves().length;
  const best = lines[0];
  const isBest = best.move === played;
  const g = GRADES[grade(best.score, playedScore, isBest, legalCount)];
  const playedVN = moveToVN(pos, played);
  const bestVN = moveToVN(pos, best.move);
  const points = [];

  const capturedNow = pos.board[moveTo(played)];
  if (capturedNow) points.push(`Bạn ăn được ${NAME_VN[typeOf(capturedNow)]} của đối phương.`);

  // Đối phương đáp trả thế nào?
  pos.makeMove(played);
  if (replyPV.length) {
    const reply = replyPV[0];
    const replyVictim = pos.genMoves().includes(reply) ? pos.board[moveTo(reply)] : 0;
    const replyVN = moveToVN(pos, reply);
    if (replyVictim && !isBest && g.tone !== 'good') {
      points.push(`Sau nước này, đối phương có thể đi ${replyVN} ăn ${NAME_VN[typeOf(replyVictim)]} của bạn.`);
    } else if (playedScore < -MATE_BOUND) {
      points.push(`Cẩn thận! Đối phương có đường chiếu bí: ${pvText(pos, replyPV, 7)}.`);
    } else if (replyVN && g.tone !== 'best') {
      points.push(`Máy dự đoán đối phương sẽ đáp: ${replyVN}.`);
    }
  }
  pos.undoMove();

  let summary;
  if (legalCount === 1) summary = 'Đây là nước đi duy nhất hợp lệ.';
  else if (isBest) summary = `${playedVN} đúng là nước máy chọn. Rất tốt!`;
  else if (g === GRADES.best) summary = `${playedVN} tốt ngang nước máy chọn (${bestVN}). Rất tốt!`;
  else {
    const why = moveReasons(pos, best.move, best.score);
    summary = `Nước tốt hơn là ${bestVN}` + (why.length ? ` — ${why.join(', ')}.` : '.');
    const loss = clampScore(best.score) - clampScore(playedScore);
    if (!isMate(best.score) && !isMate(playedScore) && loss > 40) {
      points.push(`So với nước tốt nhất, bạn mất khoảng ${(loss / 100).toFixed(1)} điểm (1 điểm ≈ giá trị 1 con Tốt).`);
    }
  }
  if (isBest || g === GRADES.best) {
    const why = moveReasons(pos, played, isBest ? best.score : playedScore);
    if (why.length) points.unshift(`Nước này ${why.join(', ')}.`);
  }

  const redScore = mover === RED ? playedScore : -playedScore;
  const altLines = lines.map((l) => ({
    move: l.move,
    vn: moveToVN(pos, l.move),
    score: formatScore(l.score),
    pv: pvText(pos, l.pv || [l.move]),
    pvItems: pvItems(pos, l.pv || [l.move]),
  }));

  const arrows = [];
  if (!isBest) arrows.push({ from: moveFrom(best.move), to: moveTo(best.move), kind: 'best' });
  if (replyPV.length && !isBest && ['inaccuracy', 'mistake', 'blunder'].includes(g.tone)) {
    arrows.push({ from: moveFrom(replyPV[0]), to: moveTo(replyPV[0]), kind: 'threat' });
  }

  return {
    mover, moverName: sideName(mover), grade: g, isBest,
    played, playedVN, best: best.move, bestVN,
    bestScore: best.score, playedScore, redScore,
    evalText: evalSentence(redScore),
    summary, points, lines: altLines, arrows,
  };
}

// Dữ liệu gửi cho "Thầy AI" (máy chủ tùy chọn)
export function aiPayload(game, index, advice) {
  return {
    fenBefore: game.positionAt(index).toFen(),
    history: game.moves.slice(0, index + 1).map((r) => r.vn),
    mover: advice.moverName,
    played: advice.playedVN,
    grade: advice.grade.label,
    best: advice.bestVN,
    evaluation: advice.evalText,
    lines: advice.lines.map((l) => `${l.vn} (${l.score}): ${l.pv}`),
  };
}

// Phân tích cả ván: điểm của từng thế cờ -> chấm từng nước
export function gradeGame(scores, bestMoves, moves) {
  // scores[i]: điểm thế cờ sau i nước, theo bên đang đi ở thế đó
  const out = [];
  for (let i = 0; i < moves.length; i++) {
    const bestScore = scores[i];
    const playedScore = -scores[i + 1];
    const isBest = bestMoves[i] === moves[i];
    out.push({ grade: grade(bestScore, playedScore, isBest), bestScore, playedScore, best: bestMoves[i] });
  }
  return out;
}

// Độ chính xác (%) kiểu đơn giản từ danh sách đánh giá
export function accuracy(graded, color, startColor = RED) {
  const weights = { best: 100, forced: 100, good: 90, ok: 75, inaccuracy: 55, mistake: 30, blunder: 5 };
  const mine = graded.filter((_, i) => ((i % 2 === 0) ? startColor : startColor ^ 1) === color);
  if (!mine.length) return null;
  return Math.round(mine.reduce((s, g) => s + weights[g.grade], 0) / mine.length);
}

export { Position };
