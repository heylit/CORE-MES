// Saf iş kuralları; veritabanı ve saat yok. Kural numaraları KURAL-TEST.md'de testlerine bağlıdır.
import type { FirmaTuru } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { ISKONTO_ONAY_ESIGI, TERMIN_ARALIKLARI, teklifFormuIcerikSemasi, teklifFormuKurumSemasi, teklifFormuMetniSemasi, terminYerlesimi, type TerminAraligi, type TerminYerlesimi } from '#paylasilan/sozlesme/siparisler.ts';
import type { KarsilamaYolu, TeklifFormuDili, TeklifFormuIcerigi, TeklifFormuKurumu, TeklifFormuMetni } from '#paylasilan/sozlesme/siparisler.ts';
import { BITEN_EMIR_DURUMLARI, type EmirDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  AdetCarpani, AdetDenemesiSatiri, MaliyetKalemi, PlanBloguTuru, PlanSeridi, Siparis, SiparisAyrintisi, SiparisDurumu, TeklifAyrintiCevabi, TeklifAyrintisi, TeklifDurumu, TeklifSatiri, TerminDenemesiCevabi,
  TerminDenemesiKalemi,
} from '#paylasilan/sozlesme/siparisler.ts';

export const SIPARIS_YOK = 'Sipariş bulunamadı.';

// Termine kalan gün (termin - bugün): eksi gecikmiştir; 0 bugün teslim edilecek olandır.
export function terminAraligi(kalanGun: number): TerminAraligi {
  if (kalanGun < 0) return 'gecikmis';
  if (kalanGun <= 3) return '0-3';
  if (kalanGun <= 7) return '4-7';
  if (kalanGun <= 14) return '8-14';
  return '15+';
}

export function terminDagilimi(kalanlar: readonly { kalan: number; sayi: number }[]): { aralik: TerminAraligi; sayi: number }[] {
  const toplam = new Map<TerminAraligi, number>(TERMIN_ARALIKLARI.map((a) => [a, 0]));
  for (const k of kalanlar) { const a = terminAraligi(k.kalan); toplam.set(a, (toplam.get(a) ?? 0) + k.sayi); }
  return TERMIN_ARALIKLARI.map((aralik) => ({ aralik, sayi: toplam.get(aralik) ?? 0 }));
}
export const FIRMA_YOK = 'Firma bulunamadı.';
export const FIRMA_PASIF = 'Pasif firmaya sipariş açılamaz.';
export const FIRMA_MUSTERI_DEGIL = 'Firma müşteri değil; satış siparişi yalnız müşteri firmaya açılır.';
export const MALZEME_YOK = 'Malzeme kartı bulunamadı.';
export const MALZEME_AKTIF_DEGIL = 'Onaylanmamış ya da iptal edilmiş malzeme kartı siparişe girmez.';
export const MALZEME_SATILMAZ = 'Bu türdeki kart satılmaz; yalnız mamul, yarı mamul ve ticari mal siparişe girer.';
export const MUSTERI_NO_KULLANILIYOR = 'Bu müşteri sipariş numarası bu firmada başka bir siparişte kullanılıyor.';
export const YALNIZ_TASLAK = 'Yalnız taslak sipariş değiştirilir.';
// Numara Logo fiş numarası olur; kalıp Sistem Ayarları'nda daha uzun numara üretirse kayıt açılmaz.
export const NUMARA_UZUN = 'Numara kalıbı 16 karakteri aşan numara üretiyor; Sistem Ayarları > Numara kurallarında kalıbı kısaltın.';

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

// 3438 a: yeni kalem kart ailesinin yürürlükteki revizyonuyla açılır; başka revizyon (müşteri eskisini isterse) gerekçeyle seçilir.
// Daha önce kayıtlı kalemin kartı değişmediyse sonradan yürürlüğe giren revizyon kalemi durdurmaz.
export interface KalemRevizyonDurumu { kod: string | null; etiket: string | null; yururlukte: boolean; yururluktekiKodu: string; yururluktekiEtiketi: string | null }
export function eskiRevizyonReddi(r: KalemRevizyonDurumu | null, gerekce: string | null, kayitliKart: boolean): string | null {
  if (r === null || r.yururlukte || kayitliKart || (gerekce ?? '').trim() !== '') return null;
  const ek = (e: string | null) => (e === null ? '' : ` (${e})`);
  return `${r.kod ?? 'Bu kart'}${ek(r.etiket)} yürürlükteki revizyon değil; yürürlükteki ${r.yururluktekiKodu}${ek(r.yururluktekiEtiketi)}. Eski revizyonla açmak için gerekçe yazın.`;
}

// SIP-4 a (02.11.2026): adet birimli kart parçayla satılır; kesirli adet siparişe girmez. Yalnız "adet" (karar metni); öteki sayılabilir
// birimler (takım, kutu) ayrı karar ister.
export const MIKTAR_TAM_SAYI = 'Bu kartın birimi adet; miktar tam sayı olmalı.';
export function miktarReddi(birim: string | null, miktar: string): string | null {
  return birim?.trim().toLocaleLowerCase('tr') === 'adet' && !/^\d+(\.0*)?$/.test(miktar.trim()) ? MIKTAR_TAM_SAYI : null;
}

// 3400-2: kartsız kalemin birimi aktif birim listesinden seçilir; karta bağlı kalemde kartın birimi geçerlidir (birim yazılmaz).
export const BIRIM_LISTEDE_YOK = 'Birim listede yok ya da kapalı; listeden bir birim seçin.';
// 3400-3: kartta yerlilik oranı varsa kalem kartınkini taşır; yoksa kalemde girilen (boş olabilir). Talep ilk sürümden sonra değişmez (TKL-03).
export function talepKalemi<T extends { malzemeNo: number | null; birim: string | null; yerlilikOrani: string | null }>(
  s: T, kartOrani: string | null,
): T {
  return { ...s, birim: s.malzemeNo === null ? s.birim : null, yerlilikOrani: s.malzemeNo !== null && kartOrani !== null ? kartOrani : s.yerlilikOrani };
}

// SIP-18 (3244 b): kalem partilere ayrıldıysa parti adetleri toplamı kalem miktarıdır; boş liste tek seri partidir. Adet birimli kartta
// parti de tam sayıdır (SIP-4 a ile aynı gerekçe). Karşılaştırma binde bir hassasiyetle tam sayıda yapılır: kayan nokta 0.1 + 0.2'de şaşar.
export const PARTI_TOPLAMI_TUTMUYOR = 'Parti adetlerinin toplamı kalem miktarına eşit olmalı.';
const binde = (m: string): bigint => {
  const [tam = '0', kesir = ''] = m.trim().split('.');
  return BigInt(tam) * 1000n + BigInt((kesir + '000').slice(0, 3));
};
// SIP-42 (3429-3 F): parti üretim emrinin bölümüdür; stoktan ya da satın alınarak karşılanan kalemde parti olmaz.
export const PARTI_YALNIZ_URETILENDE = 'Partiler yalnız "Üret" kalemde olur.';
export const karsilamaPartiReddi = (karsilama: string, partiler: readonly unknown[]): string | null =>
  karsilama !== 'uret' && partiler.length > 0 ? PARTI_YALNIZ_URETILENDE : null;

// SIP-43 (3429-3 F2, Risk R4): üretilmeyen kart (ticari mal) üretim emriyle karşılanmaz; "Üret" gelirse ya da yol verilmezse "Stoktan" kaydedilir.
export const URETILEN_TURLER: readonly string[] = ['mamul', 'yarimamul'];
export const kalemKarsilamasi = (tur: string | null, karsilama: KarsilamaYolu | undefined): KarsilamaYolu =>
  (karsilama ?? 'uret') === 'uret' && tur !== null && !URETILEN_TURLER.includes(tur) ? 'stok' : karsilama ?? 'uret';

