import type { OnayliListeCevabi } from '#paylasilan/sozlesme/satin-alma.ts';

// 3279 a: Satın Alma > Tedarikçiler > Onaylı liste satırları. Kaynak Kalite Merkezi; satın alma yazmaz. Tek sözlük: Onaylı, Şartlı,
// Onaysız, Karar yok, Kalite kaydı yok. Ad ile eşlenen kayıt yazdırma ve CSV'de onaylı sayılmaz (Risk K3).

export type Firma = OnayliListeCevabi['firmalar'][number];
export type Ton = 'tamam' | 'uyari' | 'hata' | 'pasif' | 'bilgi';
export type DurumSuzgeci = 'hepsi' | 'onayli' | 'sartli' | 'onaysiz' | 'kayitsiz' | 'sertifika';
export const TUM_FIRMALAR = '';
export const SERTIFIKA_ESIGI_GUN = 30;

export interface Satir {
  firmaId: number;
  ad: string;
  kritiklik: string | null;
  adIleEslendi: boolean;
  /** Seçili kategoride karar; kategori seçilmediyse firma geneli durum. */
  durum: { metin: string; ton: Ton; sinif: Exclude<DurumSuzgeci, 'hepsi' | 'sertifika'> };
  /** Firma geneli durum (Kalite'nin tedarikçi kaydı). */
  genel: Satir['durum'];
  satinAlmaTedarikcisi: boolean;
  sart: string | null;
  sertifikalar: string[];
  sertifikaBitisi: string | null;
  /** Sertifika bitişine kalan gün (geçtiyse eksi); bitiş yoksa null. */
  sertifikaGun: number | null;
  sonDenetim: string | null;
}

const gunFarki = (bugun: string, gun: string): number => Math.round((Date.parse(`${gun}T00:00:00Z`) - Date.parse(`${bugun}T00:00:00Z`)) / 86_400_000);
export const kategoriAnahtari = (tur: string, kod: string): string => `${tur}|${kod}`;

function genelDurum(f: Firma): Satir['durum'] {
  const d = f.kalite?.durum ?? null;
  if (f.kalite === null) return { metin: 'Kalite kaydı yok', ton: 'pasif', sinif: 'kayitsiz' };
  if (d === 'Onaylı') return { metin: 'Onaylı', ton: 'tamam', sinif: 'onayli' };
  if (d === 'Şartlı onaylı') return { metin: 'Şartlı onaylı', ton: 'uyari', sinif: 'sartli' };
  if (d === 'Aday' || d === 'Askıda') return { metin: d, ton: 'hata', sinif: 'onaysiz' };
  return { metin: 'Karar yok', ton: 'pasif', sinif: 'onaysiz' };
}

/** Seçili kategori (`TUM_FIRMALAR` ise firma geneli) için satırlar; kategoride yalnız kararı olan firmalar ve Kalite kaydı olmayan satın alma tedarikçileri. */
export function satirlar(c: OnayliListeCevabi, kategori: string, bugun: string): Satir[] {
  const sonuc: Satir[] = [];
  for (const f of c.firmalar) {
    const k = f.kalite;
    const genel = genelDurum(f);
    let durum = genel;
    let sart: string | null = null;
    if (kategori !== TUM_FIRMALAR) {
      const karar = k?.kategoriler.find((x) => kategoriAnahtari(x.kategoriTuru, x.kategoriKodu) === kategori);
      if (karar === undefined && k !== null) continue;
      if (k === null && !f.satinAlmaTedarikcisi) continue;
      if (karar !== undefined) {
        durum = karar.durum === 'onayli' ? { metin: 'Onaylı', ton: 'tamam', sinif: 'onayli' }
          : karar.durum === 'sartli' ? { metin: 'Şartlı', ton: 'uyari', sinif: 'sartli' }
            : { metin: 'Onaysız', ton: 'hata', sinif: 'onaysiz' };
        sart = karar.durum === 'sartli' ? karar.aciklama : null;
      }
    }
    const bitis = k?.sertifikaBitisi ?? null;
    sonuc.push({
      firmaId: f.firmaId, ad: f.ad, kritiklik: k?.kritiklik ?? null, adIleEslendi: k?.adIleEslendi ?? false, durum, genel, satinAlmaTedarikcisi: f.satinAlmaTedarikcisi, sart,
      sertifikalar: k?.sertifikalar ?? [], sertifikaBitisi: bitis, sertifikaGun: bitis === null ? null : gunFarki(bugun, bitis), sonDenetim: k?.sonDenetim ?? null,
    });
  }
  return sonuc;
}

export function suz(s: readonly Satir[], durum: DurumSuzgeci, ara: string): Satir[] {
  const a = ara.trim().toLocaleLowerCase('tr-TR');
  return s.filter((x) => (a === '' || x.ad.toLocaleLowerCase('tr-TR').includes(a))
    && (durum === 'hepsi' || (durum === 'sertifika' ? x.sertifikaGun !== null && x.sertifikaGun <= SERTIFIKA_ESIGI_GUN : x.durum.sinif === durum)));
}

