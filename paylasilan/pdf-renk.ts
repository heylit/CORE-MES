// PDF sayfa görüntüsünün temaya göre renklendirilmesi (ADR 0032). Tarayıcı (istemci/src/ortak/cizim/pdf.ts) ve sunucunun görüntü süreci
// (sunucu/moduller/arkon/pdf-goruntu) aynı işlevi kullanır: renklendirme iki yerde aynı kuralla yapılır (pdf.js çiziminin kenar yumuşatması tarayıcıyla küçük farklar verebilir).
// Saf işlevdir; tuval, DOM ve dosya erişimi yoktur.

export type PdfGorunusu = 'net' | 'blue' | 'orig';
export type Rgb = readonly [number, number, number];

export interface RenkAyari {
  koyu: boolean;
  look: PdfGorunusu;
  // Kalınlaştırma tekrar sayısı (okuma ayarındaki 'bold', varsayılan 1); lo görüntüde bir eksik uygulanır.
  bold: number;
  // lo: ekran çözünürlüğünde pdf.js çizgileri zaten 1 px, kalınlaştırma bir kademe az ve gama yumuşak.
  lo: boolean;
  // Mürekkep rengi: net ve orig görünüşte --ink, blue görünüşte --bp (tasarım değişkeninin o anki değeri).
  renk: Rgb;
}

// Algoritma değişirse sürüm artar: eski sürümle hazırlanmış görüntü imzası tutmaz, tablet kendisi üretir.
export const RENK_SURUMU = 'r1';

const hex = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

// Görüntünün kimliği: aynı imza aynı pikselleri verir. Sunucu ile tablet bu metni karşılaştırır.
export function renkImzasi(a: RenkAyari): string {
  return [RENK_SURUMU, a.koyu ? 'k' : 'a', a.look, 'b' + (Number.isFinite(a.bold) ? a.bold : 1), a.lo ? 'lo' : 'hi', hex(a.renk[0]) + hex(a.renk[1]) + hex(a.renk[2])].join('.');
}

// Görünüş ayarından renk ayarı: 'blue' dışındaki her değer 'net' sayılır (orig ayrıca).
export function gorunus(look: unknown): PdfGorunusu {
  return look === 'blue' || look === 'orig' ? look : 'net';
}

// kaynak: RGBA pikseller (pdf.js'in beyaz zemine çizdiği sayfa); hedef aynı boyda, sıfırlarla dolu dizi.
export function renklendirPiksel(kaynak: Uint8ClampedArray, W: number, H: number, hedef: Uint8ClampedArray, a: RenkAyari): void {
  const s = kaynak, d = hedef, net = a.look !== 'blue', bp = a.renk;
  if (a.look === 'orig') { d.set(s); return; }
  const bold = Math.max(0, a.bold - (a.lo ? 1 : 0));
  for (let i = 0; i < s.length; i += 4) {
    const r = s[i]!, g = s[i + 1]!, b = s[i + 2]!, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255, sat = (mx - mn) / 255, ink = 1 - lum;
    if (ink < 0.05 && sat < 0.1) { d[i + 3] = 0; continue; }
    // Yarı saydam kenar pikselleri güçlendirilir (gama): ince yazı silik görünmesin.
    const al = net ? Math.pow(ink, a.lo ? 0.8 : 0.6) * (a.lo ? 1.3 : 1.5) : ink * 1.3;
    // net: yalnız kırmızı (eksen çizgisi) renkli kalır, öteki renkli yazı ve çizgi mürekkep rengine döner.
    if (sat > 0.22 && (!net || (r > 150 && g < 110 && b < 110))) {
      const k = a.koyu ? 0.35 : 0; d[i] = r + (255 - r) * k; d[i + 1] = g + (255 - g) * k; d[i + 2] = b + (255 - b) * k; d[i + 3] = Math.min(255, (al * 1.08 + sat) * 255);
    } else { d[i] = bp[0]; d[i + 1] = bp[1]; d[i + 2] = bp[2]; d[i + 3] = Math.min(255, al * 255); }
  }
  // İnce CAD çizgileri ekrana sığınca kaybolmasın: alfa kanalında 3×3 genişletme (kalınlaştırma ayarı kadar tekrar).
  const a0 = new Uint8ClampedArray(W * H);
  for (let pass = 0; pass < bold; pass++) {
    for (let i = 0, j = 3; i < a0.length; i++, j += 4) a0[i] = d[j]!;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; if (a0[i]! > 200) continue;
        let m = a0[i]!, mi = i;
        const n = [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1];
        for (let q = 0; q < 8; q++) { const v = a0[n[q]!]! * (q < 4 ? 0.9 : 0.7); if (v > m) { m = v; mi = n[q]!; } }
        if (mi !== i) { const o = 4 * i, p = 4 * mi; d[o] = d[p]!; d[o + 1] = d[p + 1]!; d[o + 2] = d[p + 2]!; d[o + 3] = m; }
      }
    }
  }
}