export function partiReddi(birim: string | null, miktar: string, partiler: readonly { adet: string }[]): string | null {
  if (partiler.length === 0) return null;
  for (const p of partiler) {
    const ret = miktarReddi(birim, p.adet);
    if (ret !== null) return ret;
  }
  return partiler.reduce((t, p) => t + binde(p.adet), 0n) === binde(miktar) ? null : PARTI_TOPLAMI_TUTMUYOR;
}

// SIP-19 (3254 a): onayı geri alınmış siparişte emre bağlı kalem kilitlidir: silinmez, sırası değişmez; malzeme, miktar, fiyat, açıklama
// partiler ve karşılama yolu (3429-3) aynı kalır, yalnız termin değişir. Satın alma talebine bağlı "Satın al" kalemi de kilitlidir (3429-3 F3). Kalem kimliğiyle eşlenir (gövdedeki `id`); kimliği bu siparişte olmayan kalem reddedilir.
export const KALEM_BASKA_SIPARISIN = 'Kalem bu siparişin değil.';
export const KILITLI_KALEM_SILINMEZ = 'Emre ya da satın alma talebine bağlı kalem silinemez';
export const KILITLI_KALEM_SIRASI = 'Emre ya da satın alma talebine bağlı kalemin sırası değişmez';
export const KILITLI_KALEM_DEGISMEZ = 'Emre ya da satın alma talebine bağlı kalemde yalnız termin değişir';
const sayiAyni = (a: string | null, b: string | null): boolean => {
  const n = (m: string) => { const [t = '0', k = ''] = m.trim().split('.'); return `${BigInt(t)}.${k.replace(/0+$/, '')}`; };
  return a === null || b === null ? a === b : n(a) === n(b);
};
export interface KayitliKalem {
  id: number; sira: number; malzemeNo: number; miktar: string; birimFiyat: string | null; aciklama: string | null;
  partiler: readonly { emirTuru: string; adet: string; rotaId?: number | null | undefined }[];
  karsilama: string;
}
export interface YeniKalem {
  id?: number | undefined; malzemeNo: number; miktar: string; birimFiyat: string | null; aciklama: string | null;
  partiler?: readonly { emirTuru: string; adet: string; rotaId?: number | null | undefined }[] | undefined;
  karsilama?: string | undefined;
}
export function kilitliKalemReddi(
  kayitli: readonly KayitliKalem[], kilitli: ReadonlySet<number>, yeni: readonly YeniKalem[],
): { mesaj: string; alan: string } | null {
  const idler = new Set(kayitli.map((k) => k.id));
  const yabanci = yeni.findIndex((k) => k.id !== undefined && !idler.has(k.id));
  if (yabanci >= 0) return { mesaj: KALEM_BASKA_SIPARISIN, alan: `satirlar.${yabanci}` };
  for (const k of kayitli) {
    if (!kilitli.has(k.id)) continue;
    const i = yeni.findIndex((y) => y.id === k.id);
    const y = yeni[i];
    if (y === undefined) return { mesaj: `${KILITLI_KALEM_SILINMEZ} (kalem ${k.sira}).`, alan: 'satirlar' };
    if (i + 1 !== k.sira) return { mesaj: `${KILITLI_KALEM_SIRASI} (kalem ${k.sira}).`, alan: `satirlar.${i}` };
    const partiler = y.partiler ?? [];
    const ayni = y.malzemeNo === k.malzemeNo && sayiAyni(y.miktar, k.miktar) && sayiAyni(y.birimFiyat, k.birimFiyat) && y.aciklama === k.aciklama
      && (y.karsilama ?? 'uret') === k.karsilama
      && partiler.length === k.partiler.length
      && partiler.every((p, j) => p.emirTuru === k.partiler[j]?.emirTuru && sayiAyni(p.adet, k.partiler[j]?.adet ?? null)
        && (p.rotaId ?? null) === (k.partiler[j]?.rotaId ?? null));
    if (!ayni) return { mesaj: `${KILITLI_KALEM_DEGISMEZ} (kalem ${k.sira}).`, alan: `satirlar.${i}` };
  }
  return null;
}

// SIP-4 a: yanlış yıl girişini yakalayan makul aralık (bugün sunucudan, tesis günü). Geç girilen eski sipariş için iki yıl geri,
// önceden alınan sipariş için bir yıl ileri; termin sipariş tarihinden en çok beş yıl sonra (VARSAYIM: çerçeve sözleşmesi bu kadar uzun).
export const SIPARIS_TARIHI_ARALIK_DISI = 'Sipariş tarihi bugünden en çok iki yıl önce, en çok bir yıl sonra olabilir.';
export const TERMIN_COK_UZAK = 'Termin sipariş tarihinden en çok beş yıl sonra olabilir.';
const yilEkle = (tarih: string, yil: number): string => `${String(Number(tarih.slice(0, 4)) + yil).padStart(4, '0')}${tarih.slice(4)}`;
export function tarihAraligiReddi(
  bugun: string, g: { siparisTarihi: string; termin: string; satirlar: readonly { termin: string | null }[] },
): { mesaj: string; alan: string } | null {
  if (g.siparisTarihi < yilEkle(bugun, -2) || g.siparisTarihi > yilEkle(bugun, 1)) return { mesaj: SIPARIS_TARIHI_ARALIK_DISI, alan: 'siparisTarihi' };
  const sinir = yilEkle(g.siparisTarihi, 5);
  if (g.termin > sinir) return { mesaj: TERMIN_COK_UZAK, alan: 'termin' };
  const i = g.satirlar.findIndex((r) => r.termin !== null && r.termin > sinir);
  return i < 0 ? null : { mesaj: TERMIN_COK_UZAK, alan: `satirlar.${i}.termin` };
}

// SIP-4 a: toplamlar numeric(20,2) hesaplanır (sorgular.ts); KDV dahil genel toplam sığmazsa veritabanı alan adsız hata verirdi.
// Toplamı aşıran ilk satır gösterilir.
export const TUTAR_COK_BUYUK = 'Sipariş toplamı çok büyük; miktar ve birim fiyatı kontrol edin.';
const TUTAR_UST = 1e18;
export function tutarTasmaReddi(
  kdvOrani: string, satirlar: readonly { miktar: string; birimFiyat: string | null }[],
): { mesaj: string; alan: string } | null {
  const carpan = 1 + Number(kdvOrani) / 100;
  let toplam = 0;
  const i = satirlar.findIndex((r) => {
    toplam += r.birimFiyat === null ? 0 : Number(r.miktar) * Number(r.birimFiyat);
    return toplam * carpan >= TUTAR_UST;
  });
  return i < 0 ? null : { mesaj: TUTAR_COK_BUYUK, alan: `satirlar.${i}.birimFiyat` };
}

