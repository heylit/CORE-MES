// 3762: Takımhane listesi CNC kütüphanesinin raflarıdır; her satır bir kütüphane kalemi ve (varsa) ona bağlı stok kartıdır.
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { KutuphaneRafi } from '../cnc-kurulum/disari.ts';
import type { TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import { STOK_DURUMU_ADI, STOK_DURUMU_TONU, stokDurumu } from './gosterim.ts';

export const BAGSIZ_RAF = 'Kütüphaneye bağlı değil';

export interface KutuphaneSatiri {
  anahtar: string;
  raf: string;
  // CNC kütüphanesindeki raf anahtarı (tm_ freze, tl_ torna, ins kesici uç); eski kartta null.
  rafAnahtari: string | null;
  // Kütüphane kalemi kimliği; eski (bağlanmamış) kartta null.
  kimlik: string | null;
  ad: string;
  kod: string | null;
  takim: TakimSatiri | null;
}

// Kütüphanedeki her kalem bir satırdır; kartı olmayan kalem de görünür (açılış ondan başlar). Kütüphaneye bağlı olmayan ya da
// kalemi kütüphaneden kalkmış kartlar ayrı rafta durur, kaybolmaz.
export function kutuphaneSatirlari(raflar: readonly KutuphaneRafi[], takimlar: readonly TakimSatiri[]): KutuphaneSatiri[] {
  const kartlar = new Map<string, TakimSatiri>();
  for (const t of takimlar) if (t.kutuphaneKimligi !== null) kartlar.set(t.kutuphaneKimligi, t);
  const kullanilan = new Set<string>();
  const satirlar: KutuphaneSatiri[] = [];
  for (const r of raflar) {
    for (const k of r.kalemler) {
      const takim = kartlar.get(k.kimlik) ?? null;
      if (takim) kullanilan.add(k.kimlik);
      satirlar.push({ anahtar: `k:${k.kimlik}`, raf: r.baslik, rafAnahtari: r.anahtar, kimlik: k.kimlik, ad: k.ad, kod: k.kod, takim });
    }
  }
  for (const t of takimlar) {
    if (t.kutuphaneKimligi !== null && kullanilan.has(t.kutuphaneKimligi)) continue;
    satirlar.push({ anahtar: `t:${String(t.kartKimlik)}`, raf: BAGSIZ_RAF, rafAnahtari: null, kimlik: null, ad: t.ad, kod: t.kod, takim: t });
  }
  return satirlar;
}

export type SatirDurumu = 'kart-yok' | 'onayda' | 'pasif' | 'baglanacak' | 'sifir' | 'kritik' | 'yeterli' | 'esiksiz';
export function satirDurumu(s: KutuphaneSatiri): SatirDurumu {
  const t = s.takim;
  if (t === null) return 'kart-yok';
  if (t.kartDurumu === 'taslak' || t.kartDurumu === 'onayda') return 'onayda';
  if (t.kartDurumu === 'pasif') return 'pasif';
  if (s.kimlik === null) return 'baglanacak';
  return stokDurumu(t);
}
export const SATIR_DURUMU_ADI: Record<SatirDurumu, string> = {
  'kart-yok': 'Kart yok', onayda: 'Kart onay bekliyor', pasif: 'Kart pasif', baglanacak: 'Kütüphaneye bağlı değil', ...STOK_DURUMU_ADI,
};
export const SATIR_DURUMU_TONU: Record<SatirDurumu, RozetTonu> = {
  'kart-yok': 'pasif', onayda: 'bilgi', pasif: 'pasif', baglanacak: 'uyari', ...STOK_DURUMU_TONU,
};

// Kart yalnız kesici takım raflarından açılır (freze, torna, kesici uç): kart Malzemeler'in kesici takım kategorisine girer. Tutucu,
// aparat, ölçüm ve sarf raflarının kartı Malzemeler'de kendi kategorisinde açılır, sonra "Kaleme bağla" ile bağlanır.
export const kesiciRafMi = (rafAnahtari: string | null): boolean => rafAnahtari !== null && /^(tm_|tl_|ins$)/.test(rafAnahtari);

// Malzemeler'in kesici takım kategorisindeki "Takım türü" seçenekleri (Malzemeler istemcisi aynı katmanda olduğu için ithal edilmez;
// liste orada değişirse burada da değişir). Kart Malzemeler'de bu seçeneklerden biriyle açılmış gibi görünür.
export const TAKIM_TURLERI = ['Matkap', 'Parmak freze', 'Kesici uç (insert)', 'Kılavuz', 'Rayba', 'Torna kalemi', 'Testere şeridi', 'Daire testere'] as const;
export type TakimTuru = (typeof TAKIM_TURLERI)[number];

// Kart açma penceresinin önerdiği takım türü (Malzemeler'in seçenekleri); emin olunamazsa boş kalır, kullanıcı seçer.
export function takimTuruOnerisi(s: Pick<KutuphaneSatiri, 'ad' | 'rafAnahtari'>): TakimTuru | null {
  const ad = s.ad.toLocaleLowerCase('tr');
  if (/kılavuz/.test(ad)) return 'Kılavuz';
  if (/rayba/.test(ad)) return 'Rayba';
  if (/matka[pb]/.test(ad)) return 'Matkap';
  if (s.rafAnahtari === 'ins') return 'Kesici uç (insert)';
  if (s.rafAnahtari?.startsWith('tl_')) return 'Torna kalemi';
  if (s.rafAnahtari === 'tm_end') return 'Parmak freze';
  return null;
}

// Addaki çap (Ø10, Ø6,8): kartı aynı türdeki öteki kartlardan ayırır. Bulunamazsa boş kalır.
export function capOnerisi(ad: string): number | null {
  const m = /Ø\s*(\d+(?:[.,]\d+)?)/.exec(ad);
  return m?.[1] ? Number(m[1].replace(',', '.')) : null;
}

// Satır düğmesi: aktif kartta göze göre açılış ya da sayım; eski kartta kütüphaneye bağlama; kartsız kesici kalemde kart açma.
export type SatirEylemi = 'acilis' | 'sayim' | 'bagla' | 'kart-ac' | null;
export function satirEylemi(s: KutuphaneSatiri): SatirEylemi {
  const t = s.takim;
  if (t === null) return s.kimlik !== null && kesiciRafMi(s.rafAnahtari) ? 'kart-ac' : null;
  if (t.kartDurumu !== 'aktif') return null;
  if (s.kimlik === null) return 'bagla';
  return t.gozler.length === 0 ? 'acilis' : 'sayim';
}

export const LISTE_SUZGECLERI = [
  { deger: 'kartli', baslik: 'Kartlı' },
  { deger: 'hepsi', baslik: 'Tümü' },
  { deger: 'kritik', baslik: 'Kritik ve biten' },
  { deger: 'kart-yok', baslik: 'Kart yok' },
  { deger: 'baglanacak', baslik: 'Bağlanacak' },
] as const;
export type ListeSuzgeci = (typeof LISTE_SUZGECLERI)[number]['deger'];

export function suz(satirlar: readonly KutuphaneSatiri[], f: { suzgec: ListeSuzgeci; raf: string; ara: string }): KutuphaneSatiri[] {
  const aranan = f.ara.trim().toLocaleLowerCase('tr');
  return satirlar.filter((s) => {
    const d = satirDurumu(s);
    const uygun = f.suzgec === 'hepsi' || (f.suzgec === 'kartli' ? s.takim !== null
      : f.suzgec === 'kritik' ? d === 'kritik' || d === 'sifir' : d === f.suzgec);
    return uygun && (f.raf === '' || s.raf === f.raf)
      && (aranan === '' || `${s.kod ?? ''} ${s.ad} ${s.takim?.kod ?? ''}`.toLocaleLowerCase('tr').includes(aranan));
  });
}

// Excel satırındaki kalem: önce stok kartı kodu, sonra kütüphane kalem kodu ya da kimliği. Kart yoksa neden söylenir.
// Kod karşılaştırması büyük harfle; noktalı I ile noktasız I aynı sayılır (Excel'de yazılış farkı kalemi kaybettirmesin).
const kodu = (m: string) => m.trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I');
export function kalemBul(satirlar: readonly KutuphaneSatiri[], metin: string): { takim: TakimSatiri | null; hata: string | null } {
  const k = kodu(metin);
  if (k === '') return { takim: null, hata: 'Kalem boş.' };
  const kartli = satirlar.find((s) => s.takim !== null && kodu(s.takim.kod) === k);
  if (kartli?.takim) return { takim: kartli.takim, hata: null };
  // Hazır katalogda "kod" çoğu kez tanım metnidir ve kalemler arasında yinelenir: yalnız tek kaleme uyan kod kabul edilir.
  const kimlikle = satirlar.find((s) => s.kimlik !== null && kodu(s.kimlik) === k);
  const kodla = satirlar.filter((s) => s.kimlik !== null && kodu(s.kod ?? '') === k);
  if (!kimlikle && kodla.length > 1) return { takim: null, hata: 'Bu kod birden çok kütüphane kaleminde; kart kodunu yazın.' };
  const kalem = kimlikle ?? kodla[0];
  if (!kalem) return { takim: null, hata: 'Kütüphanede yok.' };
  if (kalem.takim === null) return { takim: null, hata: 'Kalemin stok kartı yok.' };
  return { takim: kalem.takim, hata: null };
}
