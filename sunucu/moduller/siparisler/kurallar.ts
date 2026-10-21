// Saf iş kuralları; veritabanı ve saat yok. Kural numaraları KURAL-TEST.md'de testlerine bağlıdır.
import type { FirmaTuru } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { ISKONTO_ONAY_ESIGI } from '#paylasilan/sozlesme/siparisler.ts';
import type { Siparis, SiparisAyrintisi, SiparisDurumu, TeklifAyrintiCevabi, TeklifAyrintisi, TeklifDurumu } from '#paylasilan/sozlesme/siparisler.ts';

export const SIPARIS_YOK = 'Sipariş bulunamadı.';
export const FIRMA_YOK = 'Firma bulunamadı.';
export const FIRMA_PASIF = 'Pasif firmaya sipariş açılamaz.';
export const FIRMA_MUSTERI_DEGIL = 'Firma müşteri değil; satış siparişi yalnız müşteri firmaya açılır.';
export const MALZEME_YOK = 'Malzeme kartı bulunamadı.';
export const MALZEME_AKTIF_DEGIL = 'Onaylanmamış ya da iptal edilmiş malzeme kartı siparişe girmez.';
export const MALZEME_SATILMAZ = 'Bu türdeki kart satılmaz; yalnız mamul, yarı mamul ve ticari mal siparişe girer.';
export const MUSTERI_NO_KULLANILIYOR = 'Bu müşteri sipariş numarası bu firmada başka bir siparişte kullanılıyor.';
export const YALNIZ_TASLAK = 'Yalnız taslak sipariş değiştirilir.';

// SIP-02: satılan kart türleri. Hizmet ve sarf satış siparişine girmez (VARSAYIM; NOTLAR.md).
export const SATILAN_TURLER = ['mamul', 'yarimamul', 'ticari_mal'] as const;

// SIP-01: müşteri ya da iki yönlü firma; pasif firma yeni seçilemez, taslağın zaten bağlı olduğu firma pasifleşse de kalabilir.
export function firmaReddi(
  firma: { tur: FirmaTuru; aktif: boolean } | null, firmaId: number, mevcutFirmaId: number | null,
): string | null {
  if (firma === null) return FIRMA_YOK;
  if (firma.tur === 'tedarikci') return FIRMA_MUSTERI_DEGIL;
  if (!firma.aktif && firmaId !== mevcutFirmaId) return FIRMA_PASIF;
  return null;
}

// SIP-02: kart var, aktif ve satılan türde olmalı.
export function malzemeReddi(kart: { tur: string; onayDurumu: string } | null): string | null {
  if (kart === null) return MALZEME_YOK;
  if (!(SATILAN_TURLER as readonly string[]).includes(kart.tur)) return MALZEME_SATILMAZ;
  if (kart.onayDurumu !== 'aktif') return MALZEME_AKTIF_DEGIL;
  return null;
}

// SIP-04: durum geçişleri. Taslak onaylanır; onaylı kapanır; taslak ve onaylı iptal edilir. Kapanmış ve iptal son durumdur.
export type DurumKomutu = 'onayla' | 'kapat' | 'iptal';
const GECISLER: Readonly<Record<DurumKomutu, { kaynak: readonly SiparisDurumu[]; hedef: SiparisDurumu }>> = {
  onayla: { kaynak: ['taslak'], hedef: 'onayli' },
  kapat: { kaynak: ['onayli'], hedef: 'kapandi' },
  iptal: { kaynak: ['taslak', 'onayli'], hedef: 'iptal' },
};
const DURUM_ADI: Readonly<Record<SiparisDurumu, string>> = { taslak: 'taslak', onayli: 'onaylı', kapandi: 'kapanmış', iptal: 'iptal edilmiş' };
const KOMUT_ADI: Readonly<Record<DurumKomutu, string>> = { onayla: 'onaylanamaz', kapat: 'kapatılamaz', iptal: 'iptal edilemez' };

export function gecisHedefi(komut: DurumKomutu): SiparisDurumu {
  return GECISLER[komut].hedef;
}

export function gecisReddi(durum: SiparisDurumu, komut: DurumKomutu): string | null {
  return GECISLER[komut].kaynak.includes(durum) ? null : `${DURUM_ADI[durum]} sipariş ${KOMUT_ADI[komut]}.`.replace(/^./, (h) => h.toLocaleUpperCase('tr'));
}

