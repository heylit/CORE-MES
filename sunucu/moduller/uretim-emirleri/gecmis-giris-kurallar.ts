import { tesisGunBasi } from '#paylasilan/zaman.ts';
import type { EmirDurumu, GecmisGirisAdimi } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// 3455-1: geçmiş girişin saf kuralları. Kayıt terminal çalışması değildir: süre ve OEE'ye girmez, adet akışına girer.

export const GECMIS_EMIR_DURUMU = 'Geçmiş giriş yalnız taslak ya da planlı emirde yapılır.';
export const GECMIS_ARSIV = 'Arşivdeki emre geçmiş giriş yapılmaz.';
export const GECMIS_KOLLU = 'Bölünmüş ya da kollu emre geçmiş giriş yapılmaz.';
export const GECMIS_DALLI = 'Alt parça dalları olan emre geçmiş giriş yapılmaz.';
export const GECMIS_SIRA = 'Geçmiş giriş, bitmiş adımlardan sonraki ilk bekleyen adımdan başlar ve adım atlamaz.';
export const GECMIS_SON_ADIM = 'Son adım geçmiş girişle bitirilemez; bitmiş iş için parçayı stoğa sayımla girin.';
export const GECMIS_FASON = 'Fason adım geçmiş girişle geçilemez; son biten adım fasondan önceki adım olabilir.';
export const GECMIS_ISTASYONSUZ = 'İstasyonu atanmamış adıma geçmiş giriş yapılmaz; önce adımın kaynağını seçin.';
export const GECMIS_TARIH_ILERI = 'Geçmiş giriş tarihi bugünden ileri olamaz.';
export const GECMIS_TARIH_ESKI = 'Geçmiş giriş tarihi en çok iki yıl önce olabilir.';
export const GECMIS_TARIH_SIRASI = 'Başlama tarihi bitiş tarihinden sonra olamaz.';
export const GECMIS_ADET_ASIMI = 'Adımın sağlam ve hurda toplamı önceki adımın sağlamını aşamaz.';
export const GECMIS_HURDA_NEDENI = 'Hurda girilen adımda hurda nedeni seçilmelidir.';
export const GECMIS_NEDEN_FAZLA = 'Hurda girilmeyen adımda hurda nedeni olmaz.';
export const GECMIS_GERI_YOK = 'Geri alınacak geçmiş giriş yok.';
export const GECMIS_GERI_SONRAKI = 'Geçmiş girişten sonraki adımda üretim başlamış; giriş geri alınamaz.';

export interface GecmisEmir { durum: EmirDurumu; arsiv: boolean; ustEmirId: number | null; acikKolVar: boolean }
export interface GecmisAdimDurumu {
  opNo: number; sira: number; durum: 'bekliyor' | 'calisiyor' | 'tamam'; fason: boolean; istasyonId: number | null; dalli: boolean;
}

export function gecmisEmirIhlali(e: GecmisEmir, adimlar: readonly GecmisAdimDurumu[]): string | null {
  if (e.arsiv) return GECMIS_ARSIV;
  if (e.durum !== 'taslak' && e.durum !== 'planli') return GECMIS_EMIR_DURUMU;
  if (e.ustEmirId !== null || e.acikKolVar) return GECMIS_KOLLU;
  if (adimlar.some((a) => a.dalli)) return GECMIS_DALLI;
  return null;
}

