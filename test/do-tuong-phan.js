/**
 * do-tuong-phan.js — hàm đo chạy TRONG TRANG, cho kiem-tuong-phan.mjs
 *
 * Để RIÊNG một file chứ không nhét vào template literal của harness: trong
 * template literal mọi `\` bị nuốt một lớp, nên `\s+` thành `s+` và
 * `\p{L}` thành `p{L}` — regex hỏng âm thầm, phép đo trả về số vô nghĩa mà
 * vẫn xanh. Đã mất một lượt vì đúng chuyện đó.
 *
 * File này là MỘT BIỂU THỨC để `page.evaluate()` nuốt thẳng.
 */
(() => {
  const soMau = (s) => {
    const m = String(s).match(/[\d.]+/g);
    if (!m) return null;
    const [r, g, b, a = 1] = m.map(Number);
    return { r, g, b, a };
  };
  // Nền gradient: "backgroundColor" trả về TRONG SUỐT, nên nếu chỉ đọc trường
  // đó thì nút gradient nào cũng bị chấm là chữ-trắng-trên-nền-cha. Đã kêu oan
  // đúng một lần với nút "Thêm vào giỏ" (nền teal, chữ trắng, hoàn toàn ổn).
  // Lấy trung bình các điểm dừng màu — không chính xác tuyệt đối nhưng đủ để
  // phân biệt "đọc được" với "không đọc được".
  const mauNen = (cs) => {
    const c = soMau(cs.backgroundColor);
    if (c && c.a > 0) return c;
    const anh = cs.backgroundImage;
    if (anh && anh !== 'none') {
      const diem = [...anh.matchAll(/rgba?\([^)]+\)/g)].map((m) => soMau(m[0])).filter(Boolean);
      if (diem.length) {
        return {
          r: diem.reduce((s, x) => s + x.r, 0) / diem.length,
          g: diem.reduce((s, x) => s + x.g, 0) / diem.length,
          b: diem.reduce((s, x) => s + x.b, 0) / diem.length,
          a: 1,
        };
      }
    }
    return c;
  };

  // Nền trong suốt thì phải trộn với nền của cha, đúng thứ tự "source over"
  // mà trình duyệt vẽ: nền của con nằm TRÊN nền của cha.
  const nenThat = (el) => {
    let acc = null;
    for (let n = el; n; n = n.parentElement) {
      const c = mauNen(getComputedStyle(n));
      if (!c || !c.a) continue;
      if (!acc) { acc = { ...c }; }
      else {
        const aOut = acc.a + c.a * (1 - acc.a);
        acc = {
          r: (acc.r * acc.a + c.r * c.a * (1 - acc.a)) / aOut,
          g: (acc.g * acc.a + c.g * c.a * (1 - acc.a)) / aOut,
          b: (acc.b * acc.a + c.b * c.a * (1 - acc.a)) / aOut,
          a: aOut,
        };
      }
      if (acc.a >= 0.999) return acc;
    }
    // Không gặp lớp đục nào -> nền trang.
    const nen = soMau(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    if (!acc) return nen;
    const aOut = acc.a + 1 * (1 - acc.a);
    return {
      r: (acc.r * acc.a + nen.r * (1 - acc.a)) / aOut,
      g: (acc.g * acc.a + nen.g * (1 - acc.a)) / aOut,
      b: (acc.b * acc.a + nen.b * (1 - acc.a)) / aOut,
      a: 1,
    };
  };

  const kenh = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const sang = (c) => 0.2126 * kenh(c.r) + 0.7152 * kenh(c.g) + 0.0722 * kenh(c.b);
  const tuongPhan = (a, b) => {
    const [x, y] = [sang(a), sang(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  // Đo từng THẺ MANG CHỮ, không đo cả cái nút.
  //
  // Nút hay có cấu trúc <button><b>Bàn 3</b><s>đang phục vụ</s></button>, mỗi
  // thẻ con một màu riêng. Đọc "color" của cái nút là đọc một màu có thể chẳng
  // tô chữ nào, và bỏ sót đúng dòng chữ mờ nhất.
  const chuTrucTiep = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());

  const ra = [];
  for (const nut of document.querySelectorAll('button, .btn, .chip, a[role=button]')) {
    const r = nut.getBoundingClientRect();
    if (!r.width || !r.height) continue;                 // đang ẩn
    const csn = getComputedStyle(nut);
    if (csn.visibility === 'hidden' || Number(csn.opacity) < 0.5) continue;

    for (const el of [nut, ...nut.querySelectorAll('*')]) {
      if (!chuTrucTiep(el)) continue;
      const chu = [...el.childNodes]
        .filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
      if (!chu) continue;
      // Toàn biểu tượng thì không có gì để đọc theo nghĩa chữ nghĩa.
      if (!/[\p{L}\p{N}]/u.test(chu)) continue;

      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      // Thẻ con có thể đang ẩn dù cái nút thì hiện — chấm báo số trên thanh
      // dưới là ca đó. Đo một thứ không ai nhìn thấy là báo động giả, mà báo
      // động giả thì vài lần là không ai đọc kết quả nữa.
      if (!el.getClientRects().length) continue;
      const mo = Number(cs.opacity);
      const mauChu = soMau(cs.color);
      if (!mauChu) continue;
      // Chữ trong suốt một phần thì màu thật là màu đã trộn với nền.
      const aChu = (mauChu.a ?? 1) * (Number.isFinite(mo) ? mo : 1);
      const nen = nenThat(el);
      const troi = {
        r: mauChu.r * aChu + nen.r * (1 - aChu),
        g: mauChu.g * aChu + nen.g * (1 - aChu),
        b: mauChu.b * aChu + nen.b * (1 - aChu),
      };

      const co = parseFloat(cs.fontSize);
      const dam = Number(cs.fontWeight) >= 700;
      const lon = co >= 24 || (co >= 18.66 && dam);
      ra.push({
        chu: chu.replace(/\s+/g, ' ').slice(0, 30),
        lop: (el === nut
          ? ''
          : `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).trim().replace(/\s+/g, '.') : ''} trong `)
          + (nut.className ? '.' + String(nut.className).trim().replace(/\s+/g, '.') : nut.id ? '#' + nut.id : nut.tagName),
        tp: Math.round(tuongPhan(troi, nen) * 100) / 100,
        can: lon ? 3 : 4.5,
      });
    }
  }
  return ra;
})()
