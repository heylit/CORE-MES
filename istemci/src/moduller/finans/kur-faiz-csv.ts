import type { z } from 'zod';
import type { KurFaizAraligi, kurFaizTopluSatiri } from '#paylasilan/sozlesme/finans.ts';
import { gunlukFaizdenAylik } from '#paylasilan/sozlesme/finansman.ts';
import { csvSatirlari, csvSayisi, csvTarihi } from './yeni/ayarlar/csv.ts';

// Kur ve faiz şablonunun okunması (1083-1087), saf. Ekran yalnız önizler; sunucu her satırı yeniden denetler ve sayıları o verir.
export type TopluSatir = z.input<typeof kurFaizTopluSatiri>;
// Sözleşmedeki KUR_FAIZ_TOPLU_SINIRI ve KUR_FAIZ_ARALIGI_GUN ile aynıdır (istemci paylaşılandan değer almaz); sunucu yeniden denetler.
const KUR_FAIZ_TOPLU_SINIRI = 400;
const KUR_FAIZ_ARALIGI_GUN = 1830;
// 1350 a, 1383 a: günlük oran aylığa sözleşmedeki tek çevirmeyle çevrilip dört ondalıkla kaydedilir; sunucu yeniden çevirir.
export { gunlukFaizdenAylik };
export const GUNLUK_FAIZ = 'günlük faiz';
const turOku = (ham: string): string => {
  const t = ham.trim().toLocaleLowerCase('tr').replace(/[\s_]+/g, ' ');
  return t === 'gunluk faiz' ? GUNLUK_FAIZ : t;
};
export type SatirDurumu = 'yeni' | 'ayni' | 'farkli' | 'hata';
export interface OnizlemeSatiri {
  no: number;
  tur: string;
  paraBirimi: string;
  tarih: string | null;
  deger: number | null;
  // Günlük faiz satırında kaydedilecek aylık oran; kayıtlı faizle bununla karşılaştırılır.
  aylik: number | null;
  durum: SatirDurumu;
  neden: string | null;
}
export interface OkunanDosya { satirlar: OnizlemeSatiri[]; dosyaHatasi: string | null }

export const SABLON_BASLIKLARI = ['Tür', 'Para birimi', 'Tarih', 'Değer'] as const;
// İndirilen şablonun örnek satırları; şeridin tuttuğu her kur ve faiz birimi için bir satır, değerler uydurmadır.
export const SABLON_SATIRLARI: readonly (readonly string[])[] = [
  ['kur', 'USD', '27.10.2026', '41,8520'],
  ['kur', 'EUR', '27.10.2026', '48,6130'],
  ['kur', 'GBP', '27.10.2026', '55,9040'],
  ['faiz', 'TRY', '01.11.2026', '3,2500'],
  ['faiz', 'USD', '01.11.2026', '0,6000'],
  ['faiz', 'EUR', '01.11.2026', '0,5000'],
  [GUNLUK_FAIZ, 'TRY', '01.12.2026', '0,1050'],
];

const ondalikSayisi = (n: number): number => { const m = String(n).split('.')[1]; return m ? m.length : 0; };
// Günlük faiz aylık faizin başka birimle yazılışıdır: aynı para birimi ve günde ikisi aynı kayıttır.
const anahtar = (tur: string, pb: string, tarih: string) => `${tur === GUNLUK_FAIZ ? 'faiz' : tur}|${pb}|${tarih}`;

// Aylık ve günlük faiz aynı anahtardadır; metin türü değil para birimi ve günü söyler ki iki farklı tür neden çakışıyor anlaşılsın.
const IKINCI_FAIZ = 'Bu para birimi ve tarihte faiz dosyada ikinci kez var; aylık ve günlük faiz aynı oranın iki yazılışıdır, biri kalmalı.';

