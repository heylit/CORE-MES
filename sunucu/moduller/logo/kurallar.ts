import { createHash } from 'node:crypto';
import type { FisGonderimSekli, LogoFisBilgisi, LogoFisDurumu, MalzemeFisiTuru } from '#paylasilan/sozlesme/stok.ts';

// Logo bağlantısı kuralları (kart #207). Saf: saat ve ağ dışarıdan gelir.
// Köprü sözleşmesinin bilinen kısmı yalnız burada ve kopru.ts'tedir; kılavuzun kendisi depoya girmez.

// Köprü tek oturumla çalışır, her yazma saniyeler sürer: istek en çok bu kadar beklenir (kullanıcı kararı 08.10.2026).
export const ISTEK_SURESI_MS = 60_000;
// Sonucu bilinmeyen kart açma isteğinden (zaman aşımı, kopan bağlantı, çöken süreç) sonra bu süre geçmeden aynı kart için
// yeni açma isteği gitmez: köprünün kuyruğunda kalan istek bu sürede biter, sonra "var mı" okuması onu görür.
export const BELIRSIZ_BEKLEME_MS = 5 * 60_000;
export const IS_ARALIGI_MS = 5_000;
// Turda okunan kuyruk; gönderilen yalnız ilk uygun karttır.
export const KUYRUK_SINIRI = 200;
// Logo özel kodu: TMI'den açılan kart Logo'da ayırt edilsin (kullanıcı kararı 08.10.2026).
export const OZEL_KOD = 'TMI';
export const STOK_KODU_EN_COK = 24;
// Logo kart türleri (cardType): hammadde 10, yarı mamul 11, mamul 12, sarf 13, demirbaş 4, ticari mal 1 (kart #1218; 1 DOĞRULANMADI, kılavuz depoda yok).
export const LOGO_KART_TURLERI: readonly number[] = [10, 11, 12, 13, 4, 1];
export const HATA_EN_COK = 2000;
// Köprünün birim seti listesi bu kadar eskiyince yeniden okunur; okuma başarısızsa bu aralıkla denenir.
export const LISTE_TAZELEME_MS = 60 * 60_000;
export const LISTE_DENEME_ARALIGI_MS = 5 * 60_000;
const GERI_CEKILME_ILK_MS = 30_000;
const GERI_CEKILME_EN_COK_MS = 30 * 60_000;

// Köprü cevabının yorumu. Ayrım çift gönderim kalkanı içindir:
// - basarili: köprü işledi (logicalRef > 0 ise kayıt var);
// - reddedildi / yetkisiz / ulasilamadi: kayıt kesin açılmadı;
// - belirsiz: istek köprüye ulaşmış olabilir, sonucu bilinmez (zaman aşımı, kopan bağlantı, 5xx, okunamayan cevap).
export type KopruSonucu =
  // logoAdi: yalnız malzeme "var mı" okumasında, kart varsa Logo'daki adı (2089).
  | { tur: 'basarili'; logicalRef: number | null; logoAdi?: string | null }
  | { tur: 'reddedildi'; ileti: string }
  | { tur: 'yetkisiz'; ileti: string }
  | { tur: 'ulasilamadi'; ileti: string }
  | { tur: 'belirsiz'; ileti: string };

export interface KopruZarfi {
  success?: unknown;
  logicalRef?: unknown;
  error?: unknown;
  validate?: unknown;
}

const metinMi = (d: unknown): d is string => typeof d === 'string' && d.trim() !== '';

// validate'in biçimi bilinmiyor (VARSAYIM: metin, metin dizisi ya da alan -> metin(ler) nesnesi): okunabilir tek satıra çevrilir.
export function dogrulamaMetni(validate: unknown): string | null {
  const parcalar: string[] = [];
  const topla = (d: unknown, onek: string): void => {
    if (metinMi(d)) parcalar.push(onek ? `${onek}: ${d.trim()}` : d.trim());
    else if (Array.isArray(d)) for (const o of d) topla(o, onek);
    else if (d !== null && typeof d === 'object') for (const [a, o] of Object.entries(d)) topla(o, a);
  };
  topla(validate, '');
  return parcalar.length > 0 ? parcalar.join('; ') : null;
}

export function kirp(metin: string): string {
  const temiz = metin.replace(/\s+/g, ' ').trim();
  return temiz.length > HATA_EN_COK ? temiz.slice(0, HATA_EN_COK) : temiz;
}

// Yardımcının "var mı" cevabında kart varsa `name` (Logo'daki ad) da gelir; yoksa ya da boşsa null.
export function varMiAdi(govde: unknown): string | null {
  if (govde === null || typeof govde !== 'object' || Array.isArray(govde)) return null;
  const ad = (govde as Record<string, unknown>)['name'];
  return typeof ad === 'string' && ad.trim() !== '' ? ad.trim() : null;
}

// Yardımcının malzeme kodu listesi metin dizisidir; dizi değilse okunamadı (null), boş ve fazla uzun kod atlanır, tekrarlar teke iner.
export const MALZEME_KODU_EN_COK = 64;
export function malzemeKodlariniAyikla(govde: unknown): string[] | null {
  if (!Array.isArray(govde)) return null;
  const kodlar = new Set<string>();
  for (const d of govde) {
    if (typeof d !== 'string') continue;
    const kod = d.trim();
    if (kod !== '' && kod.length <= MALZEME_KODU_EN_COK) kodlar.add(kod);
  }
  return [...kodlar];
}

// 2089-1 a, 2089-2 a: kod Logo'da TMI'nin açmadığı başka bir kartta; kart eşlenmez, Logo'ya dokunulmaz.
export function kodCakismasiMetni(logoAdi: string | null | undefined): string {
  const ad = logoAdi?.trim() ? ` (Logo adı: ${logoAdi.trim()})` : '';
  return kirp(`Logo'da bu kod başka kartta${ad}; kart eşlenmedi, gönderilmedi. Logo'daki kartın kodunu değiştirin ya da TMI kartını iptal edip yeni kodla açın.`);
}

function logoKayitNo(d: unknown): number | null {
  return typeof d === 'number' && Number.isSafeInteger(d) && d > 0 ? d : null;
}

// HTTP durumu ve gövdeden sonuç. govde null: gövde JSON değildi.
export function cevabiYorumla(durum: number, govde: KopruZarfi | null): KopruSonucu {
  if (durum === 401 || durum === 403) return { tur: 'yetkisiz', ileti: `Köprü anahtarı reddedildi (${durum}).` };
  if (durum >= 500 || durum === 408 || durum === 429) return { tur: 'belirsiz', ileti: `Köprü hata verdi (${durum}); işlenip işlenmediği bilinmiyor.` };
  if (govde === null) {
    return durum >= 200 && durum < 300
      ? { tur: 'belirsiz', ileti: `Köprü cevabı okunamadı (${durum}); işlenip işlenmediği bilinmiyor.` }
      : { tur: 'reddedildi', ileti: `Köprü isteği reddetti (${durum}).` };
  }
  if (govde.success === true && durum >= 200 && durum < 300) return { tur: 'basarili', logicalRef: logoKayitNo(govde.logicalRef) };
  const ayrinti = [metinMi(govde.error) ? govde.error.trim() : null, dogrulamaMetni(govde.validate)].filter((p) => p !== null).join(' | ');
  if (govde.success === false || (durum >= 400 && durum < 500)) {
    return { tur: 'reddedildi', ileti: kirp(`Logo reddetti${ayrinti ? `: ${ayrinti}` : ` (${durum}).`}`) };
  }
  return { tur: 'belirsiz', ileti: `Köprü cevabı beklenen biçimde değil (${durum}); işlenip işlenmediği bilinmiyor.` };
}

// Ağ hatası: bağlantı hiç kurulamadıysa istek gitmemiştir; kurulduktan sonra kopan ya da süresi dolan istek belirsizdir.
// İleti adres taşımaz (sabit metin): kartta ve ekranda görünür.
const GITMEYEN_KODLAR = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'EADDRNOTAVAIL', 'ERR_INVALID_URL']);
export function agHatasiniYorumla(hata: { zamanAsimi: boolean; kod: string | null }): KopruSonucu {
  if (hata.zamanAsimi) {
    return { tur: 'belirsiz', ileti: `Köprü ${ISTEK_SURESI_MS / 1000} saniyede cevap vermedi; işlenip işlenmediği bilinmiyor.` };
  }
  if (hata.kod !== null && GITMEYEN_KODLAR.has(hata.kod)) return { tur: 'ulasilamadi', ileti: `Köprüye ulaşılamadı (${hata.kod}).` };
  return { tur: 'belirsiz', ileti: `Köprü bağlantısı koptu${hata.kod ? ` (${hata.kod})` : ''}; işlenip işlenmediği bilinmiyor.` };
}

export interface GonderilecekKart {
  tur: string;
  stokKodu: string;
  ad: string | null;
  logoKartTuru: string | null;
  logoBirimSeti: string | null;
  // Kartın Açıklama 1-3'ü (334 a); Açıklama 1 doluysa Logo adıdır (logoKartAdi), 2-3 boşsa gövdede yoktur.
  aciklama1?: string | null;
  aciklama2?: string | null;
  aciklama3?: string | null;
}

// Logo malzeme kartında NAME2 yok (kullanıcı ölçümü, karar 2088-1): Açıklama 1 kartın Logo adıdır (NAME, `name`), Açıklama 2 NAME3, Açıklama 3 NAME4.
// Açıklama 1 boşsa Logo adı TMI adıdır. Yardımcı name2'yi yine reddeder.
export const KART_ACIKLAMA_ALANLARI = Object.freeze({ aciklama2: 'name3', aciklama3: 'name4' } as const);
export const logoKartAdi = (k: { ad: string | null; aciklama1?: string | null | undefined }): string => {
  const aciklama1 = k.aciklama1?.trim() ?? '';
  return aciklama1 !== '' ? aciklama1 : (k.ad?.trim() ?? '');
};

export interface MalzemeEklemeGovdesi {
  code: string;
  name: string;
  cardType: number;
  unitSetCode: string;
  auxilCode: string;
  name3?: string;
  name4?: string;
  // Alış ve satış KDV oranı; ayar boşken gövdede yoktur (LB3).
  vat?: number;
  sellVat?: number;
}

export interface GovdeSecenegi {
  // Tek oran ikisine gider (LB10 a); alış ve satış ayrı gerekirse ayrı karar (UYUM-BORCU).
  kdv: number | null;
  // Bu turda geçerli birim seti kodları (gecerliBirimSetleri).
  gecerliBirimler: ReadonlySet<string>;
}

// Kart açma gövdesi; kuralı tutmayan kart gönderilmez ve nedeni döner. Karşılık izinli listede değilse neden "Geçersiz karşılık" ile başlar.
export function eklemeGovdesi(k: GonderilecekKart, o: GovdeSecenegi): { govde: MalzemeEklemeGovdesi } | { hata: string } {
  // Hizmet Logo'da ayrı karttır; malzeme ucuyla gitmez (kullanıcı kararı 09.10.2026, madde 7).
  if (k.tur === 'hizmet') return { hata: 'Hizmet kartı malzeme olarak gönderilmez.' };
  const kod = k.stokKodu.trim();
  if (kod === '' || kod.length > STOK_KODU_EN_COK) return { hata: `Stok kodu 1-${STOK_KODU_EN_COK} karakter olmalı.` };
  const ad = logoKartAdi(k);
  if (ad === '') return { hata: 'Kartın adı yok.' };
  const tur = Number(k.logoKartTuru);
  if (!/^\d+$/.test(k.logoKartTuru ?? '') || !LOGO_KART_TURLERI.includes(tur)) {
    return { hata: `Geçersiz karşılık: tür karşılığı Logo kart türlerinden biri olmalı (${LOGO_KART_TURLERI.join(', ')}).` };
  }
  const birim = k.logoBirimSeti?.trim() ?? '';
  if (birim === '') return { hata: 'Birim karşılığı yok.' };
  if (!o.gecerliBirimler.has(birim)) return { hata: kirp(`Geçersiz karşılık: birim seti ${birim} Logo birim seti listesinde yok.`) };
  const govde: MalzemeEklemeGovdesi = { code: kod, name: ad, cardType: tur, unitSetCode: birim, auxilCode: OZEL_KOD };
  for (const alan of ['aciklama2', 'aciklama3'] as const) {
    const metin = k[alan]?.trim() ?? '';
    if (metin !== '') govde[KART_ACIKLAMA_ALANLARI[alan]] = metin;
  }
  if (o.kdv !== null) {
    govde.vat = o.kdv;
    govde.sellVat = o.kdv;
  }
  return { govde };
}

