import type { AmbalajTuru } from '#paylasilan/sozlesme/stok.ts';

// Önizlemedeki ambalaj kataloğu (ölçüler cm). Çap verilenlerde taban çap × çaptır. Yalnız ekran içindir:
// sunucu ölçü kodunu ve özel ölçüyü saklar, katalog sunucuda yoktur.
export interface Olcu { kod: string; ad: string; L: number; W: number; H: number; ipucu?: string }
export const AMBALAJ_KATALOGU: Record<AmbalajTuru, { ad: string; aciklama: string; varsayilan: string; ozel: boolean; olculer: Olcu[] }> = {
  kasa: { ad: 'Plastik kasa', aciklama: 'Avadanlık ve istif kasası', varsayilan: 'hop', ozel: true, olculer: [
    { kod: 'hop', ad: 'Avadanlık kutusu', L: 35, W: 21, H: 15, ipucu: 'Önü açık, raf önünden alınır' },
    { kod: 'k32', ad: 'İstif kasası S', L: 30, W: 20, H: 12 },
    { kod: 'k43', ad: 'İstif kasası M', L: 40, W: 30, H: 17 },
    { kod: 'k64', ad: 'İstif kasası L', L: 60, W: 40, H: 23 },
    { kod: 'k64d', ad: 'Derin kasa', L: 60, W: 40, H: 32 }] },
  koli: { ad: 'Karton koli', aciklama: 'Kutulu ürün', varsayilan: 'm', ozel: true, olculer: [
    { kod: 's', ad: 'Küçük koli', L: 30, W: 20, H: 15 },
    { kod: 'm', ad: 'Orta koli', L: 40, W: 30, H: 30 },
    { kod: 'l', ad: 'Büyük koli', L: 60, W: 40, H: 40 },
    { kod: 'xl', ad: 'Jumbo koli', L: 80, W: 60, H: 60 }] },
  palet: { ad: 'Paletli', aciklama: 'Palet üstünde yük', varsayilan: 'eur1', ozel: false, olculer: [
    { kod: 'eur1', ad: 'Euro palet EUR1', L: 120, W: 80, H: 14.4 },
    { kod: 'eur2', ad: 'Endüstriyel EUR2', L: 120, W: 100, H: 14.4 },
    { kod: 'eur6', ad: 'Yarım palet EUR6', L: 80, W: 60, H: 14.4 },
    { kod: 'pls', ad: 'Plastik palet', L: 120, W: 80, H: 15 }] },
  bidon: { ad: 'Bidon / varil', aciklama: 'Sıvı ve kimyasal', varsayilan: 'd20', ozel: false, olculer: [
    { kod: 'd5', ad: 'Bidon 5 L', L: 19, W: 13, H: 29 },
    { kod: 'd20', ad: 'Bidon 20 L', L: 29, W: 24, H: 43 },
    { kod: 'v60', ad: 'Varil 60 L', L: 40, W: 40, H: 62 },
    { kod: 'v200', ad: 'Varil 200 L', L: 58, W: 58, H: 88 },
    { kod: 'ibc', ad: 'IBC tank 1000 L', L: 120, W: 100, H: 116 }] },
  makara: { ad: 'Makara', aciklama: 'Kablo, hortum, şerit', varsayilan: 'r630', ozel: false, olculer: [
    { kod: 'r500', ad: 'Makara Ø50', L: 50, W: 30, H: 50 },
    { kod: 'r630', ad: 'Makara Ø63', L: 63, W: 38, H: 63 },
    { kod: 'r800', ad: 'Makara Ø80', L: 80, W: 48, H: 80 },
    { kod: 'r1000', ad: 'Makara Ø100', L: 100, W: 60, H: 100 }] },
};
const sayi = (m: string): number => Number(m);
export const olcuBul = (tur: AmbalajTuru, kod: string): Olcu | null => AMBALAJ_KATALOGU[tur].olculer.find((o) => o.kod === kod) ?? null;
export const olcuMetni = (o: { L: number; W: number; H: number }): string => `${o.L}×${o.W}×${o.H} cm`;

// Sığma (önizlemedeki "raf gözü iç ölçüsü"): göz genişliğine yan yana kaç ambalaj sığar, yükseklik kat aralığına sığar mı.
// Palet rafında kiriş ve boşluk için 25 cm, diğerlerinde 6 cm düşülür; palet yükü palet yüksekliğiyle birlikte ölçülür.
export function sigma(o: { L: number; W: number; H: number }, raf: { tur: string; bolmeGenislikM: string; derinlikM: string; katAraligiM: string }) {
  const genislik = sayi(raf.bolmeGenislikM) * 100 - 8;
  const yukseklik = sayi(raf.katAraligiM) * 100 - (raf.tur === 'palet' ? 25 : raf.tur === 'zemin' ? 0 : 6);
  const derinlik = sayi(raf.derinlikM) * 100;
  const yanYana = Math.max(0, Math.floor((genislik + 7) / (o.W + 7)));
  return { yanYana, sigar: yanYana > 0 && o.H <= yukseklik + 2 && o.L <= derinlik + 20, ic: `${Math.round(genislik)}×${Math.round(derinlik)}×~${Math.round(yukseklik)} cm` };
}
// Doluluk (raf matrisi): gözdeki ambalajların göz genişliğinden kapladığı pay; ambalajı bilinmeyen dolu göz için null.
export function doluluk(ambalajlar: { tur: AmbalajTuru; olcu: string; adet: number | null }[], bolmeGenislikM: string): number | null {
  if (ambalajlar.length === 0) return null;
  const genislik = sayi(bolmeGenislikM) * 100 - 8;
  const kaplanan = ambalajlar.reduce((t, a) => t + ((olcuBul(a.tur, a.olcu)?.W ?? 40) + 7) * (a.adet ?? 1), 0);
  return Math.min(1, kaplanan / Math.max(1, genislik));
}
