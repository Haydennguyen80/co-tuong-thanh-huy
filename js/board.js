// Vẽ bàn cờ bằng SVG, chọn/kéo quân, mũi tên gợi ý.
import { RED, colorOf, rowOf, colOf, moveFrom, moveTo, typeOf, KING } from './xiangqi.js';
import { pieceChar } from './notation.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL = 100, X0 = 60, Y0 = 92, W = 920, H = 1084;

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};


export class BoardView {
  constructor(container, handlers = {}) {
    this.container = container;
    this.h = handlers; // { canSelect(sq), targets(sq) -> [to], onMove(from, to) }
    this.flipped = false;
    this.interactive = true;
    this.showLegal = true;
    this.showCoords = true;
    this.animate = true;
    this.selected = -1;
    this.state = null;
    this.build();
  }

  build() {
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'board-svg', role: 'img', 'aria-label': 'Bàn cờ tướng' });
    const defs = el('defs', {}, svg);
    defs.innerHTML = `
      <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#F6DFAE"/><stop offset="0.55" stop-color="#EBC888"/><stop offset="1" stop-color="#DDB06B"/>
      </linearGradient>
      <pattern id="grain" width="120" height="18" patternUnits="userSpaceOnUse"><path d="M0 8Q30 3 60 8T120 8" stroke="#B8894A" stroke-width="1.6" fill="none" opacity="0.2"/></pattern>
      <radialGradient id="pieceFace" cx="0.38" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#FFFBEF"/><stop offset="0.6" stop-color="#F4E2B8"/><stop offset="1" stop-color="#D8B57A"/>
      </radialGradient>
      <filter id="pieceShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#3b2a12" flood-opacity="0.45"/>
      </filter>
      <marker id="arrowBest" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1E8E3E"/></marker>
      <marker id="arrowThreat" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#C62828"/></marker>
      <marker id="arrowHint" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#2A4D94"/></marker>`;
    el('rect', { x: 0, y: 0, width: W, height: H, rx: 26, fill: 'url(#wood)' }, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, rx: 26, fill: 'url(#grain)' }, svg);
    this.gridLayer = el('g', { class: 'grid' }, svg);
    this.coordLayer = el('g', { class: 'coords' }, svg);
    this.markLayer = el('g', {}, svg);
    this.pieceLayer = el('g', {}, svg);
    this.arrowLayer = el('g', { class: 'arrows' }, svg);
    this.svg = svg;
    this.container.appendChild(svg);
    this.drawGrid();
    this.bindInput();
  }

  drawGrid() {
    const g = this.gridLayer;
    g.innerHTML = '';
    const stroke = { stroke: '#5A3B1A', 'stroke-width': 3, fill: 'none' };
    el('rect', { x: X0 - 14, y: Y0 - 14, width: 8 * CELL + 28, height: 9 * CELL + 28, ...stroke, 'stroke-width': 6 }, g);
    for (let r = 0; r < 10; r++) el('line', { x1: X0, y1: Y0 + r * CELL, x2: X0 + 8 * CELL, y2: Y0 + r * CELL, ...stroke }, g);
    for (let c = 0; c < 9; c++) {
      if (c === 0 || c === 8) el('line', { x1: X0 + c * CELL, y1: Y0, x2: X0 + c * CELL, y2: Y0 + 9 * CELL, ...stroke }, g);
      else {
        el('line', { x1: X0 + c * CELL, y1: Y0, x2: X0 + c * CELL, y2: Y0 + 4 * CELL, ...stroke }, g);
        el('line', { x1: X0 + c * CELL, y1: Y0 + 5 * CELL, x2: X0 + c * CELL, y2: Y0 + 9 * CELL, ...stroke }, g);
      }
    }
    // Cung tướng
    for (const top of [0, 7]) {
      el('line', { x1: X0 + 3 * CELL, y1: Y0 + top * CELL, x2: X0 + 5 * CELL, y2: Y0 + (top + 2) * CELL, ...stroke }, g);
      el('line', { x1: X0 + 5 * CELL, y1: Y0 + top * CELL, x2: X0 + 3 * CELL, y2: Y0 + (top + 2) * CELL, ...stroke }, g);
    }
    // Dấu vị trí Pháo, Tốt
    const marks = [[2, 1], [2, 7], [7, 1], [7, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]];
    for (const [r, c] of marks) {
      const x = X0 + c * CELL, y = Y0 + r * CELL, d = 8, l = 18;
      for (const sx of [-1, 1]) {
        if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue;
        for (const sy of [-1, 1]) {
          el('path', { d: `M${x + sx * (d + l)} ${y + sy * d}L${x + sx * d} ${y + sy * d}L${x + sx * d} ${y + sy * (d + l)}`, ...stroke, 'stroke-width': 2.5 }, g);
        }
      }
    }
    // Sông
    const ry = Y0 + 4.5 * CELL;
    const river = el('g', { 'font-family': '"Noto Serif SC","STKaiti","KaiTi",serif', 'font-size': 56, fill: '#5A3B1A', 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
    el('text', { x: X0 + 1.5 * CELL, y: ry }, river).textContent = '楚 河';
    el('text', { x: X0 + 6.5 * CELL, y: ry }, river).textContent = '漢 界';
  }

  drawCoords() {
    const g = this.coordLayer;
    g.innerHTML = '';
    if (!this.showCoords) return;
    const attrs = { 'font-size': 30, fill: '#6B4A22', 'text-anchor': 'middle', 'font-family': 'Work Sans, sans-serif', 'font-weight': 600 };
    for (let c = 0; c < 9; c++) {
      const x = X0 + c * CELL;
      // Số cột theo phía bên dưới (cột 1 ở bên phải người ngồi dưới)
      const bottomSide = this.flipped ? 1 : 0;
      const bottomNum = 9 - c, topNum = c + 1;
      el('text', { ...attrs, x, y: H - 12, fill: bottomSide === RED ? '#9B1C1C' : '#222' }, g).textContent = bottomNum;
      el('text', { ...attrs, x, y: 32, fill: bottomSide === RED ? '#222' : '#9B1C1C' }, g).textContent = topNum;
    }
  }

  xy(sq) {
    let r = rowOf(sq), c = colOf(sq);
    if (this.flipped) { r = 9 - r; c = 8 - c; }
    return [X0 + c * CELL, Y0 + r * CELL];
  }

  sqAt(x, y) {
    let c = Math.round((x - X0) / CELL), r = Math.round((y - Y0) / CELL);
    if (c < 0 || c > 8 || r < 0 || r > 9) return -1;
    const dx = x - (X0 + c * CELL), dy = y - (Y0 + r * CELL);
    if (dx * dx + dy * dy > 55 * 55) return -1;
    if (this.flipped) { r = 9 - r; c = 8 - c; }
    return r * 9 + c;
  }

  setFlipped(f) { this.flipped = f; this.drawCoords(); if (this.state) this.render(this.state.board, { ...this.state.opts, animate: 0 }); }

  /**
   * board: Int8Array(90); opts: { lastMove, checkSq, arrows: [{from,to,kind}], animate: move }
   */
  render(board, opts = {}) {
    this.state = { board: Int8Array.from(board), opts };
    if (!this.coordLayer.childNodes.length) this.drawCoords();
    this.drawMarks();
    const pl = this.pieceLayer;
    pl.innerHTML = '';
    this.pieceEls = new Map();
    const anim = this.animate && opts.animate ? opts.animate : 0;
    for (let sq = 0; sq < 90; sq++) {
      const p = board[sq];
      if (!p) continue;
      const [x, y] = this.xy(sq);
      const g = el('g', { class: 'piece' + (colorOf(p) === RED ? ' red' : ' black'), 'data-sq': sq }, pl);
      g.style.transform = `translate(${x}px, ${y}px)`;
      // Quân cờ nổi 3D: bóng đổ + hai lớp cạnh gỗ + mặt quân
      el('ellipse', { cx: 5, cy: 13, rx: 47, ry: 45, fill: '#3a2508', opacity: 0.28 }, g);
      el('circle', { cy: 7, r: 45, fill: '#A9783C' }, g);
      el('circle', { cy: 3.5, r: 45, fill: '#C39050' }, g);
      el('circle', { r: 45, fill: 'url(#pieceFace)', stroke: '#8A5F2E', 'stroke-width': 2.5 }, g);
      el('circle', { r: 37, fill: 'none', stroke: colorOf(p) === RED ? '#B3261E' : '#222', 'stroke-width': 3 }, g);
      const t = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', y: 2, 'font-size': 50, 'font-weight': 900, fill: colorOf(p) === RED ? '#B3261E' : '#1A1A1A', 'font-family': '"Noto Serif SC","STKaiti","KaiTi","Songti SC",serif' }, g);
      t.textContent = pieceChar(p);
      this.pieceEls.set(sq, g);
      if (anim && moveTo(anim) === sq) {
        const [fx, fy] = this.xy(moveFrom(anim));
        g.style.transition = 'none';
        g.style.transform = `translate(${fx}px, ${fy}px)`;
        pl.appendChild(g); // nằm trên cùng
        requestAnimationFrame(() => requestAnimationFrame(() => {
          g.style.transition = 'transform 0.2s ease-out';
          g.style.transform = `translate(${x}px, ${y}px)`;
        }));
      }
    }
    this.drawArrows(opts.arrows || []);
  }

  drawMarks() {
    const g = this.markLayer, opts = this.state.opts;
    g.innerHTML = '';
    if (opts.lastMove) {
      for (const sq of [moveFrom(opts.lastMove), moveTo(opts.lastMove)]) {
        const [x, y] = this.xy(sq);
        el('rect', { x: x - 48, y: y - 48, width: 96, height: 96, rx: 14, fill: 'rgba(42,77,148,0.16)', stroke: '#2A4D94', 'stroke-width': 3, 'stroke-dasharray': '10 8' }, g);
      }
    }
    if (opts.checkSq >= 0 && opts.checkSq !== undefined) {
      const [x, y] = this.xy(opts.checkSq);
      el('circle', { cx: x, cy: y, r: 56, fill: 'rgba(220,38,38,0.35)', class: 'check-glow' }, g);
    }
    if (this.selected >= 0) {
      const [x, y] = this.xy(this.selected);
      el('circle', { cx: x, cy: y, r: 52, fill: 'rgba(201,162,94,0.45)', stroke: '#8A5F3B', 'stroke-width': 4 }, g);
      if (this.showLegal && this.h.targets) {
        for (const to of this.h.targets(this.selected)) {
          const [tx, ty] = this.xy(to);
          if (this.state.board[to]) el('circle', { cx: tx, cy: ty, r: 50, fill: 'none', stroke: '#1E8E3E', 'stroke-width': 6, class: 'target' }, g);
          else el('circle', { cx: tx, cy: ty, r: 14, fill: '#1E8E3E', opacity: 0.75, class: 'target' }, g);
        }
      }
    }
  }

  drawArrows(arrows) {
    const g = this.arrowLayer;
    g.innerHTML = '';
    const colors = { best: ['#1E8E3E', 'arrowBest'], threat: ['#C62828', 'arrowThreat'], hint: ['#2A4D94', 'arrowHint'] };
    for (const a of arrows) {
      const [x1, y1] = this.xy(a.from), [x2, y2] = this.xy(a.to);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const ex = x2 - (dx / len) * 22, ey = y2 - (dy / len) * 22;
      const [color, marker] = colors[a.kind] || colors.hint;
      el('line', { x1, y1, x2: ex, y2: ey, stroke: color, 'stroke-width': 16, 'stroke-linecap': 'round', opacity: 0.78, 'marker-end': `url(#${marker})` }, g);
    }
  }

  setArrows(arrows) { if (this.state) { this.state.opts.arrows = arrows; this.drawArrows(arrows); } }

  select(sq) { this.selected = sq; if (this.state) this.drawMarks(); }

  // ---------- Nhập liệu: chạm-chạm hoặc kéo-thả ----------
  bindInput() {
    const svg = this.svg;
    const toSvg = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      if (!this.interactive || !this.state) return;
      const { x, y } = toSvg(e);
      const sq = this.sqAt(x, y);
      if (sq < 0) { this.select(-1); return; }
      if (this.selected >= 0 && sq !== this.selected && this.h.targets && this.h.targets(this.selected).includes(sq)) {
        const from = this.selected; this.select(-1);
        this.h.onMove(from, sq);
        return;
      }
      if (this.h.canSelect && this.h.canSelect(sq)) {
        const wasSelected = this.selected === sq;
        this.select(sq);
        const g = this.pieceEls.get(sq);
        if (g) {
          drag = { sq, g, startX: x, startY: y, moved: false, wasSelected };
          svg.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
      } else this.select(-1);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const { x, y } = toSvg(e);
      if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) < 18) return;
      if (!drag.moved) { drag.moved = true; this.pieceLayer.appendChild(drag.g); drag.g.classList.add('dragging'); }
      drag.g.style.transition = 'none';
      drag.g.style.transform = `translate(${x}px, ${y}px) scale(1.12)`;
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      if (!d.moved) { if (d.wasSelected) this.select(-1); return; }
      const { x, y } = toSvg(e);
      const sq = this.sqAt(x, y);
      d.g.classList.remove('dragging');
      if (sq >= 0 && sq !== d.sq && this.h.targets(d.sq).includes(sq)) {
        this.select(-1);
        this.h.onMove(d.sq, sq, true);
      } else {
        const [ox, oy] = this.xy(d.sq);
        d.g.style.transition = 'transform 0.15s';
        d.g.style.transform = `translate(${ox}px, ${oy}px)`;
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }
}

export function kingSquareIfCheck(pos) {
  if (!pos.inCheck()) return -1;
  for (let sq = 0; sq < 90; sq++) if (pos.board[sq] && typeOf(pos.board[sq]) === KING && colorOf(pos.board[sq]) === pos.turn) return sq;
  return -1;
}
