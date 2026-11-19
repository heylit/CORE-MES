import { tesisGunu, tesisSaati } from '#paylasilan/tesis-zamani.ts';
import type { AksiyonDurumu, KonuGovdesi, KonuTuru, ToplantiDurumu } from '#paylasilan/sozlesme/toplantilar.ts';

// TOP-1: toplantı tek günlüktür (başlangıç ve bitiş tesis saatiyle aynı gün); en çok 24 saat kısıtı veritabanındadır.
export const TEK_GUN = 'Toplantı tek günlüktür: bitiş başlangıçla aynı gün olmalı.';
export const tekGunMu = (baslangic: string, bitis: string): boolean => tesisGunu(Date.parse(baslangic)) === tesisGunu(Date.parse(bitis));

// TOP-2: yalnız planlanan toplantı değiştirilir, iptal edilir ya da yapıldı işaretlenir.
export const PLANLANMADI = 'Yalnız planlanan toplantı değiştirilir.';
export const planlandiMi = (durum: ToplantiDurumu): boolean => durum === 'planlandi';

// TOP-3: "Yapıldı" başlama saatinden sonra işaretlenir; işaretlenince katılımcı ve gündem kilitlenir, karar ve aksiyon yazılmaya devam eder.
export const BASLAMADI = 'Toplantı başlamadan "Yapıldı" işaretlenemez.';
export const baslamisMi = (baslangic: string, simdi: string): boolean => Date.parse(simdi) >= Date.parse(baslangic);

// TOP-4: iptal edilen toplantıya karar ve aksiyon yazılmaz.
export const IPTAL_EDILDI = 'İptal edilen toplantıya karar ya da aksiyon yazılmaz.';

// TOP-5: aksiyon yalnız projeli toplantıda göreve çevrilir; açık olmalı ve görevi olmamalı.
export const PROJESIZ = 'Projesi olmayan toplantının aksiyonu göreve çevrilmez; toplantıda izlenir.';
export const KAPALI_AKSIYON = 'Yalnız açık aksiyon göreve çevrilir.';
export const GOREVI_VAR = 'Bu aksiyonun görevi zaten açık.';
export function goreveCevirmeReddi(a: { projeId: number | null; aksiyonDurumu: AksiyonDurumu; gorevVar: boolean }): string | null {
  if (a.projeId === null) return PROJESIZ;
  if (a.aksiyonDurumu !== 'acik') return KAPALI_AKSIYON;
  return a.gorevVar ? GOREVI_VAR : null;
}

// TOP-6 (3448-2 a): düzenleyen ve katılımcı kendi toplantısını görür; `toplantilar.oku` bütünü görür.
export const goruntulerMi = (k: { id: number; islemler: readonly string[] }, duzenleyenId: number, katilimci: boolean): boolean =>
  k.islemler.includes('toplantilar.oku') || k.id === duzenleyenId || katilimci;

// TOP-7: konu bağı tek sütundur; serbest konuda hepsi boş.
export function konuSutunlari(k: KonuGovdesi): { projeId: number | null; uretimEmriId: number | null; firmaId: number | null } {
  return {
    projeId: k.tur === 'proje' ? k.id : null,
    uretimEmriId: k.tur === 'uretim-emri' ? k.id : null,
    firmaId: k.tur === 'firma' ? k.id : null,
  };
}
export function konuTuru(s: { projeId: number | null; uretimEmriId: number | null; firmaId: number | null }): KonuTuru {
  if (s.projeId !== null) return 'proje';
  if (s.uretimEmriId !== null) return 'uretim-emri';
  return s.firmaId !== null ? 'firma' : 'serbest';
}

// TOP-8: e-posta ve takvim için saat aralığı "21.11.2026 09:30-10:15" (tesis saati).
export function zamanAraligi(baslangic: string, bitis: string): string {
  const b = tesisSaati(Date.parse(baslangic));
  const e = tesisSaati(Date.parse(bitis));
  return `${b.slice(8, 10)}.${b.slice(5, 7)}.${b.slice(0, 4)} ${b.slice(11)}-${e.slice(11)}`;
}

// TOP-9: değişiklik bildirimi neyin değiştiğini söyler; saat değiştiyse önceki aralık da yazılır.
export function degisiklikOzeti(
  eski: { baslik: string; baslangic: string; bitis: string; yer: string | null },
  yeni: { baslik: string; baslangic: string; bitis: string; yer: string | null },
): { degisenler: string[]; zaman: string } {
  const degisenler: string[] = [];
  const saatDegisti = Date.parse(eski.baslangic) !== Date.parse(yeni.baslangic) || Date.parse(eski.bitis) !== Date.parse(yeni.bitis);
  if (saatDegisti) degisenler.push('saat');
  if (eski.yer !== yeni.yer) degisenler.push('yer');
  if (eski.baslik !== yeni.baslik) degisenler.push('başlık');
  const simdiki = zamanAraligi(yeni.baslangic, yeni.bitis);
  return { degisenler, zaman: saatDegisti ? `${simdiki} (önceki: ${zamanAraligi(eski.baslangic, eski.bitis)})` : simdiki };
}

// TOP-10: davet yeni eklenen katılımcıya, değişiklik kalanlara, iptal çıkarılana gider; yapan kendisi almaz (bildirim kuralı).
export function katilimciFarki(eski: readonly number[], yeni: readonly number[]): { eklenen: number[]; kalan: number[]; cikan: number[] } {
  const e = new Set(eski);
  const y = new Set(yeni);
  return { eklenen: yeni.filter((k) => !e.has(k)), kalan: yeni.filter((k) => e.has(k)), cikan: eski.filter((k) => !y.has(k)) };
}

// TOP-11: görev tarihleri: plan başlangıcı bugün (son tarih geçmişse son tarih), bitişi son tarih.
export const gorevTarihleri = (bugun: string, sonTarih: string): { planBaslangic: string; planBitis: string } =>
  ({ planBaslangic: sonTarih < bugun ? sonTarih : bugun, planBitis: sonTarih });
