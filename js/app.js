// Cờ Tiên — điều khiển giao diện chính.
import { RED, BLACK, START_FEN, moveFrom, moveTo, colorOf, typeOf } from './xiangqi.js';
import { Game, resultText, sideName, REASONS } from './game.js';
import { BoardView, kingSquareIfCheck } from './board.js';
import { EngineClient } from './engine-client.js';
import { LEVELS, MATE, MATE_BOUND } from './engine.js';
import { buildAdvice, aiPayload, gradeGame, accuracy, GRADES, evalSentence } from './coach.js';
import { pieceChar, formatScore, moveToVN } from './notation.js';
import { Clock, TIME_CONTROLS, findTimeControl } from './clock.js';
import { store, uid, AVATARS, BOT_ELO, updateElo } from './storage.js';
import { sound, setSoundEnabled, music } from './sound.js';
import { mountScene, bellSVG } from './scene.js';
import { isStandalone, detectPlatform, guideHTML } from './install.js';
import { OnlineSession, makeRoomCode, roomLink } from './online.js';
import { PUZZLES, PUZZLE_GROUPS } from './puzzles.js';

const APP_VERSION = '1.4.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const S = {
  profile: store.getProfile(),
  settings: store.getSettings(),
  rating: store.getRating(),
  engine: null,
  board: null,
  g: null,          // ván đang mở
  online: null,     // phiên online
  opp: null,        // thông tin đối thủ online
  onlineCfg: null,
  arrows: [],
  aiToken: 0,
  thinking: false,
  installPrompt: null,
  setupMode: 'ai',
};

const engine = () => (S.engine ||= new EngineClient());

// ======================= TIỆN ÍCH GIAO DIỆN =======================
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

let modalResolve = null;
function ask(title, body, buttons = [{ label: 'Đóng', value: null }], { sticky = false } = {}) {
  if (modalResolve) modalResolve(null);
  $('#modal-title').textContent = title;
  const b = $('#modal-body');
  if (typeof body === 'string') b.innerHTML = body; else { b.innerHTML = ''; b.appendChild(body); }
  const row = $('#modal-btns'); row.innerHTML = '';
  for (const btn of buttons) {
    const e = document.createElement('button');
    e.type = 'button'; e.className = 'btn ' + (btn.cls || ''); e.textContent = btn.label;
    e.onclick = () => closeModal(typeof btn.value === 'function' ? btn.value() : btn.value);
    row.appendChild(e);
  }
  const m = $('#modal');
  m.classList.remove('hidden');
  m.onclick = (e) => { if (e.target === m && !sticky) closeModal(null); };
  return new Promise((res) => { modalResolve = res; });
}
function closeModal(v) {
  $('#modal').classList.add('hidden');
  const r = modalResolve; modalResolve = null;
  if (r) r(v);
}

// ---------- Điều hướng màn hình (hỗ trợ nút Back của điện thoại) ----------
let current = 'home';
function showScreen(name) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
  current = name;
  window.scrollTo(0, 0);
  const renderers = { home: renderHome, puzzles: renderPuzzles, history: renderHistory, profile: renderProfile, settings: renderSettings };
  if (renderers[name]) renderers[name]();
}
function go(name) {
  if (name === current) return;
  history.pushState({ screen: name }, '', location.pathname + location.search);
  showScreen(name);
}
async function back() {
  if (current === 'game') { await leaveGame(); return; }
  history.back();
}
window.addEventListener('popstate', async (e) => {
  const target = (e.state && e.state.screen) || 'home';
  if (current === 'game' && target !== 'game') {
    if (!skipLeaveConfirm) {
      const ok = await confirmLeaveGame();
      if (!ok) { history.pushState({ screen: 'game' }, ''); return; }
    }
    skipLeaveConfirm = false;
    teardownGame();
  }
  if (current === 'online' && target !== 'game' && S.online && !(S.g && S.g.cfg.mode === 'online')) closeOnline();
  showScreen(target);
});

// ======================= TRANG CHỦ =======================
function renderHome() {
  const p = S.profile;
  $('#home-avatar').textContent = p.avatar;
  $('#home-name').textContent = p.name || 'Kỳ thủ (chạm để đặt tên)';
  $('#home-elo').textContent = `Kỳ thủ · Điểm ${S.rating.elo.toLocaleString('vi-VN')}`;
  $('#home-rank').textContent = rankName(S.rating.elo);
  const dp = dailyPuzzle(), solved = Object.keys(store.getPuzzleProgress()).length;
  $('#tip-puzzle-text').textContent = `Bài ${dp.id}: chiếu bí trong ${dp.mateIn} nước · đã giải ${solved}/${PUZZLES.length} bài`;
  $('#tip-quote').textContent = `“${QUOTES[dayIndex() % QUOTES.length]}”`;
  const cur = store.getCurrent();
  const rb = $('#btn-resume');
  if (cur && cur.moves) {
    rb.classList.remove('hidden');
    const label = cur.cfg.mode === 'ai' ? `Với máy (${LEVELS[cur.cfg.level].name})` : 'Hai người một máy';
    $('#resume-info').textContent = `${label} · ${cur.moves.length} nước đã đi`;
  } else rb.classList.add('hidden');
  $('#install-card').classList.toggle('hidden', isStandalone() || installHidden());
}

const QUOTES = [
  'Đi cờ chớ vội, tâm tĩnh thì nước hay tự đến.',
  'Thắng không kiêu, bại không nản — mỗi ván là một bài học.',
  'Nhìn cả bàn cờ trước khi nhìn một quân cờ.',
  'Ra quân cho đủ rồi hãy tấn công.',
  'Một nước sai không đáng sợ, đáng sợ là không biết vì sao mình sai.',
  'Giữ Tướng an toàn là gốc, gốc vững thì ngọn mới tươi.',
  'Xe là quân mạnh nhất — đừng để Xe nằm im ở góc bàn.',
  'Trước khi đi, hãy tự hỏi: đối phương định làm gì?',
  'Cờ cao một nước, bó tay cả ván.',
  'Tập cờ như tập thiền: chậm mà chắc, đều mà bền.',
];
const dayIndex = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
const dailyPuzzle = () => PUZZLES[dayIndex() % PUZZLES.length];
function rankName(elo) {
  if (elo < 900) return 'Mới tập';
  if (elo < 1100) return 'Sơ cấp';
  if (elo < 1300) return 'Trung bình';
  if (elo < 1500) return 'Khá';
  if (elo < 1700) return 'Giỏi';
  return 'Cao thủ';
}

// ---------- Nhạc thiền: tự bật khi mở app (trình duyệt chỉ cho phát sau lần chạm đầu tiên) ----------
function updateMusicButtons() {
  $$('.music-btn').forEach((b) => b.classList.toggle('off', !S.settings.music));
}
function setMusic(on) {
  S.settings.music = on;
  store.saveSettings(S.settings);
  if (on) music.start(); else music.stop();
  updateMusicButtons();
}

// ======================= THIẾT LẬP VÁN =======================
function fillTimeSelect(sel, value) {
  sel.innerHTML = TIME_CONTROLS.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
  sel.value = value;
}
function segValue(name) { const b = $(`.seg[data-name="${name}"] button.on`); return b ? b.dataset.v : null; }
function resolveColor(v) { return v === 'red' ? RED : v === 'black' ? BLACK : (Math.random() < 0.5 ? RED : BLACK); }

function openSetup(mode) {
  S.setupMode = mode;
  $('#setup-title').textContent = mode === 'ai' ? 'Đánh với máy' : 'Hai người một máy';
  $('#f-color').classList.toggle('hidden', mode !== 'ai');
  $('#f-level').classList.toggle('hidden', mode !== 'ai');
  const last = S.settings.lastSetup || {};
  $('#in-level').value = last.level || 4;
  $('#level-name').textContent = LEVELS[+$('#in-level').value].name;
  fillTimeSelect($('#in-time'), last.tc || 'none');
  $('#in-autoadvice').checked = last.autoAdvice ?? S.settings.autoAdvice;
  go('setup');
}

$('#in-level').addEventListener('input', (e) => { $('#level-name').textContent = LEVELS[+e.target.value].name; });
$('#btn-start').addEventListener('click', () => {
  const mode = S.setupMode;
  const cfg = {
    mode,
    level: +$('#in-level').value,
    tc: $('#in-time').value,
    autoAdvice: $('#in-autoadvice').checked,
    myColor: mode === 'ai' ? resolveColor(segValue('color')) : RED,
  };
  S.settings.lastSetup = { level: cfg.level, tc: cfg.tc, autoAdvice: cfg.autoAdvice };
  store.saveSettings(S.settings);
  startGame(cfg);
});

// ======================= VÁN CỜ =======================
function ensureBoard() {
  if (S.board) return S.board;
  S.board = new BoardView($('#board'), {
    canSelect: (sq) => {
      const g = S.g;
      if (!g || g.view !== null || !humanCanMove()) return false;
      const p = g.game.pos.board[sq];
      return p && colorOf(p) === g.game.turn;
    },
    targets: (sq) => (S.g ? S.g.game.legalMovesFrom(sq).map(moveTo) : []),
    onMove: (from, to) => humanMove(from, to),
  });
  return S.board;
}

function applyBoardSettings() {
  const b = ensureBoard();
  b.showLegal = S.settings.showLegal;
  b.animate = S.settings.animation;
  if (b.showCoords !== S.settings.showCoords) { b.showCoords = S.settings.showCoords; b.drawCoords(); }
  setSoundEnabled(S.settings.sound);
}

function humanCanMove() {
  const g = S.g;
  if (!g || g.game.result || g.ended) return false;
  const m = g.cfg.mode;
  if (m === 'review') return false;
  if (m === 'local') return true;
  if (S.thinking) return false;
  if (m === 'online') return g.game.turn === g.cfg.myColor && !!(S.online && S.online.connected);
  return g.game.turn === g.cfg.myColor;
}

function startGame(cfg, restore = null) {
  teardownGame(false);
  applyBoardSettings();
  const game = new Game(cfg.startFen || START_FEN);
  const g = S.g = {
    cfg, game, id: restore?.id || cfg.gameId || uid(), startedAt: restore?.startedAt || Date.now(),
    view: null, advice: new Map(), usedUndo: !!restore?.usedUndo, helps: 0, ended: false,
    analysis: null, paused: false, lastScore: null,
    puzzleLeft: cfg.puzzle ? cfg.puzzle.mateIn : 0,
  };
  if (restore) for (const m of restore.moves) game.play(m);
  const tc = findTimeControl(cfg.mode === 'puzzle' || cfg.mode === 'review' ? 'none' : cfg.tc);
  g.clock = new Clock(tc, { onTick: renderClocks, onFlag });
  if (restore?.clocks) g.clock.remaining = [...restore.clocks];
  S.arrows = [];
  // Người chơi ở dưới: bên mình cầm
  S.board.flipped = cfg.mode === 'local' ? false : cfg.myColor === BLACK;
  S.board.drawCoords();
  setupGameUI();
  if (current !== 'game') go('game');
  render();
  if (!game.result && cfg.mode !== 'review' && cfg.mode !== 'puzzle') g.clock.start(game.turn);
  if (cfg.mode === 'ai' && game.turn !== cfg.myColor && !game.result) aiMove();
  if (game.result && cfg.mode !== 'review') finishGame();
}

