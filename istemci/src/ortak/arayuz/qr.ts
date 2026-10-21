import qrcode from 'qrcode-generator';

// Okuyucular kodun çevresinde boş kenar ister; iki modül el terminali ve etiket yazıcısında yeterli okundu (stok, refakat kartı).
export const QR_SESSIZ_PAY = 2;

// Hata düzeltme M: etiket yıpranınca da okunur, kod küçük kalır.
export function qrKareleri(metin: string): { modul: number; yol: string } {
  const q = qrcode(0, 'M');
  q.addData(metin);
  q.make();
  const modul = q.getModuleCount();
  let yol = '';
  for (let y = 0; y < modul; y++) for (let x = 0; x < modul; x++) if (q.isDark(y, x)) yol += `M${x + QR_SESSIZ_PAY} ${y + QR_SESSIZ_PAY}h1v1h-1z`;
  return { modul, yol };
}

const kac = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Ayrı baskı belgesine konan kod: belge uygulamanın stilini taşımaz, kâğıtta her temada siyah üstüne beyaz basılır.
export function qrSvgMetni(metin: string): string {
  const { modul, yol } = qrKareleri(metin);
  const k = modul + 2 * QR_SESSIZ_PAY;
  return `<svg viewBox="0 0 ${k} ${k}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="QR: ${kac(metin)}">`
    + `<rect width="${k}" height="${k}" fill="#fff"/><path d="${yol}" fill="#000"/></svg>`;
}