// SIP-04: durum geçişleri. Taslak onaylanır; onaylı kapanır; taslak ve onaylı iptal edilir. Kapanmış ve iptal son durumdur.
// SIP-19 (3254 a): onaylı siparişin onayı gerekçeyle geri alınır, sipariş taslağa döner; emre bağlı kalemler kilitli kalır.
export type DurumKomutu = 'onayla' | 'kapat' | 'iptal' | 'geri-al';
const GECISLER: Readonly<Record<DurumKomutu, { kaynak: readonly SiparisDurumu[]; hedef: SiparisDurumu }>> = {
  onayla: { kaynak: ['taslak'], hedef: 'onayli' },
  kapat: { kaynak: ['onayli'], hedef: 'kapandi' },
  iptal: { kaynak: ['taslak', 'onayli'], hedef: 'iptal' },
  'geri-al': { kaynak: ['onayli'], hedef: 'taslak' },
};
const DURUM_ADI: Readonly<Record<SiparisDurumu, string>> = { taslak: 'taslak', onayli: 'onaylı', kapandi: 'kapanmış', iptal: 'iptal edilmiş' };
const KOMUT_ADI: Readonly<Record<DurumKomutu, string>> = {
  onayla: 'onaylanamaz', kapat: 'kapatılamaz', iptal: 'iptal edilemez', 'geri-al': 'onayı geri alınamaz',
};

export function gecisHedefi(komut: DurumKomutu): SiparisDurumu {
  return GECISLER[komut].hedef;
}

export function gecisReddi(durum: SiparisDurumu, komut: DurumKomutu): string | null {
  return GECISLER[komut].kaynak.includes(durum) ? null : `${DURUM_ADI[durum]} sipariş ${KOMUT_ADI[komut]}.`.replace(/^./, (h) => h.toLocaleUpperCase('tr'));
}

// SIP-04 (2103 a): bağlı açık üretim emri olan sipariş iptal edilmez; önce emir kapatılır ya da iptal edilir. İptal olayı yoktur:
// emir ve plan iptalden habersiz çalışmaya devam ederdi. Açık, bitmemiş ve iptal edilmemiş emirdir (taslak, planlı, başlamış).
// 3425 a: yalnız iptal edilmiş sipariş arşive kalkar; kayıt silinmez, geri alınır. Arşiv yalnız listenin görünürlüğüdür.
export const SIPARIS_ARSIVLENEMEZ = 'Yalnız iptal edilmiş sipariş arşive kaldırılır.';
export const SIPARIS_ARSIVDE = 'Sipariş zaten arşivde.';
export const SIPARIS_ARSIVDE_DEGIL = 'Sipariş arşivde değil.';
export function siparisArsivReddi(durum: SiparisDurumu, arsivde: boolean, arsivle: boolean): string | null {
  if (!arsivle) return arsivde ? null : SIPARIS_ARSIVDE_DEGIL;
  if (arsivde) return SIPARIS_ARSIVDE;
  return durum === 'iptal' ? null : SIPARIS_ARSIVLENEMEZ;
}

export const BAGLI_ACIK_EMIR = 'Siparişe bağlı açık üretim emri var; önce emirleri kapatın ya da iptal edin';
const GOSTERILEN_EMIR = 5;

export function bagliEmirReddi(komut: DurumKomutu, emirler: readonly { emirNo: string; durum: EmirDurumu }[]): string | null {
  if (komut !== 'iptal') return null;
  const acik = emirler.filter((e) => !(BITEN_EMIR_DURUMLARI as readonly EmirDurumu[]).includes(e.durum)).map((e) => e.emirNo);
  if (acik.length === 0) return null;
  const fazla = acik.length > GOSTERILEN_EMIR ? ` ve ${acik.length - GOSTERILEN_EMIR} emir daha` : '';
  return `${BAGLI_ACIK_EMIR}: ${acik.slice(0, GOSTERILEN_EMIR).join(', ')}${fazla}.`;
}

// SIP-44 (3429-3 F3): "Satın al" kalemi açık (iptal edilmemiş, teslim alınmamış) satın alma talebine bağlıyken sipariş iptal edilemez;
// talep kendiliğinden iptal edilmez (teklif ve sipariş satın almanındır).
export const BAGLI_ACIK_TALEP = 'Siparişe bağlı açık satın alma talebi var; önce talebi iptal edin';
export function bagliTalepReddi(komut: DurumKomutu, talepNolari: readonly string[]): string | null {
  if (komut !== 'iptal' || talepNolari.length === 0) return null;
  const fazla = talepNolari.length > GOSTERILEN_EMIR ? ` ve ${talepNolari.length - GOSTERILEN_EMIR} talep daha` : '';
  return `${BAGLI_ACIK_TALEP}: ${talepNolari.slice(0, GOSTERILEN_EMIR).join(', ')}${fazla}.`;
}

// SIP-41 (3429-1 a): sevk ya da fatura eksikken onaylı sipariş yalnız gerekçeyle kapanır; eksikler iletide listelenir. Gerekçe uç
// denetim kaydında gövdeyle durur (onay geri alma gibi, SIP-19). Eksik yoksa gerekçe istenmez.
export const KAPANIS_GEREKCESI = 'Eksikle kapatmak için gerekçe yazın';
const GOSTERILEN_EKSIK = 5;
export function kapanisReddi(komut: DurumKomutu, eksikler: readonly string[], neden: string | undefined): string | null {
  if (komut !== 'kapat' || eksikler.length === 0 || (neden ?? '').trim() !== '') return null;
  const fazla = eksikler.length > GOSTERILEN_EKSIK ? ` ve ${eksikler.length - GOSTERILEN_EKSIK} eksik daha` : '';
  return `${KAPANIS_GEREKCESI}: ${eksikler.slice(0, GOSTERILEN_EKSIK).join(' ')}${fazla}`;
}

// SIP-03: içerik yalnız taslakta değişir; onaylı kayıt onaysız değişmez.
export function duzenlemeReddi(durum: SiparisDurumu): string | null {
  return durum === 'taslak' ? null : YALNIZ_TASLAK;
}

// SIP-40 (3427-4 a): onaylı sipariş "Düzenle" ile yeni sürüm alır; her sürüm gerekçe, kişi ve değişiklik listesiyle yalnız eklenir.
// Müşteri, para birimi, sipariş tarihi, kalem sayısı, kalem malzemesi ve miktarı değişmez: emir ve plan bunlarla açılmıştır; bunlar için
// bugünkü yol onayı geri almaktır (VARSAYIM). Fiyat, termin, açıklama ve ticari şartlar değişir.
export const REVIZYON_YALNIZ_ONAYLI = 'Yalnız onaylı sipariş yeni sürümle düzenlenir.';
export const REVIZYON_DEGISIKLIK_YOK = 'Değişiklik yok; yeni sürüm açılmadı.';
export const REVIZYON_SABIT_ALAN = 'Onaylı siparişte bu alan değişmez; değiştirmek için önce onayı geri alın.';
export const REVIZYON_KALEM_SABIT = 'Onaylı siparişte kalem eklenmez, silinmez; malzeme ve miktar değişmez. Değiştirmek için önce onayı geri alın.';

export function revizyonReddi(durum: SiparisDurumu, arsivde: boolean): string | null {
  return durum === 'onayli' && !arsivde ? null : REVIZYON_YALNIZ_ONAYLI;
}

export interface RevizyonBasligi {
  firmaId: number; siparisTarihi: string; paraBirimi: string; musteriSiparisNo: string | null; termin: string; kdvOrani: string;
  odemeKosulu: string | null; aciklama: string | null; cezaOraniGun: string | null; cezaTavaniOrani: string | null; odemeVadesiGun: number | null;
}
export interface RevizyonKalemi {
  id: number; sira: number; malzemeNo: number; miktar: string; birimFiyat: string | null; termin: string | null; aciklama: string | null;
}
export interface RevizyonHali { baslik: RevizyonBasligi; kalemler: readonly RevizyonKalemi[] }
export interface RevizyonGirdisi {
  baslik: RevizyonBasligi;
  kalemler: readonly { id?: number | undefined; malzemeNo: number; miktar: string; birimFiyat: string | null; termin: string | null; aciklama: string | null }[];
}
export interface RevizyonDegisikligi { alan: string; kalemSira: number | null; eski: string | null; yeni: string | null; fiyat: boolean }

