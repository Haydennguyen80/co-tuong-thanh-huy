# Cờ Tướng Thanh Huy

Ứng dụng cờ tướng chạy trên điện thoại và máy tính, cài bằng link (PWA), mang thương hiệu **Dịch Vụ Cầm Đồ Thanh Huy**.

## Tính năng

| Phần | Nội dung |
|---|---|
| 🤖 Đánh với máy | 8 mức độ khó, từ "Mới tập" tới "Cao thủ". Máy chạy ngay trên máy, không cần mạng. |
| 💡 Thầy tư vấn | Sau mỗi nước: chấm điểm (⭐ Hay nhất · ✅ Tốt · 👍 Tạm được · ⚠️ Thiếu chính xác · ❌ Sai lầm · 💥 Hớ nặng), vẽ mũi tên chỉ nước tốt hơn, giải thích bằng tiếng Việt, đưa 3 phương án tốt nhất. Có nút "Đi lại, thử nước tốt hơn". Có thể bật tư vấn tự động. |
| 🎯 Gợi ý | Chỉ nước nên đi tiếp, bấm bao nhiêu lần cũng được. |
| 📊 Phân tích cả ván | Biểu đồ thế cờ, độ chính xác (%) của mỗi bên, danh sách nước sai kèm nước nên đi. |
| 🌐 Đánh online | Tạo phòng, gửi link qua Zalo hoặc Messenger. Bạn bè bấm link là vào chơi, không cần đăng ký. Có trò chuyện, biểu tượng cảm xúc, xin hòa, xin đi lại, đấu lại, tự kết nối lại khi rớt mạng. |
| ⏱ Thời gian | Không giới hạn, 5+3, 10, 10+5, 15, 15+10, 20, 30, 45, 60 phút. |
| 👥 Hai người một máy | Ngồi chung một máy, thay phiên nhau đi. |
| 🧩 Cờ thế | 30 bài chiếu bí 1, 2, 3 nước. Máy đã kiểm chứng từng bài. |
| 🏆 Hồ sơ | Tên, ảnh đại diện, điểm xếp hạng (Elo), thống kê, bảng đối đầu với bạn bè, sao lưu dữ liệu. |
| 🎓 Thầy AI (tùy chọn) | Nối thêm Claude để giảng kỹ như thầy dạy cờ (tốn phí theo lượt hỏi). |

## Cấu trúc thư mục

```
index.html, css/app.css      Giao diện (màu và chữ theo bộ nhận diện Thanh Huy)
js/xiangqi.js                Luật cờ: sinh nước đi, chiếu, FEN
js/engine.js                 Máy chơi cờ (alpha-beta, đào sâu dần, bảng chuyển vị)
js/engine-worker.js          Chạy máy cờ ở luồng riêng để giao diện không bị đứng
js/coach.js                  Thầy tư vấn: chấm điểm và giải thích tiếng Việt
js/notation.js               Ký hiệu kiểu Việt Nam: "Pháo 2 bình 5"
js/game.js                   Ván cờ: kết quả, trường chiếu, lặp lại, 60 nước
js/board.js                  Vẽ bàn cờ SVG, chạm hoặc kéo thả quân
js/online.js                 Đánh online (WebRTC qua PeerJS)
js/app.js                    Điều khiển các màn hình
js/puzzles.js                30 bài cờ thế
sw.js, manifest.webmanifest  Cài app và chạy không cần mạng
server/thay-ai/              Máy chủ Thầy AI (Cloudflare Worker, tùy chọn)
tests/                       Kiểm thử: luật (perft), máy cờ, tư vấn, cờ thế
```

## Chạy thử trên máy tính

```bash
python3 -m http.server 8080
# mở http://localhost:8080
npm test   # chạy kiểm thử (cần Node.js 18 trở lên)
```

## Đưa app lên mạng miễn phí (GitHub Pages)

1. Tạo kho (repository) mới trên GitHub, ví dụ `co-tuong-thanh-huy`, để **Public**.
2. Đưa toàn bộ thư mục này lên làm gốc của kho.
3. Vào **Settings → Pages**, phần **Source** chọn **GitHub Actions**. Tệp `.github/workflows/pages.yml` có sẵn sẽ tự đưa app lên mỗi khi có thay đổi.
4. Link app có dạng: `https://<tên-tài-khoản>.github.io/co-tuong-thanh-huy/`
5. Gửi link này cho bạn bè. Họ mở trên điện thoại rồi chọn **"Thêm vào màn hình chính"** là có biểu tượng app.

> Khi sửa code, hãy tăng số `VERSION` trong `sw.js` để máy người dùng nhận bản mới.

## Đánh online hoạt động thế nào

- Hai máy kết nối **trực tiếp** với nhau (WebRTC). Máy chủ miễn phí `0.peerjs.com` chỉ làm nhiệm vụ "giới thiệu" hai máy với nhau.
- Một số mạng 4G hoặc mạng công ty chặn kết nối trực tiếp. Khi đó PeerJS tự chuyển qua máy chủ chuyển tiếp miễn phí của họ.
- Khi đông người chơi hoặc cần ổn định hơn, có thể tự dựng máy chủ PeerJS riêng (`npx peerjs --port 9000`), rồi điền địa chỉ vào **Cài đặt → Máy chủ kết nối online**.
- Nếu **người được mời** lỡ tải lại trang, app tự vào lại ván. Nếu **chủ phòng** tải lại trang thì ván đó dừng, phải tạo phòng mới.

## Cài Thầy AI (tùy chọn, có phí)

Máy cờ trong app luôn miễn phí. Thầy AI dùng Claude để giảng giải sâu hơn:

1. Tạo tài khoản và lấy khóa API tại https://console.anthropic.com (trả phí theo lượt dùng).
2. Tạo tài khoản Cloudflare miễn phí.
3. Trong thư mục `server/thay-ai`, chạy:
   ```bash
   npm install
   npx wrangler login
   npx wrangler secret put ANTHROPIC_API_KEY   # dán khóa API khi được hỏi
   npx wrangler deploy
   ```
4. Wrangler in ra địa chỉ dạng `https://thay-ai-co-tuong.<tên>.workers.dev`. Dán địa chỉ này vào **Cài đặt → Thầy AI** trong app.
5. Mô hình mặc định là `claude-opus-5-5` (giảng hay nhất). Muốn tiết kiệm chi phí, đổi `MODEL` trong `wrangler.toml` sang `claude-haiku-5-5`.
6. Nên đặt `ALLOWED_ORIGIN` bằng link app (ví dụ `https://<tên>.github.io`) để người khác không dùng ké máy chủ của mình.

## Dữ liệu người dùng

Mọi dữ liệu (hồ sơ, ván đã chơi, điểm) lưu ngay trên máy người dùng, không gửi đi đâu. Muốn chuyển sang máy khác thì dùng **Hồ sơ → Sao lưu dữ liệu**. Khi thương mại hóa có thể thêm tài khoản đăng nhập thật (Firebase hoặc Supabase) để đồng bộ giữa các máy và làm bảng xếp hạng chung.

## Liên hệ

Dịch Vụ Cầm Đồ Thanh Huy · Chợ Cái Côn - KV3, Ấp An Ninh 2, Xã An Lạc Thôn, TP. Cần Thơ · Hotline/Zalo 0916.31.33.44