export type HizmetYonu = 'alinan' | 'verilen';

// Hizmet gönderimi Sistem Ayarları'nda yön başına ayrı anahtardır, varsayılan kapalı (kullanıcı kararı 12.10.2026, kart #777; LH1 a'nın yerine).
export const HIZMET_AYARI = Object.freeze({ alinan: 'logo.hizmet-alinan-gonderimi', verilen: 'logo.hizmet-verilen-gonderimi' } as const);

// Logo hizmet kartı türü (CARD_TYPE): alınan 1, verilen 2 (kullanıcı bilgisi, 09.10.2026).
export const HIZMET_KART_TURU: Readonly<Record<HizmetYonu, number>> = Object.freeze({ alinan: 1, verilen: 2 });

// DOĞRULANMADI: kılavuz hizmet kartının JSON alan adlarını vermiyor, yalnız XML etiketlerini veriyor. Geçici olarak etiketlerin kendisi
// kullanılır; malzemedeki adların (code, name, cardType) aynısı varsayılmaz. Doğrulanınca yalnız bu harita değişir.
export const HIZMET_ALANLARI = Object.freeze({
  kod: 'CODE',
  ad: 'DESCRIPTION',
  kartTuru: 'CARD_TYPE',
  birimSeti: 'UNITSET_CODE',
  kdv: 'VAT_PERC',
  ozelKod: 'AUXIL_CODE',
});

export interface GonderilecekHizmet {
  tur: string;
  stokKodu: string;
  ad: string | null;
  hizmetYonu: HizmetYonu | null;
  logoBirimSeti: string | null;
}

// Hizmet kartı açma gövdesi. Kod sınırı malzemedekiyle aynı (24; hizmet için doğrulanmadı). KDV tek alandır (VAT_PERC); boşsa yok.
export function hizmetGovdesi(k: GonderilecekHizmet, o: GovdeSecenegi): { govde: Record<string, string | number> } | { hata: string } {
  if (k.tur !== 'hizmet') return { hata: 'Yalnız hizmet kartı hizmet olarak gönderilir.' };
  if (k.hizmetYonu !== 'alinan' && k.hizmetYonu !== 'verilen') return { hata: 'Hizmet kartının yönü (alınan / verilen) yok.' };
  const kod = k.stokKodu.trim();
  if (kod === '' || kod.length > STOK_KODU_EN_COK) return { hata: `Stok kodu 1-${STOK_KODU_EN_COK} karakter olmalı.` };
  const ad = k.ad?.trim() ?? '';
  if (ad === '') return { hata: 'Kartın adı yok.' };
  const birim = k.logoBirimSeti?.trim() ?? '';
  if (birim === '') return { hata: 'Birim karşılığı yok.' };
  if (!o.gecerliBirimler.has(birim)) return { hata: kirp(`Geçersiz karşılık: birim seti ${birim} Logo birim seti listesinde yok.`) };
  const a = HIZMET_ALANLARI;
  const govde: Record<string, string | number> = {
    [a.kod]: kod, [a.ad]: ad, [a.kartTuru]: HIZMET_KART_TURU[k.hizmetYonu], [a.birimSeti]: birim, [a.ozelKod]: OZEL_KOD,
  };
  if (o.kdv !== null) govde[a.kdv] = o.kdv;
  return { govde };
}

// LB6 c: köprüden liste okunduysa yalnız o liste geçerlidir (elle girilip listede olmayan "geçersiz" görünür);
// hiç okunmadıysa yöneticinin elle girdiği kodlar geçerlidir.
export function gecerliBirimSetleri(setler: readonly { kod: string; elle: boolean; kopruListesinde: boolean }[], listeOkundu: boolean): Set<string> {
  return new Set(setler.filter((s) => (listeOkundu ? s.kopruListesinde : s.elle)).map((s) => s.kod));
}

export function listeOkunmaliMi(sonOkuma: Date | null, sonDeneme: Date | null, simdi: Date): boolean {
  if (sonDeneme && simdi.getTime() - sonDeneme.getTime() < LISTE_DENEME_ARALIGI_MS) return false;
  return sonOkuma === null || simdi.getTime() - sonOkuma.getTime() >= LISTE_TAZELEME_MS;
}

// Art arda hatada bekleme uzar (30 sn, 1 dk, 2 dk ... en çok 30 dk): köprü ya da Logo düzelene kadar kuyruk dönmeye devam eder,
// hatalı kart sıranın önünü tıkamaz.
export function geriCekilmeMs(ardisikHata: number): number {
  const us = Math.max(0, Math.min(ardisikHata - 1, 16));
  return Math.min(GERI_CEKILME_ILK_MS * 2 ** us, GERI_CEKILME_EN_COK_MS);
}

export interface GidenDurumu {
  // Dolu iken bu kart için Logo'da kart açılmış olabilir (niyet yazılı ve kalıcı; açma isteği ondan sonra gider).
  niyetZamani: Date | null;
  sonrakiDeneme: Date | null;
}

export type KartEylemi = 'niyet-yaz' | 'gonder' | 'bekle';

// Çift gönderim kalkanı:
// 1. Açma isteğinden önce niyet ayrı bir turda kalıcı yazılır. Niyet yalnız onu yazan süreçte ve bir kez "taze" sayılır.
// 2. Taze olmayan niyet (başka süreç, yeniden başlayan süreç, sonucu bilinmeyen deneme) BELIRSIZ_BEKLEME_MS dolmadan gönderilmez.
// 3. Her gönderim "var mı" okumasıyla başlar; varsa yeni kart açılmaz.
export function kartEylemi(g: GidenDurumu | null, simdi: Date, tazeNiyet: boolean, sonAcmaIstegi: Date | null): KartEylemi {
  if (g?.sonrakiDeneme && g.sonrakiDeneme.getTime() > simdi.getTime()) return 'bekle';
  if (sonAcmaIstegi && simdi.getTime() - sonAcmaIstegi.getTime() < BELIRSIZ_BEKLEME_MS) return 'bekle';
  if (!g?.niyetZamani) return 'niyet-yaz';
  if (tazeNiyet) return 'gonder';
  return simdi.getTime() - g.niyetZamani.getTime() >= BELIRSIZ_BEKLEME_MS ? 'gonder' : 'bekle';
}

/* ---------------- Satın alma siparişi (#205 karar 1; kullanıcının köprü notu, 2.3) ---------------- */

// Logo fiş numarası en çok 16 karakter (not 2.3); TMI numarası (SP-YYYY-NNN) sığar.
export const FIS_NO_EN_COK = 16;
// ORDER_STATUS: 1 öneri, 4 sevk edilebilir. TMI'de onaylanıp verilmiş sipariş Logo'da sevk edilebilir açılır (VARSAYIM).
export const SIPARIS_LOGO_DURUMU = 4;
// Satır türü (TYPE): 0 malzeme, 4 hizmet (not 2.3).
const SATIR_TURU = { malzeme: 0, hizmet: 4 } as const;
// Logo döviz türü (CURTYPE): 1 USD, 20 EUR (not 2.3). TL için döviz alanı gönderilmez. Listede olmayan para birimi gönderilmez.
export const LOGO_DOVIZ_TURLERI: Readonly<Record<string, number>> = Object.freeze({ USD: 1, EUR: 20 });
const TL_KODLARI = new Set(['TRY', 'TL']);

// DOĞRULANMADI: not sipariş için yalnız XML etiketlerini veriyor (NUMBER, DATE, ARP_CODE, ORDER_STATUS; satırda TYPE, MASTER_CODE,
// QUANTITY, PRICE, EDT_PRICE/EDT_CURR, VAT_RATE, UNIT_CODE, DUE_DATE, TRANS_DESCRIPTION). JSON adları satış teklifi ucundaki adlardan
// (not 2.6: number, date, arpCode, currencyCode, rate, lines[].type, masterCode, quantity, price, vatRate, unitCode, dueDate, description)
// VARSAYILDI. Gerçek köprüyle doğrulanınca yalnız bu harita değişir; gönderim o zamana kadar ayarla kapalı kalır (logo.satin-alma-gonderimi).
export const SIPARIS_ALANLARI = Object.freeze({
  no: 'number', tarih: 'date', cari: 'arpCode', durum: 'orderStatus', doviz: 'currencyCode', kur: 'rate', satirlar: 'lines',
  tur: 'type', kod: 'masterCode', miktar: 'quantity', fiyat: 'price', kdv: 'vatRate', birim: 'unitCode', termin: 'dueDate', aciklama: 'description',
});

export interface GonderilecekSiparisSatiri {
  satirId: number;
  stokKodu: string | null;
  hizmet: boolean;
  miktar: string;
  birim: string;
  birimFiyat: string;
}

export interface GonderilecekSiparis {
  id: number;
  no: string;
  tarih: string;
  paraBirimi: string;
  kur: string | null;
  iskontoYuzdesi: string;
  termin: string | null;
  satirlar: readonly GonderilecekSiparisSatiri[];
}

export interface SiparisGovdeSecenegi {
  // Firmanın Logo cari kodu (finans); boşsa sipariş gönderilmez.
  cariKodu: string | null;
  // Malzeme ve hizmet satırının KDV oranı (logo.kdv-orani, logo.hizmet-kdv-orani); boşsa gönderilmez.
  kdv: number | null;
  hizmetKdv: number | null;
}