// SIP-03: içerik yalnız taslakta değişir; onaylı kayıt onaysız değişmez.
export function duzenlemeReddi(durum: SiparisDurumu): string | null {
  return durum === 'taslak' ? null : YALNIZ_TASLAK;
}

// Aramada no ve müşteri sipariş no büyük-küçük harf duyarsız aranır (SQL tarafı ILIKE).
export function aramaKalibi(ara: string | undefined): string | null {
  const m = ara?.trim();
  if (!m) return null;
  return `%${m.replace(/[\\%_]/g, (k) => `\\${k}`)}%`;
}

// Numara: SS-yıl-sıra, sıra en az üç basamak (satın almanın SP kalıbı).
export function siparisNo(yil: number, sira: number): string {
  return `SS-${yil}-${String(sira).padStart(3, '0')}`;
}

// ---- Satış teklifi ----

export const TEKLIF_YOK = 'Teklif bulunamadı.';
export const YALNIZ_YENI_TEKLIF = 'Talep yalnız ilk sürüm verilmeden düzenlenir.';
export const FIYAT_EKSIK = 'Teklifin her satırına bir fiyat verilmeli.';
export const SURUM_YOK = 'Bu teklifte böyle bir sürüm yok.';
export const KARTSIZ_SATIR = 'Kartı bağlanmamış satır var; siparişe dönüştürmeden önce her satıra malzeme kartı bağlanmalı.';
export const KART_BAGLANAMAZ = 'Reddedilmiş ya da siparişe dönüşmüş teklifin satırı değişmez.';

// TKL-05: teklif durum geçişleri. Sürüm yeni, verilmiş ve revizyondaki teklife verilir; kabul ve revizyon verilmiş teklife;
// red kabulden önce; siparişe yalnız kabul edilmiş teklif döner. Red ve sipariş son durumdur.
export type TeklifKomutu = 'surum' | 'iskonto-onay' | 'revizyon' | 'kabul' | 'red' | 'siparis';
const TEKLIF_GECISLERI: Readonly<Record<TeklifKomutu, { kaynak: readonly TeklifDurumu[]; hedef: TeklifDurumu }>> = {
  surum: { kaynak: ['yeni', 'onay-bekliyor', 'verildi', 'revizyon'], hedef: 'verildi' },
  'iskonto-onay': { kaynak: ['onay-bekliyor'], hedef: 'verildi' },
  revizyon: { kaynak: ['verildi'], hedef: 'revizyon' },
  kabul: { kaynak: ['verildi'], hedef: 'kabul' },
  red: { kaynak: ['yeni', 'onay-bekliyor', 'verildi', 'revizyon'], hedef: 'red' },
  siparis: { kaynak: ['kabul'], hedef: 'siparis' },
};
const TEKLIF_DURUM_ADI: Readonly<Record<TeklifDurumu, string>> = {
  yeni: 'yeni', 'onay-bekliyor': 'iskonto onayı bekliyor', verildi: 'verildi', revizyon: 'revizyon bekliyor', kabul: 'kabul edildi', red: 'reddedildi', siparis: 'siparişe dönüştü',
};
const TEKLIF_KOMUT_ADI: Readonly<Record<TeklifKomutu, string>> = {
  surum: 'yeni sürüm verilemez', 'iskonto-onay': 'onaylanacak iskonto yok', revizyon: 'revizyon istenemez', kabul: 'kabul edilemez', red: 'reddedilemez', siparis: 'siparişe dönüştürülemez',
};

export function teklifHedefi(komut: TeklifKomutu): TeklifDurumu {
  return TEKLIF_GECISLERI[komut].hedef;
}

// 291 a: eşiği aşan iskontolu sürüm müşteriye gitmeden müdür onayı bekler; müdür onaylamazsa yeni sürüm ya da red verilir.
export function surumHedefi(iskontoOrani: string): TeklifDurumu {
  return Number(iskontoOrani) > ISKONTO_ONAY_ESIGI ? 'onay-bekliyor' : 'verildi';
}

// 293: ayar açıkken sürümü veren kişi kendi iskontosunu onaylayamaz; kapalıyken onay yetkisi yeter.
export function dortGozReddi(acik: boolean, surumuVeren: number, onaylayan: number): string | null {
  return acik && surumuVeren === onaylayan ? 'Dört göz kuralı açık: kendi verdiğiniz sürümün iskontosunu başka bir yetkili onaylamalı.' : null;
}