function setupGameUI() {
  const g = S.g, mode = g.cfg.mode;
  const titles = { ai: `Với máy · ${LEVELS[g.cfg.level || 4].name}`, local: 'Hai người một máy', online: 'Đánh online', puzzle: g.cfg.puzzle ? `Cờ thế · Bài ${g.cfg.puzzle.id}` : 'Cờ thế', review: 'Xem lại ván' };
  $('#game-title').textContent = titles[mode];
  const reviewing = mode === 'review';
  $('#actions').classList.toggle('hidden', reviewing);
  $('#review-nav').classList.toggle('hidden', !reviewing);
  $('#act-hint').disabled = mode === 'online';
  $('#act-advice').disabled = mode === 'online';
  $('#act-more').querySelector('span').nextSibling.textContent = mode === 'puzzle' ? 'Bỏ qua' : 'Hòa/Thua';
  $('.tab[data-tab="chat"]').classList.toggle('hidden', mode !== 'online');
  $('#advice-box').innerHTML = ''; $('#analysis-box').innerHTML = '';
  $('#advice-empty').classList.remove('hidden');
  if (mode === 'online') {
    $('#advice-empty').innerHTML = '<p>🤝 Trong ván online, Tư vấn và Gợi ý được tắt để công bằng.</p><p class="muted">Đánh xong, bạn có thể phân tích lại cả ván.</p>';
  } else if (mode === 'puzzle') {
    $('#advice-empty').innerHTML = `<p>🧩 <b>Đỏ đi trước, chiếu bí trong ${g.cfg.puzzle.mateIn} nước.</b></p><p class="muted">Bên Đen do máy phòng thủ. Bấm Gợi ý nếu bí nước.</p>`;
  } else if (mode === 'review') {
    $('#advice-empty').innerHTML = '<p>📜 Dùng nút ◀ ▶ để xem từng nước. Bấm <b>Tư vấn</b> để Thầy nhận xét nước vừa xem.</p>';
    renderAnalysisBox();
  } else {
    $('#advice-empty').innerHTML = '<p>💡 Đi xong một nước, bấm <b>Tư vấn</b> để Thầy chấm điểm, chỉ nước tốt hơn và giải thích vì sao.</p><p class="muted">Bấm <b>Gợi ý</b> nếu muốn biết nên đi nước nào tiếp theo.</p>';
  }
  $('#chat-log').innerHTML = '';
  selectTab('advice');
  renderMoveList();
}

function playerInfo(color) {
  const g = S.g, cfg = g.cfg, me = { name: S.profile.name || 'Bạn', avatar: S.profile.avatar, sub: `Điểm ${S.rating.elo}` };
  switch (cfg.mode) {
    case 'ai': return color === cfg.myColor ? me : { name: `Máy · ${LEVELS[cfg.level].name}`, avatar: '🤖', sub: `Điểm ${BOT_ELO[cfg.level]}` };
    case 'online': {
      if (color === cfg.myColor) return me;
      const o = S.opp || { name: 'Đối thủ', avatar: '👤' };
      return { name: o.name || 'Đối thủ', avatar: o.avatar || '👤', sub: o.rating ? `Điểm ${o.rating}` : '' };
    }
    case 'puzzle': return color === RED ? me : { name: 'Máy phòng thủ', avatar: '🛡️', sub: '' };
    case 'review': {
      const r = cfg.record || {};
      if (r.mode === 'local') return { name: color === RED ? 'Bên Đỏ' : 'Bên Đen', avatar: color === RED ? '🔴' : '⚫', sub: '' };
      if (color === r.myColor) return me;
      return { name: r.opp?.name || 'Đối thủ', avatar: r.opp?.avatar || '👤', sub: '' };
    }
    default: return { name: color === RED ? 'Bên Đỏ' : 'Bên Đen', avatar: color === RED ? '🔴' : '⚫', sub: '' };
  }
}

function shownPosition() {
  const g = S.g;
  return g.view === null ? g.game.pos : g.game.positionAt(g.view);
}

function render(animateMove = 0) {
  const g = S.g;
  if (!g) return;
  const pos = shownPosition();
  const k = g.view === null ? g.game.ply : g.view;
  const last = k > 0 ? g.game.moves[k - 1].m : 0;
  S.board.interactive = g.view === null;
  S.board.render(pos.board, { lastMove: last, checkSq: kingSquareIfCheck(pos), arrows: S.arrows, animate: animateMove });
  // Thanh người chơi
  const topColor = S.board.flipped ? RED : BLACK;
  renderPlayer($('#pl-top'), topColor, pos, k);
  renderPlayer($('#pl-bottom'), topColor ^ 1, pos, k);
  renderClocks(g.clock.remaining, g.clock.active);
  // Thanh cán cân
  const bar = $('#evalbar');
  bar.classList.toggle('flipped', S.board.flipped);
  const rs = g.lastScore;
  const pct = rs === null ? 50 : 50 + 50 * Math.tanh((Math.abs(rs) > MATE_BOUND ? Math.sign(rs) * 3000 : rs) / 700);
  bar.querySelector('i').style.height = pct + '%';
  // Dòng trạng thái
  renderStatus();
  // Biểu ngữ xem lại
  const banner = $('#view-banner');
  if (g.view !== null && g.cfg.mode !== 'review') {
    banner.classList.remove('hidden');
    $('#view-text').textContent = g.view < g.game.ply ? `Đang xem thế cờ trước nước ${g.view + 1}: ${g.game.moves[g.view].vn}` : 'Đang xem lại';
  } else banner.classList.add('hidden');
  // Nút
  const live = g.view === null && !g.ended && !g.game.result;
  $('#act-undo').disabled = !(g.game.ply > 0) || g.cfg.mode === 'review' || (g.cfg.mode === 'online' && !live);
  $('#act-hint').disabled = g.cfg.mode === 'online' || !live;
  $('#act-advice').disabled = (g.cfg.mode === 'online' && !g.ended) || g.game.ply === 0;
  highlightMoveList();
}

function renderPlayer(el, color, pos, k) {
  const g = S.g, info = playerInfo(color);
  $('.avatar', el).textContent = info.avatar;
  $('.pname b', el).textContent = info.name;
  $('.pname small', el).textContent = `${sideName(color)}${info.sub ? ' · ' + info.sub : ''}`;
  // Quân đã ăn của bên này
  const caps = [];
  for (let i = 0; i < k; i++) {
    const r = g.game.moves[i];
    const mover = (g.game.startTurn + i) % 2;
    if (r.captured && mover === color) caps.push(r.captured);
  }
  caps.sort((a, b) => typeOf(b) - typeOf(a));
  $('.captured', el).innerHTML = caps.map((p) => `<span class="${colorOf(p) === RED ? 'r' : 'k'}">${pieceChar(p)}</span>`).join('');
  el.classList.toggle('turn', pos.turn === color && !g.game.result && !g.ended);
  el.dataset.color = color;
}

function renderClocks(times, active) {
  const g = S.g;
  if (!g) return;
  for (const el of [$('#pl-top'), $('#pl-bottom')]) {
    const c = +el.dataset.color;
    const ck = $('.clock', el);
    if (Number.isNaN(c)) continue;
    if (g.cfg.mode === 'puzzle' || g.cfg.mode === 'review') { ck.textContent = '—'; ck.classList.remove('low'); continue; }
    ck.textContent = (g.clock.unlimited ? '⏱ ' : '') + Clock.format(times[c], g.clock.unlimited);
    ck.classList.toggle('low', !g.clock.unlimited && times[c] < 30000 && active === c);
  }
}

function renderStatus() {
  const g = S.g, el = $('#status');
  el.classList.remove('thinking');
  if (g.game.result) { el.textContent = resultText(g.game.result, perspective()); return; }
  if (g.cfg.mode === 'review') { el.textContent = `Nước ${g.view} / ${g.game.ply}`; return; }
  if (S.thinking) { el.textContent = g.cfg.mode === 'puzzle' ? 'Máy đang tìm cách phòng thủ' : 'Máy đang suy nghĩ'; el.classList.add('thinking'); return; }
  if (g.paused) { el.textContent = 'Máy đang chờ bạn xem tư vấn — bấm “Về ván đang chơi” để tiếp tục'; return; }
  const turn = g.game.turn;
  const inCheck = g.game.pos.inCheck();
  let who;
  if (g.cfg.mode === 'local') who = `Lượt ${sideName(turn)} đi`;
  else if (g.cfg.mode === 'online' && !(S.online && S.online.connected)) who = 'Mất kết nối — đang chờ đối thủ quay lại';
  else who = turn === g.cfg.myColor ? `Lượt bạn đi (${sideName(turn)})` : `Lượt đối thủ (${sideName(turn)})`;
  if (g.cfg.mode === 'puzzle') who = turn === RED ? `Đỏ đi — còn ${g.puzzleLeft} nước để chiếu bí` : 'Đen đang phòng thủ';
  el.textContent = (inCheck ? '⚠️ Chiếu Tướng! ' : '') + who;
}

function perspective() {
  const g = S.g;
  if (!g) return null;
  if (g.cfg.mode === 'local') return null;
  if (g.cfg.mode === 'review') return g.cfg.record?.mode === 'local' ? null : g.cfg.record?.myColor ?? null;
  return g.cfg.myColor;
}

// ---------- Danh sách nước đi ----------
function renderMoveList() {
  const g = S.g, ol = $('#move-list');
  if (!g) return;
  const startTurn = g.game.startTurn;
  let html = '';
  const tagOf = (i) => {
    const a = g.analysis ? g.analysis[i] : g.advice.get(i) ? { grade: Object.keys(GRADES).find((k) => GRADES[k] === g.advice.get(i).grade) } : null;
    return a && a.grade ? `<span class="tag">${GRADES[a.grade].icon}</span>` : '';
  };
  const cells = [];
  if (startTurn === BLACK) cells.push(null);
  g.game.moves.forEach((r, i) => cells.push({ r, i }));
  for (let j = 0; j < cells.length; j += 2) {
    html += `<li class="no">${j / 2 + 1}.</li>`;
    for (const c of [cells[j], cells[j + 1]]) {
      if (!c) { html += '<li></li>'; continue; }
      html += `<li class="mv" data-i="${c.i}">${esc(c.r.vn)}${c.r.check ? ' +' : ''}${tagOf(c.i)}</li>`;
    }
  }
  ol.innerHTML = html || '<li class="muted" style="grid-column:1/-1">Chưa có nước đi nào.</li>';
  highlightMoveList();
}