// Başlık satırı atlanır; satır numarası dosyadaki satırdır (başlık 1).
export function sablonuOku(metin: string, bugun: string): OkunanDosya {
  const ham = csvSatirlari(metin);
  if (ham.length < 2) return { satirlar: [], dosyaHatasi: 'Dosyada başlık dışında satır yok.' };
  if (ham.length - 1 > KUR_FAIZ_TOPLU_SINIRI) return { satirlar: [], dosyaHatasi: `Tek seferde en çok ${KUR_FAIZ_TOPLU_SINIRI} satır yüklenir.` };
  const gorulen = new Set<string>();
  const satirlar = ham.slice(1).map((h, i): OnizlemeSatiri => {
    const r: OnizlemeSatiri = {
      no: i + 2, tur: turOku(h[0] ?? ''), paraBirimi: (h[1] ?? '').trim().toUpperCase(), tarih: null, deger: null, aylik: null, durum: 'hata', neden: null,
    };
    const hata = (neden: string): OnizlemeSatiri => ({ ...r, neden });
    if (h.length < 4 || h.slice(4).some((x) => x.trim() !== '')) return hata('Dört sütun olmalı: Tür, Para birimi, Tarih, Değer.');
    if (r.tur !== 'kur' && r.tur !== 'faiz' && r.tur !== GUNLUK_FAIZ) return hata('Tür "kur", "faiz" ya da "günlük faiz" olmalı.');
    if (!/^[A-Z]{3}$/.test(r.paraBirimi)) return hata('Para birimi üç harfli koddur (USD gibi).');
    if (r.tur === 'kur' && r.paraBirimi === 'TRY') return hata('TRY için kur girilmez.');
    const tarih = csvTarihi(h[2] ?? '');
    if (!tarih || Number.isNaN(Date.parse(`${tarih}T00:00:00Z`)) || new Date(`${tarih}T00:00:00Z`).toISOString().slice(0, 10) !== tarih) return hata('Tarih GG.AA.YYYY olmalı.');
    if (r.tur === 'kur' && tarih > bugun) return { ...hata('İleri tarihli kur girilmez.'), tarih };
    const deger = csvSayisi(h[3] ?? '');
    if (!Number.isFinite(deger)) return { ...hata('Değer sayı olmalı.'), tarih };
    if (r.tur === 'kur' && (deger <= 0 || ondalikSayisi(deger) > 6)) return { ...hata('Kur sıfırdan büyük, en çok altı ondalık olmalı.'), tarih, deger };
    if (r.tur === 'faiz' && (deger < 0 || deger > 100 || ondalikSayisi(deger) > 4)) return { ...hata('Aylık faiz 0 ile 100 arasında, en çok dört ondalık olmalı.'), tarih, deger };
    const aylik = r.tur === GUNLUK_FAIZ ? gunlukFaizdenAylik(deger) : null;
    if (aylik !== null && (deger < 0 || aylik > 100 || ondalikSayisi(deger) > 6)) return { ...hata('Günlük faiz sıfır ya da büyük, aylık %100\'ü aşmayan, en çok altı ondalık olmalı.'), tarih, deger };
    const a = anahtar(r.tur, r.paraBirimi, tarih);
    if (gorulen.has(a)) return { ...hata(r.tur === 'kur' ? 'Bu tür, para birimi ve tarih dosyada ikinci kez var.' : IKINCI_FAIZ), tarih, deger };
    gorulen.add(a);
    return { ...r, tarih, deger, aylik, durum: 'yeni' };
  });
  return { satirlar, dosyaHatasi: null };
}

// Önizlemenin kayıtlı değerleri okuyacağı aralık: geçerli satırların ilk ve son günü; sunucunun aralık sınırını aşarsa null.
export function okumaAraligi(satirlar: readonly OnizlemeSatiri[]): { baslangic: string; bitis: string } | null {
  const gunler = satirlar.filter((s) => s.durum !== 'hata' && s.tarih).map((s) => s.tarih!).sort();
  const baslangic = gunler[0];
  const bitis = gunler.at(-1);
  if (!baslangic || !bitis) return null;
  const fark = (Date.parse(`${bitis}T00:00:00Z`) - Date.parse(`${baslangic}T00:00:00Z`)) / 86_400_000;
  return fark > KUR_FAIZ_ARALIGI_GUN ? null : { baslangic, bitis };
}

// 1085 a: kayıtlı güne aynı değer de farklı değer de atlanır; farklıda kayıtlı değer yazılır ki kullanıcı elle düzeltebilsin.
export function kayitliylaKarsilastir(satirlar: readonly OnizlemeSatiri[], kayitli: KurFaizAraligi): OnizlemeSatiri[] {
  const degerler = new Map<string, string>();
  for (const k of kayitli.kurlar) degerler.set(anahtar('kur', k.paraBirimi, k.tarih), k.kur);
  for (const f of kayitli.faizler) degerler.set(anahtar('faiz', f.paraBirimi, f.gecerlilikBaslangic), f.aylikYuzde);
  return satirlar.map((s) => {
    if (s.durum === 'hata' || s.tarih === null || s.deger === null) return s;
    const eski = degerler.get(anahtar(s.tur, s.paraBirimi, s.tarih));
    if (eski === undefined) return s;
    if (Number(eski) === (s.aylik ?? s.deger)) return { ...s, durum: 'ayni', neden: 'Kayıtlı değerle aynı; atlanır.' };
    return { ...s, durum: 'farkli', neden: `Kayıtlı: ${Number(eski).toLocaleString('tr-TR', { maximumFractionDigits: 6 })}. Atlanır; o gün elle düzeltilir.` };
  });
}

// Sunucuya geçerli bütün satırlar gider: atlama kararını sunucu yeniden verir (önizlemeden sonra girilmiş kayıt da atlanır).
export const gonderilecekler = (satirlar: readonly OnizlemeSatiri[]): TopluSatir[] => satirlar
  .filter((s) => s.durum !== 'hata' && s.tarih !== null && s.deger !== null)
  .map((s): TopluSatir => {
    const g = { paraBirimi: s.paraBirimi, tarih: s.tarih!, deger: s.deger! };
    if (s.tur === 'kur') return { tur: 'kur', ...g };
    return s.tur === GUNLUK_FAIZ ? { tur: 'gunluk_faiz', ...g } : { tur: 'faiz', ...g };
  });