// Logo tarihi dd.MM.yyyy (not 1); ISO tarih (YYYY-MM-DD) dışı değer null.
export function logoTarihi(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

const ONDALIK = /^\d+(\.\d+)?$/;
const OLCEK = 4;
const OLCEK_CARPANI = 10n ** BigInt(OLCEK);

function olcekli(d: string): bigint {
  const [tam = '0', kesir = ''] = d.split('.');
  // Dört basamaktan fazlası yarım yukarı yuvarlanır.
  const k = kesir.padEnd(OLCEK + 1, '0');
  const taban = BigInt(tam) * OLCEK_CARPANI + BigInt(k.slice(0, OLCEK));
  return Number(k[OLCEK]) >= 5 ? taban + 1n : taban;
}

function metne(o: bigint): string {
  const tam = o / OLCEK_CARPANI;
  const kesir = (o % OLCEK_CARPANI).toString().padStart(OLCEK, '0').replace(/0+$/, '');
  return kesir === '' ? tam.toString() : `${tam}.${kesir}`;
}

// Satır iskontosu Logo'da ayrı etiket değil (DISCPER code 14, not 2.3): birim fiyata yedirilir. Kayan nokta yok; dört ondalık, yarım yukarı.
export function iskontoluFiyat(fiyat: string, iskontoYuzdesi: string): string | null {
  if (!ONDALIK.test(fiyat) || !ONDALIK.test(iskontoYuzdesi)) return null;
  const isk = olcekli(iskontoYuzdesi);
  if (isk > 100n * OLCEK_CARPANI) return null;
  const pay = olcekli(fiyat) * (100n * OLCEK_CARPANI - isk);
  const bolen = 100n * OLCEK_CARPANI;
  return metne((pay * 2n + bolen) / (bolen * 2n));
}

// "(isk. %10)" (not 2.3): iskonto açıklamaya yazılır; sıfırsa yazılmaz.
export function iskontoAciklamasi(iskontoYuzdesi: string): string | null {
  if (!ONDALIK.test(iskontoYuzdesi)) return null;
  const o = olcekli(iskontoYuzdesi);
  return o === 0n ? null : `(isk. %${metne(o)})`;
}

// Logo birim kodu (UNIT_CODE) TMI biriminin büyük harfi varsayıldı (adet -> ADET, kg -> KG; VARSAYIM, gerçek köprüyle doğrulanır).
export const logoBirimKodu = (birim: string): string => birim.trim().toLocaleUpperCase('tr-TR');

// Sipariş açma gövdesi; kuralı tutmayan sipariş gönderilmez ve nedeni döner (LGS-1..LGS-5).
export function siparisGovdesi(s: GonderilecekSiparis, o: SiparisGovdeSecenegi): { govde: Record<string, unknown> } | { hata: string } {
  const a = SIPARIS_ALANLARI;
  const no = s.no.trim();
  if (no === '' || no.length > FIS_NO_EN_COK) return { hata: `Sipariş numarası 1-${FIS_NO_EN_COK} karakter olmalı.` };
  const tarih = logoTarihi(s.tarih);
  if (tarih === null) return { hata: 'Sipariş tarihi yok.' };
  const cari = o.cariKodu?.trim() ?? '';
  if (cari === '') return { hata: 'Firmanın Logo cari kodu yok.' };
  if (s.satirlar.length === 0) return { hata: 'Siparişin satırı yok.' };
  const pb = s.paraBirimi.trim().toUpperCase();
  const doviz = TL_KODLARI.has(pb) ? null : LOGO_DOVIZ_TURLERI[pb];
  if (doviz === undefined) return { hata: `Para birimi ${pb} için Logo döviz türü tanımlı değil.` };
  const termin = s.termin === null ? null : logoTarihi(s.termin);
  const aciklama = iskontoAciklamasi(s.iskontoYuzdesi);
  const satirlar: Record<string, unknown>[] = [];
  for (const [i, x] of s.satirlar.entries()) {
    const sira = i + 1;
    const kod = x.stokKodu?.trim() ?? '';
    if (kod === '') return { hata: `Satır ${sira}: kalem malzeme kartına bağlı değil.` };
    if (kod.length > STOK_KODU_EN_COK) return { hata: `Satır ${sira}: stok kodu ${STOK_KODU_EN_COK} karakteri aşıyor.` };
    if (!ONDALIK.test(x.miktar) || olcekli(x.miktar) === 0n) return { hata: `Satır ${sira}: miktar sıfırdan büyük olmalı.` };
    const fiyat = iskontoluFiyat(x.birimFiyat, s.iskontoYuzdesi);
    if (fiyat === null) return { hata: `Satır ${sira}: birim fiyat ya da iskonto geçersiz.` };
    if (x.birim.trim() === '') return { hata: `Satır ${sira}: birim yok.` };
    const satir: Record<string, unknown> = {
      [a.tur]: x.hizmet ? SATIR_TURU.hizmet : SATIR_TURU.malzeme, [a.kod]: kod, [a.miktar]: Number(x.miktar), [a.fiyat]: Number(fiyat),
      [a.birim]: logoBirimKodu(x.birim),
    };
    const kdv = x.hizmet ? o.hizmetKdv : o.kdv;
    if (kdv !== null) satir[a.kdv] = kdv;
    if (termin !== null) satir[a.termin] = termin;
    if (aciklama !== null) satir[a.aciklama] = aciklama;
    satirlar.push(satir);
  }
  const govde: Record<string, unknown> = { [a.no]: no, [a.tarih]: tarih, [a.cari]: cari, [a.durum]: SIPARIS_LOGO_DURUMU };
  if (doviz !== null) {
    govde[a.doviz] = doviz;
    if (s.kur !== null && ONDALIK.test(s.kur) && olcekli(s.kur) > 0n) govde[a.kur] = Number(s.kur);
  }
  govde[a.satirlar] = satirlar;
  return { govde };
}

// Logo'daki sipariş satırlarının kayıt numaraları TMI satırlarına sırayla eşlenir (not 3b: AddRich cevabı order.lines[].logicalRef,
// lineNo). Sayı tutmazsa eşleme yapılmaz: yanlış satıra bağ yazmaktansa hata görünür.
export function satirEslemesi(tmi: readonly { satirId: number }[], logo: readonly number[]): { satirId: number; logoSatirRef: string }[] | null {
  if (logo.length !== tmi.length) return null;
  return tmi.map((t, i) => ({ satirId: t.satirId, logoSatirRef: String(logo[i]) }));
}

/* ---------------- Sipariş düzenleme ve kapatma (S2 b), talep fişi ve karşılama (S3 b), malzeme güncelleme (S4 b) ---------------- */

// Düzenleme gövdesi AddRich gövdesiyle aynı + başlıkta ve satırda logicalRef (not 2.3: "gövde AddRich ile aynı + logicalRef; satırda
// logicalRef = ORFLINE.LOGICALREF"). Kaydı olmayan satır yeni satırdır (köprü ekler); gövdede olmayan Logo satırını köprü kapatır.
// Durum (orderStatus) gönderilmez: CORE'da siparişin Logo durumu karşılığı yok; Logo'da elle değiştirilen durum düzenlemeyle ezilmesin (kart 2961).
export const KAYIT_ALANI = 'logicalRef';

export interface GuncellenecekSiparisSatiri extends GonderilecekSiparisSatiri {
  logoSatirRef: string | null;
}

export function siparisGuncellemeGovdesi(
  s: Omit<GonderilecekSiparis, 'satirlar'> & { logoKayitNo: string; satirlar: readonly GuncellenecekSiparisSatiri[] }, o: SiparisGovdeSecenegi,
): { govde: Record<string, unknown> } | { hata: string } {
  const kayit = Number(s.logoKayitNo);
  if (!Number.isSafeInteger(kayit) || kayit <= 0) return { hata: 'Siparişin Logo kayıt numarası geçersiz.' };
  const r = siparisGovdesi(s, o);
  if ('hata' in r) return r;
  const satirlar = r.govde[SIPARIS_ALANLARI.satirlar] as Record<string, unknown>[];
  for (const [i, x] of s.satirlar.entries()) {
    if (x.logoSatirRef === null) continue;
    const ref = Number(x.logoSatirRef);
    if (!Number.isSafeInteger(ref) || ref <= 0) return { hata: `Satır ${i + 1}: Logo satır kayıt numarası geçersiz.` };
    satirlar[i]![KAYIT_ALANI] = ref;
  }
  const { [SIPARIS_ALANLARI.durum]: _durum, ...durumsuz } = r.govde;
  return { govde: { [KAYIT_ALANI]: kayit, ...durumsuz } };
}

// Düzenlemeden sonra Logo satırlarının TMI satırlarına eşlenmesi: kaydı bilinen satır kendi numarasını korur; Logo'daki yeni numaralar
// (bilinenlerde ve kaldırılanlarda olmayan) kaydı olmayan TMI satırlarına sırayla verilir. Sayı tutmazsa eşleme yok.
export function guncellemeEslemesi(
  tmi: readonly { satirId: number; logoSatirRef: string | null }[], logo: readonly number[], kaldirilan: readonly string[],
): { satirId: number; logoSatirRef: string }[] | null {
  const bilinen = new Set(tmi.flatMap((t) => (t.logoSatirRef === null ? [] : [t.logoSatirRef])));
  const disari = new Set([...bilinen, ...kaldirilan]);
  const yeniler = logo.map(String).filter((r) => !disari.has(r));
  const kaydisiz = tmi.filter((t) => t.logoSatirRef === null);
  if (yeniler.length !== kaydisiz.length) return null;
  if ([...bilinen].some((r) => !logo.map(String).includes(r))) return null;
  let i = 0;
  return tmi.map((t) => ({ satirId: t.satirId, logoSatirRef: t.logoSatirRef ?? yeniler[i++]! }));
}

// Kapatma gövdesi (not 2.3: POST {number}/close {lineRefs:[...]}); satır alanı ORDER_CLOSED'ı köprü yazar.
export function kapatmaGovdesi(satirRefleri: readonly string[]): { govde: { lineRefs: number[] } } | { hata: string } {
  const refler = satirRefleri.map(Number);
  if (refler.length === 0 || refler.some((r) => !Number.isSafeInteger(r) || r <= 0)) return { hata: 'Kapatılacak Logo satırı yok ya da kayıt numarası geçersiz.' };
  return { govde: { lineRefs: refler } };
}

// Talep fişi (not 2.4, 3b). DOĞRULANMADI: JSON adları notta yalnız logoStatus için var; gerisi XML etiketlerinden (NUMBER, DATE, DO_CODE;
// satırda ITEM_CODE, AMOUNT, UNIT_CODE, PROCURE_DATE) camelCase VARSAYILDI. logoStatus 1: onaylı açılır, karşılama ancak onaylı fişe yazılır (not 3b).
export const TALEP_ALANLARI = Object.freeze({
  no: 'number', tarih: 'date', durum: 'logoStatus', satirlar: 'lines', kod: 'itemCode', miktar: 'amount', birim: 'unitCode', ihtiyac: 'procureDate',
});
export const TALEP_LOGO_DURUMU = 1;

export interface GonderilecekTalep {
  id: number;
  no: string;
  tarih: string;
  ihtiyacTarihi: string | null;
  satirlar: readonly { satirId: number; stokKodu: string | null; miktar: string; birim: string }[];
}

export function talepGovdesi(t: GonderilecekTalep): { govde: Record<string, unknown> } | { hata: string } {
  const a = TALEP_ALANLARI;
  const no = t.no.trim();
  if (no === '' || no.length > FIS_NO_EN_COK) return { hata: `Talep numarası 1-${FIS_NO_EN_COK} karakter olmalı.` };
  const tarih = logoTarihi(t.tarih);
  if (tarih === null) return { hata: 'Talep tarihi yok.' };
  if (t.satirlar.length === 0) return { hata: 'Talebin kalemi yok.' };
  const ihtiyac = t.ihtiyacTarihi === null ? null : logoTarihi(t.ihtiyacTarihi);
  const satirlar: Record<string, unknown>[] = [];
  for (const [i, x] of t.satirlar.entries()) {
    const kod = x.stokKodu?.trim() ?? '';
    if (kod === '') return { hata: `Kalem ${i + 1}: malzeme kartına bağlı değil.` };
    if (kod.length > STOK_KODU_EN_COK) return { hata: `Kalem ${i + 1}: stok kodu ${STOK_KODU_EN_COK} karakteri aşıyor.` };
    if (!ONDALIK.test(x.miktar) || olcekli(x.miktar) === 0n) return { hata: `Kalem ${i + 1}: miktar sıfırdan büyük olmalı.` };
    if (x.birim.trim() === '') return { hata: `Kalem ${i + 1}: birim yok.` };
    const satir: Record<string, unknown> = { [a.kod]: kod, [a.miktar]: Number(x.miktar), [a.birim]: logoBirimKodu(x.birim) };
    if (ihtiyac !== null) satir[a.ihtiyac] = ihtiyac;
    satirlar.push(satir);
  }
  return { govde: { [a.no]: no, [a.tarih]: tarih, [a.durum]: TALEP_LOGO_DURUMU, [a.satirlar]: satirlar } };
}

// Talep karşılaması (not 3b: POST /api/DemandFiche/peg {demandLineRef, orderLineRef, amount, itemCode, unitCode, arpCode}; adlar notta).
export interface GonderilecekKarsilama {
  siparisSatirId: number;
  siparisKayitNo: string;
  talepSatirRef: string;
  siparisSatirRef: string;
  miktar: string;
  stokKodu: string;
  birim: string;
}

export function karsilamaGovdesi(k: GonderilecekKarsilama, cariKodu: string | null): { govde: Record<string, unknown> } | { hata: string } {
  const talep = Number(k.talepSatirRef);
  const siparis = Number(k.siparisSatirRef);
  if (![talep, siparis].every((r) => Number.isSafeInteger(r) && r > 0)) return { hata: 'Talep ya da sipariş satırının Logo kayıt numarası geçersiz.' };
  if (!ONDALIK.test(k.miktar) || olcekli(k.miktar) === 0n) return { hata: 'Karşılama miktarı sıfırdan büyük olmalı.' };
  const cari = cariKodu?.trim() ?? '';
  if (cari === '') return { hata: 'Firmanın Logo cari kodu yok.' };
  return {
    govde: { demandLineRef: talep, orderLineRef: siparis, amount: Number(k.miktar), itemCode: k.stokKodu.trim(), unitCode: logoBirimKodu(k.birim), arpCode: cari },
  };
}

// Karşılama listesinden (GET /api/DemandFiche/peg/byOrder/{orderRef}) sipariş satırına ait kaydı bulur. Biçim notta yok: dizi ya da zarfın
// data alanı; öğede kayıt numarası logicalRef ya da LOGICALREF, sipariş satırı orderLineRef ya da CHILDREF (VARSAYIM).
export function karsilamaKaydiBul(govde: unknown, siparisSatirRef: number): number | null | undefined {
  const dizi = Array.isArray(govde) ? govde
    : govde !== null && typeof govde === 'object' && Array.isArray((govde as { data?: unknown }).data) ? (govde as { data: unknown[] }).data : null;
  if (dizi === null) return undefined;
  for (const o of dizi) {
    if (o === null || typeof o !== 'object') return undefined;
    const k = o as Record<string, unknown>;
    const satir = k['orderLineRef'] ?? k['CHILDREF'];
    const ref = k['logicalRef'] ?? k['LOGICALREF'];
    if (satir === siparisSatirRef && typeof ref === 'number' && Number.isSafeInteger(ref) && ref > 0) return ref;
  }
  return null;
}

// Malzeme kartı güncelleme (not 2.1: UpdateRich, CODE'dan LOGICALREF bulunur). Kod, tür ve birim kilitlidir (MKL-3); yalnız ad gider.
export interface MalzemeGuncellemeGovdesi {
  code: string;
  name: string;
  name3?: string;
  name4?: string;
}

// Güncelleme, açmadaki ad kuralını izler (2115-1 a, 2088-1): Açıklama 1 doluysa Logo adı odur, Açıklama 2-3 doluysa NAME3-NAME4'e gider.
// Kuyruk açıklamaları taşımıyorsa yalnız TMI adı gider; boş açıklama gövdede yoktur.
export function malzemeGuncellemeGovdesi(k: {
  stokKodu: string; ad: string | null; aciklama1?: string | null; aciklama2?: string | null; aciklama3?: string | null;
}): { govde: MalzemeGuncellemeGovdesi } | { hata: string } {
  const kod = k.stokKodu.trim();
  if (kod === '' || kod.length > STOK_KODU_EN_COK) return { hata: `Stok kodu 1-${STOK_KODU_EN_COK} karakter olmalı.` };
  const ad = logoKartAdi(k);
  if (ad === '') return { hata: 'Kartın adı yok.' };
  const govde: MalzemeGuncellemeGovdesi = { code: kod, name: ad };
  for (const alan of ['aciklama2', 'aciklama3'] as const) {
    const metin = k[alan]?.trim() ?? '';
    if (metin !== '') govde[KART_ACIKLAMA_ALANLARI[alan]] = metin;
  }
  return { govde };
}

/* ---------------- Satış teklifi ve tekliften satış siparişi (Siparişler) ---------------- */

// Satış teklifi gövdesi (not 2.6: POST /api/SalesOffer/AddRich; JSON adları notta yazılı). Satış teklifinde satır iskontosu ayrı alandır
// (discountRate); satın alma siparişindeki DISCPER reddi bu uç için notta yok. status 1: "onay bekliyor" (VARSAYIM: müşteriye gönderilmiş teklif).
export const SATIS_TEKLIF_ALANLARI = Object.freeze({
  no: 'number', tarih: 'date', cari: 'arpCode', gecerlilik: 'validUntil', doviz: 'currencyCode', kur: 'rate', durum: 'status', satirlar: 'lines',
  tur: 'type', kod: 'masterCode', miktar: 'quantity', fiyat: 'price', iskonto: 'discountRate', kdv: 'vatRate', birim: 'unitCode', termin: 'dueDate',
});
export const SATIS_TEKLIF_LOGO_DURUMU = 1;

export interface GonderilecekSatisTeklifiSatiri {
  satirId: number;
  stokKodu: string | null;
  hizmet: boolean;
  miktar: string;
  birim: string;
  birimFiyat: string;
  iskontoYuzdesi: string | null;
  termin: string | null;
}

export interface GonderilecekSatisTeklifi {
  id: number;
  no: string;
  tarih: string;
  gecerlilikBitis: string | null;
  paraBirimi: string;
  kur: string | null;
  satirlar: readonly GonderilecekSatisTeklifiSatiri[];
}

export function satisTeklifiGovdesi(t: GonderilecekSatisTeklifi, o: SiparisGovdeSecenegi): { govde: Record<string, unknown> } | { hata: string } {
  const a = SATIS_TEKLIF_ALANLARI;
  const no = t.no.trim();
  if (no === '' || no.length > FIS_NO_EN_COK) return { hata: `Teklif numarası 1-${FIS_NO_EN_COK} karakter olmalı.` };
  const tarih = logoTarihi(t.tarih);
  if (tarih === null) return { hata: 'Teklif tarihi yok.' };
  const cari = o.cariKodu?.trim() ?? '';
  if (cari === '') return { hata: 'Firmanın Logo cari kodu yok.' };
  if (t.satirlar.length === 0) return { hata: 'Teklifin satırı yok.' };
  const pb = t.paraBirimi.trim().toUpperCase();
  const doviz = TL_KODLARI.has(pb) ? null : LOGO_DOVIZ_TURLERI[pb];
  if (doviz === undefined) return { hata: `Para birimi ${pb} için Logo döviz türü tanımlı değil.` };
  const satirlar: Record<string, unknown>[] = [];
  for (const [i, x] of t.satirlar.entries()) {
    const sira = i + 1;
    const kod = x.stokKodu?.trim() ?? '';
    if (kod === '') return { hata: `Satır ${sira}: kalem malzeme kartına bağlı değil.` };
    if (kod.length > STOK_KODU_EN_COK) return { hata: `Satır ${sira}: stok kodu ${STOK_KODU_EN_COK} karakteri aşıyor.` };
    if (!ONDALIK.test(x.miktar) || olcekli(x.miktar) === 0n) return { hata: `Satır ${sira}: miktar sıfırdan büyük olmalı.` };
    if (!ONDALIK.test(x.birimFiyat)) return { hata: `Satır ${sira}: birim fiyat geçersiz.` };
    if (x.iskontoYuzdesi !== null && (!ONDALIK.test(x.iskontoYuzdesi) || olcekli(x.iskontoYuzdesi) > 100n * OLCEK_CARPANI)) {
      return { hata: `Satır ${sira}: iskonto 0-100 olmalı.` };
    }
    if (x.birim.trim() === '') return { hata: `Satır ${sira}: birim yok.` };
    const satir: Record<string, unknown> = {
      [a.tur]: x.hizmet ? SATIR_TURU.hizmet : SATIR_TURU.malzeme, [a.kod]: kod, [a.miktar]: Number(x.miktar), [a.fiyat]: Number(metne(olcekli(x.birimFiyat))),
      [a.birim]: logoBirimKodu(x.birim),
    };
    if (x.iskontoYuzdesi !== null && olcekli(x.iskontoYuzdesi) > 0n) satir[a.iskonto] = Number(metne(olcekli(x.iskontoYuzdesi)));
    const kdv = x.hizmet ? o.hizmetKdv : o.kdv;
    if (kdv !== null) satir[a.kdv] = kdv;
    const termin = x.termin === null ? null : logoTarihi(x.termin);
    if (termin !== null) satir[a.termin] = termin;
    satirlar.push(satir);
  }
  const govde: Record<string, unknown> = { [a.no]: no, [a.tarih]: tarih, [a.cari]: cari, [a.durum]: SATIS_TEKLIF_LOGO_DURUMU };
  const gecerlilik = t.gecerlilikBitis === null ? null : logoTarihi(t.gecerlilikBitis);
  if (gecerlilik !== null) govde[a.gecerlilik] = gecerlilik;
  if (doviz !== null) {
    govde[a.doviz] = doviz;
    if (t.kur !== null && ONDALIK.test(t.kur) && olcekli(t.kur) > 0n) govde[a.kur] = Number(t.kur);
  }
  govde[a.satirlar] = satirlar;
  return { govde };
}

// Tekliften satış siparişi (not 2.7: POST /api/SalesOffer/{ref}/toOrder {number, date, orderStatus, lines:[{offerLineRef, quantity, dueDate}]}).
// Logo satış siparişini yalnız tekliften açar; satır bağı teklif satırıdır, fiyat ve kod teklifinden gelir. orderStatus 4: sevk edilebilir (VARSAYIM).
export const SATIS_SIPARIS_LOGO_DURUMU = 4;

export interface GonderilecekSatisSiparisi {
  id: number;
  no: string;
  tarih: string;
  teklifKayitNo: string | null;
  satirlar: readonly { satirId: number; teklifSatirRef: string | null; miktar: string; termin: string | null }[];
}

export function satisSiparisiGovdesi(s: GonderilecekSatisSiparisi): { govde: Record<string, unknown> } | { hata: string } {
  const no = s.no.trim();
  if (no === '' || no.length > FIS_NO_EN_COK) return { hata: `Sipariş numarası 1-${FIS_NO_EN_COK} karakter olmalı.` };
  const tarih = logoTarihi(s.tarih);
  if (tarih === null) return { hata: 'Sipariş tarihi yok.' };
  const teklifRef = Number(s.teklifKayitNo);
  if (s.teklifKayitNo === null || !Number.isSafeInteger(teklifRef) || teklifRef <= 0) return { hata: 'Siparişin teklifi Logo\'da yok.' };
  if (s.satirlar.length === 0) return { hata: 'Siparişin satırı yok.' };
  const satirlar: Record<string, unknown>[] = [];
  for (const [i, x] of s.satirlar.entries()) {
    const sira = i + 1;
    const ref = Number(x.teklifSatirRef);
    if (x.teklifSatirRef === null || !Number.isSafeInteger(ref) || ref <= 0) return { hata: `Satır ${sira}: teklif satırı Logo'da yok.` };
    if (!ONDALIK.test(x.miktar) || olcekli(x.miktar) === 0n) return { hata: `Satır ${sira}: miktar sıfırdan büyük olmalı.` };
    const satir: Record<string, unknown> = { offerLineRef: ref, quantity: Number(x.miktar) };
    const termin = x.termin === null ? null : logoTarihi(x.termin);
    if (termin !== null) satir['dueDate'] = termin;
    satirlar.push(satir);
  }
  return { govde: { number: no, date: tarih, orderStatus: SATIS_SIPARIS_LOGO_DURUMU, lines: satirlar } };
}

/* ---------------- Okuma akışları (logo -> TMI): yalnız GET, yalnız saklanır ---------------- */

// Mal kabul dakikada bir, cari ve ambar listesi saatte bir; fatura turunda en çok bu kadar sipariş okunur ve bir sipariş en erken bu aralıkla yeniden okunur.
export const OKUMA_ISI_ARALIGI_MS = 60_000;
export const FATURA_TUR_SINIRI = 5;
export const FATURA_YENIDEN_OKUMA_MS = 60 * 60_000;
// Başarısız okuma bu aralıktan önce yinelenmez (401 ya da ağ hatasında köprüye her dakika yüklenilmez).
export const OKUMA_HATA_BEKLEME_MS = LISTE_DENEME_ARALIGI_MS;

const kayitMi = (d: unknown): d is Record<string, unknown> => d !== null && typeof d === 'object' && !Array.isArray(d);

// DOĞRULANMADI (VARSAYIM): okuma uçlarının cevap biçimi köprü notunda yok. Cevap dizi ya da zarfın bilinen bir alanında dizidir.
function kayitDizisi(govde: unknown, adaylar: readonly string[]): unknown[] | null {
  if (Array.isArray(govde)) return govde;
  if (!kayitMi(govde)) return null;
  for (const a of [...adaylar, 'data', 'items', 'results', 'list']) if (Array.isArray(govde[a])) return govde[a] as unknown[];
  return null;
}

function ilkSayi(k: Record<string, unknown>, adlar: readonly string[]): number | null {
  for (const a of adlar) {
    const d = k[a];
    if (typeof d === 'number' && Number.isFinite(d)) return d;
    if (typeof d === 'string' && /^-?\d+(\.\d+)?$/.test(d.trim())) return Number(d);
  }
  return null;
}

function ilkMetin(k: Record<string, unknown>, adlar: readonly string[], enCok: number): string | null {
  for (const a of adlar) {
    const d = k[a];
    const m = typeof d === 'string' ? d.trim() : typeof d === 'number' && Number.isFinite(d) ? String(d) : '';
    if (m !== '') return m.length > enCok ? m.slice(0, enCok) : m;
  }
  return null;
}

const kayitNumarasi = (k: Record<string, unknown>, adlar: readonly string[]): number | null => {
  const n = ilkSayi(k, adlar);
  return n !== null && Number.isSafeInteger(n) && n > 0 ? n : null;
};

export interface MalKabulSatiri {
  // STLINE.LOGICALREF: tekil anahtar.
  kayitNo: number;
  // orderLineRef: bağlı sipariş satırı (ORDTRANSREF); yoksa null.
  siparisSatirRef: number | null;
  siparisFisRef: number | null;
  fisNo: string | null;
  malzemeKodu: string | null;
  miktar: string | null;
  birim: string | null;
  ham: Record<string, unknown>;
}

// Satır kaydı olmayan öğe saklanamaz (anahtarı yok) ve sayılır; hiç dizi yoksa null (cevap okunamadı, imleç ilerlemez).
export function malKabulSatirlariniAyikla(govde: unknown): { satirlar: MalKabulSatiri[]; atlanan: number } | null {
  const dizi = kayitDizisi(govde, ['lines', 'receipts']);
  if (dizi === null) return null;
  const satirlar = new Map<number, MalKabulSatiri>();
  let atlanan = 0;
  for (const o of dizi) {
    const kayitNo = kayitMi(o) ? kayitNumarasi(o, ['logicalRef', 'LOGICALREF', 'lineRef', 'stLineRef']) : null;
    if (!kayitMi(o) || kayitNo === null) { atlanan += 1; continue; }
    const miktar = ilkSayi(o, ['quantity', 'amount', 'QUANTITY', 'AMOUNT']);
    satirlar.set(kayitNo, {
      kayitNo,
      siparisSatirRef: kayitNumarasi(o, ['orderLineRef', 'ORDTRANSREF']),
      siparisFisRef: kayitNumarasi(o, ['orderRef', 'orderFicheRef', 'ORDFICHEREF']),
      fisNo: ilkMetin(o, ['ficheNo', 'receiptNo', 'number', 'FICHENO'], 64),
      malzemeKodu: ilkMetin(o, ['itemCode', 'masterCode', 'code', 'ITEM_CODE'], 64),
      miktar: miktar === null ? null : String(miktar),
      birim: ilkMetin(o, ['unitCode', 'unit', 'UNIT_CODE'], 40),
      ham: o,
    });
  }
  return { satirlar: [...satirlar.values()], atlanan };
}

export interface ListeKaydi {
  kod: string;
  ad: string | null;
}

// Cari: kod code/CODE/arpCode, ad name/title/definition. Ambar: kod nr/number/code. Kodsuz öğe atlanır; yinelenen kod tek kayıt.
export function listeKayitlariniAyikla(govde: unknown, liste: 'cari' | 'ambar'): ListeKaydi[] | null {
  const dizi = kayitDizisi(govde, liste === 'cari' ? ['accounts', 'customers'] : ['warehouses']);
  if (dizi === null) return null;
  const kodAdlari = liste === 'cari' ? ['code', 'CODE', 'arpCode', 'ARP_CODE'] : ['nr', 'NR', 'number', 'code', 'CODE'];
  const kayitlar = new Map<string, ListeKaydi>();
  for (const o of dizi) {
    if (!kayitMi(o)) continue;
    const kod = ilkMetin(o, kodAdlari, 64);
    if (kod === null) continue;
    kayitlar.set(kod, { kod, ad: ilkMetin(o, ['name', 'NAME', 'title', 'TITLE', 'definition', 'DEFINITION_', 'description'], 200) });
  }
  return [...kayitlar.values()];
}

export interface FaturaKaydi {
  // Faturanın Logo kaydı; yoksa satırın özeti. Sipariş içinde tekildir.
  anahtar: string;
  faturaNo: string | null;
  ham: Record<string, unknown>;
}

export function faturalariAyikla(govde: unknown): FaturaKaydi[] | null {
  const dizi = kayitDizisi(govde, ['invoices']);
  if (dizi === null) return null;
  const kayitlar = new Map<string, FaturaKaydi>();
  for (const o of dizi) {
    if (!kayitMi(o)) continue;
    const ref = kayitNumarasi(o, ['logicalRef', 'LOGICALREF', 'invoiceRef']);
    const anahtar = ref !== null ? String(ref) : createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 32);
    kayitlar.set(anahtar, { anahtar, faturaNo: ilkMetin(o, ['number', 'invoiceNo', 'ficheNo', 'FICHENO'], 64), ham: o });
  }
  return [...kayitlar.values()];
}

