// Saf iş kuralları; veritabanı ve saat yok. Kural numaraları KURAL-TEST.md'de testlerine bağlıdır.

export const PROJE_YOK = 'Proje bulunamadı.';
export const KOD_KULLANILIYOR = 'Bu proje kodu kullanılıyor.';
export const FIRMA_YOK = 'Firma bulunamadı.';
export const FIRMA_PASIF = 'Pasif firma projeye seçilemez.';
export const SIPARIS_ONAYSIZ = 'Proje yalnız onaylı siparişten açılır.';
export const FIRMA_SIPARISTEN = 'Siparişe bağlı projenin firması siparişin firmasıdır; değiştirilemez.';

// PRJ-05: pasif firma yeni seçilemez; projenin zaten bağlı olduğu firma pasifleşse de proje onda kalabilir.
export function firmaReddi(
  firma: { var: boolean; aktif: boolean }, firmaId: number, mevcutFirmaId: number | null,
): string | null {
  if (!firma.var) return FIRMA_YOK;
  if (!firma.aktif && firmaId !== mevcutFirmaId) return FIRMA_PASIF;
  return null;
}

// Aramada kod büyük harfle tutulur; ad büyük-küçük harf duyarsız aranır (SQL tarafı ILIKE).
export function aramaKalibi(ara: string | undefined): string | null {
  const m = ara?.trim();
  if (!m) return null;
  return `%${m.replace(/[\\%_]/g, (k) => `\\${k}`)}%`;
}

// PRJ-07: proje yalnız onaylı siparişten açılır; taslak, kapanmış ve iptal sipariş reddedilir.
export function siparisReddi(durum: string): string | null {
  return durum === 'onayli' ? null : SIPARIS_ONAYSIZ;
}

// PRJ-08: siparişe bağlı projenin firması siparişten gelir ve düzenlemede değişmez.
export function siparisFirmasiReddi(siparisId: number | null, mevcutFirmaId: number | null, yeniFirmaId: number | null): string | null {
  if (siparisId === null) return null;
  return yeniFirmaId === mevcutFirmaId ? null : FIRMA_SIPARISTEN;
}

// PRJ-09: bütçeyi yalnız maliyet gören yazar; görmeyenin gövdesindeki bütçe yok sayılır ve var olan değer kalır. Tutar varsa
// para birimi verilmediğinde TRY'dir, tutar yoksa para birimi de yoktur.
export interface Butce { butceTutari: string | null; butceParaBirimi: string | null }
export function butce(gorur: boolean, tutar: string | null, paraBirimi: string | null, mevcut: Butce | null): Butce {
  if (!gorur) return mevcut ?? { butceTutari: null, butceParaBirimi: null };
  if (tutar === null) return { butceTutari: null, butceParaBirimi: null };
  return { butceTutari: tutar, butceParaBirimi: paraBirimi ?? 'TRY' };
}
