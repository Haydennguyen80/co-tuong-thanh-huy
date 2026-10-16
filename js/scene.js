// Cảnh nền "Thiền — chùa cổ": núi mờ, chùa cổ, sương sớm, tre hai bên; chuông đồng; logo thư pháp.
let n = 0;
const uid = (p) => `${p}${++n}`;

function leaf(x, y, len, ang, col, op = 0.92) {
  const w = len * 0.13;
  return `<path transform="translate(${x},${y}) rotate(${ang})" d="M0 0C${len * 0.25} ${-w} ${len * 0.7} ${-w * 0.9} ${len} 0C${len * 0.7} ${w * 0.9} ${len * 0.25} ${w} 0 0Z" fill="${col}" opacity="${op}"/>`;
}

function stalk(x, y0, y1, w, seg, dark) {
  const id = uid('bs');
  const c = dark ? ['#4E7A23', '#7FA845', '#3E6619'] : ['#7BA645', '#B4D277', '#5C8A2C'];
  let s = `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${c[2]}"/><stop offset=".45" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[0]}"/></linearGradient></defs>`;
  for (let y = y0; y < y1; y += seg) {
    const h = Math.min(seg - 4, y1 - y);
    s += `<rect x="${x - w / 2}" y="${y}" width="${w}" height="${h}" rx="${w * 0.35}" fill="url(#${id})"/>`;
    s += `<rect x="${x - w / 2 - 1.5}" y="${y + h - 3}" width="${w + 3}" height="6" rx="3" fill="${c[2]}" opacity=".9"/>`;
  }
  return s;
}

// Cụm tre sát viền; side = 'left' | 'right'
export function bambooSVG(side, H = 1000, scale = 0.9) {
  const W = Math.round(150 * scale);
  let s = `<svg class="bamboo ${side}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin slice" aria-hidden="true"><g${side === 'right' ? ` transform="translate(${W},0) scale(-1,1)"` : ''}>`;
  for (const [x, w, seg, dark] of [[18, 14, 118, true], [44, 9, 96, false], [6, 11, 140, false]]) s += stalk(x * scale, -20, H + 20, w * scale, seg * scale, dark);
  const greens = ['#5C8F2C', '#7FB046', '#A2C96A'];
  for (let cy = 90; cy < H; cy += 170) {
    const cx = (cy / 170) % 2 < 1 ? 30 : 50;
    for (let i = 0; i < 5; i++) s += leaf(cx * scale, cy, (52 + (i * 13) % 30) * scale, -10 + i * 22 + (cy % 17), greens[i % 3]);
  }
  return s + '</g></svg>';
}

function temple(x, y, sc, col, op) {
  let s = `<g transform="translate(${x},${y}) scale(${sc})" fill="${col}" opacity="${op}">`;
  for (const [ty, w, h] of [[0, 120, 26], [-36, 96, 22], [-68, 74, 19], [-96, 54, 16]]) {
    s += `<path d="M${-w / 2 - 22} ${ty}Q${-w / 2} ${ty - 4} ${-w / 2 + 6} ${ty - h}L${w / 2 - 6} ${ty - h}Q${w / 2} ${ty - 4} ${w / 2 + 22} ${ty}Q${w / 2 + 8} ${ty + 3} ${w / 2 - 4} ${ty + 2}L${-w / 2 + 4} ${ty + 2}Q${-w / 2 - 8} ${ty + 3} ${-w / 2 - 22} ${ty}Z"/>`;
    s += `<rect x="${-w / 2 + 12}" y="${ty + 2}" width="${w - 24}" height="${ty === 0 ? 46 : 14}"/>`;
  }
  return s + '<rect x="-3" y="-140" width="6" height="34"/><circle cx="0" cy="-142" r="5"/></g>';
}

const ridge = (W, y, col, op) => `<path d="M0 ${y}L${W * 0.12} ${y - 70}L${W * 0.25} ${y - 30}L${W * 0.42} ${y - 110}L${W * 0.6} ${y - 40}L${W * 0.78} ${y - 95}L${W} ${y - 30}L${W} ${y + 400}L0 ${y + 400}Z" fill="${col}" opacity="${op}"/>`;

