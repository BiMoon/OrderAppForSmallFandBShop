/**
 * Cầu nối in — nhận HTTP POST từ app, đẩy thẳng byte vào máy in qua TCP 9100.
 *
 *   node tools/cau-noi-in.mjs --may=192.168.1.50
 *   node tools/cau-noi-in.mjs --may=192.168.1.50 --cong=9100 --nghe=9110
 *
 * ── Vì sao cần nó ───────────────────────────────────────────────────────────
 *
 * Máy in nhiệt WiFi nghe ESC/POS THÔ ở cổng TCP 9100. Trình duyệt không mở
 * được socket TCP, và sẽ không bao giờ mở được. Cái file 60 dòng này là toàn
 * bộ phần còn thiếu: một cổng HTTP quay ra socket.
 *
 * Chạy trên bất cứ máy nào luôn bật trong quán — điện thoại Android cũ cài
 * Termux, một con Raspberry Pi, hay chính máy tính ở quầy. KHÔNG mở ra
 * Internet: nó nhận byte rồi in, không hỏi han gì, nên chỉ được nằm trong LAN.
 *
 * ── Lưu ý khi lắp ───────────────────────────────────────────────────────────
 *
 * • Đặt IP TĨNH cho máy in (hoặc gán cố định trong DHCP của router). DHCP đổi
 *   IP là mất in, và chuyện đó luôn xảy ra vào giờ đông khách.
 * • Trang chạy HTTPS gọi http://192.168.x.x cần Chrome ≥142 (Local Network
 *   Access) và một lần bấm đồng ý.
 */

import { createServer } from 'node:http';
import { Socket } from 'node:net';

const doc = (ten, mac) => {
  const v = process.argv.find(a => a.startsWith(`--${ten}=`));
  return v ? v.slice(ten.length + 3) : mac;
};

const MAY  = doc('may', '');
const CONG = Number(doc('cong', 9100));
const NGHE = Number(doc('nghe', 9110));

if (!MAY){
  console.error('Thiếu địa chỉ máy in.  node tools/cau-noi-in.mjs --may=192.168.1.50');
  process.exit(1);
}

/** Mở socket, đẩy hết byte, đóng. Mỗi lần in một kết nối — máy in rẻ hay rớt
    kết nối giữ lâu, mà giữ lại cũng chẳng tiết kiệm được gì đáng kể. */
function inRa(bytes){
  return new Promise((xong, hong) => {
    const s = new Socket();
    const het = (e) => { s.destroy(); e ? hong(e) : xong(); };
    s.setTimeout(8000, () => het(new Error('máy in không trả lời sau 8 giây')));
    s.on('error', het);
    s.connect(CONG, MAY, () => s.end(bytes, () => het()));
  });
}

createServer(async (req, res) => {
  // Trình duyệt gửi preflight trước khi POST octet-stream từ origin khác.
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-private-network': 'true',
    'access-control-max-age': '86400',
  };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();

  if (req.method === 'GET' && req.url === '/'){
    return res.writeHead(200, { ...cors, 'content-type': 'text/plain; charset=utf-8' })
              .end(`Cầu nối in đang chạy.\nMáy in: ${MAY}:${CONG}\n`);
  }
  if (req.method !== 'POST' || !req.url.startsWith('/in')){
    return res.writeHead(404, cors).end('không có đường này');
  }

  const manh = [];
  let co = 0;
  for await (const c of req){
    co += c.length;
    if (co > 4_000_000){ res.writeHead(413, cors).end('quá lớn'); return req.destroy(); }
    manh.push(c);
  }
  const bytes = Buffer.concat(manh);

  try {
    await inRa(bytes);
    console.log(new Date().toLocaleTimeString('vi-VN'), `đã in ${bytes.length} byte`);
    res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end('{"ok":true}');
  } catch (e) {
    console.error(new Date().toLocaleTimeString('vi-VN'), 'lỗi in:', e.message);
    res.writeHead(502, { ...cors, 'content-type': 'application/json' })
       .end(JSON.stringify({ ok: false, message: e.message }));
  }
}).listen(NGHE, () => {
  console.log(`Cầu nối in: nghe :${NGHE}  →  máy in ${MAY}:${CONG}`);
  console.log('Điền địa chỉ này vào màn Cài đặt máy in của app.');
});
