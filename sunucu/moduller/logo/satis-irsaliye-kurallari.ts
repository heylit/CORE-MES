// Stoktan Logo'ya satış (8) ve konsinye çıkış (9) irsaliyesi (kart 3684; kurgu devir-heylit/stok-irsaliye-kesme/KURGU.md). Saf kurallar: gövde, etiket ve
// gönderim yok; etiketler ve konsinye TRCODE'u gerçek Logo dökümü gelene kadar yazılmaz (ADR 0017 m.5, kart 3683).
const ONDALIK = /^\d+(\.\d+)?$/;
const SIFIR = /^0+(\.0+)?$/;
const FIS_NO_EN_COK = 16; // VARSAYIM: mal kabul kurgusuyla aynı; Logo sınırı ölçülmedi, kırpmak yerine reddedilir.
const STOK_KODU_EN_COK = 24;

export type SatisTuru = 'toptan' | 'konsinye';
export interface SevkSatiri {
  sira: number;
  stokKodu: string | null;
  miktar: string;
  birim: string | null;
  ambarNo: number | null;
  // Logo satış siparişi satırının kayıt no'su; konsinyede sipariş olmayabilir.
  siparisSatiriLogoRef: number | null;
  lotlu: boolean;
  // CORE stokundaki kullanılabilir miktar (ondalık metin); okunamadıysa null.
  stoktaki: string | null;
}
export interface SevkBelgesi {
  no: string;
  // Sevk tarihi YYYY-MM-DD.
  tarih: string;
  tur: SatisTuru;
  cariKodu: string | null;
  satirlar: readonly SevkSatiri[];
}

export type AtlamaNedeni = 'siparis-bagi-yok' | 'stok-kodu-yok' | 'ambar-yok' | 'birim-yok' | 'miktar-gecersiz' | 'lotlu' | 'stok-yetersiz' | 'kalan-yetersiz';
export const ATLAMA_ILETILERI: Readonly<Record<AtlamaNedeni, string>> = Object.freeze({
  'siparis-bagi-yok': 'Satış siparişine bağlı değil (Logo siparişinde satır bağı yok).',
  'stok-kodu-yok': "Malzeme kartı Logo'ya gitmemiş.",
  'ambar-yok': "Deponun Logo ambar no'su yok.",
  'birim-yok': 'Birim yok.',
  'miktar-gecersiz': 'Miktar sıfırdan büyük bir sayı olmalı.',
  lotlu: "Partili (lotlu) satır; ilk dilimde Logo'ya gitmez.",
  'stok-yetersiz': 'CORE stokunda bu miktar yok ya da okunamadı.',
  'kalan-yetersiz': 'Logo siparişinde kalan miktar bu sevki karşılamıyor ya da okunamadı.',
});
export type EngelNedeni = 'cari-kodu' | 'fis-no' | 'ambar-farkli' | 'gidecek-satir-yok';
export const ENGEL_ILETILERI: Readonly<Record<EngelNedeni, string>> = Object.freeze({
  'cari-kodu': "Müşterinin Logo cari kodu yok.",
  'fis-no': `Sevk no'su Logo fiş numarasına (en çok ${String(FIS_NO_EN_COK)} karakter) sığmıyor.`,
  'ambar-farkli': 'Satırlar farklı Logo ambarlarından çıkıyor; satır ambarı etiketi doğrulanana kadar tek ambarlı belge gider.',
  'gidecek-satir-yok': "Logo'ya gidecek satır yok.",
});
export interface AtlananSatir { sira: number; neden: AtlamaNedeni }
export interface OnKontrolSonucu { engeller: EngelNedeni[]; gidecek: SevkSatiri[]; atlanan: AtlananSatir[]; kismi: boolean; gonderilebilir: boolean }

const bos = (s: string | null | undefined): boolean => s === null || s === undefined || s.trim() === '';