function highlightMoveList() {
  const g = S.g;
  if (!g) return;
  const k = g.view === null ? g.game.ply : g.view;
  $$('#move-list .mv').forEach((e) => e.classList.toggle('cur', +e.dataset.i === k - 1));
  const cur = $('#move-list .mv.cur');
  if (cur && $('#panel-moves').classList.contains('on')) cur.scrollIntoView({ block: 'nearest' });
}

$('#move-list').addEventListener('click', (e) => {
  const li = e.target.closest('.mv');
  if (!li || !S.g) return;
  const i = +li.dataset.i;
  const g = S.g;
  if (g.cfg.mode === 'online' && !g.ended) { toast('Đang trong ván online — xem lại sau khi kết thúc nhé'); return; }
  S.arrows = [];
  setView(i + 1 >= g.game.ply && g.cfg.mode !== 'review' ? null : i + 1);
  if (g.cfg.mode === 'review' || g.ended) showCachedAdvice(i);
});

function setView(v) {
  const g = S.g;
  const wasLive = g.view === null;
  g.view = v;
  if (v === null) {
    S.arrows = [];
    if (g.paused) { g.paused = false; if (!g.game.result && g.cfg.mode !== 'review') g.clock.start(g.game.turn); render(); continueAfterPause(); return; }
  } else if (wasLive && (g.cfg.mode === 'ai' || g.cfg.mode === 'local') && !g.game.result) {
    // Đang xem lại trong ván với máy: tạm dừng máy và đồng hồ
    if (S.thinking) cancelAI();
    if (!g.paused) { g.paused = true; g.clock.pause(); }
  }
  render();
}

function continueAfterPause() {
  const g = S.g;
  if (g.cfg.mode === 'ai' && !g.game.result && g.game.turn !== g.cfg.myColor) aiMove();
}

$('#btn-live').addEventListener('click', () => setView(null));

// ---------- Đi quân ----------
function humanMove(from, to) {
  sound.unlock();
  const g = S.g;
  if (!humanCanMove()) return;
  const m = from | (to << 7);
  if (!g.game.isLegal(m)) return;
  applyMove(m, 'me');
}

function applyMove(m, source) {
  const g = S.g;
  const mover = g.game.turn;
  const rec = g.game.play(m);
  if (!rec) return null;
  S.arrows = [];
  g.view = null;
  if (rec.check) { sound.check(); if (S.settings.vibrate && navigator.vibrate) navigator.vibrate([60, 40, 60]); }
  else if (rec.captured) sound.capture(); else sound.move();
  if (g.cfg.mode !== 'puzzle') g.clock.punch(mover);
  if (g.cfg.mode === 'online' && source === 'me') {
    S.online.send({ t: 'move', m, ply: g.game.ply, clocks: g.clock.remaining });
  }
  saveCurrent();
  renderMoveList();
  render(m);
  if (g.game.result) { finishGame(); return rec; }
  afterMove(source, g.game.ply - 1);
  return rec;
}

async function afterMove(source, index) {
  const g = S.g, mode = g.cfg.mode;
  if (mode === 'ai' && source === 'me') {
    if (g.cfg.autoAdvice) await requestAdvice(index, { auto: true });
    if (S.g === g && !g.paused) aiMove();
  } else if (mode === 'local' && g.cfg.autoAdvice) {
    requestAdvice(index, { auto: true });
  } else if (mode === 'puzzle' && source === 'me') {
    puzzleReply();
  }
}

async function aiMove() {
  const g = S.g;
  if (!g || g.game.result || g.paused || g.game.turn === g.cfg.myColor) return;
  const token = ++S.aiToken;
  S.thinking = true; renderStatus();
  const t0 = performance.now();
  try {
    const r = await engine().bestMove(g.game.startFen, g.game.moveList(), g.cfg.level);
    const wait = 350 - (performance.now() - t0);
    if (wait > 0) await sleep(wait);
    if (token !== S.aiToken || S.g !== g) return;
    S.thinking = false;
    if (r.move) applyMove(r.move, 'ai');
  } catch (e) {
    if (!e.cancelled) { S.thinking = false; toast('Máy gặp lỗi: ' + e.message); renderStatus(); }
  }
}

function cancelAI() {
  if (S.thinking) { S.aiToken++; S.thinking = false; if (S.engine) S.engine.cancel(); }
}

function onFlag(side) {
  const g = S.g;
  if (!g || g.game.result) return;
  g.game.setResult(side ^ 1, 'timeout');
  if (g.cfg.mode === 'online' && S.online) S.online.send({ t: 'flag', side });
  finishGame();
}

function saveCurrent() {
  const g = S.g;
  if (!g || g.ended || (g.cfg.mode !== 'ai' && g.cfg.mode !== 'local')) return;
  if (g.game.result) { store.clearCurrent(); return; }
  store.saveCurrent({ cfg: g.cfg, moves: g.game.moveList(), clocks: g.clock.remaining, id: g.id, startedAt: g.startedAt, usedUndo: g.usedUndo });
}

// ---------- Đi lại ----------
function undoMoves(n) {
  const g = S.g;
  for (let i = 0; i < n && g.game.ply > 0; i++) {
    g.game.undo();
    g.advice.delete(g.game.ply);
  }
  g.ended = false;
  S.arrows = [];
  g.view = null; g.paused = false;
  if (g.cfg.mode !== 'puzzle' && g.cfg.mode !== 'review') g.clock.start(g.game.turn);
  saveCurrent();
  renderMoveList();
  render();
}

async function onUndo() {
  const g = S.g;
  if (!g || !g.game.ply) return;
  const mode = g.cfg.mode;
  if (mode === 'online') {
    if (g.game.result) return;
    S.online.send({ t: 'undo-req', ply: g.game.ply });
    toast('Đã gửi lời xin đi lại tới đối thủ…');
    return;
  }
  if (mode === 'ai') {
    cancelAI();
    g.usedUndo = true;
    const n = g.game.turn === g.cfg.myColor ? 2 : 1;
    if (g.game.ply < n && g.game.turn === g.cfg.myColor) { toast('Không còn nước để đi lại'); return; }
    undoMoves(n);
    if (g.game.turn !== g.cfg.myColor) aiMove();
    return;
  }
  if (mode === 'puzzle') { cancelAI(); undoMoves(g.game.turn === RED ? 2 : 1); g.puzzleLeft = g.cfg.puzzle.mateIn - Math.floor(g.game.ply / 2); render(); return; }
  undoMoves(1);
}

// Đi lại về trước nước thứ index để thử nước tốt hơn
function retryFrom(index) {
  const g = S.g;
  cancelAI();
  g.usedUndo = true;
  const n = g.game.ply - index;
  undoMoves(n);
  toast('Đã lùi lại. Hãy thử nước tốt hơn!');
}