/* ---------------- Logo'dan kart, stok ve cari okuması (kartlar 2116, 2118) ---------------- */

// Yardımcının sözleşmesi (araclar/logo-yardimcisi Islemler.cs): sayfa { data, next }, cari arama dizi, tek cari nesne.
// Sütun karşılıkları gerçek Logo'da doğrulanmadı (kurulum/logo-yardimcisi.md); biçim yardımcınındır.
export interface Sayfa<T> {
  kayitlar: T[];
  // Sonraki sayfanın imleci; null: son sayfa.
  sonraki: number | null;
}

export interface LogoMalzemeKarti {
  logoKayitNo: number;
  kod: string;
  ad: string | null;
  aciklama2: string | null;
  aciklama3: string | null;
  // ITEMS.CARDTYPE; TMI türüne karşılığı malzemelerin işidir.
  kartTuru: number | null;
  birimSeti: string | null;
  aktif: boolean;
}

export interface LogoStokSatiri {
  malzemeKodu: string;
  ambarNo: number;
  // Ondalık metin; sayıya çevrilmez.
  miktar: string;
}

export interface LogoCari {
  logoKayitNo: number;
  kod: string;
  ad: string | null;
  // CLCARD.CARDTYPE (VARSAYIM: 1 alıcı, 2 satıcı, 3 alıcı + satıcı).
  kartTuru: number | null;
  vergiNo: string | null;
  tcKimlikNo: string | null;
  vergiDairesi: string | null;
  adres: string | null;
  ilce: string | null;
  il: string | null;
  postaKodu: string | null;
  telefon: string | null;
  ePosta: string | null;
  aktif: boolean;
}

