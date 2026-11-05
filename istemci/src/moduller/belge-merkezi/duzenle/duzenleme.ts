// PDF düzenleyicisinin saf modeli (kart 2123). Öğeler sayfanın görünüm noktasında (pdf.js ölçek 1, sol üst köşe başlangıç,
// sayfanın /Rotate değeri uygulanmış) tutulur; PDF'e yazarken sayfanın kendi koordinatına çevrilir.

export type OgeTuru = 'dolgu' | 'cizgi' | 'logo' | 'yazi';

export interface Kutu { x: number; y: number; g: number; y2: number }

export type Oge =
  | ({ tur: 'dolgu'; renk: string } & Kutu)
  | { tur: 'cizgi'; x0: number; y0: number; x1: number; y1: number; renk: string; kalin: number }
  | ({ tur: 'logo' } & Kutu)
  | { tur: 'yazi'; x: number; y: number; metin: string; boy: number; renk: string };

// pdf.js'in `page.view` (görünür kutu: x1, y1, x2, y2) ve `page.rotate` değeri.
export interface SayfaKutusu { kutu: readonly [number, number, number, number]; donme: number }

export const VARSAYILAN_DOLGU = '#ffffff';
export const VARSAYILAN_CIZGI = '#111111';
export const YAZI_BOYLARI = [10, 12, 14, 16, 20, 24, 32] as const;
export const CIZGI_KALINLIKLARI = [0.7, 1, 1.4, 2, 3] as const;
export const EN_KUCUK_OLCU = 4;
export const YAZI_EN_UZUN = 200;

const RENK = /^#[0-9a-f]{6}$/i;
export const renkGecerliMi = (r: string): boolean => RENK.test(r);

export function renkBilesenleri(r: string): [number, number, number] {
  if (!renkGecerliMi(r)) throw new Error(`Geçersiz renk: ${r}`);
  const n = Number.parseInt(r.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const donmeSapla = (d: number): 0 | 90 | 180 | 270 => {
  const k = ((Math.round(d / 90) * 90) % 360 + 360) % 360;
  return k as 0 | 90 | 180 | 270;
};

// pdf.js PageViewport dönüşümünün (ölçek 1) aynısı: görünüm = M · pdf + t.
function donusum(s: SayfaKutusu): { a: number; b: number; c: number; d: number; e: number; f: number; en: number; boy: number } {
  const [x1, y1, x2, y2] = s.kutu;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const [a, b, c, d] = ({ 0: [1, 0, 0, -1], 90: [0, 1, 1, 0], 180: [-1, 0, 0, 1], 270: [0, -1, -1, 0] } as const)[donmeSapla(s.donme)];
  const yan = a === 0;
  const ox = yan ? Math.abs(cy - y1) : Math.abs(cx - x1);
  const oy = yan ? Math.abs(cx - x1) : Math.abs(cy - y1);
  const en = yan ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
  const boy = yan ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
  return { a, b, c, d, e: ox - a * cx - c * cy, f: oy - b * cx - d * cy, en, boy };
}

export function gorunumOlcusu(s: SayfaKutusu): { en: number; boy: number } {
  const { en, boy } = donusum(s);
  return { en, boy };
}

export function pdfNoktasi(s: SayfaKutusu, vx: number, vy: number): [number, number] {
  const { a, b, c, d, e, f } = donusum(s);
  // M ortogonal ve ±1 öğeli; tersi devriğidir.
  const u = vx - e, w = vy - f;
  return [a * u + b * w, c * u + d * w];
}

export function gorunumNoktasi(s: SayfaKutusu, px: number, py: number): [number, number] {
  const { a, b, c, d, e, f } = donusum(s);
  return [a * px + c * py + e, b * px + d * py + f];
}

// Görünümdeki eksene paralel kutu PDF'te de eksene paraleldir (dönme 90'ın katı).
export function pdfKutusu(s: SayfaKutusu, k: Kutu): { x: number; y: number; en: number; boy: number } {
  const [ax, ay] = pdfNoktasi(s, k.x, k.y);
  const [bx, by] = pdfNoktasi(s, k.x + k.g, k.y + k.y2);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), en: Math.abs(bx - ax), boy: Math.abs(by - ay) };
}