// ======================= TƯ VẤN =======================
function selectTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('on', p.id === 'panel-' + name));
  if (name === 'chat') $('#chat-dot').classList.add('hidden');
  if (name === 'moves') highlightMoveList();
}
$$('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

function adviceIndexForButton() {
  const g = S.g;
  if (g.cfg.mode === 'review') return (g.view ?? g.game.ply) - 1;
  if (g.view !== null) return g.view; // đang xem thế trước nước view -> tư vấn nước đó
  if (g.cfg.mode === 'ai' || g.cfg.mode === 'puzzle') {
    // Nước gần nhất của người chơi
    const me = g.cfg.mode === 'puzzle' ? RED : g.cfg.myColor;
    const start = g.game.startTurn;
    for (let i = g.game.ply - 1; i >= 0; i--) if ((start + i) % 2 === me) return i;
    return -1;
  }
  return g.game.ply - 1;
}

async function computeAdvice(index) {
  const g = S.g;
  if (g.advice.has(index)) return g.advice.get(index);
  const moves = g.game.moveList();
  const before = moves.slice(0, index), played = moves[index];
  const t = S.settings.adviceTime;
  const an = await engine().analyze(g.game.startFen, before, t, 3);
  const lines = an.lines;
  if (!lines.length) throw new Error('Không phân tích được');
  let playedScore, replyPV = [];
  const found = lines.find((l) => l.move === played);
  if (found) { playedScore = found.score; replyPV = (found.pv || []).slice(1); }
  else {
    const r = await engine().search(g.game.startFen, before.concat([played]), Math.max(500, t * 0.6));
    playedScore = r.move ? -r.score : (r.score <= -MATE_BOUND ? MATE - 1 : 0);
    replyPV = r.pv || [];
  }
  const advice = buildAdvice({ before: g.game.positionAt(index), played, lines, playedScore, replyPV });
  advice.index = index;
  g.advice.set(index, advice);
  return advice;
}

async function requestAdvice(index, { auto = false } = {}) {
  const g = S.g;
  if (index < 0) { toast('Bạn chưa đi nước nào để tư vấn'); return; }
  if (g.cfg.mode === 'online' && !g.ended) { toast('Tư vấn tắt trong ván online để công bằng'); return; }
  if (!auto && (g.cfg.mode === 'ai' || g.cfg.mode === 'local') && !g.game.result) {
    // Tạm dừng máy để bạn xem tư vấn
    if (S.thinking) cancelAI();
    g.paused = true; g.clock.pause();
  }
  selectTab('advice');
  $('#advice-empty').classList.add('hidden');
  const box = $('#advice-box');
  if (!g.advice.has(index)) box.innerHTML = `<div class="advice"><div class="grade ok"><span class="gi">🤔</span><span>Thầy đang xem nước <b>${esc(g.game.moves[index].vn)}</b>…<small>Đang tính các phương án tốt nhất</small></span></div><div class="spinner"></div></div>`;
  try {
    const advice = await computeAdvice(index);
    if (S.g !== g) return;
    g.helps++;
    g.lastScore = advice.redScore;
    renderAdvice(advice, auto);
    renderMoveList();
    if (!auto) {
      S.arrows = adviceArrows(advice);
      g.view = index;
      render();
    } else render();
  } catch (e) {
    if (e.cancelled) return;
    box.innerHTML = `<p class="muted">Không tư vấn được: ${esc(e.message)}</p>`;
  }
}

function adviceArrows(a) {
  const arrows = [];
  if (!a.isBest) arrows.push({ from: moveFrom(a.played), to: moveTo(a.played), kind: 'hint' });
  arrows.push({ from: moveFrom(a.best), to: moveTo(a.best), kind: 'best' });
  return arrows;
}

function renderAdvice(a, auto) {
  const g = S.g;
  const canRetry = (g.cfg.mode === 'ai' || g.cfg.mode === 'local') && !g.game.result && !a.isBest && !['best', 'good'].includes(a.grade.tone) &&
    (g.cfg.mode === 'local' || a.mover === g.cfg.myColor);
  const ai = S.settings.aiEndpoint;
  const box = $('#advice-box');
  box.innerHTML = `
    <div class="advice">
      <div class="grade ${a.grade.tone}"><span class="gi">${a.grade.icon}</span>
        <span>${esc(a.grade.label)}<small>Nước ${a.index + 1} (${esc(a.moverName)}): ${esc(a.playedVN)}</small></span></div>
      <p class="summary">${esc(a.summary)}</p>
      ${a.points.length ? `<ul>${a.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      <div class="evaltext">📊 ${esc(a.evalText)}</div>
      <div class="legend"><span><i style="background:#1E8E3E"></i>Nước tốt nhất</span>${a.isBest ? '' : '<span><i style="background:#2A4D94"></i>Nước bạn đã đi</span>'}</div>
      <div><b>Các phương án tốt nhất:</b></div>
      <div class="lines">${a.lines.map((l, i) => `<div class="line"><span class="sc">${esc(l.score)}</span><b>${i + 1}. ${esc(l.vn)}</b><span class="pv">${(l.pvItems || []).map((x) => `<span class="${x.color === RED ? 'mv-r' : 'mv-k'}">${esc(x.vn)}</span>`).join(' → ')}</span></div>`).join('')}</div>
      <p class="muted" style="margin:0"><span class="mv-r">Chữ đỏ</span> là nước của Đỏ, <span class="mv-k">chữ đậm</span> là nước của Đen.</p>
      <div class="btn-row">
        ${auto ? '<button class="btn small" id="adv-show" type="button">👁 Xem trên bàn cờ</button>' : ''}
        ${canRetry ? '<button class="btn small gold" id="adv-retry" type="button">↶ Đi lại, thử nước tốt hơn</button>' : ''}
        ${ai ? '<button class="btn small navy" id="adv-ai" type="button">🎓 Hỏi Thầy AI giảng kỹ</button>' : ''}
      </div>
      <div id="ai-answer"></div>
    </div>`;
  const show = $('#adv-show');
  if (show) show.onclick = () => { S.arrows = adviceArrows(a); setView(a.index); };
  const retry = $('#adv-retry');
  if (retry) retry.onclick = () => retryFrom(a.index);
  const askAi = $('#adv-ai');
  if (askAi) askAi.onclick = () => askTeacher(a);
}

function showCachedAdvice(i) {
  const g = S.g;
  if (g.advice.has(i)) renderAdvice(g.advice.get(i), true);
}

async function askTeacher(a) {
  const g = S.g, out = $('#ai-answer');
  out.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await fetch(S.settings.aiEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiPayload(g.game, a.index, a)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Máy chủ trả lỗi ${res.status}`);
    out.innerHTML = `<div class="ai-text">🎓 ${esc(data.text || '(Không có nội dung)')}</div>`;
  } catch (e) {
    out.innerHTML = `<p class="muted">Không hỏi được Thầy AI: ${esc(e.message)}</p>`;
  }
}

async function onHint() {
  const g = S.g;
  if (!g || g.view !== null || g.game.result) return;
  if (!humanCanMove()) { toast('Chưa tới lượt bạn'); return; }
  $('#status').textContent = 'Thầy đang tìm nước hay…';
  try {
    let r;
    if (g.cfg.mode === 'puzzle') r = await engine().search(g.game.startFen, g.game.moveList(), 15000, 2 * g.puzzleLeft + 1);
    else r = await engine().search(g.game.startFen, g.game.moveList(), S.settings.adviceTime);
    if (S.g !== g || !r.move) return;
    g.helps++;
    S.arrows = [{ from: moveFrom(r.move), to: moveTo(r.move), kind: 'best' }];
    g.lastScore = g.game.turn === RED ? r.score : -r.score;
    render();
    const vn = moveToVN(g.game.pos, r.move);
    $('#status').textContent = `🎯 Gợi ý: ${vn} (${formatScore(r.score)})`;
    toast(`Gợi ý: ${vn}`);
  } catch (e) { if (!e.cancelled) toast('Không gợi ý được: ' + e.message); }
}

// ======================= KẾT THÚC VÁN =======================
function finishGame() {
  const g = S.g;
  if (!g || g.ended) return;
  g.ended = true;
  g.clock.stop();
  cancelAI();
  store.clearCurrent();
  const res = g.game.result;
  const persp = perspective();
  if (g.cfg.mode === 'puzzle') { render(); puzzleFinished(); return; }
  // Lưu lịch sử
  const record = {
    id: g.id, date: Date.now(), mode: g.cfg.mode, myColor: g.cfg.mode === 'local' ? null : g.cfg.myColor,
    level: g.cfg.level, tc: g.cfg.tc, startFen: g.game.startFen, moves: g.game.moveList(), result: res, usedUndo: g.usedUndo,
    opp: g.cfg.mode === 'ai' ? { name: `Máy · ${LEVELS[g.cfg.level].name}`, avatar: '🤖', level: g.cfg.level }
      : g.cfg.mode === 'online' ? { ...(S.opp || {}), name: S.opp?.name || 'Đối thủ' } : null,
  };
  // Điểm xếp hạng
  let eloLine = '';
  const score = persp === null ? null : res.winner === null ? 0.5 : res.winner === persp ? 1 : 0;
  if (score !== null && g.game.ply >= 10 && (g.cfg.mode === 'online' || (g.cfg.mode === 'ai' && !g.usedUndo))) {
    const oppElo = g.cfg.mode === 'ai' ? BOT_ELO[g.cfg.level] : (S.opp?.rating || 1200);
    const before = S.rating.elo;
    S.rating = { elo: updateElo(before, oppElo, score), games: S.rating.games + 1 };
    store.saveRating(S.rating);
    const d = S.rating.elo - before;
    eloLine = `<p class="center">Điểm xếp hạng: <b>${S.rating.elo}</b> (${d >= 0 ? '+' : ''}${d})</p>`;
    record.eloAfter = S.rating.elo;
  } else if (g.cfg.mode === 'ai' && g.usedUndo) eloLine = '<p class="center muted">Ván có đi lại nên không tính điểm xếp hạng.</p>';
  store.saveGame(record);
  render();
  if (score === 1) sound.win(); else if (score === 0) sound.lose(); else sound.notify();
  if (g.leaving) return;
  const icon = score === null ? '🏁' : score === 1 ? '🏆' : score === 0 ? '😔' : '🤝';
  const title = score === null ? (res.winner === null ? 'Hòa cờ' : `${sideName(res.winner)} thắng`) : score === 1 ? 'Bạn thắng!' : score === 0 ? 'Bạn thua' : 'Hòa cờ';
  const buttons = [{ label: '📊 Phân tích ván', value: 'review', cls: 'gold' }];
  if (g.cfg.mode === 'online') buttons.push({ label: '🔁 Đấu lại', value: 'rematch', cls: 'navy' });
  else buttons.push({ label: '🔁 Ván mới', value: 'again', cls: 'navy' });
  buttons.push({ label: 'Đóng', value: null });
  setTimeout(() => {
    ask(title, `<div class="big-icon">${icon}</div><p class="center">${esc(REASONS[res.reason] || '')}</p>${eloLine}`, buttons).then((v) => {
      if (v === 'review') openReview(record);
      else if (v === 'again') startGame({ ...g.cfg, myColor: g.cfg.mode === 'ai' ? g.cfg.myColor : RED });
      else if (v === 'rematch') requestRematch();
    });
  }, 600);
}

async function confirmLeaveGame() {
  const g = S.g;
  if (!g || g.ended || g.game.result || g.cfg.mode === 'review') return true;
  if (g.cfg.mode === 'online') {
    const v = await ask('Rời ván online?', '<p>Rời ván lúc này sẽ bị tính là <b>thua</b>.</p>', [{ label: 'Ở lại', value: false, cls: 'gold' }, { label: 'Rời ván', value: true, cls: 'danger' }]);
    if (v && S.online) { S.online.send({ t: 'resign' }); g.leaving = true; g.game.setResult(g.cfg.myColor ^ 1, 'resign'); finishGame(); }
    return !!v;
  }
  if (g.cfg.mode === 'puzzle') return true;
  return true; // ván với máy / hai người được lưu để chơi tiếp
}

let skipLeaveConfirm = false;
async function leaveGame() {
  if (!(await confirmLeaveGame())) return;
  teardownGame();
  skipLeaveConfirm = true;
  if (history.state && history.state.screen === 'game' && history.length > 1) history.back();
  else { skipLeaveConfirm = false; history.replaceState({ screen: 'home' }, ''); showScreen('home'); }
}

function teardownGame(full = true) {
  const g = S.g;
  if (g) {
    g.clock && g.clock.stop();
    if (S.thinking || (S.engine && S.engine.busy)) { S.aiToken++; S.thinking = false; S.engine && S.engine.cancel(); }
    saveCurrent();
  }
  if (full) { S.g = null; if (S.online) closeOnline(); }
}

