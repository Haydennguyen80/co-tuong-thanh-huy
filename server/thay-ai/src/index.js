// Thầy AI: nhận thông tin nước cờ từ app, nhờ Claude giảng giải bằng tiếng Việt dễ hiểu.
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `Bạn là "Thầy", một thầy dạy cờ tướng (xiangqi) người miền Tây Việt Nam, thân thiện, kiên nhẫn.
Học trò ở trình độ trung bình, muốn nâng cao. Hãy giảng bằng tiếng Việt, xưng "Thầy", gọi học trò là "con" hoặc "bạn".
Dữ liệu máy cờ (nước tốt nhất, điểm số, các phương án) là CHÍNH XÁC — tuyệt đối không bịa nước đi khác ngoài dữ liệu được cho.
Ký hiệu: "tấn" = tiến, "thoái" = lui, "bình" = đi ngang; cột đánh số 1-9 từ phải sang trái theo phía mỗi bên.
Điểm số: 1 điểm ≈ 1 con Tốt.
Cách giảng (ngắn gọn, khoảng 120-200 chữ):
1. Nhận xét nước học trò vừa đi: hay hay dở, vì sao.
2. Giải thích ý đồ của nước tốt nhất và phương án tiếp theo.
3. Rút ra một bài học/nguyên tắc chung để lần sau áp dụng.
Không dùng định dạng markdown phức tạp, chỉ văn xuôi và gạch đầu dòng đơn giản.`;

function cors(origin, allowed) {
  const allow = !allowed || allowed === origin ? (origin || '*') : allowed;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

const clip = (s, n) => String(s ?? '').slice(0, n);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, env.ALLOWED_ORIGIN);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'Chỉ nhận POST' }, 405, headers);
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) return json({ error: 'Không được phép' }, 403, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Dữ liệu không hợp lệ' }, 400, headers); }

    const history = Array.isArray(body.history) ? body.history.slice(-40).map((m) => clip(m, 40)) : [];
    const lines = Array.isArray(body.lines) ? body.lines.slice(0, 3).map((l) => clip(l, 300)) : [];
    const prompt = [
      `Các nước đã đi trong ván: ${history.join(', ') || '(chưa có)'}`,
      `Thế cờ trước nước cần giảng (FEN): ${clip(body.fenBefore, 120)}`,
      `Bên đi: ${clip(body.mover, 10)}`,
      `Nước học trò đã đi: ${clip(body.played, 40)} — máy chấm: ${clip(body.grade, 30)}`,
      `Nước tốt nhất theo máy: ${clip(body.best, 40)}`,
      `Đánh giá thế cờ sau nước học trò đi: ${clip(body.evaluation, 120)}`,
      `Các phương án tốt nhất của máy:\n${lines.join('\n')}`,
      'Thầy hãy giảng cho học trò hiểu.',
    ].join('\n');

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const msg = await client.beta.messages.create({
        model: env.MODEL || 'claude-opus-5-5',
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      });
      if (msg.stop_reason === 'refusal') return json({ error: 'Thầy AI không trả lời được câu này' }, 502, headers);
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return json({ text }, 200, headers);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json({ error: 'Thầy đang bận, thử lại sau ít phút' }, 429, headers);
      if (err instanceof Anthropic.AuthenticationError) return json({ error: 'Khóa API chưa đúng' }, 500, headers);
      if (err instanceof Anthropic.APIError) return json({ error: `Lỗi máy chủ AI (${err.status})` }, 502, headers);
      return json({ error: 'Không kết nối được máy chủ AI' }, 502, headers);
    }
  },
};