// Resim görünümde dik dursun diye sayfanın dönmesi kadar saat yönünün tersine döndürülür; dayanak görünümdeki sol alt köşedir.
export function resimYerlesimi(s: SayfaKutusu, k: Kutu): { x: number; y: number; en: number; boy: number; donme: number } {
  const [x, y] = pdfNoktasi(s, k.x, k.y + k.y2);
  return { x, y, en: k.g, boy: k.y2, donme: donmeSapla(s.donme) };
}

export function kutuNormalle(x0: number, y0: number, x1: number, y1: number): Kutu {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), g: Math.abs(x1 - x0), y2: Math.abs(y1 - y0) };
}

// Kaydetmeden önce öğeler denetlenir: ölçüsüz kutu, boş yazı, bozuk renk PDF'e girmez.
export function ogeReddi(o: Oge): string | null {
  if (o.tur === 'dolgu' || o.tur === 'logo') {
    if (!(o.g >= EN_KUCUK_OLCU && o.y2 >= EN_KUCUK_OLCU)) return 'Alan çok küçük.';
  }
  if (o.tur === 'cizgi' && Math.hypot(o.x1 - o.x0, o.y1 - o.y0) < EN_KUCUK_OLCU) return 'Çizgi çok kısa.';
  if (o.tur === 'cizgi' && !(o.kalin > 0)) return 'Çizgi kalınlığı geçersiz.';
  if (o.tur === 'yazi') {
    if (o.metin.trim() === '') return 'Yazı boş.';
    if (o.metin.length > YAZI_EN_UZUN) return `Yazı en çok ${String(YAZI_EN_UZUN)} karakter olabilir.`;
    if (!(o.boy > 0)) return 'Yazı boyu geçersiz.';
  }
  if ((o.tur === 'dolgu' || o.tur === 'cizgi' || o.tur === 'yazi') && !renkGecerliMi(o.renk)) return 'Renk geçersiz.';
  return null;
}

// Geri al / ileri al: sayfa başına öğe listelerinin anlık görüntüleri.
export interface Gecmis { simdi: Oge[][]; geri: Oge[][][]; ileri: Oge[][][] }

export const gecmisBaslat = (sayfaSayisi: number): Gecmis => ({ simdi: Array.from({ length: sayfaSayisi }, () => []), geri: [], ileri: [] });

export function degistir(g: Gecmis, sayfa: number, yeni: Oge[]): Gecmis {
  const simdi = g.simdi.map((l, i) => (i === sayfa ? yeni : l));
  return { simdi, geri: [...g.geri, g.simdi], ileri: [] };
}

export function geriAl(g: Gecmis): Gecmis {
  const onceki = g.geri.at(-1);
  return onceki ? { simdi: onceki, geri: g.geri.slice(0, -1), ileri: [...g.ileri, g.simdi] } : g;
}

export function ileriAl(g: Gecmis): Gecmis {
  const sonraki = g.ileri.at(-1);
  return sonraki ? { simdi: sonraki, geri: [...g.geri, g.simdi], ileri: g.ileri.slice(0, -1) } : g;
}

export const degisiklikVarMi = (g: Gecmis): boolean => g.simdi.some((l) => l.length > 0);

// Kaynak belge ve gerekçe yeni belgenin ilk revizyon notuna yazılır (not alanı en çok 300 karakter).
export const NOT_EN_UZUN = 300;
export function duzenlemeNotu(kaynakAd: string, kaynakHarf: string, gerekce: string): string {
  const bas = `Düzenlendi: ${kaynakAd} Rev ${kaynakHarf}. Gerekçe: `;
  const metin = bas + gerekce.trim();
  return metin.length <= NOT_EN_UZUN ? metin : `${metin.slice(0, NOT_EN_UZUN - 1)}…`;
}