// ---------- Menu Hòa / Thua ----------
async function onMore() {
  const g = S.g;
  if (!g || g.game.result) return;
  const mode = g.cfg.mode;
  if (mode === 'puzzle') {
    const v = await ask('Bỏ qua bài này?', '<p>Bạn có muốn xem lời giải không?</p>', [{ label: '👀 Xem lời giải', value: 'solve', cls: 'gold' }, { label: '⏭ Bài tiếp', value: 'next' }, { label: 'Đóng', value: null }]);
    if (v === 'solve') showPuzzleSolution(); else if (v === 'next') nextPuzzle();
    return;
  }
  const v = await ask('Tùy chọn ván cờ', '', [
    { label: '🤝 Xin hòa', value: 'draw', cls: 'navy' },
    { label: '🏳️ Xin thua', value: 'resign', cls: 'danger' },
    { label: 'Đóng', value: null },
  ]);
  if (v === 'resign') {
    const ok = await ask('Xác nhận', '<p>Bạn chắc chắn muốn xin thua?</p>', [{ label: 'Xin thua', value: true, cls: 'danger' }, { label: 'Thôi', value: false }]);
    if (!ok) return;
    if (mode === 'online') S.online.send({ t: 'resign' });
    const loser = mode === 'local' ? g.game.turn : g.cfg.myColor;
    g.game.setResult(loser ^ 1, 'resign');
    finishGame();
  } else if (v === 'draw') {
    if (mode === 'online') { S.online.send({ t: 'draw-offer' }); toast('Đã gửi lời xin hòa…'); return; }
    if (mode === 'local') { g.game.setResult(null, 'agreed'); finishGame(); return; }
    // Máy đồng ý hòa nếu thế cờ của máy không tốt hơn
    toast('Máy đang cân nhắc lời xin hòa…');
    try {
      const r = await engine().search(g.game.startFen, g.game.moveList(), 1200);
      const aiScore = g.game.turn === g.cfg.myColor ? -r.score : r.score;
      if (aiScore <= 50 && g.game.ply >= 20) { g.game.setResult(null, 'agreed'); finishGame(); }
      else ask('Máy từ chối hòa', `<p>${aiScore > 50 ? 'Máy thấy mình đang có lợi thế nên muốn đánh tiếp.' : 'Ván cờ còn sớm, máy muốn đánh tiếp (cần ít nhất 10 nước mỗi bên).'}</p>`);
    } catch { /* bỏ qua */ }
  }
}

async function onGameMenu() {
  const g = S.g;
  if (!g) return;
  const btns = [];
  if (g.cfg.mode === 'ai' || g.cfg.mode === 'local') btns.push({ label: '🆕 Ván mới cùng thiết lập', value: 'new', cls: 'gold' });
  if (g.game.ply && g.cfg.mode !== 'review' && (g.cfg.mode !== 'online' || g.ended)) btns.push({ label: '📊 Phân tích ván này', value: 'review' });
  btns.push({ label: S.settings.sound ? '🔇 Tắt âm thanh' : '🔊 Bật âm thanh', value: 'sound' });
  btns.push({ label: '🏠 Về trang chủ', value: 'home' });
  btns.push({ label: 'Đóng', value: null });
  const v = await ask('Menu', '', btns);
  if (v === 'new') { store.clearCurrent(); g.ended = true; startGame({ ...g.cfg }); }
  else if (v === 'review') {
    openReview({ id: g.id, mode: g.cfg.mode, myColor: g.cfg.myColor, startFen: g.game.startFen, moves: g.game.moveList(), result: g.game.result, opp: S.opp, date: Date.now(), unsaved: !g.ended });
  } else if (v === 'sound') { S.settings.sound = !S.settings.sound; store.saveSettings(S.settings); setSoundEnabled(S.settings.sound); toast(S.settings.sound ? 'Đã bật âm thanh' : 'Đã tắt âm thanh'); }
  else if (v === 'home') leaveGame();
}

