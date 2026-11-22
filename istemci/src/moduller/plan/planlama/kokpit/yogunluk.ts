import type { KokpitEmri, KokpitModeli, KokpitOlcegi } from './kurallar.ts';

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

// Dilim 2. T3: Hafta ve üstünde iş gerçek boyunda çizilir; okunur genişlik (3365 a) yalnız Gün ve 3 gün'dedir (S1 a, 3552).
export const okunurGenislik = (olcek: KokpitOlcegi): boolean => olcek === 'G' || olcek === '3';
// Dar yan yana işler bir "N iş" kümesi olur (V4): iki iş arası boşluk KUME_BOSLUK px'ten az ve ikisi de KUME_DAR px'ten darsa birleşir.
export const KUME_BOSLUK = 4, KUME_DAR = 12;
export interface KumeGirdisi { id: string; sol: number; en: number }
export interface Birim { idler: string[]; sol: number; en: number }
export function kumele(l: readonly KumeGirdisi[]): Birim[] {
  const sirali = [...l].sort((a, b) => a.sol - b.sol), out: Birim[] = [];
  let son: (Birim & { sonEn: number }) | null = null;
  for (const x of sirali) {
    if (son && x.en < KUME_DAR && son.sonEn < KUME_DAR && x.sol - (son.sol + son.en) < KUME_BOSLUK) {
      son.idler.push(x.id); son.en = Math.max(son.en, x.sol + x.en - son.sol); son.sonEn = x.en;
      continue;
    }
    son = { idler: [x.id], sol: x.sol, en: x.en, sonEn: x.en };
    out.push(son);
  }
  return out.map(({ idler, sol, en }) => ({ idler, sol, en }));
}
export const kumeYazisi = (n: number): string => `${String(n)} iş`;

// T4: satır boyu. Rahat bugünkü (dokunma boyu), Sıkı daha alçak; dokunmatik ekranda Sıkı kapalıdır (dokunma hedefi). Tarayıcıda hatırlanır (V6).
export type SatirBoyu = 'rahat' | 'siki';
export const SATIR_ANAHTARI = 'coremes.kokpit-satir-boyu';
export const satirBoyuCoz = (ham: string | null | undefined, dokunmatik: boolean): SatirBoyu => (!dokunmatik && ham === 'siki' ? 'siki' : 'rahat');
