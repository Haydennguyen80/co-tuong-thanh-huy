// Đánh online qua link: kết nối trực tiếp giữa hai máy (WebRTC qua PeerJS).
// Chủ phòng tạo mã phòng; người được mời mở link ?phong=MÃ là vào chơi.
const ID_PREFIX = 'th-cotuong-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let peerLib = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLib) return peerLib;
  peerLib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('./vendor/peerjs.min.js', import.meta.url).href;
    s.onload = () => resolve(window.Peer);
    s.onerror = () => { peerLib = null; reject(new Error('Không tải được thư viện kết nối')); };
    document.head.appendChild(s);
  });
  return peerLib;
}

export function makeRoomCode() {
  let c = '';
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  for (const x of a) c += CODE_CHARS[x % CODE_CHARS.length];
  return c;
}

export function roomLink(code) {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('phong', code);
  return u.href;
}

// Tùy chọn máy chủ: "host:port/path" hoặc để trống dùng máy chủ miễn phí của PeerJS
function peerOptions(peerHost) {
  const opts = { debug: 1 };
  if (peerHost) {
    const u = new URL(peerHost.includes('://') ? peerHost : 'https://' + peerHost);
    opts.host = u.hostname;
    opts.port = +(u.port || (u.protocol === 'http:' ? 80 : 443));
    opts.path = u.pathname || '/';
    opts.secure = u.protocol === 'https:';
  }
  return opts;
}

/**
 * Phiên chơi online. Sự kiện (on): status, open, message, connected, disconnected, error
 */
export class OnlineSession {
  constructor({ role, code, peerHost = '', pid = '' }) {
    this.role = role; // 'host' | 'guest'
    this.pid = pid;
    this.code = code;
    this.peerHost = peerHost;
    this.handlers = {};
    this.conn = null;
    this.closed = false;
    this.lastSeen = 0;
    this.retryTimer = null;
    this.heartbeat = null;
  }

  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const fn of this.handlers[ev] || []) fn(...a); }

  async start() {
    const Peer = await loadPeerJS();
    const opts = peerOptions(this.peerHost);
    this.emit('status', this.role === 'host' ? 'Đang tạo phòng…' : 'Đang kết nối tới phòng…');
    this.peer = this.role === 'host' ? new Peer(ID_PREFIX + this.code, opts) : new Peer(opts);
    this.peer.on('open', () => {
      this.emit('open');
      if (this.role === 'host') this.emit('status', 'Phòng đã sẵn sàng. Gửi link cho bạn để vào chơi.');
      else this.connect();
    });
    this.peer.on('connection', (conn) => {
      if (this.role !== 'host') { conn.close(); return; }
      // Cùng một người kết nối lại (ví dụ rớt mạng) thì thay kết nối cũ
      const sameGuest = this.conn && conn.metadata && this.conn.metadata && conn.metadata.pid === this.conn.metadata.pid;
      const stale = this.conn && Date.now() - this.lastSeen > 10000;
      if (this.conn && this.conn.open && !sameGuest && !stale) {
        conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); });
        return;
      }
      if (this.conn && this.conn !== conn) { const old = this.conn; this.conn = null; try { old.close(); } catch { /* bỏ qua */ } }
      this.attach(conn);
    });
    this.peer.on('disconnected', () => { if (!this.closed) { try { this.peer.reconnect(); } catch { /* bỏ qua */ } } });
    this.peer.on('error', (err) => {
      const type = err && err.type;
      if (type === 'unavailable-id') this.emit('error', 'Mã phòng đang được dùng. Hãy tạo phòng mới.');
      else if (type === 'peer-unavailable') {
        if (this.role === 'guest') {
          this.emit('status', 'Chưa thấy chủ phòng, đang thử lại…');
          this.scheduleRetry();
        }
      } else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        this.emit('status', 'Mạng không ổn định, đang thử kết nối lại…');
        this.scheduleRetry();
      } else if (type === 'browser-incompatible') this.emit('error', 'Trình duyệt không hỗ trợ chơi online. Hãy dùng Chrome hoặc Safari mới.');
      else this.emit('status', 'Lỗi kết nối: ' + (err && err.message || type));
    });
  }

  connect() {
    if (this.closed || !this.peer || this.peer.destroyed) return;
    const conn = this.peer.connect(ID_PREFIX + this.code, { reliable: true, serialization: 'json', metadata: { pid: this.pid } });
    this.attach(conn);
  }

  scheduleRetry() {
    if (this.closed || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.peer && this.peer.disconnected && !this.peer.destroyed) { try { this.peer.reconnect(); } catch { /* bỏ qua */ } }
      if (this.role === 'guest' && !(this.conn && this.conn.open)) this.connect();
    }, 3000);
  }

  attach(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.lastSeen = Date.now();
      this.emit('connected');
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (!this.conn || !this.conn.open) return;
        this.send({ t: 'ping' });
        if (Date.now() - this.lastSeen > 15000) { this.emit('disconnected'); try { this.conn.close(); } catch { /* bỏ qua */ } }
      }, 4000);
    });
    conn.on('data', (msg) => {
      this.lastSeen = Date.now();
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') { this.send({ t: 'pong' }); return; }
      if (msg.t === 'pong') return;
      this.emit('message', msg);
    });
    conn.on('close', () => {
      if (this.conn !== conn) return;
      clearInterval(this.heartbeat);
      if (this.closed) return;
      this.emit('disconnected');
      if (this.role === 'guest') this.scheduleRetry();
    });
    conn.on('error', () => { if (this.role === 'guest') this.scheduleRetry(); });
  }

  get connected() { return !!(this.conn && this.conn.open); }

  send(msg) {
    if (this.conn && this.conn.open) { try { this.conn.send(msg); return true; } catch { return false; } }
    return false;
  }

  close() {
    this.closed = true;
    clearInterval(this.heartbeat);
    clearTimeout(this.retryTimer);
    try { if (this.conn) this.conn.close(); } catch { /* bỏ qua */ }
    try { if (this.peer) this.peer.destroy(); } catch { /* bỏ qua */ }
  }
}