function sayfaAyikla<T>(govde: unknown, satir: (o: Record<string, unknown>) => T | null): Sayfa<T> | null {
  if (!kayitMi(govde) || !Array.isArray(govde['data'])) return null;
  const n = govde['next'];
  if (n !== null && n !== undefined && !(typeof n === 'number' && Number.isSafeInteger(n) && n > 0)) return null;
  const kayitlar: T[] = [];
  for (const o of govde['data'] as unknown[]) {
    const k = kayitMi(o) ? satir(o) : null;
    if (k !== null) kayitlar.push(k);
  }
  return { kayitlar, sonraki: typeof n === 'number' ? n : null };
}

const aktifMi = (o: Record<string, unknown>): boolean => o['active'] !== false;

// Kaydı ya da kodu olmayan satır atlanır (anahtarı yok); sayfa biçimi bozuksa null (imleç ilerlemez, satır yazılmaz).
export function malzemeKartlariniAyikla(govde: unknown): Sayfa<LogoMalzemeKarti> | null {
  return sayfaAyikla(govde, (o) => {
    const logoKayitNo = kayitNumarasi(o, ['logicalRef']);
    const kod = ilkMetin(o, ['code'], 64);
    if (logoKayitNo === null || kod === null) return null;
    const tur = ilkSayi(o, ['cardType']);
    return {
      logoKayitNo, kod, ad: ilkMetin(o, ['name'], 200), aciklama2: ilkMetin(o, ['name3'], 200), aciklama3: ilkMetin(o, ['name4'], 200),
      kartTuru: tur !== null && Number.isSafeInteger(tur) ? tur : null, birimSeti: ilkMetin(o, ['unitSetCode'], 40), aktif: aktifMi(o),
    };
  });
}

export function stokToplamlariniAyikla(govde: unknown): Sayfa<LogoStokSatiri> | null {
  return sayfaAyikla(govde, (o) => {
    const malzemeKodu = ilkMetin(o, ['itemCode'], 64);
    const ambarNo = ilkSayi(o, ['warehouseNr']);
    const miktar = ilkSayi(o, ['onHand']);
    if (malzemeKodu === null || ambarNo === null || !Number.isSafeInteger(ambarNo) || ambarNo < 0 || miktar === null) return null;
    return { malzemeKodu, ambarNo, miktar: String(miktar) };
  });
}

export function cariKaydiniAyikla(o: unknown): LogoCari | null {
  if (!kayitMi(o)) return null;
  const logoKayitNo = kayitNumarasi(o, ['logicalRef']);
  const kod = ilkMetin(o, ['code'], 64);
  if (logoKayitNo === null || kod === null) return null;
  const tur = ilkSayi(o, ['cardType']);
  const adres = [ilkMetin(o, ['address1'], 500), ilkMetin(o, ['address2'], 500)].filter((a) => a !== null).join(' ');
  return {
    logoKayitNo, kod, ad: ilkMetin(o, ['name'], 200), kartTuru: tur !== null && Number.isSafeInteger(tur) ? tur : null,
    vergiNo: ilkMetin(o, ['taxNr'], 30), tcKimlikNo: ilkMetin(o, ['tckNo'], 30), vergiDairesi: ilkMetin(o, ['taxOffice'], 100),
    adres: adres === '' ? null : adres.slice(0, 500), ilce: ilkMetin(o, ['town'], 100), il: ilkMetin(o, ['city'], 100),
    postaKodu: ilkMetin(o, ['postCode'], 20), telefon: ilkMetin(o, ['phone'], 40), ePosta: ilkMetin(o, ['email'], 200), aktif: aktifMi(o),
  };
}

export function cariListesiniAyikla(govde: unknown): LogoCari[] | null {
  if (!Array.isArray(govde)) return null;
  return govde.map(cariKaydiniAyikla).filter((c): c is LogoCari => c !== null);
}

