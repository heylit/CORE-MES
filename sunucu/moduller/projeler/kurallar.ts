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

// --- Proje yönetimi (890 c) ---

export const STATU_YOK = 'Statü bulunamadı.';
export const STATU_ETKIN_DEGIL = 'Bu statü artık seçilemiyor.';
export const SERBEST_STATU_KAPALI = 'Statü yalnız listeden seçilebilir.';
export const PROJE_KAPALI = 'Tamamlanmış ya da iptal edilmiş projede görev ve kilometre taşı yazılmaz.';
export const KILOMETRE_TASI_YOK = 'Kilometre taşı bulunamadı.';
export const GOREV_YOK = 'Görev bulunamadı.';
export const TABAN_AYNI = 'Yeni taban tarih eskisiyle aynı.';
export const BITTI_GERCEK_BITIS = 'Biten görevin gerçekleşen bitiş tarihi zorunlu.';
export const GERCEK_BASLANGIC_GEREKLI = 'Gerçekleşen bitiş için gerçekleşen başlangıç da gerekli.';
export const GERCEK_SIRASI = 'Gerçekleşen bitiş başlangıçtan önce olamaz.';
export const ONCEKI_DONGU = 'Önce bitmesi gereken görev zinciri kendine dönüyor.';

// PRJ-11: listeden seçilen statü var ve etkin olmalı; elle yazılan statü yalnız ayar açıkken kabul edilir.
export function statuReddi(
  g: { statuId: number | null; metin: string | null }, statu: { etkin: boolean } | null, serbestIzin: boolean,
): { ileti: string; alan: string } | null {
  if (g.statuId !== null) {
    if (statu === null) return { ileti: STATU_YOK, alan: 'statuId' };
    if (!statu.etkin) return { ileti: STATU_ETKIN_DEGIL, alan: 'statuId' };
    return null;
  }
  return serbestIzin ? null : { ileti: SERBEST_STATU_KAPALI, alan: 'metin' };
}

// PRJ-15: görev ve kilometre taşı yalnız aktif projede yazılır; statü her durumda yazılır (kapanış notu için).
export function projeAcikReddi(durum: string): string | null {
  return durum === 'aktif' ? null : PROJE_KAPALI;
}

// PRJ-12: görevin gerçekleşen tarihleri ve durumu tutarlı olmalı. "Bitti" gerçekleşen bitiş ister ve ilerlemeyi 100'e çeker;
// geri açılan görevde ilerleme kişinin yazdığıdır.
export function gorevDurumuDuzelt(g: {
  durum: string; ilerleme: number; gercekBaslangic: string | null; gercekBitis: string | null;
}): { ilerleme: number } | { ileti: string; alan: string } {
  if (g.gercekBitis !== null && g.gercekBaslangic === null) return { ileti: GERCEK_BASLANGIC_GEREKLI, alan: 'gercekBaslangic' };
  if (g.gercekBitis !== null && g.gercekBaslangic !== null && g.gercekBitis < g.gercekBaslangic) return { ileti: GERCEK_SIRASI, alan: 'gercekBitis' };
  if (g.durum === 'bitti') return g.gercekBitis === null ? { ileti: BITTI_GERCEK_BITIS, alan: 'gercekBitis' } : { ilerleme: 100 };
  return { ilerleme: g.ilerleme };
}

// PRJ-12: "önce bitmesi gereken" zinciri döngü kuramaz. `oncekiler` projedeki görev -> önceki görev eşlemesidir (yazılacak bağ hariç).
export function oncekiDonguVarMi(gorevId: number, oncekiId: number | null, oncekiler: ReadonlyMap<number, number | null>): boolean {
  const gorulen = new Set<number>();
  for (let s: number | null = oncekiId; s !== null; s = oncekiler.get(s) ?? null) {
    if (s === gorevId) return true;
    if (gorulen.has(s)) return false;
    gorulen.add(s);
  }
  return false;
}

// PRJ-13: taban tarih yalnız gerekçeyle ve gerçekten değişince yenilenir.
export function tabanReddi(eski: string, yeni: string): string | null {
  return eski === yeni ? TABAN_AYNI : null;
}

// PRJ-14: proje ilerlemesi, iptal dışındaki görevlerin plan süresi (gün, uçlar dahil) ağırlıklı ortalaması; görev yoksa null.
export function projeIlerlemesi(gorevler: readonly { durum: string; ilerleme: number; planBaslangic: string; planBitis: string }[]): number | null {
  let agirlik = 0;
  let toplam = 0;
  for (const g of gorevler) {
    if (g.durum === 'iptal') continue;
    const gun = Math.round((Date.parse(`${g.planBitis}T00:00:00Z`) - Date.parse(`${g.planBaslangic}T00:00:00Z`)) / 864e5) + 1;
    agirlik += gun;
    toplam += gun * g.ilerleme;
  }
  return agirlik === 0 ? null : Math.round(toplam / agirlik);
}