/** Yazdırma ve CSV'deki durum: ad ile eşlenen kayıt onaylı sayılmaz (Risk K3). */
const k3 = (x: Satir, metin: string): string => (x.adIleEslendi ? `${metin} (ad ile eşlendi, onaylı sayılmaz)` : metin);
export const csvDurumu = (x: Satir): string => k3(x, x.durum.metin);

export const CSV_BASLIKLARI = ['Firma', 'Kritiklik', 'Kategori', 'Bu kategoride', 'Firma geneli', 'Şart', 'Sertifikalar', 'Sertifika bitişi', 'Son denetim'] as const;
/** CSV satırları; kategori seçilmediyse kategori ve kategori durumu boş. */
export function csvSatirlari(s: readonly Satir[], kategoriAdi: string | null): (string | null)[][] {
  return s.map((x) => [
    x.ad, x.kritiklik, kategoriAdi, kategoriAdi === null ? null : csvDurumu(x), k3(x, x.genel.metin), x.sart,
    x.sertifikalar.join(', '), x.sertifikaBitisi, x.sonDenetim,
  ]);
}

export function sertifikaMetni(x: Satir): string | null {
  if (x.sertifikaGun === null || x.sertifikaBitisi === null) return null;
  const t = `${x.sertifikaBitisi.slice(8, 10)}.${x.sertifikaBitisi.slice(5, 7)}.${x.sertifikaBitisi.slice(0, 4)}`;
  return x.sertifikaGun < 0 ? `bitti ${t}` : x.sertifikaGun <= SERTIFIKA_ESIGI_GUN ? `bitiş ${t}, ${x.sertifikaGun} gün` : `bitiş ${t}`;
}

/** Kategori seçenekleri: önce kararı olan kategoriler (üst başlıkla), sonra ötekiler; pasif kategori yalnız kararı varsa. */
export interface KategoriSecenegi { deger: string; ad: string; ust: string; kisa: string; kararli: boolean; sayi: number }
export function kategoriSecenekleri(c: OnayliListeCevabi): KategoriSecenegi[] {
  const sayi = new Map<string, number>();
  for (const f of c.firmalar) for (const k of f.kalite?.kategoriler ?? []) {
    const a = kategoriAnahtari(k.kategoriTuru, k.kategoriKodu);
    sayi.set(a, (sayi.get(a) ?? 0) + 1);
  }
  return c.kategoriler
    .filter((k) => k.aktif || sayi.has(kategoriAnahtari(k.tur, k.kod)))
    .map((k) => {
      const deger = kategoriAnahtari(k.tur, k.kod);
      return { deger, ad: `${k.ustAd} · ${k.ad}`, ust: k.ustAd, kisa: k.ad, kararli: sayi.has(deger), sayi: sayi.get(deger) ?? 0 };
    })
    .sort((a, b) => Number(b.kararli) - Number(a.kararli) || a.ad.localeCompare(b.ad, 'tr'));
}

/** Firma x kategori tablosu: sütun kararı olan kategoriler, satır Kalite kaydı ya da kararı olan firmalar. */
export interface MatrisHucresi { durum: 'onayli' | 'sartli' | 'onaysiz'; aciklama: string | null }
export function matris(c: OnayliListeCevabi): { sutunlar: { deger: string; ad: string }[]; satirlar: { firmaId: number; ad: string; hucreler: (MatrisHucresi | null)[] }[] } {
  const sutunlar = kategoriSecenekleri(c).filter((k) => k.kararli).map(({ deger, ad }) => ({ deger, ad }));
  const satirlar = c.firmalar.filter((f) => f.kalite !== null).map((f) => ({
    firmaId: f.firmaId, ad: f.ad,
    hucreler: sutunlar.map((s) => {
      const k = f.kalite?.kategoriler.find((x) => kategoriAnahtari(x.kategoriTuru, x.kategoriKodu) === s.deger);
      return k === undefined ? null : { durum: k.durum, aciklama: k.aciklama };
    }),
  }));
  return { sutunlar, satirlar };
}

/** Üstteki özet: firma geneli satırlardan sayılır (kategori seçiminden bağımsız). */
export function ozet(s: readonly Satir[]): { onayli: number; sartli: number; sertifika: number; sertifikaGecmis: number; kayitsiz: number } {
  return {
    onayli: s.filter((x) => x.genel.sinif === 'onayli').length,
    sartli: s.filter((x) => x.genel.sinif === 'sartli').length,
    sertifika: s.filter((x) => x.sertifikaGun !== null && x.sertifikaGun <= SERTIFIKA_ESIGI_GUN).length,
    sertifikaGecmis: s.filter((x) => x.sertifikaGun !== null && x.sertifikaGun < 0).length,
    kayitsiz: s.filter((x) => x.genel.sinif === 'kayitsiz').length,
  };
}