// Girilen adımlar bitmiş adımlardan sonraki ardışık bekleyen adımlardır; sıra adımın sırasıdır, gövdedeki sıra değil.
export function gecmisSiraIhlali(adimlar: readonly GecmisAdimDurumu[], girilenOpNolar: readonly number[]): string | null {
  const sirali = [...adimlar].sort((a, b) => a.sira - b.sira);
  const ilk = sirali.findIndex((a) => a.durum !== 'tamam');
  if (ilk < 0) return GECMIS_SON_ADIM;
  if (new Set(girilenOpNolar).size !== girilenOpNolar.length) return GECMIS_SIRA;
  const beklenen = sirali.slice(ilk, ilk + girilenOpNolar.length);
  const kume = new Set(girilenOpNolar);
  if (beklenen.length !== girilenOpNolar.length || beklenen.some((a) => !kume.has(a.opNo))) return GECMIS_SIRA;
  if (ilk + girilenOpNolar.length >= sirali.length) return GECMIS_SON_ADIM;
  for (const a of beklenen) {
    if (a.durum !== 'bekliyor') return GECMIS_SIRA;
    if (a.fason) return GECMIS_FASON;
    if (a.istasyonId === null) return GECMIS_ISTASYONSUZ;
  }
  return null;
}

const yilEkle = (tarih: string, yil: number): string => `${String(Number(tarih.slice(0, 4)) + yil).padStart(4, '0')}${tarih.slice(4)}`;

// Siparişle aynı sınır (siparisler SIP-4 a): iki yıl geri; ileri tarih yok.
export function gecmisTarihIhlali(bugun: string, bas: string | null, bit: string | null): string | null {
  for (const t of [bas, bit]) {
    if (t === null) continue;
    if (t > bugun) return GECMIS_TARIH_ILERI;
    if (t < yilEkle(bugun, -2)) return GECMIS_TARIH_ESKI;
  }
  if (bas !== null && bit !== null && bas > bit) return GECMIS_TARIH_SIRASI;
  return null;
}

// Önceki adımın sağlamı sonraki adıma giren en çok adettir; ilk girilen adımın önceki sağlamı varsa (bitmiş adım) o sınırdır.
export function gecmisAdetIhlali(oncekiSaglam: number | null, adimlar: readonly Pick<GecmisGirisAdimi, 'saglam' | 'hurda' | 'hurdaNedeniId'>[]): { ileti: string; sira: number } | null {
  let onceki = oncekiSaglam;
  for (const [i, a] of adimlar.entries()) {
    if (a.hurda > 0 && a.hurdaNedeniId === null) return { ileti: GECMIS_HURDA_NEDENI, sira: i };
    if (a.hurda === 0 && a.hurdaNedeniId !== null) return { ileti: GECMIS_NEDEN_FAZLA, sira: i };
    if (onceki !== null && a.saglam + a.hurda > onceki) return { ileti: GECMIS_ADET_ASIMI, sira: i };
    onceki = a.saglam;
  }
  return null;
}

// İş emrinin başlama ve bitiş anı: girilen gün (yoksa emrin genel günü) tesis saatiyle öğlen; gelecek ana düşmez ve başlama bitişi geçmez.
const OGLEN_MS = 12 * 3_600_000;
export function gecmisZamanlari(
  genel: { baslama: string; bitis: string }, adim: { baslama: string | null; bitis: string | null }, simdi: number,
): { baslama: string; bitis: string } {
  const bit = Math.min(tesisGunBasi(adim.bitis ?? genel.bitis) + OGLEN_MS, simdi);
  const bas = Math.min(tesisGunBasi(adim.baslama ?? genel.baslama) + OGLEN_MS, bit);
  return { baslama: new Date(bas).toISOString(), bitis: new Date(bit).toISOString() };
}

// Geri alma son girilen adımdandır; ondan sonraki adımların hiçbiri başlamamış ve sayım almamış olmalıdır.
export function gecmisGeriAlIhlali(
  e: GecmisEmir, girisVar: boolean, sonrakiler: readonly { durum: 'bekliyor' | 'calisiyor' | 'tamam'; sayimVar: boolean }[],
): string | null {
  if (e.arsiv) return GECMIS_ARSIV;
  if (e.durum !== 'taslak' && e.durum !== 'planli') return GECMIS_EMIR_DURUMU;
  if (!girisVar) return GECMIS_GERI_YOK;
  if (sonrakiler.some((a) => a.durum !== 'bekliyor' || a.sayimVar)) return GECMIS_GERI_SONRAKI;
  return null;
}