// Cari arama metni: yardımcı en az 3, en çok 100 karakter kabul eder.
export const CARI_ARAMA_EN_AZ = 3;
export const CARI_ARAMA_EN_COK = 100;
// Sayfalı okumanın tam turu en çok saatte bir başlar; tur sürerken sonraki sayfa bir sonraki iş turunda okunur.
export const SAYFALI_OKUMA_TAZELEME_MS = 60 * 60_000;

export function sayfaliOkumaSirasi(i: { sonRef: number; sonTamam: Date | null } | null, simdi: Date): 'devam' | 'bastan' | 'bekle' {
  if (i !== null && i.sonRef > 0) return 'devam';
  if (i === null || i.sonTamam === null) return 'bastan';
  return simdi.getTime() - i.sonTamam.getTime() >= SAYFALI_OKUMA_TAZELEME_MS ? 'bastan' : 'bekle';
}

/* ---------------- Malzeme kodu eşlemesi (2116-3 c) ---------------- */

// Logo'ya giden belgenin malzeme kodları: kartın kendi kodu ve satırlardaki kodlar.
type KodluBelge = { stokKodu?: string | null; satirlar?: readonly { stokKodu?: string | null }[] };

export function belgeStokKodlari(b: KodluBelge): string[] {
  const kodlar = [b.stokKodu, ...(b.satirlar ?? []).map((x) => x.stokKodu)];
  return [...new Set(kodlar.filter((k): k is string => typeof k === 'string' && k.trim() !== '').map((k) => k.trim()))];
}

// Eşlemesi olan TMI stok kodu Logo koduyla değişir; eşlemesi olmayan kod aynen kalır. Belgenin başka alanına dokunulmaz.
export function logoKodlarinaCevir<T extends KodluBelge>(b: T, harita: ReadonlyMap<string, string>): T {
  if (harita.size === 0) return b;
  const cevir = <K extends string | null | undefined>(k: K): K => (typeof k === 'string' ? ((harita.get(k.trim()) ?? k) as K) : k);
  const yeni: T = { ...b };
  if ('stokKodu' in b) yeni.stokKodu = cevir(b.stokKodu);
  if (b.satirlar) yeni.satirlar = b.satirlar.map((x) => ('stokKodu' in x ? { ...x, stokKodu: cevir(x.stokKodu) } : x));
  return yeni;
}

/* ---------------- Malzeme fişi (kaynağı stok; 294 c, 298 a) ---------------- */

// Sarf 12 ve üretimden giriş 13 köprü notundadır. DOĞRULANMADI (298 a, gerçek Logo'da denenecek): fire 11, ambar transferi 25,
// sayım fazlası 50, sayım eksiği 51. Bu dört tür ayarda kapalı gelir.
export const MALZEME_FISI_TURU = Object.freeze({
  'sarf-fisi': 12, 'uretim-girisi': 13, 'fire-fisi': 11, 'ambar-fisi': 25, 'sayim-fazlasi': 50, 'sayim-eksigi': 51,
} as const);
export type LogoFisTuru = keyof typeof MALZEME_FISI_TURU;
export const LOGO_FIS_TURLERI = Object.keys(MALZEME_FISI_TURU) as LogoFisTuru[];
// Yardımcının uç adı: POST /api/MaterialSlip/Add{ad}, DELETE /api/MaterialSlip/{ad}/{no}. Yeni dördü yardımcıda kart #494 ile açılır.
export const MALZEME_FISI_UCU: Readonly<Record<LogoFisTuru, string>> = Object.freeze({
  'sarf-fisi': 'Consumption', 'uretim-girisi': 'ProductionEntry', 'fire-fisi': 'Scrap', 'ambar-fisi': 'WarehouseTransfer',
  'sayim-fazlasi': 'CountSurplus', 'sayim-eksigi': 'CountShortage',
});
// Stoktaki fiş türü -> giden kutusundaki belge türü ve gönderim şekli ayarı.
export const STOK_FISI_LOGO_TURU: Readonly<Record<MalzemeFisiTuru, LogoFisTuru>> = Object.freeze({
  sarf: 'sarf-fisi', uretim_girisi: 'uretim-girisi', fire: 'fire-fisi', ambar: 'ambar-fisi', sayim_fazlasi: 'sayim-fazlasi', sayim_eksigi: 'sayim-eksigi',
});
export const FIS_GONDERIM_AYARI = Object.freeze({
  sarf: 'logo.malzeme-fisi-sarf', uretim_girisi: 'logo.malzeme-fisi-uretim-girisi', fire: 'logo.malzeme-fisi-fire', ambar: 'logo.malzeme-fisi-ambar',
  sayim_fazlasi: 'logo.malzeme-fisi-sayim-fazlasi', sayim_eksigi: 'logo.malzeme-fisi-sayim-eksigi',
} as const satisfies Record<MalzemeFisiTuru, string>);
// Ayar değeri sabit listedendir; bilinmeyen değer kapalı sayılır (fiş gitmez).
export const gonderimSekli = (deger: string): FisGonderimSekli => (deger === 'otomatik' || deger === 'elle' ? deger : 'kapali');

// DOĞRULANMADI: alan adları köprü notundaki etiketlerdir; satırların kabı (TRANSACTIONS dizisi), TIME biçimi (HH:mm:ss), LINE_NUMBER'ın
// 1'den başlaması ve birim çevrimi (1/1) VARSAYILDI. Ambar transferinin kaynak ve hedef ambar alanları (SOURCE_WH, DEST_WH; başlıkta ve
// satırda) VARSAYIM. Doğrulanınca yalnız bu harita ve malzemeFisiGovdesi değişir.
export const MALZEME_FISI_ALANLARI = Object.freeze({
  tur: 'TYPE', no: 'NUMBER', tarih: 'DATE', saat: 'TIME', grup: 'GROUP', toplamlar: 'CURRSEL_TOTALS', proje: 'PROJECT_CODE', satirlar: 'TRANSACTIONS',
  kod: 'ITEM_CODE', miktar: 'QUANTITY', birim: 'UNIT_CODE', carpan1: 'UNIT_CONV1', carpan2: 'UNIT_CONV2', satirTuru: 'LINE_TYPE', satirNo: 'LINE_NUMBER',
  aciklama: 'DESCRIPTION', kaynakAmbar: 'SOURCE_WH', hedefAmbar: 'DEST_WH',
});
// Başlık GROUP 3 (malzeme fişi), CURRSEL_TOTALS 1; satır türü 0 (malzeme).
const MALZEME_FISI_GRUBU = 3;
const MALZEME_FISI_ACIKLAMA_EN_COK = 50;

export interface GonderilecekMalzemeFisi {
  id: number;
  tur: LogoFisTuru;
  no: string;
  tarih: string;
  // HH:mm:ss; yoksa TIME gönderilmez.
  saat: string | null;
  projeKodu: string | null;
  satirlar: readonly {
    satirId: number; stokKodu: string; miktar: string; birim: string; aciklama: string | null;
    // Yalnız ambar transferinde; Logo ambar no.
    kaynakAmbarNo?: number | null; hedefAmbarNo?: number | null;
  }[];
}

// Stoktaki fiş ve satırları. Fire gönderimi kapalıyken emrin fire satırları sarf fişine eklenir (önceki gibi fire sarfın içinde).
export interface StokFisi {
  id: number;
  tur: MalzemeFisiTuru;
  no: string;
  tarih: string;
  saat: string;
  // Emir fişinin emir numarası; Logo fiş numarasına sığmadığı için satır açıklamasının başında gider.
  emirNo?: string | null;
  satirlar: readonly StokFisSatiri[];
}
export interface StokFisSatiri { stokKodu: string | null; birim: string | null; miktar: string; aciklama: string | null; kaynakAmbarNo: number | null; hedefAmbarNo: number | null }

// Kartı ya da birimi olmayan satır boş metinle kalır: gövde kuralı fişi nedeniyle reddeder, sessizce düşmez. Satırı olmayan fiş null
// (gönderilecek bir şey yok; Logo'da açıksa silinir). Emir numarası açıklamanın başındadır: açıklama sınırda kesilirse emir no kalır.
const emirliAciklama = (emirNo: string | null, aciklama: string | null): string | null =>
  [emirNo?.trim(), aciklama?.trim()].filter((x) => x).join(' ') || null;
export function stokFisindenLogoFisi(f: StokFisi, ekSatirlar: readonly StokFisSatiri[] = []): GonderilecekMalzemeFisi | null {
  const ambar = f.tur === 'ambar';
  const satirlar = [...f.satirlar, ...ekSatirlar]
    .filter((k) => !ONDALIK.test(k.miktar) || olcekli(k.miktar) !== 0n)
    .map((k, i) => ({
      satirId: i + 1, stokKodu: k.stokKodu ?? '', miktar: k.miktar, birim: k.birim ?? '', aciklama: emirliAciklama(f.emirNo ?? null, k.aciklama),
      ...(ambar ? { kaynakAmbarNo: k.kaynakAmbarNo, hedefAmbarNo: k.hedefAmbarNo } : {}),
    }));
  if (satirlar.length === 0) return null;
  return { id: f.id, tur: STOK_FISI_LOGO_TURU[f.tur], no: f.no, tarih: f.tarih, saat: f.saat, projeKodu: null, satirlar };
}

// 2948: emir fişinin eski numarası emir numarasıydı (yoksa "#<emir kimliği>"). Logo'ya hiç ulaşmamış olabilecek satırda değil, köprüye
// gitmiş olabilecek satırda (deneme, niyet ya da kayıt no var) ve numara 16'ya sığıyorsa eski numara korunur: fiş Logo'da o numarayla
// duruyor olabilir; yeni numarayla açmak ikinci fiş (çift stok hareketi) olur. Kayıtlı numara her zaman önce gelir.
export function eskiEmirFisiNo(f: { id: number; tur: MalzemeFisiTuru; uretimEmriId: number | null; emirNo?: string | null }): string | null {
  if (f.tur !== 'sarf' && f.tur !== 'uretim_girisi' && f.tur !== 'fire') return null;
  return (f.emirNo ?? `#${f.uretimEmriId ?? f.id}`).trim();
}
export function logoFisNumarasi(
  yeni: string, eski: string | null,
  g: { numara: string | null; denemeSayisi: number; niyetZamani: Date | null; logoKayitNo: string | null } | null,
): string {
  if (g?.numara) return g.numara;
  const gitmisOlabilir = g !== null && (g.denemeSayisi > 0 || g.niyetZamani !== null || g.logoKayitNo !== null);
  if (gitmisOlabilir && eski !== null && eski !== '' && eski.length <= FIS_NO_EN_COK) return eski;
  return yeni.trim();
}

// 233: Logo'daki fişin satırlarının özeti; aynı özet yeniden gönderilmez. Miktar ölçekli sayıyla karşılaştırılır ("2.50" ile "2.5" aynı).
export function malzemeFisiOzeti(f: GonderilecekMalzemeFisi): string {
  return JSON.stringify(f.satirlar.map((x) => {
    const satir: unknown[] = [x.stokKodu.trim(), ONDALIK.test(x.miktar) ? String(olcekli(x.miktar)) : x.miktar, x.birim.trim(), x.aciklama];
    return f.tur === 'ambar-fisi' ? [...satir, x.kaynakAmbarNo ?? null, x.hedefAmbarNo ?? null] : satir;
  }));
}