const SABIT_BASLIK = ['firmaId', 'siparisTarihi', 'paraBirimi'] as const;
const SAYI_ALANI = new Set(['kdvOrani', 'cezaOraniGun', 'cezaTavaniOrani', 'odemeVadesiGun', 'birimFiyat']);
const DEGISEN_BASLIK = ['musteriSiparisNo', 'termin', 'kdvOrani', 'odemeKosulu', 'aciklama', 'cezaOraniGun', 'cezaTavaniOrani', 'odemeVadesiGun'] as const;
const KALEM_ALANI = ['birimFiyat', 'termin', 'aciklama'] as const;
const revMetni = (v: string | number | null): string | null => (v === null ? null : String(v));
const alanAyni = (alan: string, a: string | null, b: string | null): boolean => (SAYI_ALANI.has(alan) ? sayiAyni(a, b) : a === b);

// Kalemler kimlikle ve sırayla eşlenir; reddedilen girdi { mesaj, alan } döner (alan form alanıdır).
export function revizyonGirdiReddi(onceki: RevizyonHali, yeni: RevizyonGirdisi): { mesaj: string; alan: string } | null {
  for (const a of SABIT_BASLIK) {
    if (revMetni(onceki.baslik[a]) !== revMetni(yeni.baslik[a])) return { mesaj: REVIZYON_SABIT_ALAN, alan: a };
  }
  if (yeni.kalemler.length !== onceki.kalemler.length) return { mesaj: REVIZYON_KALEM_SABIT, alan: 'satirlar' };
  for (const [i, k] of onceki.kalemler.entries()) {
    const y = yeni.kalemler[i];
    if (y === undefined || y.id !== k.id || y.malzemeNo !== k.malzemeNo || !sayiAyni(y.miktar, k.miktar)) {
      return { mesaj: `${REVIZYON_KALEM_SABIT} (kalem ${k.sira}).`, alan: `satirlar.${i}` };
    }
  }
  return null;
}

export function revizyonDegisiklikleri(onceki: RevizyonHali, yeni: RevizyonGirdisi): RevizyonDegisikligi[] {
  const sonuc: RevizyonDegisikligi[] = [];
  for (const a of DEGISEN_BASLIK) {
    const eski = revMetni(onceki.baslik[a]);
    const y = revMetni(yeni.baslik[a]);
    if (!alanAyni(a, eski, y)) sonuc.push({ alan: a, kalemSira: null, eski, yeni: y, fiyat: false });
  }
  for (const [i, k] of onceki.kalemler.entries()) {
    const y = yeni.kalemler[i];
    if (y === undefined) continue;
    for (const a of KALEM_ALANI) {
      if (!alanAyni(a, k[a], y[a])) sonuc.push({ alan: a, kalemSira: k.sira, eski: k[a], yeni: y[a], fiyat: a === 'birimFiyat' });
    }
  }
  return sonuc;
}

// Fiyat görmeyene fiyat değişikliğinin yalnız varlığı görünür (180).
export function degisiklikFiyatsiz(d: RevizyonDegisikligi): RevizyonDegisikligi {
  return d.fiyat ? { ...d, eski: null, yeni: null } : d;
}

