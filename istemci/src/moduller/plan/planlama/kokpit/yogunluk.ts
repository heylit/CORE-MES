import type { KokpitEmri, KokpitModeli } from './kurallar.ts';

// Kokpit gantt yoğun veride okunurluk, dilim 1 (KURGU T1 ufuk, T5 etiket, T6 oklar). Saf; ekran Tahta.tsx ve Kokpit.tsx.

// T1: motorun ufku tahtada yalnız çizilir (sunucunun yazdığı ufukGun; sayfa değiştirmez). Ufuk tahtanın içindeyse saati, değilse null.
export function ufukCizgisi(m: Pick<KokpitModeli, 'bas' | 'son'>, ufukSonu: number | null | undefined): number | null {
  if (ufukSonu == null || !Number.isFinite(ufukSonu)) return null;
  return ufukSonu > m.bas && ufukSonu < m.son ? ufukSonu : null;
}
export const ufukYazisi = (zaman: (t: number) => string, ufukSonu: number): string => `Plan ufku · ${zaman(ufukSonu).slice(0, 5)}`;
// Ufka sığmayan emir: en az bir adımı ufuktan sonra bitiyor (motor ufku o emir için uzattı, 3484 c).
export const ufkaSigmaz = (e: Pick<KokpitEmri, 'ufukEksik'>): boolean => (e.ufukEksik ?? 0) > 0;
export const ufkaSigmayanSayisi = (emirler: readonly Pick<KokpitEmri, 'ufukEksik'>[]): number => emirler.filter(ufkaSigmaz).length;

// T5: çubuk yazısı sığarsa içinde; sığmazsa sağdaki boş yer yetiyorsa dışında; o da yoksa yalnız emir kodu içeride (kod sığarsa); yoksa yazısız.
// Yazı kesilmez (üç nokta yok); tam metin her durumda ipucunda ve ekran okuyucu adındadır.
export type EtiketYeri = 'ic' | 'dis' | 'kod' | 'yok';
// Yazı genişliği ölçülmez, tahmin edilir (tahta yazısı 12 px; harf başına üst sınır ve çubuğun iç payı). Tahmin cömerttir: sığmayan yazı içeride kesilmesin.
export const ETIKET_HARF = 7, ETIKET_PAYI = 16;
export const etiketEni = (yazi: string): number => (yazi.length === 0 ? 0 : yazi.length * ETIKET_HARF + ETIKET_PAYI);
export function etiketYeri(cubukEni: number, sagBosluk: number, kod: string, ek: string): EtiketYeri {
  const tam = etiketEni(ek ? `${kod} ${ek}` : kod);
  if (tam <= cubukEni) return 'ic';
  if (tam <= sagBosluk) return 'dis';
  return kod && etiketEni(kod) <= cubukEni ? 'kod' : 'yok';
}

// T6: yoğunlukta (görünen satır 50'den çok) "Oklar: seçili sipariş" kipi yalnız seçili emrin (yoksa odaktaki işin emrinin) bağlarını çizer;
// bütün siparişin okları yüzlerce satırda örgü olur.
export const YOGUN_SATIR = 50;
export const YOGUN_OK_ACIKLAMASI = 'Çok satırda yalnız seçili emrin adımları';
// Görünen satır: Tezgâh gözünde tezgâhlar; Sipariş gözünde emirler ve açık emirlerin adım satırları.
export function gorunenSatirSayisi(goz: 'T' | 'S', tezgahSayisi: number, emirler: readonly Pick<KokpitEmri, 'id' | 'adimlar'>[], acik: ReadonlySet<string> | null): number {
  if (goz === 'T') return tezgahSayisi;
  return emirler.length + (acik ? emirler.reduce((n, e) => n + (acik.has(e.id) ? e.adimlar.length : 0), 0) : 0);
}
export function okKumesi(yanan: ReadonlySet<string> | null, odakEmir: string | null, secEmir: string | null, satirSayisi: number): ReadonlySet<string> | null {
  if (satirSayisi > YOGUN_SATIR) { const e = secEmir ?? odakEmir; return e ? new Set([e]) : null; }
  return yanan ?? (odakEmir ? new Set([odakEmir]) : null);
}
