// Lưu trữ trên máy: hồ sơ, cài đặt, ván đã chơi, điểm xếp hạng.
const PREFIX = 'thcotuong:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const AVATARS = ['🐯', '🐉', '🦁', '🐴', '🦅', '🐘', '🐢', '🦊', '🐼', '🐓', '🐃', '🐟', '🌾', '🌴', '⭐', '👑'];

export const DEFAULT_SETTINGS = {
  music: true,          // nhạc thiền tự bật
  musicVolume: 0.8,     // âm lượng nhạc thiền (0..1)
  sound: true,
  vibrate: true,
  autoAdvice: false,     // tự động tư vấn sau mỗi nước
  adviceTime: 1500,      // thời gian máy suy nghĩ khi tư vấn (ms)
  showLegal: true,       // hiện chấm gợi ý nước đi hợp lệ
  showCoords: true,      // hiện số cột
  animation: true,
  aiEndpoint: '',        // địa chỉ máy chủ "Thầy AI" (tùy chọn)
  peerHost: '',          // máy chủ kết nối riêng (tùy chọn, để trống dùng máy chủ miễn phí)
};

export const store = {
  getProfile() {
    let p = read('profile', null);
    if (!p) { p = { id: uid(), name: '', avatar: AVATARS[0], createdAt: Date.now() }; write('profile', p); }
    return p;
  },
  saveProfile(p) { write('profile', p); },

  getSettings() { return { ...DEFAULT_SETTINGS, ...read('settings', {}) }; },
  saveSettings(s) { write('settings', s); },

  getGames() { return read('games', []); },
  saveGame(g) {
    const games = this.getGames();
    const i = games.findIndex((x) => x.id === g.id);
    if (i >= 0) games[i] = g; else games.unshift(g);
    while (games.length > 300) games.pop();
    write('games', games);
  },
  deleteGame(id) { write('games', this.getGames().filter((g) => g.id !== id)); },

  getRating() { return read('rating', { elo: 1200, games: 0 }); },
  saveRating(r) { write('rating', r); },

  getPuzzleProgress() { return read('puzzles', {}); },
  savePuzzleProgress(p) { write('puzzles', p); },

  getCurrent() { return read('current', null); },
  saveCurrent(c) { write('current', c); },
  clearCurrent() { try { localStorage.removeItem(PREFIX + 'current'); } catch { /* bỏ qua */ } },

  exportAll() {
    const data = {};
    for (const k of ['profile', 'settings', 'games', 'rating', 'puzzles']) data[k] = read(k, null);
    return { app: 'co-tuong-thanh-huy', version: 1, exportedAt: new Date().toISOString(), data };
  },
  importAll(obj) {
    if (!obj || obj.app !== 'co-tuong-thanh-huy' || !obj.data) throw new Error('Tệp sao lưu không đúng');
    for (const [k, v] of Object.entries(obj.data)) if (v !== null) write(k, v);
  },
};

// Elo: mức máy tương ứng với điểm
export const BOT_ELO = [0, 600, 800, 1000, 1200, 1450, 1700, 1900, 2100];

export function updateElo(my, opp, score, k = 32) {
  const expected = 1 / (1 + Math.pow(10, (opp - my) / 400));
  return Math.round(my + k * (score - expected));
}
