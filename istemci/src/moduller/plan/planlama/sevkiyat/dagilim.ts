import { gecMi, saatTarihi, type Olcu, type SevkSatiri } from './kurallar.ts';

// 3667: Sevk takvimi "Dağılım" görünümünün saf parçaları. Hesaplar kurallar.ts'tendir (aşan = gecMi); burada yalnız günlere dağıtma,
// gecikmiş kümesi, matris ve gün listesi vardır. Sevk edilen sipariş hiçbir kümeye girmez; bitişi olmayan sipariş günlere dağıtılmaz (sayı uydurulmaz).

export type DagilimAnahtari = 'musteri' | 'urun' | 'yer';
export type GunSekmesi = 'tumu' | 'bitecek' | 'termin' | 'asan';
export const GECIKMIS = 'gecikmis';
export type GunSecimi = number | typeof GECIKMIS;
export const MATRIS_GUN = 14;
export const TAKVIM_HAFTA = 5;

const gunNo = (t: number): number => Math.floor(t / 24);
const acik = (l: readonly SevkSatiri[]): SevkSatiri[] => l.filter((x) => !x.sevk);
const olc = (x: SevkSatiri, o: Olcu): number => (o === 'adet' ? x.adet ?? 0 : 1);
const topla = (l: readonly SevkSatiri[], o: Olcu): number => l.reduce((a, x) => a + olc(x, o), 0);

export interface GunSayisi { bitecek: number; asan: number; termin: number }

export const bitecekler = (l: readonly SevkSatiri[], gun: number): SevkSatiri[] => acik(l).filter((x) => x.C !== null && gunNo(x.C) === gun);
export const terminliler = (l: readonly SevkSatiri[], gun: number): SevkSatiri[] => acik(l).filter((x) => x.termin !== null && gunNo(x.termin) === gun);

// Gecikmiş: plan bitişi bugünden önce olup sevk kaydı olmayan sipariş (V1).
export const gecikmisler = (l: readonly SevkSatiri[], simdi: number): SevkSatiri[] => acik(l).filter((x) => x.C !== null && gunNo(x.C) < gunNo(simdi));
export const gecikmisSayisi = (l: readonly SevkSatiri[], simdi: number, o: Olcu): number => topla(gecikmisler(l, simdi), o);

// Bitişi olan ama hiçbir güne dağıtılamayan sipariş yoktur; bitişi olmayan sipariş sayısı notta söylenir.
export const bitissizSayisi = (l: readonly SevkSatiri[]): number => acik(l).filter((x) => x.C === null).length;

export function gunSayisi(l: readonly SevkSatiri[], gun: number, o: Olcu): GunSayisi {
  const b = bitecekler(l, gun);
  return { bitecek: topla(b, o), asan: topla(b.filter(gecMi), o), termin: topla(terminliler(l, gun), o) };
}

// planDisi: günün, plandaki son bitişten sonra olduğu (plan o güne kadar bakmıyor); boş gün "sipariş yok", plan dışı gün "plan yok" diye ayrılır. Plan ufku bu ekrana gelmez; son bitiş günü ölçüdür (V8).
export interface TakvimGunu { gun: number; tarih: Date; haftaGunu: number; bugun: boolean; sayi: GunSayisi; bos: boolean; planDisi: boolean }

// Takvim bugünün haftasından (pazartesi) başlar; geçmiş haftalar yer tutmaz.
export function takvimGunleri(l: readonly SevkSatiri[], taban: number, simdi: number, o: Olcu, hafta = TAKVIM_HAFTA): TakvimGunu[] {
  const bugun = gunNo(simdi);
  const ilk = bugun - ((saatTarihi(taban, bugun * 24).getUTCDay() + 6) % 7);
  const sonBitis = Math.max(-Infinity, ...acik(l).map((x) => (x.C === null ? -Infinity : gunNo(x.C))));
  return Array.from({ length: hafta * 7 }, (_, i) => {
    const gun = ilk + i;
    const sayi = gunSayisi(l, gun, o);
    return { gun, tarih: saatTarihi(taban, gun * 24), haftaGunu: i % 7, bugun: gun === bugun, sayi, bos: sayi.bitecek === 0 && sayi.termin === 0, planDisi: gun > sonBitis };
  });
}