// Satır tek sebeple atlanır. Toptan satışta sipariş bağı şart (mal kabuldeki karar: bağsız satır gitmez, VARSAYIM); konsinyede şart değil.
export function satirAtlamaNedeni(s: SevkSatiri, tur: SatisTuru): AtlamaNedeni | null {
  if (s.lotlu) return 'lotlu';
  if (tur === 'toptan' && s.siparisSatiriLogoRef === null) return 'siparis-bagi-yok';
  if (bos(s.stokKodu) || (s.stokKodu?.trim().length ?? 0) > STOK_KODU_EN_COK) return 'stok-kodu-yok';
  if (s.ambarNo === null) return 'ambar-yok';
  if (bos(s.birim)) return 'birim-yok';
  if (!ONDALIK.test(s.miktar) || SIFIR.test(s.miktar)) return 'miktar-gecersiz';
  if (s.stoktaki === null || !ONDALIK.test(s.stoktaki) || Number(s.miktar) > Number(s.stoktaki)) return 'stok-yetersiz';
  return null;
}

export function sevkOnKontrol(b: SevkBelgesi): OnKontrolSonucu {
  const engeller: EngelNedeni[] = [];
  if (bos(b.cariKodu)) engeller.push('cari-kodu');
  if (b.no.trim() === '' || b.no.trim().length > FIS_NO_EN_COK) engeller.push('fis-no');
  const gidecek: SevkSatiri[] = [];
  const atlanan: AtlananSatir[] = [];
  for (const s of b.satirlar) {
    const neden = satirAtlamaNedeni(s, b.tur);
    if (neden === null) gidecek.push(s);
    else atlanan.push({ sira: s.sira, neden });
  }
  if (gidecek.length === 0) engeller.push('gidecek-satir-yok');
  if (new Set(gidecek.map((s) => s.ambarNo)).size > 1) engeller.push('ambar-farkli');
  return { engeller, gidecek, atlanan, kismi: gidecek.length > 0 && atlanan.length > 0, gonderilebilir: engeller.length === 0 };
}

// Gönderimden hemen önce Logo sipariş satırının kalanı yeniden okunur; haritada olmayan satır okunamamıştır ve gitmez. Konsinyede (siparişsiz) uygulanmaz.
export function sevkKalanKontrolu(gidecek: readonly SevkSatiri[], kalanlar: ReadonlyMap<number, string>): AtlananSatir[] {
  const atlanan: AtlananSatir[] = [];
  for (const s of gidecek) {
    if (s.siparisSatiriLogoRef === null) continue;
    const kalan = kalanlar.get(s.siparisSatiriLogoRef);
    if (kalan === undefined || !ONDALIK.test(kalan) || Number(s.miktar) > Number(kalan)) atlanan.push({ sira: s.sira, neden: 'kalan-yetersiz' });
  }
  return atlanan;
}

// Araç çıkış kilidi (karar K4 3685: yalnız sevk işinin "yola çıktı" geçişi kilitlenir, stok 235 a gibi kalır). Durum Logo'dan okunur, yazılmaz.
// DOĞRULANMADI: kodlar belgenin EDESPSTATUS tablosundan (6 GİB'de işlendi, 8 alıcıya iletildi, 10 alıcıda işlendi, 12 kabul); hangisinin yeterli
// sayılacağı mali müşavir ve entegratörle netleşir, bu yüzden küme parametredir.
export const CIKIS_IZINLI_DURUMLAR_ONERI: ReadonlySet<number> = new Set([6, 8, 10, 12]);
export const CIKIS_HATA_DURUMLARI: ReadonlySet<number> = new Set([5, 7, 9, 11, 18]);
export type CikisKarari = { izin: true } | { izin: false; neden: 'durum-yok' | 'hata' | 'bekliyor' };
export function cikisKilidi(durum: number | null, izinli: ReadonlySet<number> = CIKIS_IZINLI_DURUMLAR_ONERI): CikisKarari {
  if (durum === null) return { izin: false, neden: 'durum-yok' };
  if (izinli.has(durum)) return { izin: true };
  return { izin: false, neden: CIKIS_HATA_DURUMLARI.has(durum) ? 'hata' : 'bekliyor' };
}

// Fiili sevk, düzenleme zamanından önce olamaz (belge 7.5, mevzuat iddiası doğrulanmadı); sevk zamanı sunucu saatinden verilir, kullanıcıdan alınmaz.
export const sevkZamaniGecerli = (duzenleme: Date, sevk: Date): boolean => sevk.getTime() >= duzenleme.getTime();