export function teklifGecisReddi(durum: TeklifDurumu, komut: TeklifKomutu): string | null {
  return TEKLIF_GECISLERI[komut].kaynak.includes(durum) ? null : `Teklif durumu "${TEKLIF_DURUM_ADI[durum]}"; ${TEKLIF_KOMUT_ADI[komut]}.`;
}

// TKL-03: talep satırları yalnız ilk sürümden önce değişir (verilmiş fiyat satıra bağlıdır).
export function talepDuzenlemeReddi(durum: TeklifDurumu): string | null {
  return durum === 'yeni' ? null : YALNIZ_YENI_TEKLIF;
}

// TKL-04: sürümde her talep satırının tam bir fiyatı olur; fazla, eksik ya da yinelenen satır reddedilir.
export function fiyatReddi(satirIdleri: readonly number[], fiyatSatirlari: readonly number[]): string | null {
  const verilen = new Set(fiyatSatirlari);
  if (verilen.size !== fiyatSatirlari.length || verilen.size !== satirIdleri.length) return FIYAT_EKSIK;
  return satirIdleri.every((id) => verilen.has(id)) ? null : FIYAT_EKSIK;
}

// TKL-06: siparişe dönüşmeden her satırın kartı bağlı olmalı.
export function kartsizSatirReddi(malzemeNolari: readonly (number | null)[]): string | null {
  return malzemeNolari.every((m) => m !== null) ? null : KARTSIZ_SATIR;
}

export function kartBaglamaReddi(durum: TeklifDurumu): string | null {
  return durum === 'red' || durum === 'siparis' ? KART_BAGLANAMAZ : null;
}

export function teklifNo(yil: number, sira: number): string {
  return `TK-${yil}-${String(sira).padStart(3, '0')}`;
}

// SIP-10 (180): fiyat, iskonto, tutar ve toplamlar yalnız fiyat ve maliyet görene gider; görmeyene null (sıfır uydurulmaz).
export function siparisFiyatsiz(s: Siparis): Siparis {
  return { ...s, araToplam: null, kdvTutari: null, genelToplam: null };
}
export function siparisAyrintisiFiyatsiz(s: SiparisAyrintisi): SiparisAyrintisi {
  return { ...siparisFiyatsiz(s), satirlar: s.satirlar.map((m) => ({ ...m, birimFiyat: null, tutar: null })) };
}
export function teklifFiyatsiz(t: TeklifAyrintisi): TeklifAyrintiCevabi {
  return {
    ...t,
    surumler: t.surumler.map((v) => ({
      ...v, iskontoOrani: null, toplam: null,
      fiyatlar: v.fiyatlar.map((f) => ({ satirId: f.satirId, birimFiyat: null, iskontoluFiyat: null, tutar: null })),
    })),
  };
}

// SIP-11 (201 a): fiyatı yalnız fiyat görme yetkisi olan girer; öteki yazar kalemi fiyatsız açar ve düzenlerken önceki fiyatı silemez.
// Fiyatsız kalemli sipariş onaylanmaz.
export const FIYAT_YETKISI_YOK = 'Fiyatı yalnız fiyat görme yetkisi olan girer; kalemleri fiyatsız gönderin.';
export const SIPARIS_FIYAT_EKSIK = 'Fiyatı girilmemiş kalem var; sipariş fiyatlar girilmeden onaylanamaz.';

export function fiyatYazmaReddi(fiyatYazar: boolean, satirlar: readonly { birimFiyat: string | null }[]): string | null {
  return !fiyatYazar && satirlar.some((s) => s.birimFiyat !== null) ? FIYAT_YETKISI_YOK : null;
}

// Fiyatı görmeyen düzenlemede satır, aynı sırada aynı kart duruyorsa önceki fiyatını korur; yeni ya da yeri değişen kalem fiyatsızdır.
export function fiyatlariKoru<T extends { malzemeNo: number; birimFiyat: string | null }>(
  onceki: readonly { malzemeNo: number; birimFiyat: string | null }[], yeni: readonly T[],
): T[] {
  return yeni.map((s, i) => (onceki[i]?.malzemeNo === s.malzemeNo ? { ...s, birimFiyat: onceki[i]?.birimFiyat ?? null } : s));
}

export function fiyatEksikReddi(satirlar: readonly { birimFiyat: string | null }[]): string | null {
  return satirlar.some((s) => s.birimFiyat === null) ? SIPARIS_FIYAT_EKSIK : null;
}