// Aramada no ve müşteri sipariş no büyük-küçük harf duyarsız aranır (SQL tarafı ILIKE).
export function aramaKalibi(ara: string | undefined): string | null {
  const m = ara?.trim();
  if (!m) return null;
  return `%${m.replace(/[\\%_]/g, (k) => `\\${k}`)}%`;
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
export type TeklifKomutu = 'surum' | 'iskonto-onay' | 'termin-onay' | 'revizyon' | 'kabul' | 'red' | 'siparis';
const TEKLIF_GECISLERI: Readonly<Record<TeklifKomutu, { kaynak: readonly TeklifDurumu[]; hedef: TeklifDurumu }>> = {
  surum: { kaynak: ['yeni', 'onay-bekliyor', 'verildi', 'revizyon'], hedef: 'verildi' },
  'iskonto-onay': { kaynak: ['onay-bekliyor'], hedef: 'verildi' },
  'termin-onay': { kaynak: ['onay-bekliyor'], hedef: 'verildi' },
  revizyon: { kaynak: ['verildi'], hedef: 'revizyon' },
  kabul: { kaynak: ['verildi'], hedef: 'kabul' },
  red: { kaynak: ['yeni', 'onay-bekliyor', 'verildi', 'revizyon'], hedef: 'red' },
  siparis: { kaynak: ['kabul'], hedef: 'siparis' },
};
const TEKLIF_DURUM_ADI: Readonly<Record<TeklifDurumu, string>> = {
  yeni: 'yeni', 'onay-bekliyor': 'onay bekliyor', verildi: 'verildi', revizyon: 'revizyon bekliyor', kabul: 'kabul edildi', red: 'reddedildi', siparis: 'siparişe dönüştü',
};
const TEKLIF_KOMUT_ADI: Readonly<Record<TeklifKomutu, string>> = {
  surum: 'yeni sürüm verilemez', 'iskonto-onay': 'onaylanacak iskonto yok', 'termin-onay': 'onaylanacak termin yok', revizyon: 'revizyon istenemez', kabul: 'kabul edilemez', red: 'reddedilemez', siparis: 'siparişe dönüştürülemez',
};

export function teklifHedefi(komut: TeklifKomutu): TeklifDurumu {
  return TEKLIF_GECISLERI[komut].hedef;
}

// 291 a: eşiği aşan iskontolu sürüm müşteriye gitmeden müdür onayı bekler; müdür onaylamazsa yeni sürüm ya da red verilir.
export function iskontoOnayiGerekir(iskontoOrani: string): boolean {
  return Number(iskontoOrani) > ISKONTO_ONAY_ESIGI;
}

// TKL-15 (63 b): iskonto ve termin onayı ayrı verilir; teklif ikisi de bitmeden müşteriye gitmez.
export function onayHedefi(bekleyen: { iskonto: boolean; termin: boolean }): TeklifDurumu {
  return bekleyen.iskonto || bekleyen.termin ? 'onay-bekliyor' : 'verildi';
}
export function surumHedefi(iskontoOrani: string, terminOnayiBekler = false): TeklifDurumu {
  return onayHedefi({ iskonto: iskontoOnayiGerekir(iskontoOrani), termin: terminOnayiBekler });
}
export const ONAYLANACAK_ISKONTO_YOK = 'Onaylanacak iskonto yok.';
export const ONAYLANACAK_TERMIN_YOK = 'Plancı onayı bekleyen satış taslağı yok.';

// 293 ve 273: ayar açıkken sürümü veren kişi kendi iskontosunu ya da terminini onaylayamaz; kapalıyken onay yetkisi yeter.
export function dortGozReddi(acik: boolean, surumuVeren: number, onaylayan: number, konu: 'iskonto' | 'termin' = 'iskonto'): string | null {
  return acik && surumuVeren === onaylayan ? `Dört göz kuralı açık: kendi verdiğiniz sürümün ${konu === 'iskonto' ? 'iskontosunu' : 'terminini'} başka bir yetkili onaylamalı.` : null;
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

// 3419 a: yalnız fiyatı verilmemiş (müşteriye ve Logo'ya gitmemiş) teklif kalıcı silinir; açan ya da sipariş onay yetkilisi siler.
export const SILINMEZ_TEKLIF = 'Fiyatı verilmiş teklif silinmez; arşivleyin.';
export const SILME_YETKISI_YOK = 'Teklifi yalnız açan kişi ya da sipariş onay yetkilisi silebilir.';
export function silmeReddi(t: { durum: TeklifDurumu; surumSayisi: number }): string | null {
  return t.durum === 'yeni' && t.surumSayisi === 0 ? null : SILINMEZ_TEKLIF;
}
export function silmeYetkisiReddi(olusturanId: number, kisiId: number, onaylayabilir: boolean): string | null {
  return olusturanId === kisiId || onaylayabilir ? null : SILME_YETKISI_YOK;
}

// 3419 a: fiyatı verilmiş, siparişe dönmemiş teklif arşivlenir; arşivdeki teklife komut işlemez, arşivden çıkınca sürer.
export const ARSIVLENEMEZ = 'Yalnız fiyatı verilmiş, siparişe dönmemiş teklif arşivlenir; fiyatı verilmemiş teklif silinir.';
export const ARSIVDE = 'Teklif arşivde; önce arşivden çıkarın.';
export const ARSIVDE_DEGIL = 'Teklif arşivde değil.';
const ARSIVLENIR: readonly TeklifDurumu[] = ['onay-bekliyor', 'verildi', 'revizyon', 'red'];
export function arsivReddi(durum: TeklifDurumu, arsivde: boolean): string | null {
  if (arsivde) return ARSIVDE;
  return ARSIVLENIR.includes(durum) ? null : ARSIVLENEMEZ;
}
export function arsivdeReddi(arsivde: boolean): string | null {
  return arsivde ? ARSIVDE : null;
}

// SIP-10 (180): fiyat, iskonto, tutar ve toplamlar yalnız fiyat görene gider; görmeyene null (sıfır uydurulmaz).
// 3401-2 a: gecikme cezası ve ödeme vadesi de ticari şarttır, fiyat görmeyene (planlama, kalite, depo, sevkiyat) gitmez.
export function siparisFiyatsiz(s: Siparis): Siparis {
  return { ...s, araToplam: null, kdvTutari: null, genelToplam: null, cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null };
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

// 3401-2 a: ceza ve vade fiyat görme yetkisinin parçasıdır; göremeyen göndermez, düzenlemede kayıttaki kalır.
export const TICARI_SART_YETKISI_YOK = 'Gecikme cezası ve ödeme vadesini yalnız fiyat görme yetkisi olan girer.';
export function ticariSartReddi(fiyatYazar: boolean, g: { cezaOraniGun: string | null; cezaTavaniOrani: string | null; odemeVadesiGun: number | null }): string | null {
  return !fiyatYazar && (g.cezaOraniGun !== null || g.cezaTavaniOrani !== null || g.odemeVadesiGun !== null) ? TICARI_SART_YETKISI_YOK : null;
}

export function fiyatYazmaReddi(fiyatYazar: boolean, satirlar: readonly { birimFiyat: string | null }[]): string | null {
  return !fiyatYazar && satirlar.some((s) => s.birimFiyat !== null) ? FIYAT_YETKISI_YOK : null;
}

// Fiyatı görmeyen düzenlemede gövde satır kimliği taşımaz; önceki fiyat satırın içeriğinden eşlenir, sıradan değil (sıra silme ve
// eklemede kayar). Önce kart, miktar, termin ve açıklaması aynı satır; sonra kartta tek aday kalırsa o (miktar ya da termin değişmiştir).
// Aynı kartta birden çok aday kalırsa fiyat boş kalır: yanlış satırın fiyatını taşımaktansa yeniden girilsin (onay fiyatsız geçmez).
type KorunanSatir = { malzemeNo: number; miktar: string; birimFiyat: string | null; termin: string | null; aciklama: string | null };
const ayniSatir = (a: Omit<KorunanSatir, 'birimFiyat'>, b: Omit<KorunanSatir, 'birimFiyat'>): boolean =>
  a.malzemeNo === b.malzemeNo && Number(a.miktar) === Number(b.miktar) && a.termin === b.termin && a.aciklama === b.aciklama;

export function fiyatlariKoru<T extends KorunanSatir>(onceki: readonly KorunanSatir[], yeni: readonly T[]): T[] {
  const kullanildi = new Set<number>();
  const eslesen = new Map<number, number>();
  yeni.forEach((s, i) => {
    const j = onceki.findIndex((o, k) => !kullanildi.has(k) && ayniSatir(o, s));
    if (j >= 0) { kullanildi.add(j); eslesen.set(i, j); }
  });
  const kalanYeni = (kart: number) => yeni.filter((s, i) => !eslesen.has(i) && s.malzemeNo === kart).length;
  yeni.forEach((s, i) => {
    if (eslesen.has(i) || kalanYeni(s.malzemeNo) !== 1) return;
    const adaylar = onceki.flatMap((o, k) => (!kullanildi.has(k) && o.malzemeNo === s.malzemeNo ? [k] : []));
    const tek = adaylar[0];
    if (adaylar.length === 1 && tek !== undefined) { kullanildi.add(tek); eslesen.set(i, tek); }
  });
  return yeni.map((s, i) => {
    const j = eslesen.get(i);
    return { ...s, birimFiyat: j === undefined ? null : onceki[j]?.birimFiyat ?? null };
  });
}

export function fiyatEksikReddi(satirlar: readonly { birimFiyat: string | null }[]): string | null {
  return satirlar.some((s) => s.birimFiyat === null) ? SIPARIS_FIYAT_EKSIK : null;
}

// ---- Teklif termin ve fiyat denemesi (44) ----

export const TERMIN_DENEMESI_YOK = 'Termin denemesi kullanılamıyor (planlama motoru bağlı değil); fiyat ve termin elle girilir.';
export const DENENECEK_KALEM_YOK = 'Teklifte kartı bağlı kalem yok; fiyat ve termin elle girilir.';
export const GENEL_GIDER_YOK = 'Genel gider oranı tanımlı değil (Finans).';
export const TERMIN_CIKMADI = 'Motor teklifin bütün kalemlerini yerleştiremedi; termin çıkmadı. Eksik veriyi tamamlayın ya da fiyat ve termini elle verin.';

// Motorun bir kalem için verdiği yerleşim. TL'ler motorun ücretlerinden gelir; ücret ya da fiyat eksikse null.
export interface DenemeIslemi {
  opId: string;
  tezgah: string;
  fason: boolean;
  baslangic: string;
  bitis: string;
  ayarSaat: number;
  islemeSaat: number;
  // Motor işlemin ayar ve işleme bedelini tek tutar verir; fasonda fason bedelidir.
  tl: number | null;
}
export interface DenemeKalemi {
  satirId: number;
  yerlesti: boolean;
  bitis: string | null;
  planTermini: string | null;
  malzemeTl: number | null;
  malzemeGelisi: string | null;
  satinalma: { kod: string; miktar: number; birim: string | null; gelis: string }[];
  islemler: DenemeIslemi[];
  eksikVeri: string[];
  // 3355 a: firması belirlenmemiş fason adımın notu; varsa termin tahminidir. Eski motor vermezse yok.
  fasonNotu?: string[];
  // 3384-c a: reçetedeki hammaddeler (stok kodu ve birimi, tekrarsız); motor vermezse yok.
  hammaddeler?: { kod: string; birim: string | null }[];
}
export interface DenemeSonucu {
  planSurumu: string | null;
  kalemler: DenemeKalemi[];
  kayanlar: { siparis: string; once: string; sonra: string; termin: string | null; gecikir: boolean }[];
  plan: PlanSeridi | null;
}

const tl = (n: number | null): string | null => (n === null || !Number.isFinite(n) ? null : n.toFixed(2));
const toplamVeyaNull = (sayilar: readonly (number | null)[]): number | null =>
  sayilar.some((n) => n === null || !Number.isFinite(n)) ? null : sayilar.reduce<number>((a, n) => a + (n ?? 0), 0);

// TKL-14: maliyet aynı yerleşimden çıkar: malzeme, her işlemin (ayar dahil) tutarı, fason bedeli ve tezgâh saatine genel gider.
// Biri bilinmiyorsa toplam null (sıfır uydurulmaz); yerleşmeyen kalemin maliyeti yoktur.
export function kalemMaliyeti(k: DenemeKalemi, adet: number, genelGiderSaatBasi: number | null): {
  dokum: MaliyetKalemi[]; toplam: number | null; birim: number | null;
} {
  const dokum: MaliyetKalemi[] = [{ tur: 'malzeme', ad: 'Malzeme', tezgah: null, saat: null, tutar: tl(k.malzemeTl) }];
  const tutarlar: (number | null)[] = [k.malzemeTl];
  let makineSaati = 0;
  for (const i of k.islemler) {
    if (i.fason) {
      dokum.push({ tur: 'fason', ad: i.opId, tezgah: i.tezgah, saat: null, tutar: tl(i.tl) });
      tutarlar.push(i.tl);
      continue;
    }
    makineSaati += i.ayarSaat + i.islemeSaat;
    dokum.push({ tur: 'isleme', ad: i.opId, tezgah: i.tezgah, saat: (i.ayarSaat + i.islemeSaat).toFixed(2), tutar: tl(i.tl) });
    tutarlar.push(i.tl);
  }
  const genel = genelGiderSaatBasi === null ? null : makineSaati * genelGiderSaatBasi;
  dokum.push({ tur: 'genel-gider', ad: 'Genel gider', tezgah: null, saat: makineSaati.toFixed(2), tutar: tl(genel) });
  tutarlar.push(genel);
  const toplam = k.yerlesti && adet > 0 ? toplamVeyaNull(tutarlar) : null;
  return { dokum, toplam, birim: toplam === null ? null : toplam / adet };
}

// 59 a: termin, geçerlilik tarihinden itibaren gün olarak da yazılır. Tarihler gündür; saat dilimi karışmaz.
export function gunFarki(bas: string, son: string): number {
  return Math.round((Date.parse(`${son}T00:00:00Z`) - Date.parse(`${bas}T00:00:00Z`)) / 86_400_000);
}

const enGec = (tarihler: readonly string[]): string | null => (tarihler.length === 0 ? null : [...tarihler].sort().at(-1) ?? null);

// TKL-13 (64 a, 62 a, 48 b, 63 b): bütün kartlı kalemler tek denemede yerleşir; teklifin plan termini en geç kalemin terminidir,
// yerleşmeyen kalem varsa plan termini yoktur. Kartsız kalem plansızdır. İstenen termin bir siparişi geciktiriyorsa plancı onayı gerekir.
export function denemeCevabi(
  satirlar: readonly Pick<TeklifSatiri, 'id' | 'sira' | 'malzemeNo' | 'tanim' | 'miktar'>[], sonuc: DenemeSonucu | null,
  g: {
    gecerlilik: string | null; istenenTermin: string | null; yerlesim?: TerminYerlesimi; baslangic?: string | null; genelGiderSaatBasi: number | null;
    genelGiderGizli?: boolean;
  },
): TerminDenemesiCevabi {
  // 2661 a, 2669 b: gizli oranlı ayda oran, genel gider payı ve onu içeren her maliyet null; genel gider hariç maliyet de verilmez.
  const gizli = g.genelGiderGizli === true;
  const motor = new Map((sonuc?.kalemler ?? []).map((k) => [k.satirId, k]));
  const kalemler: TerminDenemesiKalemi[] = satirlar.map((s) => {
    const k = s.malzemeNo === null ? undefined : motor.get(s.id);
    const ortak = { satirId: s.id, sira: s.sira, tanim: s.tanim, malzemeNo: s.malzemeNo, adet: s.miktar, plansiz: s.malzemeNo === null };
    if (k === undefined) {
      return {
        ...ortak, yerlesti: false, bitis: null, planTermini: null, malzemeGelisi: null, satinalma: [], birimMaliyet: null, toplamMaliyet: null, dokum: null,
        eksikVeri: [], fasonNotu: [],
      };
    }
    const m = kalemMaliyeti(k, Number(s.miktar), g.genelGiderSaatBasi);
    // 3347: genel gider yalnız maliyeti eksik bırakır; yerleşmeyen kalemin maliyeti zaten yoktur, not yalnız yerleşende yazılır.
    const eksik = g.genelGiderSaatBasi === null && k.yerlesti ? [...k.eksikVeri, GENEL_GIDER_YOK] : k.eksikVeri;
    return {
      ...ortak, yerlesti: k.yerlesti, bitis: k.bitis, planTermini: k.planTermini, malzemeGelisi: k.malzemeGelisi,
      satinalma: k.satinalma.map((a) => ({ kod: a.kod, miktar: String(a.miktar), birim: a.birim, gelis: a.gelis })),
      birimMaliyet: m.birim === null || gizli ? null : m.birim.toFixed(4), toplamMaliyet: gizli ? null : tl(m.toplam),
      // 2669 b: genel gidersiz satırların toplamı da genel gider hariç maliyet olurdu; gizli ayda dökümün bütün tutarları null.
      dokum: gizli ? m.dokum.map((d) => ({ ...d, tutar: null })) : m.dokum, eksikVeri: eksik, fasonNotu: k.fasonNotu ?? [],
      hammaddeler: k.hammaddeler ?? [],
    };
  });
  const planli = kalemler.filter((k) => !k.plansiz);
  const planTermini = sonuc === null || planli.length === 0 || planli.some((k) => k.planTermini === null)
    ? null : enGec(planli.map((k) => k.planTermini ?? ''));
  const kayanlar = sonuc?.kayanlar ?? [];
  const yerlesim = g.yerlesim ?? terminYerlesimi(g.istenenTermin, null);
  // Arkaya eklemede plan değişmez: istenen termine yetişmeyen teklifte müşteriye planın verdiği tarih gider (Risk 3301 K-ek). Terminden
  // geriye yerleşimde istenen termin kalır; başka sipariş gecikirse plancı onayı ister.
  const yetismez = g.istenenTermin !== null && planTermini !== null && planTermini > g.istenenTermin;
  // 3326: seçilen günde başlatmada müşteriye planın verdiği tarih gider; istenen termin yalnız yetişme ölçüsüdür.
  const termin = yerlesim === 'baslat' || (yerlesim === 'arkaya' && yetismez) ? planTermini : g.istenenTermin ?? planTermini;
  return {
    durum: sonuc === null && planli.length > 0 ? 'cozucu-yok' : 'hazir',
    planSurumu: sonuc?.planSurumu ?? null,
    gecerlilik: g.gecerlilik,
    istenenTermin: g.istenenTermin,
    yerlesim,
    baslangic: yerlesim === 'baslat' ? g.baslangic ?? null : null,
    planTermini,
    termin,
    terminGun: termin !== null && g.gecerlilik !== null ? gunFarki(g.gecerlilik, termin) : null,
    yetisir: g.istenenTermin === null ? null : planTermini !== null && planTermini <= g.istenenTermin,
    // 3301: arkaya eklemede plan dondurulur, kimse kaymaz; onay yalnız terminden geriye yerleşimde doğar.
    onayGerekli: yerlesim === 'geriye' && g.istenenTermin !== null && kayanlar.some((k) => k.gecikir),
    satinalmaGerekli: kalemler.some((k) => k.satinalma.length > 0),
    kalemler,
    maliyetToplami: planli.length === 0 ? null : tl(toplamVeyaNull(planli.map((k) => (k.toplamMaliyet === null ? null : Number(k.toplamMaliyet))))),
    genelGiderSaatBasi: gizli ? null : tl(g.genelGiderSaatBasi),
    genelGiderGizli: gizli,
    kayanlar,
    plan: sonuc?.plan ?? null,
  };
}

// Adet değişirse: çarpan 1 kalemi olduğu gibi bırakır; ötekiler tam adede yuvarlanır, en az 1 (örnek sayfa: yarım, iki ve dört kat).
export function carpilmisAdet(miktar: string, carpan: AdetCarpani): string {
  if (carpan === '1') return miktar;
  return Math.max(1, Math.round(Number(miktar) * Number(carpan))).toFixed(3);
}

// Aynı adetleri veren çarpan tabloyu tekrarlamaz (ör. tek adetlik teklifte yarım kat); teklifin kendi adedi (çarpan 1) hep kalır.
export function adetSatirlari(satirlar: readonly AdetDenemesiSatiri[]): AdetDenemesiSatiri[] {
  const anahtar = (s: AdetDenemesiSatiri): string => s.kalemler.map((k) => Number(k.adet)).join('|');
  const gorulen = new Set(satirlar.filter((s) => s.carpan === '1').map(anahtar));
  return satirlar.filter((s) => {
    if (s.carpan === '1') return true;
    const a = anahtar(s);
    if (gorulen.has(a)) return false;
    gorulen.add(a);
    return true;
  });
}

// TKL-16 (180, 65 a): maliyet toplamı fiyat ya da maliyet görene, döküm ve genel gider oranı yalnız maliyet okuyana gider; görmeyene null.
export function denemeSuzgeci(c: TerminDenemesiCevabi, gorur: { toplam: boolean; dokum: boolean }): TerminDenemesiCevabi {
  return {
    ...c,
    maliyetToplami: gorur.toplam ? c.maliyetToplami : null,
    genelGiderSaatBasi: gorur.dokum ? c.genelGiderSaatBasi : null,
    kalemler: c.kalemler.map((k) => ({
      ...k,
      birimMaliyet: gorur.toplam ? k.birimMaliyet : null,
      toplamMaliyet: gorur.toplam ? k.toplamMaliyet : null,
      dokum: gorur.dokum ? k.dokum : null,
    })),
  };
}

// Satış taslağının planda tuttuğu yer: kalemlerin bütün işlemleri, tezgâh ve zamanıyla.
export function kilitler(sonuc: DenemeSonucu): { satirId: number; opId: string; tezgah: string; baslangic: string; bitis: string }[] {
  return sonuc.kalemler.flatMap((k) => k.islemler.map((i) => ({ satirId: k.satirId, opId: i.opId, tezgah: i.tezgah, baslangic: i.baslangic, bitis: i.bitis })));
}

// Planlama motorunun (Reçete ve Rota teklifDene) girdi ve sonuç biçimi; yalnız siparişlerin kullandığı alanlar. Kalemler sırayla eşleşir.
// Anlar tesis anı (ISO), günler 'GGGG-AA-GG'. Motor çalışması yoksa sonuç null'dır.
export interface MotorYerlesimi { makineId: string; baslangic: string }
export interface MotorGirdisi {
  kalemler: { malzemeNo: number; adet: number }[];
  gecerlilik: string;
  istenenTermin: string | null;
  yerlesim: TerminYerlesimi;
  // 3326: yalnız 'baslat'ta; kalem bu günden önce başlamaz.
  baslangic: string | null;
  taslakId: string | null;
  taslaklar: { id: string; gecerlilik: string; kalemler: { malzemeNo: number; adet: number; termin: string; yerlesim: Record<string, MotorYerlesimi> }[] }[];
}
export interface MotorSonucu {
  kalemler: {
    tamam: boolean;
    bitis: string | null;
    planTermini: string | null;
    malzeme: { kod?: string; birim?: string; gelis: string | null }[];
    satinalma: { kod: string; birim: string; miktar: number; gelis: string }[];
    islemler: { adim: string; makineId: string; fason: boolean; baslangic: string; bitis: string; ayarSaat: number; islemeSaat: number; tl: number | null }[];
    malzemeTl: number | null;
    eksik: string[];
    // 3355 a: firması belirlenmemiş fason adımın notu (plan verir); eski motor vermezse yok.
    fasonNotu?: string[];
  }[];
  kayan: { siparis: string; emirNo: string | null; once: string; sonra: string; termin: string | null }[];
  // Plan denemesi şeridi; Reçete ve Rota vermiyorsa yoktur.
  plan?: MotorPlani | null;
}
export interface MotorPlani {
  baslangic: string;
  bitis: string;
  kapaliGunler: string[];
  hatlar: { makineId: string; ad: string; fason: boolean }[];
  bloklar: {
    makineId: string; tur: PlanBloguTuru; is: string; emirNo: string | null; kalem: number | null; adim: string; baslangic: string; bitis: string; gecikir: boolean;
  }[];
}

// Şerit etiketi: sipariş emir noyla, satış taslağı teklif noyla bilinir (taslak kimliği yalnız siparişlerin iç anahtarıdır).
export function planSeridi(p: MotorPlani | null | undefined, teklifNolari: ReadonlyMap<string, string>): PlanSeridi | null {
  if (p === undefined || p === null) return null;
  return {
    baslangic: p.baslangic, bitis: p.bitis, kapaliGunler: p.kapaliGunler, hatlar: p.hatlar,
    bloklar: p.bloklar.map((b) => ({
      makineId: b.makineId, tur: b.tur, kalem: b.kalem, adim: b.adim, baslangic: b.baslangic, bitis: b.bitis, gecikir: b.gecikir,
      etiket: b.tur === 'siparis' ? (b.emirNo ?? b.is) : b.tur === 'satis-taslagi' ? (teklifNolari.get(b.is) ?? b.is) : TEKLIF_ETIKETI,
    })),
  };
}
export const TEKLIF_ETIKETI = 'Bu teklif';

const enGecAn = (anlar: readonly (string | null)[]): string | null =>
  anlar.reduce<string | null>((a, x) => (x === null || (a !== null && Date.parse(a) >= Date.parse(x)) ? a : x), null);

const hammaddeler = (l: readonly { kod?: string; birim?: string }[]): { kod: string; birim: string | null }[] => {
  const g = new Map<string, string | null>();
  for (const m of l) if (typeof m.kod === 'string' && m.kod !== '' && !g.has(m.kod)) g.set(m.kod, m.birim ?? null);
  return [...g].map(([kod, birim]) => ({ kod, birim }));
};

// Motor sonucunu teklifin satırlarına çevirir: kalem sırası denemeye verilen sırayla aynıdır. Kayan siparişin termini motorda
// tesis anıdır; gün olarak ilk on karakteri alınır, gecikme anla karşılaştırılır.
export function motorSonucu(satirIdleri: readonly number[], r: MotorSonucu, teklifNolari: ReadonlyMap<string, string> = new Map()): DenemeSonucu {
  return {
    planSurumu: null,
    plan: planSeridi(r.plan, teklifNolari),
    kalemler: r.kalemler.flatMap((k, i) => {
      const satirId = satirIdleri[i];
      if (satirId === undefined) return [];
      return [{
        satirId, yerlesti: k.tamam, bitis: k.bitis, planTermini: k.planTermini, malzemeTl: k.malzemeTl,
        malzemeGelisi: enGecAn(k.malzeme.map((m) => m.gelis)),
        satinalma: k.satinalma.map((a) => ({ kod: a.kod, miktar: a.miktar, birim: a.birim, gelis: a.gelis })),
        islemler: k.islemler.map((o) => ({
          opId: o.adim, tezgah: o.makineId, fason: o.fason, baslangic: o.baslangic, bitis: o.bitis, ayarSaat: o.ayarSaat, islemeSaat: o.islemeSaat, tl: o.tl,
        })),
        eksikVeri: k.eksik, fasonNotu: k.fasonNotu ?? [],
        hammaddeler: hammaddeler(k.malzeme),
      }];
    }),
    kayanlar: r.kayan.map((x) => ({
      siparis: x.emirNo ?? x.siparis, once: x.once, sonra: x.sonra, termin: x.termin === null ? null : x.termin.slice(0, 10),
      gecikir: x.termin !== null && Date.parse(x.sonra) > Date.parse(x.termin),
    })),
  };
}

// 49: yer tutan satış taslakları motora kilitli iş olarak gider: kalem başına termin ve adım başına makine ile başlangıç.
// Satış taslağı yalnız termin çıkınca yazılır (TERMIN_CIKMADI); termini yoksa motora verilecek kalem termini de yoktur, gönderilmez.
export function motorTaslaklari(t: readonly {
  taslakId: number; gecerlilik: string; termin: string | null;
  kalemler: readonly { satirId: number; malzemeNo: number | null; adet: string }[];
  kilitler: readonly { satirId: number; opId: string; tezgah: string; baslangic: string }[];
}[]): MotorGirdisi['taslaklar'] {
  return t.flatMap((x) => {
    const termin = x.termin;
    if (termin === null) return [];
    return [{
      id: String(x.taslakId), gecerlilik: x.gecerlilik,
      kalemler: x.kalemler.flatMap((k) => (k.malzemeNo === null ? [] : [{
        malzemeNo: k.malzemeNo, adet: Number(k.adet), termin,
        yerlesim: Object.fromEntries(x.kilitler.filter((y) => y.satirId === k.satirId).map((y) => [y.opId, { makineId: y.tezgah, baslangic: y.baslangic }])),
      }])),
    }];
  });
}

// TKL-17 (49): yer tutan satış taslağı yalnız istenen termin, yerleşim (3301) ya da başlangıç günü (3326) değişince yeniden yerleşir; geçerliliği geçmişse yeri
// kalkmıştır. Yerleşimi yazılmamış eski taslak istenen terminden çıkar (boş: arkaya, dolu: geriye); böylece yeniden dizilmez.
export function yenidenYerlesirMi(
  mevcut: { istenenTermin: string | null; yerlesim: TerminYerlesimi | null; baslangic?: string | null; gecerli: boolean } | null, istenenTermin: string | null,
  yerlesim: TerminYerlesimi, baslangic: string | null = null,
): boolean {
  return mevcut === null || !mevcut.gecerli || mevcut.istenenTermin !== istenenTermin || terminYerlesimi(mevcut.istenenTermin, mevcut.yerlesim) !== yerlesim
    || (mevcut.baslangic ?? null) !== baslangic;
}

// Takvimde siparişin durum adı ve kapanmışlığı (891); iptal takvime gelmez.
export const TAKVIM_SIPARIS_DURUMU: Readonly<Record<Exclude<SiparisDurumu, 'iptal'>, { ad: string; bitti: boolean }>> = {
  taslak: { ad: 'Taslak', bitti: false },
  onayli: { ad: 'Onaylı', bitti: false },
  kapandi: { ad: 'Kapandı', bitti: true },
};

// ---- Teklif formu (3245 d) ----
export const SABLON_YOK = 'Teklif formu şablonu bulunamadı.';
export const SABLON_ADI_KULLANILIYOR = 'Bu adla başka bir şablon var; başka ad verin.';
export const KURUM_SATIRI_YOK = 'Teklif formu firma bilgisi kurulumda açılmamış; güncellemeyi tamamlayın.';
const BOS_KURUM: TeklifFormuKurumu = { unvan: '', adres: '', telefon: '', eposta: '', vergi: '' };

// Saklanan içerik sözleşmeye uymuyorsa (elle bozulmuş satır) form boş alanlarla çizilir; düzenleyip kaydetmek onarır.
export function kurumIcerigi(ham: unknown): TeklifFormuKurumu {
  const s = teklifFormuKurumSemasi.safeParse(ham);
  return s.success ? s.data : BOS_KURUM;
}
const BOS_ICERIK: TeklifFormuIcerigi = { baslik: 'TEKLİF FORMU', giris: '', sartlar: [], imza1: '', imza2: '', alt: '' };
// Kabul edilen, reddedilen ya da siparişe dönen teklifin basılı metni müşterinin gördüğüdür; sonradan değişmez (değişiklik yeni teklifle).
export const FORM_METNI_KAPALI = 'Kabul edilmiş, reddedilmiş ya da siparişe dönmüş teklifin form metni değişmez.';
export function formMetniReddi(durum: TeklifDurumu): string | null {
  return durum === 'kabul' || durum === 'red' || durum === 'siparis' ? FORM_METNI_KAPALI : null;
}
// Saklanan teklif form metni şemaya uymazsa yok sayılır, şablon basılır.
export function formMetni(ham: unknown): TeklifFormuMetni | null {
  const s = teklifFormuMetniSemasi.safeParse(ham);
  return s.success ? s.data : null;
}
export function sablonIcerigi(ham: unknown): TeklifFormuIcerigi {
  const s = teklifFormuIcerikSemasi.safeParse(ham);
  return s.success ? s.data : BOS_ICERIK;
}
// Kopyanın içeriği kaynağınkidir; kopya varsayılan olmaz.
export function sablonKopyasi(kaynak: { dil: TeklifFormuDili; icerik: unknown }, ad: string): { ad: string; dil: TeklifFormuDili; icerik: TeklifFormuIcerigi } {
  return { ad, dil: kaynak.dil, icerik: sablonIcerigi(kaynak.icerik) };
}

// Firma kartının adresi forma tek metin olarak basılır: sokak, sonra posta kodu ve ilçe / il. Boş parça atlanır; hiçbiri yoksa null.
export function firmaAdresi(f: { adres: string | null; postaKodu: string | null; ilce: string | null; il: string | null }): string | null {
  const dolu = (x: string | null): x is string => x !== null && x.trim() !== '';
  const yer = [f.ilce, f.il].filter(dolu).join(' / ');
  const satir2 = [f.postaKodu, yer].filter(dolu).join(' ');
  const metin = [f.adres, satir2].filter(dolu).join('\n');
  return metin === '' ? null : metin;
}

// İskonto tutarı ve genel toplam sunucudaki iki ondalıklı tutarlardan kuruş üzerinden çıkar; kayan nokta kullanılmaz.
const kurus = (t: string): bigint => {
  const [tam = '0', ondalik = ''] = t.split('.');
  return BigInt(tam) * 100n + BigInt((ondalik + '00').slice(0, 2));
};
const metin = (k: bigint): string => {
  const isaret = k < 0n ? '-' : '';
  const m = k < 0n ? -k : k;
  return `${isaret}${String(m / 100n)}.${String(m % 100n).padStart(2, '0')}`;
};
export function formToplamlari(araToplam: string, kdvHaric: string, kdvTutari: string, kdvOrani: string) {
  return {
    araToplam, kdvHaric, kdvTutari, kdvOrani,
    iskontoTutari: metin(kurus(araToplam) - kurus(kdvHaric)),
    genelToplam: metin(kurus(kdvHaric) + kurus(kdvTutari)),
  };
}