// Phong cảnh xa (núi, chùa, sương, mặt trời) — vẽ trong khung 430 x 420, co giãn theo bề ngang
export function landscapeSVG() {
  return `<svg class="landscape" viewBox="0 0 430 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <radialGradient id="sceneSun" cx=".72" cy=".2" r=".45"><stop offset="0" stop-color="#FFE3A8" stop-opacity=".95"/><stop offset="1" stop-color="#FFE3A8" stop-opacity="0"/></radialGradient>
      <linearGradient id="sceneMist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6EAD0" stop-opacity="0"/><stop offset="1" stop-color="#F6EAD0"/></linearGradient>
    </defs>
    <rect width="430" height="420" fill="url(#sceneSun)"/>
    ${ridge(430, 300, '#C9BB9C', 0.45)}
    ${ridge(430, 336, '#B5A584', 0.35)}
    ${temple(300, 286, 0.95, '#9E8A66', 0.5)}
    <rect y="270" width="430" height="150" fill="url(#sceneMist)"/>
  </svg>`;
}

// Chuông đồng cổ (dùng ở trang chủ)
export function bellSVG(size = 120) {
  const g = uid('bell'), h = uid('bellHi');
  return `<svg class="bell" width="${size}" height="${size * 1.15}" viewBox="-70 -84 140 162" aria-hidden="true">
    <defs>
      <linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="#5E3F15"/><stop offset=".28" stop-color="#B98A3E"/><stop offset=".45" stop-color="#E8C786"/><stop offset=".62" stop-color="#B07E34"/><stop offset="1" stop-color="#4E3310"/></linearGradient>
      <radialGradient id="${h}" cx=".4" cy=".3" r=".6"><stop offset="0" stop-color="#FFF1CF" stop-opacity=".7"/><stop offset="1" stop-color="#FFF1CF" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="0" cy="74" rx="56" ry="6" fill="#3a2508" opacity=".22"/>
    <path d="M-12 -66a12 12 0 1 1 24 0v10h-24z" fill="none" stroke="#6B4A1E" stroke-width="7"/>
    <rect x="-16" y="-58" width="32" height="12" rx="5" fill="#7B5524"/>
    <path d="M-34 -46Q-36 0 -46 40L-52 54H52L46 40Q36 0 34 -46Q0 -56 -34 -46Z" fill="url(#${g})"/>
    <path d="M-34 -46Q-36 0 -46 40L-52 54H52L46 40Q36 0 34 -46Q0 -56 -34 -46Z" fill="url(#${h})"/>
    <rect x="-56" y="52" width="112" height="10" rx="5" fill="#6B4A1E"/>
    <path d="M-36 -18H36M-40 14H40" stroke="#5C3E16" stroke-width="2.5" opacity=".55"/>
    <g fill="#5C3E16" opacity=".55">${[-24, -12, 0, 12, 24].map((x) => `<circle cx="${x}" cy="-32" r="3"/>`).join('')}</g>
    <rect x="-13" y="-10" width="26" height="20" rx="3" fill="none" stroke="#5C3E16" stroke-width="2" opacity=".5"/>
    <circle cx="0" cy="62" r="7" fill="#5C3E16"/>
  </svg>`;
}

// Logo thư pháp "Cờ Tiên" (mẫu C Sếp chọn)
export function logoSVG(size = 300) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 300 300" aria-label="Cờ Tiên">
    <circle cx="150" cy="150" r="118" fill="none" stroke="#C9A25E" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>
    <text x="150" y="146" text-anchor="middle" font-family="'Dancing Script',cursive" font-weight="700" font-size="96" fill="#7A1F14">Cờ Tiên</text>
    <path d="M70 172Q150 158 232 172" stroke="#B3261E" stroke-width="5" fill="none" stroke-linecap="round"/>
    <rect x="128" y="190" width="44" height="44" rx="6" fill="#B3261E"/>
    <text x="150" y="213" text-anchor="middle" dominant-baseline="central" font-family="'Noto Serif SC',serif" font-weight="900" font-size="30" fill="#FFF3E0">棋</text>
  </svg>`;
}

export function mountScene() {
  const el = document.createElement('div');
  el.className = 'scene';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = landscapeSVG() + bambooSVG('left', 1400) + bambooSVG('right', 1400);
  document.body.prepend(el);
}