$('#act-advice').addEventListener('click', () => S.g && requestAdvice(adviceIndexForButton()));
$('#act-review-advice').addEventListener('click', () => S.g && requestAdvice(adviceIndexForButton()));
$('#act-hint').addEventListener('click', onHint);
$('#act-undo').addEventListener('click', onUndo);
$('#act-flip').addEventListener('click', () => { if (S.g) { S.board.setFlipped(!S.board.flipped); render(); } });
$('#act-more').addEventListener('click', onMore);
$('#game-back').addEventListener('click', back);
$('#game-menu-btn').addEventListener('click', onGameMenu);
$$('[data-nav]').forEach((b) => b.addEventListener('click', () => {
  const g = S.g;
  if (!g) return;
  const k = g.view ?? g.game.ply;
  const nav = { start: 0, prev: Math.max(0, k - 1), next: Math.min(g.game.ply, k + 1), end: g.game.ply }[b.dataset.nav];
  S.arrows = [];
  g.view = nav;
  if (nav > k) { const m = g.game.moves[nav - 1]; if (m.check) sound.check(); else if (m.captured) sound.capture(); else sound.move(); }
  render(nav === k + 1 ? g.game.moves[nav - 1].m : 0);
  if (nav > 0) showCachedAdvice(nav - 1);
}));
document.addEventListener('keydown', (e) => {
  if (current !== 'game' || !S.g || S.g.cfg.mode !== 'review' || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') $('[data-nav="prev"]').click();
  if (e.key === 'ArrowRight') $('[data-nav="next"]').click();
});

// ======================= XEM LẠI & PHÂN TÍCH =======================
function openReview(record) {
  teardownGame(false);
  const cfg = { mode: 'review', record, myColor: record.myColor ?? RED, startFen: record.startFen };
  applyBoardSettings();
  const game = Game.fromJSON(record);
  S.g = {
    cfg, game, id: record.id, view: game.ply, advice: new Map(), ended: true, analysis: record.analysis?.graded || null,
    scores: record.analysis?.scores || null, lastScore: null, paused: false,
    clock: new Clock(findTimeControl('none'), {}),
  };
  if (S.g.scores) S.g.lastScore = redScoreAt(S.g.scores, game.ply);
  S.arrows = [];
  S.board.flipped = record.myColor === BLACK;
  S.board.drawCoords();
  setupGameUI();
  if (current !== 'game') go('game');
  render();
}

function redScoreAt(scores, i) {
  const s = scores[i];
  return (S.g.game.startTurn + i) % 2 === RED ? s : -s;
}

function renderAnalysisBox() {
  const g = S.g, box = $('#analysis-box');
  if (!g.analysis) {
    box.innerHTML = g.game.ply >= 2
      ? `<div class="card" style="box-shadow:none;margin-top:10px"><h3>📊 Phân tích cả ván</h3><p class="muted">Thầy sẽ xem từng nước, chấm điểm và vẽ biểu đồ thế cờ (mất khoảng ${Math.ceil(g.game.ply * 0.6)} giây).</p><button class="btn gold" id="btn-analyze" type="button">Bắt đầu phân tích</button></div>`
      : '';
    const b = $('#btn-analyze');
    if (b) b.onclick = runGameAnalysis;
    return;
  }
  const graded = g.analysis, scores = g.scores;
  const start = g.game.startTurn;
  const accR = accuracy(graded, RED, start), accB = accuracy(graded, BLACK, start);
  const count = (c, t) => graded.filter((x, i) => ((start + i) % 2) === c && x.grade === t).length;
  const row = (t) => `<tr><td>${GRADES[t].icon} ${GRADES[t].label}</td><td class="n">${count(RED, t)}</td><td class="n">${count(BLACK, t)}</td></tr>`;
  const bad = graded.map((x, i) => ({ ...x, i })).filter((x) => ['mistake', 'blunder'].includes(x.grade));
  box.innerHTML = `
    <div style="margin-top:12px">
      <h3>📊 Kết quả phân tích</h3>
      ${chartSVG(scores, graded)}
      <div class="acc-row" style="margin-top:8px">
        <div class="acc">🔴 Đỏ<b>${accR ?? '-'}%</b><small>độ chính xác</small></div>
        <div class="acc">⚫ Đen<b>${accB ?? '-'}%</b><small>độ chính xác</small></div>
      </div>
      <table class="table" style="margin-top:8px"><tr><th></th><th class="n">Đỏ</th><th class="n">Đen</th></tr>
        ${['best', 'good', 'ok', 'inaccuracy', 'mistake', 'blunder'].map(row).join('')}</table>
      ${bad.length ? `<p style="margin-top:10px"><b>Các nước cần xem lại:</b></p><div class="lines">${bad.map((x) => `<button class="line" data-jump="${x.i}" type="button" style="text-align:left">${GRADES[x.grade].icon} Nước ${x.i + 1}: ${esc(g.game.moves[x.i].vn)} <span class="pv">Nên đi: ${esc(moveToVN(g.game.positionAt(x.i), x.best))}</span></button>`).join('')}</div>` : '<p>👏 Không có sai lầm lớn nào!</p>'}
    </div>`;
  $$('[data-jump]', box).forEach((b) => b.onclick = () => { const i = +b.dataset.jump; g.view = i + 1; requestAdvice(i); });
}

function chartSVG(scores, graded) {
  const W = 600, H = 170, n = scores.length - 1;
  if (n < 1) return '';
  const start = S.g.game.startTurn;
  const red = scores.map((s, i) => {
    let v = (start + i) % 2 === RED ? s : -s;
    if (Math.abs(v) > MATE_BOUND) v = Math.sign(v) * 1000;
    return Math.max(-1000, Math.min(1000, v));
  });
  const x = (i) => (i / n) * W, y = (v) => H / 2 - (v / 1000) * (H / 2 - 8);
  const pts = red.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dots = graded.map((g, i) => ['mistake', 'blunder'].includes(g.grade)
    ? `<circle cx="${x(i + 1).toFixed(1)}" cy="${y(red[i + 1]).toFixed(1)}" r="5" fill="${g.grade === 'blunder' ? '#8E1B12' : '#C62828'}"/>` : '').join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ thế cờ">
    <rect x="0" y="0" width="${W}" height="${H / 2}" fill="rgba(179,38,30,0.08)"/>
    <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#999" stroke-dasharray="4 4"/>
    <polygon points="0,${H / 2} ${pts} ${W},${H / 2}" fill="rgba(201,162,94,0.35)"/>
    <polyline points="${pts}" fill="none" stroke="#8A5F3B" stroke-width="2.5"/>
    ${dots}
    <text x="6" y="16" font-size="12" fill="#B3261E">Đỏ hơn</text><text x="6" y="${H - 6}" font-size="12" fill="#555">Đen hơn</text>
  </svg>`;
}

async function runGameAnalysis() {
  const g = S.g, box = $('#analysis-box');
  const moves = g.game.moveList(), n = moves.length;
  const per = n > 120 ? 300 : n > 60 ? 450 : 600;
  box.innerHTML = '<div style="margin-top:12px"><p>🔍 Đang phân tích <span id="an-prog">0</span>/' + (n + 1) + ' thế cờ…</p><div class="progress"><i id="an-bar"></i></div><button class="btn small" id="an-cancel" type="button" style="margin-top:8px">Dừng</button></div>';
  let cancelled = false;
  $('#an-cancel').onclick = () => { cancelled = true; S.engine && S.engine.cancel(); };
  const scores = [], bests = [];
  try {
    for (let i = 0; i <= n; i++) {
      if (cancelled || S.g !== g) return;
      const r = await engine().search(g.game.startFen, moves.slice(0, i), per);
      scores.push(r.move ? r.score : (r.score ?? -MATE));
      bests.push(r.move);
      $('#an-prog').textContent = i + 1;
      $('#an-bar').style.width = ((i + 1) / (n + 1) * 100) + '%';
    }
  } catch (e) {
    if (!e.cancelled) toast('Phân tích lỗi: ' + e.message);
    renderAnalysisBox();
    return;
  }
  g.analysis = gradeGame(scores, bests, moves);
  g.scores = scores;
  g.lastScore = redScoreAt(scores, g.view ?? n);
  const rec = store.getGames().find((x) => x.id === g.id);
  if (rec) { rec.analysis = { scores, graded: g.analysis }; store.saveGame(rec); }
  renderAnalysisBox();
  renderMoveList();
  render();
}

// ======================= ONLINE =======================
function openOnline(code = '') {
  fillTimeSelect($('#in-otime'), S.settings.lastOnlineTc || '15');
  $('#room-box').classList.add('hidden');
  $('#btn-host').classList.remove('hidden');
  setOnlineTab(code ? 'join' : 'host');
  if (code) $('#in-code').value = code;
  $('#join-status').textContent = '';
  go('online');
}

function setOnlineTab(v) {
  $$('#online-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  $('#online-host').classList.toggle('hidden', v !== 'host');
  $('#online-join').classList.toggle('hidden', v !== 'join');
}
$$('#online-tabs button').forEach((b) => b.addEventListener('click', () => { closeOnline(); $('#room-box').classList.add('hidden'); $('#btn-host').classList.remove('hidden'); setOnlineTab(b.dataset.v); }));

async function ensureName() {
  if (S.profile.name) return true;
  const wrap = document.createElement('div');
  wrap.innerHTML = '<p>Nhập tên để bạn bè nhận ra bạn:</p><input id="name-ask" maxlength="24" placeholder="Tên của bạn" style="width:100%;padding:12px;border-radius:12px;border:1.5px solid var(--line);font-size:1rem">';
  setTimeout(() => $('#name-ask') && $('#name-ask').focus(), 50);
  const v = await ask('Tên của bạn', wrap, [{ label: 'Xong', value: () => ($('#name-ask').value || '').trim(), cls: 'gold' }], { sticky: true });
  S.profile.name = (v || '').trim() || 'Kỳ thủ ' + Math.floor(Math.random() * 900 + 100);
  store.saveProfile(S.profile);
  return true;
}

function helloMsg() {
  return { t: 'hello', v: 1, id: S.profile.id, name: S.profile.name, avatar: S.profile.avatar, rating: S.rating.elo };
}

function wireSession(sess, statusEl) {
  sess.on('status', (m) => {
    if (statusEl && current === 'online') statusEl.textContent = m;
    if (S.g && S.g.cfg.mode === 'online' && !S.g.ended) chatSys(m);
  });
  sess.on('error', (m) => { toast(m, 4000); if (statusEl) statusEl.textContent = m; });
  sess.on('connected', () => { sess.send(helloMsg()); if (S.g && S.g.cfg.mode === 'online') { chatSys('Đã kết nối với đối thủ.'); render(); } });
  sess.on('disconnected', () => {
    if (S.g && S.g.cfg.mode === 'online' && !S.g.ended) { chatSys('⚠️ Mất kết nối với đối thủ. Đang chờ kết nối lại…'); render(); }
  });
  sess.on('message', handleOnline);
}

async function hostRoom() {
  await ensureName();
  closeSession();
  const code = makeRoomCode();
  const tc = $('#in-otime').value;
  S.settings.lastOnlineTc = tc; store.saveSettings(S.settings);
  S.onlineCfg = { role: 'host', code, tc, colorPref: segValue('ocolor') };
  const sess = S.online = new OnlineSession({ role: 'host', code, peerHost: S.settings.peerHost, pid: S.profile.id });
  wireSession(sess, $('#host-status'));
  $('#btn-host').classList.add('hidden');
  $('#room-box').classList.remove('hidden');
  $('#room-code').textContent = code;
  $('#room-link').textContent = roomLink(code);
  $('#host-status').textContent = 'Đang tạo phòng…';
  try { await sess.start(); } catch (e) { $('#host-status').textContent = e.message; }
}

async function joinRoom(code) {
  code = (code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) { toast('Mã phòng gồm 6 ký tự'); return; }
  await ensureName();
  closeSession();
  S.onlineCfg = { role: 'guest', code };
  const sess = S.online = new OnlineSession({ role: 'guest', code, peerHost: S.settings.peerHost, pid: S.profile.id });
  wireSession(sess, $('#join-status'));
  $('#join-status').textContent = 'Đang kết nối…';
  try { await sess.start(); } catch (e) { $('#join-status').textContent = e.message; }
}

function closeSession() {
  if (S.online) { S.online.send({ t: 'leave' }); S.online.close(); }
  S.online = null;
}

function closeOnline() {
  closeSession();
  if (location.search.includes('phong=')) history.replaceState(history.state, '', location.pathname);
}

function startOnlineGame(myColor, tc, gameId) {
  startGame({ mode: 'online', myColor, tc, gameId });
  chatSys(`Bắt đầu ván mới. Bạn cầm quân ${sideName(myColor)}.`);
  sound.notify();
}

function handleOnline(msg) {
  const g = S.g;
  const isHost = S.onlineCfg && S.onlineCfg.role === 'host';
  switch (msg.t) {
    case 'hello': {
      S.opp = { id: msg.id, name: String(msg.name || 'Đối thủ').slice(0, 24), avatar: String(msg.avatar || '👤').slice(0, 4), rating: +msg.rating || 1200 };
      if (isHost) {
        if (g && g.cfg.mode === 'online' && !g.ended) {
          S.online.send({ t: 'sync', moves: g.game.moveList(), clocks: g.clock.remaining, hostColor: g.cfg.myColor, tc: g.cfg.tc, gameId: g.id });
          chatSys('Đối thủ đã kết nối lại.');
          render();
        } else {
          const hostColor = resolveColor(S.onlineCfg.colorPref);
          const gameId = uid();
          S.online.send({ t: 'start', hostColor, tc: S.onlineCfg.tc, gameId });
          startOnlineGame(hostColor, S.onlineCfg.tc, gameId);
        }
      } else if (g && g.cfg.mode === 'online') render();
      break;
    }
    case 'start':
      if (!isHost) startOnlineGame(msg.hostColor ^ 1, msg.tc, msg.gameId);
      break;
    case 'sync':
      if (!isHost) {
        if (!g || g.cfg.mode !== 'online' || g.id !== msg.gameId) startOnlineGame(msg.hostColor ^ 1, msg.tc, msg.gameId);
        const gg = S.g;
        const moves = msg.moves || [];
        const same = gg.game.ply <= moves.length && gg.game.moveList().every((m, i) => m === moves[i]);
        if (!same) { while (gg.game.ply) gg.game.undo(); }
        for (let i = gg.game.ply; i < moves.length; i++) gg.game.play(moves[i]);
        gg.clock.set(msg.clocks); gg.clock.start(gg.game.turn);
        renderMoveList(); render();
        chatSys('Đã đồng bộ lại ván cờ.');
      }
      break;
    case 'move':
      if (!g || g.cfg.mode !== 'online' || g.ended) return;
      if (msg.ply !== g.game.ply + 1 || g.game.turn === g.cfg.myColor) { S.online.send({ t: 'resync-req' }); return; }
      if (applyMove(msg.m, 'opp')) { g.clock.set(msg.clocks); if (!g.game.result) g.clock.start(g.game.turn); }
      break;
    case 'resync-req':
      if (g && g.cfg.mode === 'online') S.online.send({ t: 'sync', moves: g.game.moveList(), clocks: g.clock.remaining, hostColor: isHost ? g.cfg.myColor : g.cfg.myColor ^ 1, tc: g.cfg.tc, gameId: g.id });
      break;
    case 'chat': chatAdd(String(msg.text || '').slice(0, 200), false); break;
    case 'emoji': floatEmoji(String(msg.e || '').slice(0, 4)); chatAdd(String(msg.e || '').slice(0, 4), false); break;
    case 'draw-offer':
      if (!g || g.ended) return;
      ask('Đối thủ xin hòa', `<p><b>${esc(S.opp?.name || 'Đối thủ')}</b> muốn hòa ván này. Bạn đồng ý không?</p>`, [{ label: '🤝 Đồng ý hòa', value: true, cls: 'gold' }, { label: 'Đánh tiếp', value: false }], { sticky: true }).then((ok) => {
        S.online.send({ t: 'draw-reply', ok: !!ok });
        if (ok) { g.game.setResult(null, 'agreed'); finishGame(); }
      });
      break;
    case 'draw-reply':
      if (msg.ok && g && !g.ended) { g.game.setResult(null, 'agreed'); finishGame(); } else toast('Đối thủ từ chối hòa');
      break;
    case 'undo-req':
      if (!g || g.ended || msg.ply !== g.game.ply) return;
      ask('Đối thủ xin đi lại', `<p><b>${esc(S.opp?.name || 'Đối thủ')}</b> xin đi lại nước vừa rồi.</p>`, [{ label: 'Cho đi lại', value: true, cls: 'gold' }, { label: 'Không', value: false }], { sticky: true }).then((ok) => {
        S.online.send({ t: 'undo-reply', ok: !!ok, ply: msg.ply });
        if (ok && g.game.ply === msg.ply) undoMoves(g.game.turn === (g.cfg.myColor ^ 1) ? 2 : 1);
      });
      break;
    case 'undo-reply':
      if (!g || g.ended) return;
      if (msg.ok && msg.ply === g.game.ply) { undoMoves(g.game.turn === g.cfg.myColor ? 2 : 1); toast('Đối thủ đồng ý cho đi lại'); }
      else if (!msg.ok) toast('Đối thủ không cho đi lại');
      break;
    case 'resign':
      if (g && !g.ended) { g.game.setResult(g.cfg.myColor, 'resign'); finishGame(); }
      break;
    case 'flag':
      if (g && !g.ended) { g.game.setResult(msg.side ^ 1, 'timeout'); finishGame(); }
      break;
    case 'rematch':
      ask('Đấu lại?', `<p><b>${esc(S.opp?.name || 'Đối thủ')}</b> muốn đấu thêm ván nữa (đổi màu quân).</p>`, [{ label: '🔁 Chơi tiếp', value: true, cls: 'gold' }, { label: 'Thôi', value: false }], { sticky: true }).then((ok) => {
        S.online.send({ t: 'rematch-reply', ok: !!ok });
        if (ok && isHost) hostStartRematch();
      });
      break;
    case 'rematch-reply':
      if (!msg.ok) { toast('Đối thủ chưa muốn chơi tiếp'); return; }
      if (isHost) hostStartRematch();
      break;
    case 'full': toast('Phòng đã đủ 2 người', 4000); $('#join-status').textContent = 'Phòng đã đủ 2 người.'; break;
    case 'leave':
      if (g && g.cfg.mode === 'online' && !g.ended) { chatSys('Đối thủ đã rời phòng.'); g.game.setResult(g.cfg.myColor, 'abandon'); finishGame(); }
      break;
  }
}

function requestRematch() {
  if (!S.online || !S.online.connected) { toast('Đối thủ đã rời phòng'); return; }
  S.online.send({ t: 'rematch' });
  toast('Đã mời đối thủ đấu lại…');
}

function hostStartRematch() {
  const prev = S.g ? S.g.cfg.myColor : RED;
  const hostColor = prev ^ 1, gameId = uid();
  S.online.send({ t: 'start', hostColor, tc: S.onlineCfg.tc, gameId });
  startOnlineGame(hostColor, S.onlineCfg.tc, gameId);
}

// ---------- Trò chuyện ----------
const EMOJIS = ['👍', '😂', '😮', '🤔', '😡', '🔥', '👏', '🤝', '😭', '❤️'];
const PHRASES = ['Nước hay!', 'Chờ chút nhé', 'Đánh nhanh lên 😄', 'Ván nữa không?', 'Hay quá, thua tâm phục!', 'Cảm ơn ván cờ!'];
function initChat() {
  $('#quick-emoji').innerHTML = EMOJIS.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('');
  $('#quick-phrases').innerHTML = PHRASES.map((p) => `<button type="button" data-p="${esc(p)}">${esc(p)}</button>`).join('');
  $('#quick-emoji').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !S.online) return;
    S.online.send({ t: 'emoji', e: b.dataset.e }); floatEmoji(b.dataset.e); chatAdd(b.dataset.e, true);
  });
  $('#quick-phrases').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !S.online) return;
    S.online.send({ t: 'chat', text: b.dataset.p }); chatAdd(b.dataset.p, true);
  });
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#chat-input').value.trim();
    if (!v || !S.online) return;
    if (!S.online.send({ t: 'chat', text: v })) { toast('Chưa kết nối với đối thủ'); return; }
    chatAdd(v, true); $('#chat-input').value = '';
  });
}
function chatAdd(text, mine) {
  const d = document.createElement('div');
  d.className = 'msg' + (mine ? ' me' : '');
  d.textContent = text;
  $('#chat-log').appendChild(d);
  $('#chat-log').scrollTop = 1e9;
  if (!mine) {
    sound.notify();
    if (!$('#panel-chat').classList.contains('on')) { $('#chat-dot').classList.remove('hidden'); toast(`💬 ${S.opp?.name || 'Đối thủ'}: ${text}`); }
  }
}
function chatSys(text) {
  const d = document.createElement('div');
  d.className = 'msg sys'; d.textContent = text;
  $('#chat-log').appendChild(d); $('#chat-log').scrollTop = 1e9;
}
function floatEmoji(e) {
  const s = document.createElement('span');
  s.textContent = e; s.style.left = (15 + Math.random() * 65) + '%';
  $('#float-emoji').appendChild(s);
  setTimeout(() => s.remove(), 2500);
}

$('#btn-host').addEventListener('click', hostRoom);
$('#btn-join').addEventListener('click', () => joinRoom($('#in-code').value));
$('#in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('#in-code').value); });
$('#btn-copy').addEventListener('click', async () => {
  const link = $('#room-link').textContent;
  try { await navigator.clipboard.writeText(link); toast('Đã sao chép link. Dán vào Zalo gửi cho bạn nhé!'); }
  catch { prompt('Sao chép link này:', link); }
});
$('#btn-share').addEventListener('click', async () => {
  const link = $('#room-link').textContent, code = $('#room-code').textContent;
  const text = `Vào đánh cờ tướng với ${S.profile.name || 'mình'} nhé! Mã phòng: ${code}`;
  if (navigator.share) { try { await navigator.share({ title: 'Cờ Tiên', text, url: link }); } catch { /* người dùng hủy */ } }
  else { try { await navigator.clipboard.writeText(`${text}\n${link}`); toast('Đã sao chép lời mời. Dán vào Zalo nhé!'); } catch { prompt('Sao chép lời mời:', link); } }
});

// ======================= CỜ THẾ =======================
function renderPuzzles() {
  const prog = store.getPuzzleProgress();
  const done = PUZZLES.filter((p) => prog[p.id]).length;
  $('#puzzle-list').innerHTML = `<div class="card"><b>Đã giải: ${done} / ${PUZZLES.length} bài</b><div class="progress" style="margin-top:8px"><i style="width:${done / PUZZLES.length * 100}%"></i></div></div>` +
    PUZZLE_GROUPS.map((gr) => `<div class="card pz-group"><h3>${gr.title}</h3><p class="muted">${gr.note}</p><div class="pz-grid">${PUZZLES.filter((p) => p.mateIn === gr.mateIn).map((p) => `<button type="button" class="pz ${prog[p.id] ? 'done' : ''}" data-pz="${p.id}">${p.id}</button>`).join('')}</div></div>`).join('');
  $$('[data-pz]').forEach((b) => b.onclick = () => startPuzzle(PUZZLES.find((p) => p.id === +b.dataset.pz)));
}

function startPuzzle(p) {
  startGame({ mode: 'puzzle', myColor: RED, startFen: p.fen, puzzle: p, tc: 'none' });
}

async function puzzleReply() {
  const g = S.g;
  if (g.game.result) return;
  const left = g.puzzleLeft;
  S.thinking = true; renderStatus();
  const token = ++S.aiToken;
  try {
    const r = await engine().search(g.game.startFen, g.game.moveList(), 15000, 2 * (left - 1) + 2);
    await sleep(300);
    if (token !== S.aiToken || S.g !== g) return;
    S.thinking = false;
    // Đen đi: nếu Đỏ vẫn chiếu bí được trong (left-1) nước thì điểm của Đen <= -(MATE - 2*(left-1))
    if (left > 1 && r.move && r.score <= -MATE + 2 * (left - 1)) {
      g.puzzleLeft = left - 1;
      applyMove(r.move, 'ai');
    } else {
      sound.lose();
      toast('Chưa đúng rồi! Nước này không chiếu bí kịp. Thử lại nhé.', 3200);
      g.game.undo();
      renderMoveList(); render();
    }
  } catch (e) { if (!e.cancelled) { S.thinking = false; renderStatus(); } }
}

async function puzzleFinished() {
  const g = S.g, res = g.game.result;
  if (res.winner === RED && !g.solutionShown) {
    const prog = store.getPuzzleProgress();
    prog[g.cfg.puzzle.id] = { solvedAt: Date.now() };
    store.savePuzzleProgress(prog);
    sound.win();
    const v = await ask('Giải đúng rồi! 🎉', `<div class="big-icon">🏆</div><p class="center">Chiếu bí trong ${g.cfg.puzzle.mateIn} nước. Giỏi lắm!</p>`, [{ label: '⏭ Bài tiếp theo', value: 'next', cls: 'gold' }, { label: 'Danh sách bài', value: 'list' }]);
    if (v === 'next') nextPuzzle(); else if (v === 'list') leaveGame();
  }
}

function nextPuzzle() {
  const id = S.g?.cfg.puzzle?.id || 0;
  const p = PUZZLES.find((x) => x.id === id + 1) || PUZZLES[0];
  startPuzzle(p);
}

async function showPuzzleSolution() {
  const g = S.g;
  cancelAI();
  while (g.game.ply) g.game.undo();
  g.ended = false; g.solutionShown = true;
  g.puzzleLeft = g.cfg.puzzle.mateIn;
  renderMoveList(); render();
  toast('Xem lời giải từng nước…');
  for (let k = 0; k < 2 * g.cfg.puzzle.mateIn && !g.game.result && S.g === g; k++) {
    const depth = g.game.turn === RED ? 2 * g.puzzleLeft + 1 : 2 * (g.puzzleLeft - 1) + 2;
    const r = await engine().search(g.game.startFen, g.game.moveList(), 15000, depth);
    if (!r.move || S.g !== g) break;
    await sleep(700);
    if (g.game.turn === BLACK) g.puzzleLeft--;
    applyMoveQuiet(r.move);
  }
}

function applyMoveQuiet(m) {
  const g = S.g;
  const rec = g.game.play(m);
  if (!rec) return;
  if (rec.check) sound.check(); else if (rec.captured) sound.capture(); else sound.move();
  renderMoveList(); render(m);
  if (g.game.result) { g.ended = true; render(); }
}

// ======================= LỊCH SỬ =======================
let historyFilter = 'all';
function renderHistory() {
  const games = store.getGames().filter((x) => historyFilter === 'all' || x.mode === historyFilter);
  const list = $('#history-list');
  if (!games.length) { list.innerHTML = '<p class="muted center">Chưa có ván nào. Đánh một ván đi nào!</p>'; return; }
  list.innerHTML = games.map((x) => {
    const persp = x.mode === 'local' ? null : x.myColor;
    let cls = 'draw', label = 'Hòa';
    if (x.result && x.result.winner !== null) {
      if (persp === null) { cls = 'draw'; label = `${sideName(x.result.winner)} thắng`; }
      else if (x.result.winner === persp) { cls = 'win'; label = 'Thắng'; } else { cls = 'loss'; label = 'Thua'; }
    }
    const who = x.mode === 'local' ? 'Hai người một máy' : (x.opp?.name || 'Đối thủ');
    const d = new Date(x.date);
    return `<div class="hist" data-id="${x.id}"><span class="avatar">${esc(x.opp?.avatar || (x.mode === 'local' ? '👥' : '👤'))}</span>
      <span><b>${esc(who)}</b><small>${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${x.moves.length} nước · ${esc(REASONS[x.result?.reason] || '')}${x.analysis ? ' · 📊' : ''}</small></span>
      <span class="res ${cls}">${label}</span></div>`;
  }).join('');
  $$('.hist', list).forEach((e) => e.onclick = async () => {
    const rec = store.getGames().find((x) => x.id === e.dataset.id);
    const v = await ask('Ván cờ', `<p>${esc(rec.opp?.name || 'Hai người một máy')} · ${rec.moves.length} nước</p>`, [{ label: '📊 Xem lại & phân tích', value: 'open', cls: 'gold' }, { label: '🗑 Xóa', value: 'del', cls: 'danger' }, { label: 'Đóng', value: null }]);
    if (v === 'open') openReview(rec);
    else if (v === 'del') { store.deleteGame(rec.id); renderHistory(); }
  });
}
$$('#history-filter button').forEach((b) => b.addEventListener('click', () => {
  $$('#history-filter button').forEach((x) => x.classList.toggle('on', x === b));
  historyFilter = b.dataset.v; renderHistory();
}));

// ======================= HỒ SƠ =======================
function renderProfile() {
  const p = S.profile;
  $('#pf-avatar').textContent = p.avatar;
  $('#pf-name').value = p.name;
  $('#pf-avatars').innerHTML = AVATARS.map((a) => `<button type="button" class="${a === p.avatar ? 'on' : ''}" data-a="${a}">${a}</button>`).join('');
  $$('#pf-avatars button').forEach((b) => b.onclick = () => { p.avatar = b.dataset.a; store.saveProfile(p); renderProfile(); });
  const games = store.getGames().filter((x) => x.mode !== 'local');
  const wdl = (arr) => {
    let w = 0, d = 0, l = 0;
    for (const x of arr) { if (!x.result || x.result.winner === null) d++; else if (x.result.winner === x.myColor) w++; else l++; }
    return { w, d, l };
  };
  const all = wdl(games);
  const solved = Object.keys(store.getPuzzleProgress()).length;
  $('#pf-stats').innerHTML = [
    ['Điểm xếp hạng', S.rating.elo], ['Tổng số ván', games.length], ['Thắng', all.w], ['Hòa', all.d], ['Thua', all.l], ['Cờ thế đã giải', `${solved}/${PUZZLES.length}`],
  ].map(([k, v]) => `<div class="stat"><b>${v}</b><small>${k}</small></div>`).join('');
  // Đối đầu online
  const by = new Map();
  for (const x of games.filter((x) => x.mode === 'online')) {
    const key = x.opp?.id || x.opp?.name || '?';
    if (!by.has(key)) by.set(key, { name: x.opp?.name || 'Đối thủ', avatar: x.opp?.avatar || '👤', games: [] });
    by.get(key).games.push(x);
  }
  const rows = [...by.values()].map((o) => ({ ...o, ...wdl(o.games) })).sort((a, b) => (b.w - b.l) - (a.w - a.l));
  $('#pf-h2h').innerHTML = rows.length
    ? `<table class="table"><tr><th>Đối thủ</th><th class="n">Thắng</th><th class="n">Hòa</th><th class="n">Thua</th></tr>${rows.map((o) => `<tr><td>${esc(o.avatar)} ${esc(o.name)}</td><td class="n">${o.w}</td><td class="n">${o.d}</td><td class="n">${o.l}</td></tr>`).join('')}</table>`
    : '<p class="muted">Chưa có ván online nào. Vào “Đánh online” để mời bạn bè.</p>';
  const botRows = [];
  for (let lv = 1; lv <= 8; lv++) {
    const arr = games.filter((x) => x.mode === 'ai' && x.level === lv);
    if (arr.length) botRows.push({ lv, ...wdl(arr) });
  }
  $('#pf-bots').innerHTML = botRows.length
    ? `<table class="table"><tr><th>Mức máy</th><th class="n">Thắng</th><th class="n">Hòa</th><th class="n">Thua</th></tr>${botRows.map((r) => `<tr><td>${LEVELS[r.lv].name}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td></tr>`).join('')}</table>`
    : '<p class="muted">Chưa có ván nào với máy.</p>';
}
$('#pf-name').addEventListener('change', (e) => { S.profile.name = e.target.value.trim().slice(0, 24); store.saveProfile(S.profile); });
$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store.exportAll(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `co-tuong-thanh-huy_sao-luu_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#in-import').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    store.importAll(JSON.parse(await f.text()));
    S.profile = store.getProfile(); S.settings = store.getSettings(); S.rating = store.getRating();
    toast('Đã nhập dữ liệu sao lưu'); renderProfile();
  } catch (err) { toast('Không nhập được: ' + err.message); }
  e.target.value = '';
});

