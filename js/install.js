// Cài app lên điện thoại / laptop: nhận biết thiết bị, hiện hướng dẫn phù hợp, mã QR.
import qrcode from './vendor/qrcode.mjs';

export const isStandalone = () =>
  (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches)) ||
  window.navigator.standalone === true;

export function detectPlatform() {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const inApp = /Zalo|FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Messenger/i.test(ua);
  const samsung = /SamsungBrowser/i.test(ua);
  const edge = /Edg\//.test(ua);
  const firefox = /Firefox|FxiOS/i.test(ua);
  const chromeIOS = /CriOS/.test(ua);
  const safariMac = !iOS && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  const mobile = iOS || android || /Mobile/i.test(ua);
  if (inApp) return { id: 'inapp', iOS, android, name: /Zalo/i.test(ua) ? 'Zalo' : 'ứng dụng' };
  if (iOS) return { id: chromeIOS ? 'ios-chrome' : 'ios-safari', iOS };
  if (android) return { id: samsung ? 'samsung' : firefox ? 'android-firefox' : 'android-chrome', android };
  if (safariMac) return { id: 'mac-safari' };
  if (firefox) return { id: 'desktop-firefox' };
  return { id: edge ? 'desktop-edge' : 'desktop-chrome', mobile };
}

// Mã QR dạng SVG
export function qrSVG(text, size = 180) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), cell = size / (n + 8);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${((c + 4) * cell).toFixed(2)} ${((r + 4) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
  return `<svg class="qr" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Mã QR"><rect width="${size}" height="${size}" rx="12" fill="#fff"/><path d="${d}" fill="#2B2116"/></svg>`;
}

// Biểu tượng nhỏ để minh họa nút cần bấm
const ICON = {
  share: '<span class="ins-ic"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="#1B6EF3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="4" y="11" width="16" height="10" rx="2.5" fill="none" stroke="#1B6EF3" stroke-width="2.2"/></svg></span>',
  plusSquare: '<span class="ins-ic"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="#333" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="#333" stroke-width="2" stroke-linecap="round"/></svg></span>',
  dots: '<span class="ins-ic"><b style="letter-spacing:-1px">⋮</b></span>',
  dotsH: '<span class="ins-ic"><b>⋯</b></span>',
  install: '<span class="ins-ic"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="#333" stroke-width="2"/><path d="M12 7v6M9 10l3 3 3-3M8 20h8" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round"/></svg></span>',
  menuLines: '<span class="ins-ic"><b>≡</b></span>',
};

const step = (n, html) => `<li><span class="ins-n">${n}</span><span>${html}</span></li>`;

export function guideHTML(p, url) {
  const steps = {
    'ios-safari': {
      title: 'Cài trên iPhone / iPad (Safari)',
      list: [
        `Bấm nút <b>Chia sẻ</b> ${ICON.share} ở thanh dưới cùng của Safari (iPad: góc trên bên phải).`,
        `Kéo xuống, chọn <b>“Thêm vào MH chính”</b> ${ICON.plusSquare}.`,
        'Bấm <b>“Thêm”</b> ở góc trên bên phải.',
        'Biểu tượng <b>Cờ Tiên</b> hiện trên màn hình chính, chạm vào là mở như app thật.',
      ],
    },
    'ios-chrome': {
      title: 'Cài trên iPhone (Chrome)',
      list: [
        `Bấm nút <b>Chia sẻ</b> ${ICON.share} ở góc trên bên phải thanh địa chỉ.`,
        `Chọn <b>“Thêm vào MH chính”</b> ${ICON.plusSquare}, rồi bấm <b>“Thêm”</b>.`,
        'Nếu không thấy mục này: mở link bằng <b>Safari</b> rồi làm theo hướng dẫn cho Safari.',
      ],
    },
    'android-chrome': {
      title: 'Cài trên điện thoại Android (Chrome)',
      list: [
        `Bấm nút ${ICON.dots} ở góc trên bên phải.`,
        `Chọn <b>“Cài đặt ứng dụng”</b> hoặc <b>“Thêm vào màn hình chính”</b>.`,
        'Bấm <b>“Cài đặt”</b>. Biểu tượng Cờ Tiên hiện trên màn hình chính và trong danh sách ứng dụng.',
      ],
    },
    samsung: {
      title: 'Cài trên Samsung (Samsung Internet)',
      list: [
        `Bấm nút ${ICON.menuLines} ở góc dưới bên phải.`,
        `Chọn <b>“Thêm trang vào”</b> → <b>“Màn hình chờ”</b> (hoặc biểu tượng ${ICON.install} trên thanh địa chỉ).`,
        'Bấm <b>“Thêm”</b>. Biểu tượng Cờ Tiên hiện trên màn hình chính.',
      ],
    },
    'android-firefox': {
      title: 'Cài trên Android (Firefox)',
      list: [`Bấm ${ICON.dots} → <b>“Cài đặt”</b> hoặc <b>“Thêm vào màn hình chính”</b>.`, 'Nên dùng <b>Chrome</b> để app chạy mượt nhất.'],
    },
    'desktop-chrome': {
      title: 'Cài trên laptop / máy tính (Chrome)',
      list: [
        `Bấm biểu tượng cài đặt ${ICON.install} ở cuối thanh địa chỉ (bên phải).`,
        `Hoặc bấm ${ICON.dots} → <b>“Truyền, lưu và chia sẻ”</b> → <b>“Cài đặt trang dưới dạng ứng dụng”</b>.`,
        'Bấm <b>“Cài đặt”</b>. Cờ Tiên mở trong cửa sổ riêng, có biểu tượng trên màn hình và thanh tác vụ.',
      ],
    },
    'desktop-edge': {
      title: 'Cài trên laptop / máy tính (Edge)',
      list: [
        `Bấm biểu tượng ${ICON.install} trên thanh địa chỉ, hoặc ${ICON.dotsH} → <b>“Ứng dụng”</b> → <b>“Cài đặt trang web này dưới dạng ứng dụng”</b>.`,
        'Bấm <b>“Cài đặt”</b>. Có thể ghim Cờ Tiên vào thanh tác vụ và Start.',
      ],
    },
    'mac-safari': {
      title: 'Cài trên MacBook (Safari)',
      list: ['Trên thanh menu, chọn <b>Tệp (File)</b> → <b>“Thêm vào Dock”</b>.', 'Bấm <b>“Thêm”</b>. Cờ Tiên hiện trên Dock như app thật.'],
    },
    'desktop-firefox': {
      title: 'Cài trên máy tính',
      list: ['Firefox chưa hỗ trợ cài app web.', 'Hãy mở link này bằng <b>Chrome</b> hoặc <b>Edge</b>, rồi bấm biểu tượng cài đặt trên thanh địa chỉ.'],
    },
    inapp: {
      title: `Đang mở trong ${p.name}`,
      list: [
        `Trình duyệt bên trong ${p.name} không cài được app. Bấm nút ${ICON.dotsH} hoặc ${ICON.dots} ở góc trên bên phải.`,
        p.iOS ? 'Chọn <b>“Mở bằng Safari”</b> (hoặc “Mở trong trình duyệt”).' : 'Chọn <b>“Mở bằng trình duyệt”</b> (Chrome).',
        'Khi trang đã mở trong Safari/Chrome, bấm lại nút <b>“Cài app”</b> để xem bước tiếp theo.',
      ],
      copy: true,
    },
  }[p.id];
  const desktop = p.id.startsWith('desktop') || p.id === 'mac-safari';
  return `
    <div class="ins">
      <p class="ins-why">Cài xong, Cờ Tiên có biểu tượng riêng, mở toàn màn hình như app thật và <b>chơi với máy được cả khi không có mạng</b>.</p>
      <h4>${steps.title}</h4>
      <ol class="ins-steps">${steps.list.map((h, i) => step(i + 1, h)).join('')}</ol>
      ${steps.copy ? `<button class="btn small" type="button" data-copy-link>📋 Sao chép link để dán vào Safari/Chrome</button>` : ''}
      ${desktop ? `<div class="ins-qr"><div>${qrSVG(url)}</div><p><b>Cài lên điện thoại:</b> mở Camera quét mã này để mở Cờ Tiên trên điện thoại, rồi bấm “Cài app”.</p></div>` : ''}
    </div>`;
}