export function malzemeFisiGovdesi(f: GonderilecekMalzemeFisi): { govde: Record<string, unknown> } | { hata: string } {
  const a = MALZEME_FISI_ALANLARI;
  const no = f.no.trim();
  if (no === '' || no.length > FIS_NO_EN_COK) return { hata: `Fiş numarası 1-${FIS_NO_EN_COK} karakter olmalı.` };
  const tarih = logoTarihi(f.tarih);
  if (tarih === null) return { hata: 'Fiş tarihi yok.' };
  if (f.saat !== null && !/^\d{2}:\d{2}:\d{2}$/.test(f.saat)) return { hata: 'Fiş saati HH:mm:ss olmalı.' };
  if (f.satirlar.length === 0) return { hata: 'Fişin satırı yok.' };
  const ambar = f.tur === 'ambar-fisi';
  const ciftler = new Set(f.satirlar.map((x) => `${x.kaynakAmbarNo ?? ''}>${x.hedefAmbarNo ?? ''}`));
  // Logo ambar fişi başlıkta tek kaynak ve hedef ambar taşır (VARSAYIM); birden çok depo çifti olan fiş bölünmez, reddedilir.
  if (ambar && ciftler.size > 1) return { hata: 'Fişte birden çok depo çifti var; Logo ambar fişi tek kaynak ve hedef ambar taşır.' };
  const proje = f.projeKodu?.trim() ?? '';
  const satirlar: Record<string, unknown>[] = [];
  for (const [i, x] of f.satirlar.entries()) {
    const sira = i + 1;
    const kod = x.stokKodu.trim();
    if (kod === '' || kod.length > STOK_KODU_EN_COK) return { hata: `Satır ${sira}: stok kodu 1-${STOK_KODU_EN_COK} karakter olmalı.` };
    if (!ONDALIK.test(x.miktar) || olcekli(x.miktar) === 0n) return { hata: `Satır ${sira}: miktar sıfırdan büyük olmalı.` };
    if (x.birim.trim() === '') return { hata: `Satır ${sira}: birim yok.` };
    const satir: Record<string, unknown> = {
      [a.kod]: kod, [a.miktar]: Number(metne(olcekli(x.miktar))), [a.birim]: logoBirimKodu(x.birim), [a.carpan1]: 1, [a.carpan2]: 1, [a.satirTuru]: 0, [a.satirNo]: sira,
    };
    if (ambar) {
      if (x.kaynakAmbarNo == null || x.hedefAmbarNo == null) return { hata: `Satır ${sira}: deponun Logo ambar no'su yok.` };
      satir[a.kaynakAmbar] = x.kaynakAmbarNo;
      satir[a.hedefAmbar] = x.hedefAmbarNo;
    }
    const aciklama = x.aciklama?.trim() ?? '';
    if (aciklama !== '') satir[a.aciklama] = aciklama.slice(0, MALZEME_FISI_ACIKLAMA_EN_COK);
    if (proje !== '') satir[a.proje] = proje;
    satirlar.push(satir);
  }
  const govde: Record<string, unknown> = { [a.tur]: MALZEME_FISI_TURU[f.tur], [a.no]: no, [a.tarih]: tarih };
  if (f.saat !== null) govde[a.saat] = f.saat;
  govde[a.grup] = MALZEME_FISI_GRUBU;
  govde[a.toplamlar] = 1;
  if (proje !== '') govde[a.proje] = proje;
  if (ambar) {
    govde[a.kaynakAmbar] = f.satirlar[0]!.kaynakAmbarNo;
    govde[a.hedefAmbar] = f.satirlar[0]!.hedefAmbarNo;
  }
  govde[a.satirlar] = satirlar;
  return { govde };
}

// Stokta fişin Logo durumu (295 a). Giden kutusu satırı, türün gönderim şekli ve kanal (bağlantı ve ana anahtar) durumundan çıkar.
export interface FisDurumSorusu { tur: MalzemeFisiTuru; degisiklik: number; satirVar: boolean; id: number }
export interface FisGidenDurumu {
  kaynakDegisiklik: number; bekleyen: number; istekBekliyor: boolean; logoKayitNo: string | null; sonSonuc: string | null; sonHata: string | null;
  sonDeneme: Date | null; sonrakiDeneme: Date | null; denemeSayisi: number; ardisikHata: number;
}
const BASARILI_SONUCLAR = new Set(['gonderildi', 'zaten-vardi', 'silindi']);
export function logoFisDurumu(
  q: FisDurumSorusu, g: FisGidenDurumu | null, o: { sekil: FisGonderimSekli; fireSekli: FisGonderimSekli; kanalAcik: boolean; enBuyukFisId: number },
): LogoFisBilgisi {
  const deneme = {
    kayitNo: g?.logoKayitNo ?? null, sonDeneme: g?.sonDeneme?.toISOString() ?? null, sonrakiDeneme: g?.sonrakiDeneme?.toISOString() ?? null,
    denemeSayisi: g?.denemeSayisi ?? 0, ardisikHata: g?.ardisikHata ?? 0,
  };
  const bilgi = (durum: LogoFisDurumu, neden: string | null): LogoFisBilgisi => ({ durum, gonderimSekli: o.sekil, neden, ...deneme });
  if (q.tur === 'fire' && o.sekil === 'kapali') return bilgi('gonderilmez', 'Fire gönderimi kapalı; fire satırları emrin sarf fişiyle gider.');
  if (o.sekil === 'kapali') return bilgi('gonderilmez', 'Bu fiş türünün Logo gönderimi kapalı.');
  if (g === null) {
    if (q.id <= o.enBuyukFisId) return bilgi('gonderilmez', 'Fiş Logo kuyruğuna alınmadı (Logo izlemeye başlamadan önce açıldı ve o günden beri değişmedi).');
    return bilgi('bekliyor', o.kanalAcik ? 'Logo işi fişi sıraya alacak.' : 'Logo bağlantısı ya da malzeme fişi gönderimi kapalı.');
  }
  if (g.sonSonuc !== null && !BASARILI_SONUCLAR.has(g.sonSonuc)) return bilgi('hata', g.sonHata);
  const degisti = g.bekleyen > 0 || g.kaynakDegisiklik < q.degisiklik;
  if (!q.satirVar && g.logoKayitNo === null) return bilgi('gonderilmez', 'Fişte satır yok; boş fiş Logo\'ya gitmez.');
  if (!degisti && g.logoKayitNo !== null) return bilgi('gonderildi', null);
  if (!o.kanalAcik) return bilgi('bekliyor', 'Logo bağlantısı ya da malzeme fişi gönderimi kapalı.');
  if (o.sekil === 'elle' && !g.istekBekliyor) return bilgi('bekliyor', 'Elle gönderim: Gönder ile gider.');
  return bilgi('bekliyor', g.logoKayitNo !== null ? 'Değişti; Logo\'daki fiş yenilenecek.' : 'Sırada.');
}

/* ---------------- Bağlantı hazırlığı ve canlı kontrol ---------------- */

// bagli: kod var ve işe bağlı; baglanmadi: kod var, kaynağı olan modülün işlevleri gelmedi (UYUM-BORCU); kodda-yok: yazılmadı.
export type AkisKaynagi = 'bagli' | 'baglanmadi' | 'kodda-yok';

export interface LogoAkisTanimi {
  anahtar: string;
  yon: 'tmi-logo' | 'logo-tmi';
  baslik: string;
  aciklama: string;
  kaynak: AkisKaynagi;
  // "Logo bağlantısı"na ek olarak açık olması gereken anahtarlar; biri açıksa yeter (hizmet kartının iki yönü).
  ayarlar: readonly string[];
  // logo_giden belge türleri; sayılar bunlardan toplanır.
  belgeTurleri: readonly string[];
  // Okuma akışı (logo -> TMI): sayı giden kutusundan değil okunan satırlardan gelir; `gonderilen` okunan satır sayısıdır, `hatali` yoktur.
  okuma?: 'mal-kabul' | 'cari-ambar' | 'fatura' | 'malzeme-karti' | 'stok' | 'cari';
}