// ======================= CÀI ĐẶT =======================
const TOGGLES = [
  ['music', 'Nhạc thiền', 'Tự bật khi mở app: tiếng đàn ngân nhẹ và tiếng chuông chùa'],
  ['sound', 'Âm thanh quân cờ', 'Tiếng quân cờ, tiếng chiếu tướng'],
  ['vibrate', 'Rung khi bị chiếu', 'Chỉ trên điện thoại hỗ trợ'],
  ['autoAdvice', 'Mặc định tự động tư vấn', 'Áp dụng cho ván mới'],
  ['showLegal', 'Hiện nước đi hợp lệ', 'Chấm xanh ở ô có thể đi'],
  ['showCoords', 'Hiện số cột', 'Đánh số 1–9 quanh bàn cờ'],
  ['animation', 'Hiệu ứng di chuyển quân', ''],
];
function renderSettings() {
  const st = S.settings;
  $('#settings-toggles').innerHTML = TOGGLES.map(([k, label, sub]) => `<div class="field toggle-row"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><label class="switch"><input type="checkbox" data-k="${k}" ${st[k] ? 'checked' : ''}><i></i></label></div>`).join('');
  $$('#settings-toggles input').forEach((i) => i.onchange = () => {
    if (i.dataset.k === 'music') { setMusic(i.checked); return; }
    st[i.dataset.k] = i.checked; store.saveSettings(st); applyBoardSettings();
  });
  $('#st-musicvol').value = Math.round((st.musicVolume ?? 0.8) * 100);
  $('#st-musicvol-val').textContent = $('#st-musicvol').value + '%';
  $('#st-advtime').value = String(st.adviceTime);
  $('#st-ai').value = st.aiEndpoint;
  $('#st-peer').value = st.peerHost;
  $('#app-version').textContent = `Cờ Tiên · phiên bản ${APP_VERSION}`;
}
$('#st-musicvol').addEventListener('input', (e) => {
  const v = +e.target.value / 100;
  S.settings.musicVolume = v; store.saveSettings(S.settings);
  $('#st-musicvol-val').textContent = e.target.value + '%';
  music.setVolume(v);
});
$('#st-advtime').addEventListener('change', (e) => { S.settings.adviceTime = +e.target.value; store.saveSettings(S.settings); });
$('#st-ai').addEventListener('change', (e) => { S.settings.aiEndpoint = e.target.value.trim(); store.saveSettings(S.settings); });
$('#st-peer').addEventListener('change', (e) => { S.settings.peerHost = e.target.value.trim(); store.saveSettings(S.settings); });