export const anahtarDegeri = (x: SevkSatiri, k: DagilimAnahtari): string => (k === 'musteri' ? x.musteri : k === 'urun' ? x.ad ?? '—' : x.yer ?? '—');

export interface MatrisHucresi { toplam: number; asan: number }
export interface MatrisSatiri { ad: string; gecikmis: number; hucreler: MatrisHucresi[]; toplam: number }
export interface Matris { gunler: number[]; satirlar: MatrisSatiri[]; gecikmisToplam: number; gunToplamlari: number[]; genelToplam: number }

// Satır anahtarına göre müşteri/ürün/yer × gün; ilk sütun Gecikmiş. Toplam satırı ve sütunu tüm kümeleri sayar (görünen günler + gecikmiş).
export function matris(l: readonly SevkSatiri[], simdi: number, k: DagilimAnahtari, o: Olcu, gunSayisiN = MATRIS_GUN): Matris {
  const ilk = gunNo(simdi);
  const gunler = Array.from({ length: gunSayisiN }, (_, i) => ilk + i);
  const ge = gecikmisler(l, simdi);
  const gorunen = new Set(gunler);
  const adlar = [...new Set(acik(l).filter((x) => x.C !== null && (gunNo(x.C) < ilk || gorunen.has(gunNo(x.C)))).map((x) => anahtarDegeri(x, k)))]
    .sort((a, b) => a.localeCompare(b, 'tr'));
  const gunToplamlari = gunler.map(() => 0);
  const satirlar = adlar.map((ad): MatrisSatiri => {
    const s = acik(l).filter((x) => anahtarDegeri(x, k) === ad);
    const gecikmis = topla(s.filter((x) => ge.includes(x)), o);
    const hucreler = gunler.map((g, i): MatrisHucresi => {
      const b = s.filter((x) => x.C !== null && gunNo(x.C) === g);
      const t = topla(b, o);
      gunToplamlari[i] = (gunToplamlari[i] ?? 0) + t;
      return { toplam: t, asan: topla(b.filter(gecMi), o) };
    });
    return { ad, gecikmis, hucreler, toplam: gecikmis + hucreler.reduce((a, h) => a + h.toplam, 0) };
  });
  const gecikmisToplam = satirlar.reduce((a, s) => a + s.gecikmis, 0);
  return { gunler, satirlar, gecikmisToplam, gunToplamlari, genelToplam: gecikmisToplam + gunToplamlari.reduce((a, n) => a + n, 0) };
}

export interface GunSatiri { x: SevkSatiri; bitecek: boolean; termin: boolean; asan: boolean }

// Seçilen günün listesi: o gün bitecekler ve termini o gün olanlar (Tümü); sekme süzer. Gecikmiş seçiliyse gecikmişler. Hücre süzgeci satır anahtarına bakar.
export function gunListesi(
  l: readonly SevkSatiri[], simdi: number, secim: GunSecimi, sekme: GunSekmesi, suzgec: { anahtar: DagilimAnahtari; deger: string } | null,
): GunSatiri[] {
  let satirlar: GunSatiri[];
  if (secim === GECIKMIS) satirlar = gecikmisler(l, simdi).map((x) => ({ x, bitecek: false, termin: false, asan: gecMi(x) }));
  else {
    const b = new Set(bitecekler(l, secim)), t = new Set(terminliler(l, secim));
    const hepsi = [...new Set([...b, ...t])];
    satirlar = hepsi.map((x) => ({ x, bitecek: b.has(x), termin: t.has(x), asan: gecMi(x) }))
      // Satırın aşan işareti günden bağımsızdır (siparişin planı termini aşıyor); Aşan sekmesi ise takvimdeki sayı gibi o gün bitecek olan aşanları süzer.
      .filter((s) => (sekme === 'tumu' ? true : sekme === 'bitecek' ? s.bitecek : sekme === 'termin' ? s.termin : s.bitecek && s.asan));
  }
  if (suzgec) satirlar = satirlar.filter((s) => anahtarDegeri(s.x, suzgec.anahtar) === suzgec.deger);
  return satirlar.sort((a, b) => (a.x.C ?? Infinity) - (b.x.C ?? Infinity) || a.x.id.localeCompare(b.x.id, 'tr'));
}
