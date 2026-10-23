import { createHash } from 'node:crypto';

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
  | { tur: 'basarili'; logicalRef: number | null }
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
  // Kartın Açıklama 1-3'ü (334 a); boşsa gövdede yoktur.
  aciklama1?: string | null;
  aciklama2?: string | null;
  aciklama3?: string | null;
}

// DOĞRULANMADI: kartın adı Logo'da NAME (name), Açıklama 1-3 NAME2-NAME4 sayıldı; JSON adları name'in kalıbıyla VARSAYILDI. Doğrulanınca yalnız bu harita değişir.
export const KART_ACIKLAMA_ALANLARI = Object.freeze({ aciklama1: 'name2', aciklama2: 'name3', aciklama3: 'name4' } as const);

export interface MalzemeEklemeGovdesi {
  code: string;
  name: string;
  cardType: number;
  unitSetCode: string;
  auxilCode: string;
  name2?: string;
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
  const ad = k.ad?.trim() ?? '';
  if (ad === '') return { hata: 'Kartın adı yok.' };
  const tur = Number(k.logoKartTuru);
  if (!/^\d+$/.test(k.logoKartTuru ?? '') || !LOGO_KART_TURLERI.includes(tur)) {
    return { hata: `Geçersiz karşılık: tür karşılığı Logo kart türlerinden biri olmalı (${LOGO_KART_TURLERI.join(', ')}).` };
  }
  const birim = k.logoBirimSeti?.trim() ?? '';
  if (birim === '') return { hata: 'Birim karşılığı yok.' };
  if (!o.gecerliBirimler.has(birim)) return { hata: kirp(`Geçersiz karşılık: birim seti ${birim} Logo birim seti listesinde yok.`) };
  const govde: MalzemeEklemeGovdesi = { code: kod, name: ad, cardType: tur, unitSetCode: birim, auxilCode: OZEL_KOD };
  for (const alan of ['aciklama1', 'aciklama2', 'aciklama3'] as const) {
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
  return { govde: { [KAYIT_ALANI]: kayit, ...r.govde } };
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
export function malzemeGuncellemeGovdesi(k: { stokKodu: string; ad: string | null }): { govde: { code: string; name: string } } | { hata: string } {
  const kod = k.stokKodu.trim();
  if (kod === '' || kod.length > STOK_KODU_EN_COK) return { hata: `Stok kodu 1-${STOK_KODU_EN_COK} karakter olmalı.` };
  const ad = k.ad?.trim() ?? '';
  if (ad === '') return { hata: 'Kartın adı yok.' };
  return { govde: { code: kod, name: ad } };
}

/* ---------------- Satış teklifi ve tekliften satış siparişi (portal; kullanıcı sorusu 12.10.2026, kart #777) ---------------- */

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

/* ---------------- Malzeme fişi: sarf (TRCODE 12) ve üretimden giriş (TRCODE 13) ---------------- */

export const MALZEME_FISI_TURU = Object.freeze({ 'sarf-fisi': 12, 'uretim-girisi': 13 } as const);
// DOĞRULANMADI: alan adları köprü notundaki etiketlerdir; satırların kabı (TRANSACTIONS dizisi), TIME biçimi (HH:mm:ss), LINE_NUMBER'ın
// 1'den başlaması ve birim çevrimi (1/1) VARSAYILDI. Doğrulanınca yalnız bu harita ve malzemeFisiGovdesi değişir.
export const MALZEME_FISI_ALANLARI = Object.freeze({
  tur: 'TYPE', no: 'NUMBER', tarih: 'DATE', saat: 'TIME', grup: 'GROUP', toplamlar: 'CURRSEL_TOTALS', proje: 'PROJECT_CODE', satirlar: 'TRANSACTIONS',
  kod: 'ITEM_CODE', miktar: 'QUANTITY', birim: 'UNIT_CODE', carpan1: 'UNIT_CONV1', carpan2: 'UNIT_CONV2', satirTuru: 'LINE_TYPE', satirNo: 'LINE_NUMBER',
  aciklama: 'DESCRIPTION',
});
// Başlık GROUP 3 (malzeme fişi), CURRSEL_TOTALS 1; satır türü 0 (malzeme).
const MALZEME_FISI_GRUBU = 3;
const MALZEME_FISI_ACIKLAMA_EN_COK = 50;

export interface GonderilecekMalzemeFisi {
  id: number;
  tur: 'sarf-fisi' | 'uretim-girisi';
  no: string;
  tarih: string;
  // HH:mm:ss; yoksa TIME gönderilmez.
  saat: string | null;
  projeKodu: string | null;
  satirlar: readonly { satirId: number; stokKodu: string; miktar: string; birim: string; aciklama: string | null }[];
}

// 335: emir başına tek sarf ve tek üretimden giriş fişi; numara emir numarasıdır (iki fiş türü Logo'da ayrı numaralanır, VARSAYIM). Sarf stoktaki
// net sarftır (fire dahil); üretimden giriş net girişe emrin mamul hurdasını ayrı "Hurda" satırıyla ekler. Kartı ya da birimi olmayan satır boş
// metinle kalır: gövde kuralı fişi nedeniyle reddeder, sessizce düşmez. Satırı olmayan fiş null (gönderilecek bir şey yok).
export interface EmirFisKalemi { stokKodu: string | null; birim: string | null; miktar: string }
export interface EmirFisVerisi {
  emirNo: string;
  tarih: string;
  saat: string | null;
  sarf: readonly EmirFisKalemi[];
  giris: readonly EmirFisKalemi[];
  hurda: readonly EmirFisKalemi[];
}
export const HURDA_SATIRI_ACIKLAMASI = 'Hurda';

export function emirMalzemeFisi(id: number, tur: 'sarf-fisi' | 'uretim-girisi', v: EmirFisVerisi): GonderilecekMalzemeFisi | null {
  const kalemler = tur === 'sarf-fisi'
    ? v.sarf.map((k) => ({ k, aciklama: null }))
    : [...v.giris.map((k) => ({ k, aciklama: null })), ...v.hurda.map((k) => ({ k, aciklama: HURDA_SATIRI_ACIKLAMASI }))];
  const satirlar = kalemler
    .filter(({ k }) => !ONDALIK.test(k.miktar) || olcekli(k.miktar) !== 0n)
    .map(({ k, aciklama }, i) => ({ satirId: i + 1, stokKodu: k.stokKodu ?? '', miktar: k.miktar, birim: k.birim ?? '', aciklama }));
  if (satirlar.length === 0) return null;
  return { id, tur, no: v.emirNo, tarih: v.tarih, saat: v.saat, projeKodu: null, satirlar };
}

// 233: Logo'daki fişin satırlarının özeti; aynı özet yeniden gönderilmez. Miktar ölçekli sayıyla karşılaştırılır ("2.50" ile "2.5" aynı).
export function malzemeFisiOzeti(f: GonderilecekMalzemeFisi): string {
  return JSON.stringify(f.satirlar.map((x) => [x.stokKodu.trim(), ONDALIK.test(x.miktar) ? String(olcekli(x.miktar)) : x.miktar, x.birim.trim(), x.aciklama]));
}

export function malzemeFisiGovdesi(f: GonderilecekMalzemeFisi): { govde: Record<string, unknown> } | { hata: string } {
  const a = MALZEME_FISI_ALANLARI;
  const no = f.no.trim();
  if (no === '' || no.length > FIS_NO_EN_COK) return { hata: `Fiş numarası 1-${FIS_NO_EN_COK} karakter olmalı.` };
  const tarih = logoTarihi(f.tarih);
  if (tarih === null) return { hata: 'Fiş tarihi yok.' };
  if (f.saat !== null && !/^\d{2}:\d{2}:\d{2}$/.test(f.saat)) return { hata: 'Fiş saati HH:mm:ss olmalı.' };
  if (f.satirlar.length === 0) return { hata: 'Fişin satırı yok.' };
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
  govde[a.satirlar] = satirlar;
  return { govde };
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
  okuma?: 'mal-kabul' | 'cari-ambar' | 'fatura';
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
    belgeTurleri: ['satis-teklifi', 'satis-siparisi'], aciklama: 'Portaldaki teklif SalesOffer olarak, kabul edilen sipariş tekliften açılır.' },
  { anahtar: 'malzeme-fisi', yon: 'tmi-logo', baslik: 'Sarf ve üretimden giriş fişi', kaynak: 'bagli', ayarlar: ['logo.malzeme-fisi-gonderimi'],
    belgeTurleri: ['sarf-fisi', 'uretim-girisi'],
    aciklama: 'Biten üretim emri, anahtar açıkken, MaterialSlip AddConsumption (12) ve AddProductionEntry (13) ile emir başına bir kez gider; satırlar stoktaki net sarf ve giriş ile emrin hurdasıdır.' },
  { anahtar: 'birim-setleri', yon: 'logo-tmi', baslik: 'Birim seti listesi', kaynak: 'bagli', ayarlar: [], belgeTurleri: [],
    aciklama: 'Saatte bir Lookup/unitsets okunur; malzeme gönderiminde birim karşılığı buna göre denetlenir.' },
  { anahtar: 'mal-kabul', yon: 'logo-tmi', baslik: 'Mal kabul (irsaliye satırları)', kaynak: 'bagli', ayarlar: ['logo.mal-kabul-okumasi'], belgeTurleri: [], okuma: 'mal-kabul',
    aciklama: 'Dakikada bir PurchaseOrder/receipts okunur (since imleciyle); satırlar yalnız saklanır, stoka ya da satın almaya işlenmez. Gönderilen sütunu okunan satır sayısıdır.' },
  { anahtar: 'cari-depo', yon: 'logo-tmi', baslik: 'Cari ve ambar listeleri', kaynak: 'bagli', ayarlar: ['logo.liste-okumasi'], belgeTurleri: [], okuma: 'cari-ambar',
    aciklama: 'Saatte bir Arp/list ve Lookup/warehouses okunup önbelleğe (kod, ad) yazılır. Gönderilen sütunu okunan kayıt sayısıdır.' },
  { anahtar: 'fatura', yon: 'logo-tmi', baslik: 'Fatura ve irsaliye', kaynak: 'bagli', ayarlar: ['logo.fatura-okumasi'], belgeTurleri: [], okuma: 'fatura',
    aciklama: 'Logo\'ya giden satın alma siparişlerinin faturaları (PurchaseOrder/{no}/invoices) sırayla okunup saklanır; Logo\'ya hiç yazılmaz. Okunacak sipariş, bu sürümden sonra Logo\'da açılan satın alma siparişleridir. Gönderilen sütunu okunan fatura sayısıdır.' },
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