export const LOGO_AKISLARI: readonly LogoAkisTanimi[] = [
  { anahtar: 'malzeme-karti', yon: 'tmi-logo', baslik: 'Malzeme kartı', kaynak: 'bagli', ayarlar: [], belgeTurleri: ['malzeme'],
    aciklama: 'Aktif malzeme kartı Logo\'da açılır (Material/AddRich); önce "var mı" okunur.' },
  { anahtar: 'malzeme-guncelleme', yon: 'tmi-logo', baslik: 'Malzeme adı güncellemesi', kaynak: 'bagli', ayarlar: ['logo.malzeme-guncelleme-gonderimi'],
    belgeTurleri: ['malzeme-guncelleme'],
    aciklama: 'Logo\'ya gitmiş kartın değişen adı Material/UpdateRich ile gider; Malzemeler modülünün güncelleme kuyruğundan okunur. Kapalıyken güncellemeler birikir.' },
  { anahtar: 'hizmet-karti', yon: 'tmi-logo', baslik: 'Hizmet kartı (alınan, verilen)', kaynak: 'bagli',
    ayarlar: ['logo.hizmet-alinan-gonderimi', 'logo.hizmet-verilen-gonderimi'], belgeTurleri: ['hizmet'],
    aciklama: 'PurchaseService ve SalesService AddRich; iki yön ayrı anahtarla açılır.' },
  { anahtar: 'satin-alma-siparisi', yon: 'tmi-logo', baslik: 'Satın alma siparişi', kaynak: 'bagli', ayarlar: ['logo.satin-alma-gonderimi'],
    belgeTurleri: ['siparis', 'siparis-guncelleme', 'siparis-kapatma', 'siparis-iptal'],
    aciklama: 'Verilen sipariş açılır (PurchaseOrder/AddRich, önce find ile çift gönderim kalkanı); düzenleme, kapatma ve iptal de gider.' },
  { anahtar: 'talep-fisi', yon: 'tmi-logo', baslik: 'Talep fişi ve karşılama', kaynak: 'bagli', ayarlar: ['logo.satin-alma-gonderimi'],
    belgeTurleri: ['talep', 'karsilama'], aciklama: 'Onaylı talep DemandFiche olarak açılır; sipariş satırı talep satırına karşılama (peg) ile bağlanır.' },
  { anahtar: 'satis', yon: 'tmi-logo', baslik: 'Satış teklifi ve siparişi', kaynak: 'bagli', ayarlar: ['logo.satis-gonderimi'],
    belgeTurleri: ['siparisler-teklifi', 'siparisler-siparisi'],
    aciklama: 'Siparişler\'de müşteriye verilen her teklif sürümü SalesOffer olarak, onaylanan sipariş kabul edilen sürümün teklifinden açılır.' },
  { anahtar: 'malzeme-fisi', yon: 'tmi-logo', baslik: 'Malzeme fişi', kaynak: 'bagli', ayarlar: ['logo.malzeme-fisi-gonderimi'],
    belgeTurleri: [...LOGO_FIS_TURLERI],
    aciklama: 'Stok\'taki malzeme fişleri (sarf, üretimden giriş, fire, sayım fazlası ve eksiği, ambar transferi) MaterialSlip uçlarıyla gider; her türün gönderim şekli (kapalı, otomatik, elle) ayrı ayardadır. Değişen fiş Logo\'da silinip aynı numarayla yeniden açılır.' },
  // 2971: 2961 ile gelen işler; kodu bağlanınca kaynak 'bagli' olur ve sayılar giden kutusundan gelir.
  { anahtar: 'siparis-durumu', yon: 'tmi-logo', baslik: 'Satın alma siparişi: beklet / serbest bırak', kaynak: 'kodda-yok', ayarlar: ['logo.satin-alma-gonderimi'],
    belgeTurleri: [], aciklama: 'Satın Alma\'da siparişin "Logo\'da beklet" ve "Serbest bırak" düğmesi Logo\'daki sipariş durumunu değiştirir (2966-1 b).' },
  { anahtar: 'talep-iptali', yon: 'tmi-logo', baslik: 'Talep fişi iptali', kaynak: 'kodda-yok', ayarlar: ['logo.satin-alma-gonderimi'], belgeTurleri: [],
    aciklama: 'Logo\'ya gitmiş talep CORE\'da iptal edilince Logo\'da da kapanır, karşılamaları geri alınır; iptal geri alınınca yeniden açılır (2966-2 a).' },
  { anahtar: 'teklif-kapatma', yon: 'tmi-logo', baslik: 'Satış teklifi kapatma', kaynak: 'kodda-yok', ayarlar: ['logo.satis-gonderimi'], belgeTurleri: [],
    aciklama: 'Reddedilen teklif ve yeni sürümü gelen teklifin eski sürümü Logo\'da kapanır (2966-3 a, 2966-4 a).' },
  { anahtar: 'malzeme-hareketleri', yon: 'logo-tmi', baslik: 'Malzeme hareketleri ve son alış fiyatları', kaynak: 'kodda-yok', ayarlar: [], belgeTurleri: [],
    aciklama: 'Malzeme kartında Logo\'daki hareketler ve son alış faturası fiyatları istenince okunur; Logo\'ya yazılmaz.' },
  { anahtar: 'sozlukler', yon: 'logo-tmi', baslik: 'Ödeme planı, masraf merkezi, proje ve kur', kaynak: 'kodda-yok', ayarlar: [], belgeTurleri: [],
    aciklama: 'Formlardaki seçim listeleri ve günün kurları Logo\'dan okunur; Logo\'ya yazılmaz.' },
  { anahtar: 'birim-setleri', yon: 'logo-tmi', baslik: 'Birim seti listesi', kaynak: 'bagli', ayarlar: [], belgeTurleri: [],
    aciklama: 'Saatte bir Lookup/unitsets okunur; malzeme gönderiminde birim karşılığı buna göre denetlenir.' },
  { anahtar: 'mal-kabul', yon: 'logo-tmi', baslik: 'Mal kabul (irsaliye satırları)', kaynak: 'bagli', ayarlar: ['logo.mal-kabul-okumasi'], belgeTurleri: [], okuma: 'mal-kabul',
    aciklama: 'Dakikada bir PurchaseOrder/receipts okunur (since imleciyle); satırlar yalnız saklanır, stoka ya da satın almaya işlenmez. Sayı okunan satır sayısıdır.' },
  { anahtar: 'cari-depo', yon: 'logo-tmi', baslik: 'Cari ve ambar listeleri', kaynak: 'bagli', ayarlar: ['logo.liste-okumasi'], belgeTurleri: [], okuma: 'cari-ambar',
    aciklama: 'Saatte bir Arp/list ve Lookup/warehouses okunup önbelleğe (kod, ad) yazılır. Sayı okunan kayıt sayısıdır.' },
  { anahtar: 'fatura', yon: 'logo-tmi', baslik: 'Fatura ve irsaliye', kaynak: 'bagli', ayarlar: ['logo.fatura-okumasi'], belgeTurleri: [], okuma: 'fatura',
    aciklama: 'Logo\'ya giden satın alma siparişlerinin faturaları (PurchaseOrder/{no}/invoices) sırayla okunup saklanır; Logo\'ya hiç yazılmaz. Okunacak sipariş, bu sürümden sonra Logo\'da açılan satın alma siparişleridir. Sayı okunan fatura sayısıdır.' },
  { anahtar: 'malzeme-karti-okuma', yon: 'logo-tmi', baslik: 'Malzeme kartı okuması', kaynak: 'bagli', ayarlar: ['logo.malzeme-okumasi'], belgeTurleri: [], okuma: 'malzeme-karti',
    aciklama: 'Logo malzeme kartları (Material/list) en çok saatte bir, sayfa sayfa okunur ve aynaya yazılır; Malzemeler\'de "Logo\'dan gelenler" listesi buradan beslenir. TMI kartı kendiliğinden değişmez, Logo\'ya hiçbir şey gitmez. Sayı son turda okunan kart sayısıdır.' },
  { anahtar: 'stok-okuma', yon: 'logo-tmi', baslik: 'Stok toplamı okuması', kaynak: 'bagli', ayarlar: ['logo.stok-okumasi'], belgeTurleri: [], okuma: 'stok',
    aciklama: 'Logo\'daki ambar başına eldeki miktar (Stock/totals) en çok saatte bir okunur; yalnız TMI stoğuyla karşılaştırma ve bir kezlik açılış devri içindir, TMI stoğuna kendiliğinden yazılmaz. Sayı son turda okunan satır sayısıdır.' },
  { anahtar: 'cari-arama', yon: 'logo-tmi', baslik: 'Cari arama (müşteri ve tedarikçi)', kaynak: 'bagli', ayarlar: ['logo.cari-aramasi'], belgeTurleri: [], okuma: 'cari',
    aciklama: 'Müşteri-Tedarikçi\'de yeni firma açarken Logo carisi kod, ünvan ya da vergi numarasıyla aranır (Arp/search) ve seçilen cari forma doldurulur; zamanlanmış okuma yoktur, Logo\'ya yazılmaz.' },
];

export type LogoAkisDurumu = 'hazir' | 'kapali' | 'ayar-eksik' | 'baglanmadi' | 'kodda-yok';

// LOGO-H1: akış ancak kodu bağlı, ortam değişkenleri tanımlı, "Logo bağlantısı" ve kendi anahtarı açıkken hazırdır.
export function logoAkisDurumu(t: Pick<LogoAkisTanimi, 'kaynak' | 'ayarlar'>, d: { ortamVar: boolean; ayarlar: Readonly<Record<string, boolean>> }): LogoAkisDurumu {
  if (t.kaynak !== 'bagli') return t.kaynak;
  if (!d.ortamVar) return 'ayar-eksik';
  if (d.ayarlar['logo.baglanti'] !== true) return 'kapali';
  return t.ayarlar.length === 0 || t.ayarlar.some((a) => d.ayarlar[a] === true) ? 'hazir' : 'kapali';
}

// Köprü notundaki deneme malzemesi; kontrol yalnız "var mı" diye okur, kart açmaz.
export const KONTROL_MALZEME_KODU = 'TMI-ERP-TEST-001';

// LOGO-H2: canlı kontrol yalnız okur (GET); sırayla ve tek tek gider, köprünün tek COM oturumu meşgul edilmez.
export const LOGO_KONTROL_ADIMLARI: readonly { ad: string; yol: string }[] = [
  { ad: 'Köprüye ulaşım ve anahtar (ambar listesi)', yol: '/api/Lookup/warehouses' },
  { ad: 'Malzeme "var mı" okuması', yol: `/api/Material/exists/${KONTROL_MALZEME_KODU}` },
  { ad: 'Birim seti listesi', yol: '/api/Lookup/unitsets' },
];

export type KontrolAdimSonucu = { sonuc: 'tamam' | 'hata'; ileti: string; devam: boolean };

// LOGO-H3: 2xx ve "success: false" taşımayan cevap tamamdır. Ağ hatası, zaman aşımı ve anahtar reddinde sonraki adımlar atlanır.
export function kontrolAdiminiYorumla(c: { durum: number; govde: unknown } | Exclude<KopruSonucu, { tur: 'basarili' }>): KontrolAdimSonucu {
  if ('tur' in c) return { sonuc: 'hata', ileti: c.ileti, devam: false };
  if (c.durum === 401 || c.durum === 403) return { sonuc: 'hata', ileti: `Köprü anahtarı reddedildi (${c.durum}).`, devam: false };
  const zarf = c.govde !== null && typeof c.govde === 'object' && !Array.isArray(c.govde) ? (c.govde as KopruZarfi) : null;
  if (c.durum >= 200 && c.durum < 300 && zarf?.success !== false) return { sonuc: 'tamam', ileti: `Cevap geldi (${c.durum}).`, devam: true };
  const r = cevabiYorumla(c.durum, zarf);
  return { sonuc: 'hata', ileti: r.tur === 'basarili' ? `Köprü ${c.durum} döndü.` : r.ileti, devam: true };
}

/* ---------------- 2961-D4: malzeme hareketleri ve son alış fiyatları (yalnız okuma) ---------------- */

// Yardımcının GET /api/Material/{kod}/movements (sayfa) ve /lastPurchases (dizi) cevapları. Sütunlar gerçek Logo'da ölçülmedi (yardımcı
// Sorgular.Dogrulanmadi); okunamayan satır atlanır, sayı uydurulmaz. Miktar ve fiyat ondalık metin kalır.
export interface LogoMalzemeHareketi {
  logoKayitNo: number;
  // ISO tarih (YYYY-MM-DD).
  tarih: string;
  // STLINE.TRCODE ve IOCODE (1, 2 giriş; 3, 4 çıkış; VARSAYIM). Anlamlandırma kullanan ekranın işidir.
  fisTuru: number;
  girisCikis: number;
  fisNo: string | null;
  miktar: string;
  ambarNo: number | null;
  birim: string | null;
}

export interface LogoAlisFiyati {
  logoKayitNo: number;
  tarih: string;
  cariKodu: string | null;
  faturaNo: string | null;
  miktar: string;
  birim: string | null;
  // Yerel para birim fiyatı; döviz türü 0 ise döviz fiyatı null.
  fiyat: string;
  dovizTuru: number | null;
  dovizFiyati: string | null;
}

const ISO_TARIH = /^\d{4}-\d{2}-\d{2}$/;
const tamSayi = (n: number | null): number | null => (n !== null && Number.isSafeInteger(n) ? n : null);

function hareketSatiri(o: Record<string, unknown>): LogoMalzemeHareketi | null {
  const logoKayitNo = kayitNumarasi(o, ['logicalRef']);
  const tarih = ilkMetin(o, ['date'], 10);
  const fisTuru = tamSayi(ilkSayi(o, ['trCode']));
  const girisCikis = tamSayi(ilkSayi(o, ['ioCode']));
  const miktar = ilkSayi(o, ['quantity']);
  if (logoKayitNo === null || tarih === null || !ISO_TARIH.test(tarih) || fisTuru === null || girisCikis === null || miktar === null) return null;
  const ambar = tamSayi(ilkSayi(o, ['warehouseNr']));
  return {
    logoKayitNo, tarih, fisTuru, girisCikis, fisNo: ilkMetin(o, ['ficheNo'], 40), miktar: String(miktar),
    ambarNo: ambar !== null && ambar >= 0 ? ambar : null, birim: ilkMetin(o, ['unitCode'], 40),
  };
}

export function malzemeHareketleriniAyikla(govde: unknown): Sayfa<LogoMalzemeHareketi> | null {
  return sayfaAyikla(govde, hareketSatiri);
}

export function alisFiyatlariniAyikla(govde: unknown): LogoAlisFiyati[] | null {
  if (!Array.isArray(govde)) return null;
  const l: LogoAlisFiyati[] = [];
  for (const o of govde) {
    if (!kayitMi(o)) continue;
    const logoKayitNo = kayitNumarasi(o, ['logicalRef']);
    const tarih = ilkMetin(o, ['date'], 10);
    const miktar = ilkSayi(o, ['quantity']);
    const fiyat = ilkSayi(o, ['price']);
    if (logoKayitNo === null || tarih === null || !ISO_TARIH.test(tarih) || miktar === null || fiyat === null) continue;
    const tur = tamSayi(ilkSayi(o, ['currencyType']));
    const dovizli = tur !== null && tur > 0;
    const dovizFiyati = dovizli ? ilkSayi(o, ['currencyPrice']) : null;
    l.push({
      logoKayitNo, tarih, cariKodu: ilkMetin(o, ['arpCode'], 64), faturaNo: ilkMetin(o, ['invoiceNo'], 40), miktar: String(miktar),
      birim: ilkMetin(o, ['unitCode'], 40), fiyat: String(fiyat), dovizTuru: dovizli ? tur : null, dovizFiyati: dovizFiyati === null ? null : String(dovizFiyati),
    });
  }
  return l;
}