// ======================= KHỞI ĐỘNG =======================
function bindNav() {
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.go;
    if (t === 'setup-ai') openSetup('ai');
    else if (t === 'setup-local') openSetup('local');
    else if (t === 'online') openOnline();
    else go(t);
  }));
  $$('[data-back]').forEach((b) => b.addEventListener('click', back));
  $$('.seg[data-name] button').forEach((b) => b.addEventListener('click', () => {
    $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#home-profile').addEventListener('click', () => go('profile'));
  $('#btn-resume').addEventListener('click', () => {
    const cur = store.getCurrent();
    if (!cur) return;
    startGame(cur.cfg, cur);
  });
  $('#home-avatar').addEventListener('click', () => go('profile'));
  for (const id of ['#th-corner', '#th-line']) $(id).addEventListener('click', () => go('about'));
  $('#tip-puzzle').addEventListener('click', () => startPuzzle(dailyPuzzle()));
  $('#bell-btn').addEventListener('click', () => {
    const b = $('#bell-btn');
    b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring');
    music.bell();
  });
  $$('.music-btn').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setMusic(!S.settings.music); }));
  $('#btn-install').addEventListener('click', openInstall);
  $('#btn-install-2').addEventListener('click', openInstall);
  $('#install-close').addEventListener('click', () => {
    try { localStorage.setItem('thcotuong:installHide', String(Date.now())); } catch { /* bỏ qua */ }
    renderHome();
  });
}

// ======================= CÀI APP =======================
const appUrl = () => location.origin + location.pathname;
function installHidden() {
  try { const t = +localStorage.getItem('thcotuong:installHide'); return t && Date.now() - t < 7 * 86400000; } catch { return false; }
}
async function openInstall() {
  if (isStandalone()) { toast('Cờ Tiên đã được cài trên máy này rồi ạ 🎉'); return; }
  if (S.installPrompt) {
    const ev = S.installPrompt;
    S.installPrompt = null;
    ev.prompt();
    const choice = await ev.userChoice.catch(() => null);
    if (choice && choice.outcome === 'accepted') toast('Đang cài Cờ Tiên…');
    renderHome();
    return;
  }
  const v = ask('Cài app Cờ Tiên', guideHTML(detectPlatform(), appUrl()), [{ label: 'Đã hiểu', value: null, cls: 'gold' }]);
  const copy = $('[data-copy-link]');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(appUrl()); toast('Đã sao chép link'); } catch { prompt('Sao chép link này:', appUrl()); }
  };
  await v;
}

function init() {
  history.replaceState({ screen: 'home' }, '', location.pathname + location.search);
  mountScene();
  music.setVolume(S.settings.musicVolume ?? 0.8);
  $('#hero-bell').innerHTML = bellSVG(118);
  bindNav();
  updateMusicButtons();
  initChat();
  setSoundEnabled(S.settings.sound);
  renderHome();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installPrompt = e; renderHome(); });
  window.addEventListener('appinstalled', () => { S.installPrompt = null; toast('Đã cài xong Cờ Tiên! Tìm biểu tượng trên màn hình nhé 🎉', 4000); renderHome(); });
  // Mở nhanh từ phím tắt của biểu tượng app: ?mo=ai | online | cothe
  const mo = new URLSearchParams(location.search).get('mo');
  if (mo) {
    history.replaceState({ screen: 'home' }, '', location.pathname);
    if (mo === 'ai') openSetup('ai'); else if (mo === 'online') openOnline(); else if (mo === 'cothe') go('puzzles');
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  // Mở từ link mời: ?phong=MÃ
  const code = new URLSearchParams(location.search).get('phong');
  if (code) {
    // Giữ mã phòng trên địa chỉ để lỡ tải lại trang vẫn vào lại được ván đang đánh
    openOnline(code.toUpperCase());
    ensureName().then(() => joinRoom(code));
  }
  // Lần chạm đầu tiên: mở khóa âm thanh và tự bật nhạc thiền (nếu đang bật trong cài đặt)
  const firstTouch = () => { sound.unlock(); if (S.settings.music) music.start(); };
  document.addEventListener('pointerdown', firstTouch, { once: true });
  document.addEventListener('keydown', firstTouch, { once: true });
  // Ẩn app thì tạm dừng nhạc và lưu ván; mở lại thì phát tiếp
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveCurrent(); music.stop(); }
    else if (S.settings.music && navigator.userActivation?.hasBeenActive !== false) music.start();
  });
}

init();

// Cho phép kiểm thử tự động truy cập trạng thái
window.__TH = { S, evalSentence };
