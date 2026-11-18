import { createHash } from 'node:crypto';
import { LOGO_IRSALIYE_TURLERI, type IRSALIYE_ESLESME_DURUMLARI, type SiparisLogoKalemDurumu } from '#paylasilan/sozlesme/logo.ts';
import type { FisGonderimSekli, LogoFisBilgisi, LogoFisDurumu, MalzemeFisiTuru } from '#paylasilan/sozlesme/stok.ts';
import type { LogoBelgeAramaTuru, LogoRozetDurumu, LogoRozetTuru } from '#paylasilan/sozlesme/logo.ts';

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
  // crmKodlari: yalnız CRM satış müşterisi okumasında, cariye bağlı CRM müşteri kodları ve toplam bağ sayısı (eski yardımcıda yok: null).
  | { tur: 'basarili'; logicalRef: number | null; logoAdi?: string | null; crmKodlari?: CrmKodlari | null }
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

export const ESKI_YARDIMCI_ILETISI = 'Logo bilgisayarındaki yardımcı program eski sürümde; bu işlem için güncellenmesi gerekir.';

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
  // Yardımcı tanımadığı yola 404 "Not found" döner (kayıt yok 404'leri "Material not found" gibi kendi metnini taşır): istek Logo'ya hiç
  // gitmemiştir, reddeden Logo değil eski yardımcıdır (3195).
  if (durum === 404 && metinMi(govde.error) && govde.error.trim() === 'Not found') return { tur: 'reddedildi', ileti: ESKI_YARDIMCI_ILETISI };
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
export const MALZEME_GONDERIM_AYARI = 'logo.malzeme-gonderimi';
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

// 3313: giden kutusu sonuçları ve sınıfları. Logo'nun kesin reddi kalıcıdır: belge kendiliğinden yeniden denenmez ("Durdu"), kullanıcı veriyi
// düzeltip "Yeniden gönder" der ya da sahibi modül belgeyi yeniden sıraya koyar. Bağlantı, anahtar, belirsiz cevap ve CORE'a yazılamama artan
// beklemeyle kendiliğinden yinelenir. Yeni sonuç eklenince sınıfı burada seçilmeden derlenmez.
export const GIDEN_SONUCLARI = ['gonderildi', 'zaten-vardi', 'silindi', 'reddedildi', 'yetkisiz', 'ulasilamadi', 'belirsiz', 'yazilamadi'] as const;
export type GidenSonucu = (typeof GIDEN_SONUCLARI)[number];
export type SonucSinifi = 'basari' | 'durdu' | 'yinelenir';
export const SONUC_SINIFI: Readonly<Record<GidenSonucu, SonucSinifi>> = Object.freeze({
  gonderildi: 'basari', 'zaten-vardi': 'basari', silindi: 'basari',
  reddedildi: 'durdu',
  yetkisiz: 'yinelenir', ulasilamadi: 'yinelenir', belirsiz: 'yinelenir', yazilamadi: 'yinelenir',
});
// Kalıcı sonuçta sonraki deneme yazılmaz; "Durdu" = son sonuç kalıcı ve sonraki deneme boş. Yeniden gönderme sonraki denemeyi doldurur.
export const sonrakiDenemeYazilir = (sonuc: GidenSonucu, bekleme: Date | null): Date | null => (SONUC_SINIFI[sonuc] === 'durdu' ? null : bekleme);
export function durduMu(g: { sonSonuc?: GidenSonucu | null; sonrakiDeneme: Date | null } | null): boolean {
  return g !== null && g.sonSonuc != null && SONUC_SINIFI[g.sonSonuc] === 'durdu' && g.sonrakiDeneme === null;
}
// Tur bu belgeye bakar mı: durmamış ve bekleme dolmuş (ya da hiç beklemesi yok).
export function denemeZamaniMi(g: { sonSonuc?: GidenSonucu | null; sonrakiDeneme: Date | null } | null, simdi: Date): boolean {
  if (g === null) return true;
  if (durduMu(g)) return false;
  return g.sonrakiDeneme === null || g.sonrakiDeneme.getTime() <= simdi.getTime();
}

// 3313: bağlantı izleme. Başarıyla gitmemiş giden kutusu satırının ekrandaki durumu ve ne yapılacağı tek yerde; "Yeniden gönder" yalnız
// duran belgede (belirsiz sonuç elle öne alınmaz; kart bekleyen belge kart gidince kendiliğinden gider). Başarılı satır izlemeye girmez (sorgu dışlar).
export type GidenIzlemeDurumu = 'durdu' | 'yeniden-denenecek' | 'kart-bekliyor' | 'proje-bekliyor' | 'sirada';
export function gidenIzlemeDurumu(g: { sonSonuc: GidenSonucu | null; sonrakiDeneme: Date | null }): Exclude<GidenIzlemeDurumu, 'kart-bekliyor' | 'proje-bekliyor'> {
  if (g.sonSonuc === null) return 'sirada';
  if (durduMu(g)) return 'durdu';
  return SONUC_SINIFI[g.sonSonuc] === 'durdu' ? 'sirada' : 'yeniden-denenecek';
}
export const GIDEN_NE_YAPMALI: Readonly<Record<GidenIzlemeDurumu, string>> = Object.freeze({
  durdu: 'Logo reddetti. Nedeni düzeltin (kart, cari, eşleme ya da belge), sonra "Yeniden gönder".',
  'yeniden-denenecek': 'Bir şey yapmanız gerekmez: kendiliğinden yeniden denenir. Uzun sürerse Logo yardımcısının çalıştığını denetleyin.',
  'proje-bekliyor': 'Bir şey yapmanız gerekmez: proje Logo\'ya gidince belge kendiliğinden gider. Proje durduysa izlemedeki "Proje kartı" satırına bakın.',
  'kart-bekliyor': 'Eksik kartı Logo\'ya gönderin; kart Logo\'da varsa Logo geçişinde kodla canlı arayıp bağlayın. Belge kendiliğinden gider.',
  sirada: 'Sırada; ilk turda gider.',
});
// 3313 (Arayüz kod bakışı 2c): duran belgede "Ne yapmalı" nedene göre kısa adımdır. Neden CORE'un kendi ret iletisi ya da Logo'nun hata
// metnidir; tanınmayan nedende genel adım kalır. Sıra önemlidir: daha özel kalıp önce.
const DURDU_ADIMLARI: readonly (readonly [RegExp, string])[] = [
  [/hizmet satırı/i, 'Talep fişinden hizmet satırını çıkarın (hizmet satın alma siparişiyle gider), sonra "Yeniden gönder".'],
  [/hizmet kartının yönü/i, 'Hizmet kartında yönü (alış ya da satış) seçin, sonra "Yeniden gönder".'],
  [/cari/i, 'Firma kartında Logo cari kodunu doldurun ya da cariyi Logo\'da tanımlayın, sonra "Yeniden gönder".'],
  [/birim/i, 'Malzeme kartının birimini ya da Sistem Ayarları\'ndaki birim karşılığını düzeltin, sonra "Yeniden gönder".'],
  [/satırlar.*tutmuyor|elle bakın/i, 'Belgeye Logo\'da elle bakın ve farkı giderin, sonra "Yeniden gönder".'],
  [/kayıt numarası/i, 'Belgenin Logo kaydını Logo\'da denetleyin; kayıt silinmişse belgeyi CORE\'da yeniden onaylayın.'],
  [/kart|malzeme|stok kodu/i, 'Kartı Logo geçişinde kodla canlı arayıp eşleyin ya da kartı Logo\'ya gönderin, sonra "Yeniden gönder".'],
];
export function durduNeYapmali(neden: string | null): string {
  const bulunan = neden === null ? undefined : DURDU_ADIMLARI.find(([kalip]) => kalip.test(neden));
  return bulunan?.[1] ?? GIDEN_NE_YAPMALI.durdu;
}
export const GIDEN_BELGE_ADLARI: Readonly<Record<string, string>> = Object.freeze({
  malzeme: 'Malzeme kartı', hizmet: 'Hizmet kartı', 'malzeme-guncelleme': 'Malzeme adı güncellemesi',
  siparis: 'Satın alma siparişi', 'siparis-guncelleme': 'Sipariş düzenlemesi', 'siparis-kapatma': 'Sipariş kapatma', 'siparis-bekletme': 'Sipariş bekletme',
  'siparis-iptal': 'Sipariş iptali', talep: 'Talep fişi', karsilama: 'Talep karşılama', 'satis-teklifi': 'Satış teklifi', 'satis-siparisi': 'Satış siparişi',
  'siparisler-teklifi': 'Satış teklifi', 'siparisler-siparisi': 'Satış siparişi', 'sarf-fisi': 'Sarf fişi', 'uretim-girisi': 'Üretimden giriş fişi',
  'fire-fisi': 'Fire fişi', 'ambar-fisi': 'Ambar transferi', 'sayim-fazlasi': 'Sayım fazlası fişi', 'sayim-eksigi': 'Sayım eksiği fişi',
  proje: 'Proje kartı',
});
export const gidenBelgeAdi = (belge: string, islem: 'gonder' | 'pasif'): string =>
  `${GIDEN_BELGE_ADLARI[belge] ?? belge}${islem === 'pasif' ? ' (pasife alma)' : ''}`;

// 3313: satır kartı denetimi. Kart Logo'da sayılır: CORE kartında Logo kaydı var (gönderildi, bağlandı, Logo'dan alındı) ya da Logo
// kodu okunmuş kopyada. Eksik kart varsa belge gitmez ve deneme sayılmaz; kart gidince belge kendiliğinden gider.
export function logodaOlmayanKartlar(
  kodlar: readonly string[], durumlar: ReadonlyMap<string, { logoKayitli: boolean }>, logoKodu: (k: string) => string, aynada: ReadonlySet<string>,
): string[] {
  return [...new Set(kodlar)].filter((k) => durumlar.get(k)?.logoKayitli !== true && !aynada.has(logoKodu(k)));
}
export function kartBekliyorMetni(eksik: readonly string[]): string {
  const ilk = eksik.slice(0, 5).join(', ');
  const kalan = eksik.length > 5 ? ` ve ${eksik.length - 5} kart daha` : '';
  return kirp(`Kart bekliyor: ${ilk}${kalan}. Kart Logo'ya gidince (ya da Logo geçişinde bağlanınca) belge kendiliğinden gider.`);
}
// 3315 madde 8: belgenin sahibine yazılan tam metin; izlemedeki Neden sütunu durumu tekrarlamaz.
export const projeBekliyorMetni = (kod: string): string => kirp(`Proje bekliyor: ${kod}. Proje Logo'ya gidince belge kendiliğinden gider.`);
export const projeBekliyorNedeni = (kod: string): string => kirp(`${kod} Logo'ya gidince belge kendiliğinden gider.`);
// Gövde kuralı hata verdiyse olduğu gibi döner; proje kodu yalnız doluysa eklenir (yardımcı alanı yoksa yazmaz).
// 3315 VARSAYIM: satış siparişinin tek projesi varsa onun kodu gider; projesiz ya da çok projeli sipariş projesiz gider.
export function satisSiparisiProjesi(projeler: readonly { id: number }[]): number | null {
  return projeler.length === 1 ? projeler[0]!.id : null;
}

export function projeliGovde<G extends Record<string, unknown>>(r: { govde: G } | { hata: string }, projeKodu: string | null): { govde: G } | { hata: string } {
  if ('hata' in r || projeKodu === null) return r;
  return { govde: { ...r.govde, projectCode: projeKodu } };
}
export const TALEP_HIZMET_ILETISI = 'Talep fişine hizmet satırı yazılamaz; hizmet satırını talepten çıkarın ya da satın alma siparişiyle gönderin.';

export interface GidenDurumu {
  // Dolu iken bu kart için Logo'da kart açılmış olabilir (niyet yazılı ve kalıcı; açma isteği ondan sonra gider).
  niyetZamani: Date | null;
  sonrakiDeneme: Date | null;
  sonSonuc?: GidenSonucu | null;
}

export type KartEylemi = 'niyet-yaz' | 'gonder' | 'bekle';

// Çift gönderim kalkanı:
// 1. Açma isteğinden önce niyet ayrı bir turda kalıcı yazılır. Niyet yalnız onu yazan süreçte ve bir kez "taze" sayılır.
// 2. Taze olmayan niyet (başka süreç, yeniden başlayan süreç, sonucu bilinmeyen deneme) BELIRSIZ_BEKLEME_MS dolmadan gönderilmez.
// 3. Her gönderim "var mı" okumasıyla başlar; varsa yeni kart açılmaz.
export function kartEylemi(g: GidenDurumu | null, simdi: Date, tazeNiyet: boolean, sonAcmaIstegi: Date | null): KartEylemi {
  if (!denemeZamaniMi(g, simdi)) return 'bekle';
  if (sonAcmaIstegi && simdi.getTime() - sonAcmaIstegi.getTime() < BELIRSIZ_BEKLEME_MS) return 'bekle';
  if (!g?.niyetZamani) return 'niyet-yaz';
  if (tazeNiyet) return 'gonder';
  return simdi.getTime() - g.niyetZamani.getTime() >= BELIRSIZ_BEKLEME_MS ? 'gonder' : 'bekle';
}

/* ---------------- Proje kartı (3315 c) ---------------- */

// CORE proje kodu Logo'ya aynen gider (eşleme yok); 24 CORE'un kod kısıtıdır, Logo proje kodu sınırı DOĞRULANMADI (yardımcıda da 24).
export const PROJE_KODU_EN_COK = 24;
export const PROJE_AYARI = 'logo.proje-gonderimi';
export const PROJE_KURULUM_ILETISI = 'Logo yardımcısında proje kartı açık değil (ayar dosyasında proje_nesnesi yok ya da yardımcı eski); projeler bekliyor.';
export interface GonderilecekProje {
  id: number;
  kod: string;
  ad: string;
}
export function projeGovdesi(p: GonderilecekProje): { govde: { code: string; name: string } } | { hata: string } {
  const kod = p.kod.trim();
  if (kod === '' || kod.length > PROJE_KODU_EN_COK) return { hata: `Proje kodu 1-${PROJE_KODU_EN_COK} karakter olmalı.` };
  const ad = p.ad.trim();
  if (ad === '') return { hata: 'Projenin adı yok.' };
  return { govde: { code: kod, name: ad } };
}

/* ---------------- Satın alma siparişi (#205 karar 1; kullanıcının köprü notu, 2.3) ---------------- */

// Logo fiş numarası en çok 16 karakter (not 2.3); TMI numarası (SP-YYYY-NNN) sığar.
export const FIS_NO_EN_COK = 16;
// ORDER_STATUS: 1 öneri, 4 sevk edilebilir. TMI'de onaylanıp verilmiş sipariş Logo'da sevk edilebilir açılır (VARSAYIM).
export const SIPARIS_LOGO_DURUMU = 4;
// 2972-1 b: "Logo'da beklet" = 1 (öneri, kesinleşmemiş sipariş), "serbest bırak" = 4 (açılıştaki durum).
export const SIPARIS_BEKLETME_DURUMLARI = { beklet: 1, serbest: SIPARIS_LOGO_DURUMU } as const;
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
  // 3315: siparişin CORE projesi (talebinin projesi); yoksa null.
  projeId?: number | null;
}

export interface SiparisGovdeSecenegi {
  // Firmanın Logo cari kodu (finans); boşsa sipariş gönderilmez.
  cariKodu: string | null;
  // Malzeme ve hizmet satırının KDV oranı (logo.kdv-orani, logo.hizmet-kdv-orani); boşsa gönderilmez.
  kdv: number | null;
  hizmetKdv: number | null;
  // 3391-2 a: yalnız satış teklifinde, firma kartında seçilmiş CRM satış müşterisi kodu; yoksa yardımcı bağ sırasının ilkini kullanır.
  crmKodu?: string | null;
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

// Bekletme Logo'ya düzenleme gövdesiyle ve durumla gider (yardımcı ORDER_STATUS'u yalnız düzenlemede yazar). Kuyruk yalnız bütün satırları
// Logo'da numaralı ve sırada düzenlemesi olmayan siparişi verir; burada yine de numarasız satır reddedilir, yoksa Logo'ya yeni satır eklenirdi.
export function bekletmeGovdesi(
  s: Parameters<typeof siparisGuncellemeGovdesi>[0], o: SiparisGovdeSecenegi, istek: keyof typeof SIPARIS_BEKLETME_DURUMLARI,
): { govde: Record<string, unknown> } | { hata: string } {
  if (s.satirlar.some((x) => x.logoSatirRef === null)) return { hata: 'Siparişte Logo\'ya henüz gitmemiş satır var; önce düzenleme gitmeli.' };
  const r = siparisGuncellemeGovdesi(s, o);
  return 'hata' in r ? r : { govde: { ...r.govde, [SIPARIS_ALANLARI.durum]: SIPARIS_BEKLETME_DURUMLARI[istek] } };
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
  // 3315: talebin CORE projesi (2611 a); yoksa null.
  projeId?: number | null;
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
  crm: 'salesCustomerCode',
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
  const crm = o.crmKodu?.trim() ?? '';
  if (crm !== '') govde[a.crm] = crm;
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
  // 3315: Siparişler'deki sipariş kimliği; projesi buradan bulunur.
  siparisId?: number | null;
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

// 3079 a: kartın kullanım izi; tarih gün metni (yyyy-mm-dd), hareketsiz kartta null.
export interface LogoKullanimSatiri {
  malzemeKodu: string;
  sonHareket: string | null;
  acikSiparis: boolean;
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
function malzemeKartiAyikla(o: Record<string, unknown>): LogoMalzemeKarti | null {
  const logoKayitNo = kayitNumarasi(o, ['logicalRef']);
  const kod = ilkMetin(o, ['code'], 64);
  if (logoKayitNo === null || kod === null) return null;
  const tur = ilkSayi(o, ['cardType']);
  return {
    logoKayitNo, kod, ad: ilkMetin(o, ['name'], 200), aciklama2: ilkMetin(o, ['name3'], 200), aciklama3: ilkMetin(o, ['name4'], 200),
    kartTuru: tur !== null && Number.isSafeInteger(tur) ? tur : null, birimSeti: ilkMetin(o, ['unitSetCode'], 40), aktif: aktifMi(o),
  };
}
export function malzemeKartlariniAyikla(govde: unknown): Sayfa<LogoMalzemeKarti> | null {
  return sayfaAyikla(govde, malzemeKartiAyikla);
}
// 3080 a: arama cevabı düz dizidir; kullanım dışı satır yardımcıdan gelmez, gelse de alınmaz.
export function malzemeAramasiniAyikla(govde: unknown): LogoMalzemeKarti[] | null {
  if (!Array.isArray(govde)) return null;
  return govde.map((o) => (kayitMi(o) ? malzemeKartiAyikla(o) : null)).filter((k): k is LogoMalzemeKarti => k !== null && k.aktif);
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

const GUN_METNI = /^\d{4}-\d{2}-\d{2}$/;
export function kullanimlariAyikla(govde: unknown): Sayfa<LogoKullanimSatiri> | null {
  return sayfaAyikla(govde, (o) => {
    const malzemeKodu = ilkMetin(o, ['itemCode'], 64);
    const tarih = o['lastMovement'];
    const acik = o['openOrder'];
    if (malzemeKodu === null || typeof acik !== 'boolean') return null;
    if (tarih !== null && !(typeof tarih === 'string' && GUN_METNI.test(tarih) && !Number.isNaN(Date.parse(tarih)))) return null;
    return { malzemeKodu, sonHareket: tarih, acikSiparis: acik };
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

// 3360 a: yardımcının belge araması (araclar/logo-yardimcisi Islemler.cs BelgeAra): dizi; tür adları yardımcıdakiyle aynı.
export const BELGE_ARAMA_TURU: Readonly<Record<LogoBelgeAramaTuru, string>> = Object.freeze({
  proje: 'project', 'satis-siparisi': 'salesOrder', teklif: 'salesOffer', talep: 'demand', 'satin-alma-siparisi': 'purchaseOrder',
});
// Giden kutusunda aynı Logo kaydına gitmiş CORE belgesinin türü (CORE karşılığı için).
export const BELGE_ARAMA_GIDEN_TURU: Readonly<Record<LogoBelgeAramaTuru, string>> = Object.freeze({
  proje: 'proje', 'satis-siparisi': 'siparisler-siparisi', teklif: 'siparisler-teklifi', talep: 'talep', 'satin-alma-siparisi': 'siparis',
});
export interface LogoBelgeBulgusuHam {
  logoKayitNo: number; no: string | null; belgeNo: string | null; tarih: string | null; cariKodu: string | null; cariAdi: string | null;
  projeKodu: string | null; projeAdi: string | null; aciklama: string | null; tutar: string | null; dovizTuru: number | null; iptal: boolean;
  satirlar: { kod: string | null; ad: string | null; miktar: string | null; birim: string | null; aciklama: string | null }[];
  satirSayisi: number;
}
// 3360-2 a: Logo'ya elle girilmiş belge CORE belgesine elle bağlanır; bağlanan belge ve ondan doğan belgeler bir daha gönderilmez,
// sonraki değişiklik Logo'da elle yapılır (kullanıcı cevabı "yalnız işaretlensin"). Kural: satış teklifi ve siparişinde aynı cari;
// projede aynı proje kodu (Logo projesinde cari yoktur). İptal edilmiş ya da başka CORE belgesine bağlı kayıt bağlanmaz.
export const ELLE_BAGLI_TEKLIF_SURUMU = "Teklifin önceki sürümü Logo'ya elle bağlandı; bu sürüm gönderilmez. Logo'ya elle girip Logo'da ara ile bağlayın.";
export const ELLE_BAGLI_TEKLIF_SIPARISI = "Teklif Logo'ya elle bağlandı; sipariş gönderilmez. Siparişi Logo'da elle açıp Logo'da ara ile bağlayın.";
const kodEsit = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a.trim() !== '' && a.trim().toLocaleUpperCase('tr') === b.trim().toLocaleUpperCase('tr');
export function baglamaUyumu(
  tur: 'proje' | 'satis-siparisi' | 'teklif', core: { cariKodu: string | null; projeKodu: string | null },
  logo: { iptal: boolean; cariKodu: string | null; projeKodu: string | null; baskaBagli: boolean },
): string | null {
  if (logo.baskaBagli) return 'Başka bir CORE belgesine bağlı; bağlanamaz.';
  if (logo.iptal) return "Logo'da iptal ya da pasif; bağlanamaz.";
  if (tur === 'proje') return kodEsit(core.projeKodu, logo.projeKodu) ? null : 'Proje kodu farklı; bağlanamaz.';
  if (core.cariKodu === null || core.cariKodu.trim() === '') return 'Firmanın Logo cari kodu yok; bağlanamaz.';
  return kodEsit(core.cariKodu, logo.cariKodu) ? null : 'Cari farklı; bağlanamaz.';
}
// CORE belgesi bağlanabilir mi (giden izi ve sahibi modülün sırası). Sırası yoksa belge Logo'ya gidecek durumda değildir.
export function baglanacakEngeli(
  g: { sonSonuc: GidenSonucu | null; niyetZamani: Date | null; logoKayitNo: string | null } | null, sira: { durum: string; logoKayitNo: string | null } | null | undefined,
): string | null {
  if (sira === null) return "Belge henüz Logo'ya gidecek durumda değil (teklif verilmedi ya da sipariş onaylanmadı).";
  const kayit = g?.logoKayitNo ?? sira?.logoKayitNo ?? null;
  if (kayit !== null || sira?.durum === 'gonderildi') return `Belge zaten Logo'da${kayit === null ? '' : ` (kayıt ${kayit})`}.`;
  if (g?.niyetZamani != null) return "Belge şu an Logo'ya gönderiliyor; sonuç gelince yeniden bakın.";
  return null;
}
const miktarMetni = (d: number | null): string | null => (d === null || !Number.isFinite(d) ? null : String(Math.round(d * 1e6) / 1e6));
export function belgeBulgulariniAyikla(govde: unknown): LogoBelgeBulgusuHam[] | null {
  if (!Array.isArray(govde)) return null;
  const sonuc: LogoBelgeBulgusuHam[] = [];
  for (const o of govde) {
    if (!kayitMi(o)) continue;
    const ref = ilkSayi(o, ['logicalRef']);
    if (ref === null || !Number.isSafeInteger(ref) || ref <= 0) continue;
    const tarih = ilkMetin(o, ['date'], 10);
    const doviz = ilkSayi(o, ['currency']);
    const satirlar = (Array.isArray(o['matchedLines']) ? o['matchedLines'] : []).filter(kayitMi).slice(0, 5).map((x) => ({
      kod: ilkMetin(x, ['code'], 64), ad: ilkMetin(x, ['name'], 200), miktar: miktarMetni(ilkSayi(x, ['amount'])),
      birim: ilkMetin(x, ['unit'], 20), aciklama: ilkMetin(x, ['description'], 250),
    }));
    const sayi = ilkSayi(o, ['matchedLineCount']);
    sonuc.push({
      logoKayitNo: ref, no: ilkMetin(o, ['number'], 40), belgeNo: ilkMetin(o, ['docNumber'], 40),
      tarih: tarih !== null && GUN_METNI.test(tarih) && !Number.isNaN(Date.parse(tarih)) ? tarih : null,
      cariKodu: ilkMetin(o, ['arpCode'], 64), cariAdi: ilkMetin(o, ['arpName'], 200),
      projeKodu: ilkMetin(o, ['projectCode'], 64), projeAdi: ilkMetin(o, ['projectName'], 200),
      aciklama: ilkMetin(o, ['description'], 250), tutar: miktarMetni(ilkSayi(o, ['netTotal'])),
      dovizTuru: doviz !== null && Number.isSafeInteger(doviz) && doviz > 0 ? doviz : null,
      iptal: o['cancelled'] === true,
      satirlar, satirSayisi: sayi !== null && Number.isSafeInteger(sayi) && sayi >= satirlar.length ? sayi : satirlar.length,
    });
    if (sonuc.length >= 50) break;
  }
  return sonuc;
}

// Cari arama metni: yardımcı en az 3, en çok 100 karakter kabul eder.
export const CARI_ARAMA_EN_AZ = 3;
export const CARI_ARAMA_EN_COK = 100;
// 3077 a: kopya yalnız geçiş içindir; tam tur kendiliğinden yinelenmez. Okuma ilk açılışta bir kez; ayar kapatılıp açılınca
// yeniden tam tur (3316-K2 a); arada kart canlı aramayla aynaya eklenir. Tur sürerken sonraki sayfa bir sonraki iş turunda okunur.
export function sayfaliOkumaSirasi(
  i: { sonRef: number; sonTamam: Date | null; turIstendi: boolean } | null,
): 'devam' | 'bastan' | 'bekle' {
  if (i !== null && i.sonRef > 0) return 'devam';
  if (i === null || i.sonTamam === null || i.turIstendi) return 'bastan';
  return 'bekle';
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
  // 'hepsi': anahtarların hepsi açık olmalı (yeni Logo işi kendi anahtarı ve bağlı olduğu gönderim anahtarıyla, 2971).
  ayarKosulu?: 'biri' | 'hepsi';
  // logo_giden belge türleri; sayılar bunlardan toplanır.
  belgeTurleri: readonly string[];
  // Okuma akışı (logo -> TMI): sayı giden kutusundan değil okunan satırlardan gelir; `gonderilen` okunan satır sayısıdır, `hatali` yoktur.
  okuma?: 'mal-kabul' | 'cari-ambar' | 'fatura' | 'malzeme-karti' | 'stok' | 'kullanim' | 'malzeme-arama' | 'cari' | 'son-alis';
}

export const LOGO_AKISLARI: readonly LogoAkisTanimi[] = [
  { anahtar: 'malzeme-karti', yon: 'tmi-logo', baslik: 'Malzeme kartı', kaynak: 'bagli', ayarlar: [MALZEME_GONDERIM_AYARI], belgeTurleri: ['malzeme'],
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
  { anahtar: 'proje-karti', yon: 'tmi-logo', baslik: 'Proje kartı', kaynak: 'bagli', ayarlar: ['logo.proje-gonderimi'], belgeTurleri: ['proje'],
    aciklama: 'Aktif CORE projesi Logo\'da aynı kodla açılır (Project/AddRich); önce "var mı" okunur, varsa bağlanır. Yardımcının ayar dosyasında proje_nesnesi yazılı olmalı.' },
  { anahtar: 'malzeme-fisi', yon: 'tmi-logo', baslik: 'Malzeme fişi', kaynak: 'bagli', ayarlar: ['logo.malzeme-fisi-gonderimi'],
    belgeTurleri: [...LOGO_FIS_TURLERI],
    aciklama: 'Stok\'taki malzeme fişleri (sarf, üretimden giriş, fire, sayım fazlası ve eksiği, ambar transferi) MaterialSlip uçlarıyla gider; her türün gönderim şekli (kapalı, otomatik, elle) ayrı ayardadır. Değişen fiş Logo\'da silinip aynı numarayla yeniden açılır.' },
  // 2971: 2961 ile gelen işler; her biri kendi anahtarıyla, varsayılan kapalı. Yazan iş bağlı olduğu gönderim anahtarını da taşır ve ikisi
  // birden açık olmalıdır; gönderim anahtarı açık olsa da iş kendiliğinden başlamaz. Kod bağlanınca rozet "kapalı" ile başlar.
  { anahtar: 'siparis-durumu', yon: 'tmi-logo', baslik: 'Siparişi Logo\'da beklet', kaynak: 'bagli', ayarlar: ['logo.siparis-bekletme-gonderimi', 'logo.satin-alma-gonderimi'], ayarKosulu: 'hepsi',
    belgeTurleri: ['siparis-bekletme'], aciklama: 'Satın alma siparişindeki "Logo\'da beklet" siparişi Logo\'da öneri (kesinleşmemiş) durumuna çeker, "Logo\'da serbest bırak" geri alır.' },
  { anahtar: 'talep-iptali', yon: 'tmi-logo', baslik: 'Talep fişi iptali', kaynak: 'kodda-yok', ayarlar: ['logo.talep-iptali-gonderimi', 'logo.satin-alma-gonderimi'], ayarKosulu: 'hepsi', belgeTurleri: [],
    aciklama: 'CORE\'da iptal edilen talebin Logo fişi öneriye geri alınır (Logo\'da iptal durumu yok); iptal geri alınınca yeniden onaylanır.' },
  { anahtar: 'teklif-kapatma', yon: 'tmi-logo', baslik: 'Satış teklifi kapatma', kaynak: 'kodda-yok', ayarlar: ['logo.teklif-kapatma-gonderimi', 'logo.satis-gonderimi'], ayarKosulu: 'hepsi', belgeTurleri: [],
    aciklama: 'Reddedilen teklif ve yeni sürümü gelen teklifin eskisi Logo\'da kapanır.' },
  { anahtar: 'malzeme-hareketleri', yon: 'logo-tmi', baslik: 'Malzeme hareketleri', kaynak: 'bagli', ayarlar: ['logo.malzeme-hareketleri-okumasi'], belgeTurleri: [],
    aciklama: 'Malzeme kartının "Logo\'da" bölümünde Logo\'daki giriş ve çıkışlar "Hareketleri oku" denince okunur (son 20, sonra daha eskiler).' },
  { anahtar: 'son-alis-fiyatlari', yon: 'logo-tmi', baslik: 'Son alış fiyatları', kaynak: 'bagli', ayarlar: ['logo.son-alis-fiyatlari-okumasi'], belgeTurleri: [],
    aciklama: 'Malzemenin son alış faturası fiyatları istenince okunur; yalnız fiyat görene açılır.' },
  { anahtar: 'son-alis-kopyasi', yon: 'logo-tmi', baslik: 'Son alış fiyatı kopyası', kaynak: 'bagli', ayarlar: ['logo.son-alis-okumasi'], belgeTurleri: [], okuma: 'son-alis',
    aciklama: 'Logo alış faturası satırları (Material/purchases) sayfa sayfa, yetişince saatte bir okunup CORE\'da kopyalanır (yalnız eklenir). Teklif ve proje maliyetinde fiyatı bilinmeyen malzemeye "Logo son alış" önerisi buradan gelir, hesaba girmez. Logo\'ya yazılmaz. Sayı kopyadaki satır sayısıdır.' },
  { anahtar: 'sozlukler', yon: 'logo-tmi', baslik: 'Ödeme planı, masraf merkezi, proje, kur', kaynak: 'kodda-yok', ayarlar: ['logo.sozluk-okumasi'], belgeTurleri: [],
    aciklama: 'Formlardaki seçim listeleri ve günün kurları Logo\'dan okunur.' },
  { anahtar: 'birim-setleri', yon: 'logo-tmi', baslik: 'Birim seti listesi', kaynak: 'bagli', ayarlar: [], belgeTurleri: [],
    aciklama: 'Saatte bir Lookup/unitsets okunur; malzeme gönderiminde birim karşılığı buna göre denetlenir.' },
  { anahtar: 'mal-kabul', yon: 'logo-tmi', baslik: 'Mal kabul (irsaliye satırları)', kaynak: 'bagli', ayarlar: ['logo.mal-kabul-okumasi'], belgeTurleri: [], okuma: 'mal-kabul',
    aciklama: 'Dakikada bir PurchaseOrder/receipts okunur (since imleciyle); satırlar yalnız saklanır, stoka ya da satın almaya işlenmez. Sayı okunan satır sayısıdır.' },
  { anahtar: 'irsaliye-okuma', yon: 'logo-tmi', baslik: 'Alış ve satış irsaliyeleri', kaynak: 'bagli', ayarlar: ['logo.irsaliye-okumasi'], belgeTurleri: [],
    aciklama: 'Dakikada bir Dispatch/list ile son 90 günün alış ve satış irsaliyeleri (sekiz tür) okunur, değişenler yeniden okunur, saatte bir silinenler işaretlenir; Logo İrsaliyeleri sayfası CORE karşılığıyla gösterir. Logo\'ya, stoka ya da başka modüle hiçbir şey yazılmaz.' },
  { anahtar: 'cari-depo', yon: 'logo-tmi', baslik: 'Cari ve ambar listeleri', kaynak: 'bagli', ayarlar: ['logo.liste-okumasi'], belgeTurleri: [], okuma: 'cari-ambar',
    aciklama: 'Saatte bir Arp/list ve Lookup/warehouses okunup önbelleğe (kod, ad) yazılır. Sayı okunan kayıt sayısıdır.' },
  { anahtar: 'fatura', yon: 'logo-tmi', baslik: 'Fatura ve irsaliye', kaynak: 'bagli', ayarlar: ['logo.fatura-okumasi'], belgeTurleri: [], okuma: 'fatura',
    aciklama: 'Logo\'ya giden satın alma siparişlerinin faturaları (PurchaseOrder/{no}/invoices) sırayla okunup saklanır; Logo\'ya hiç yazılmaz. Okunacak sipariş, bu sürümden sonra Logo\'da açılan satın alma siparişleridir. Sayı okunan fatura sayısıdır.' },
  { anahtar: 'malzeme-karti-okuma', yon: 'logo-tmi', baslik: 'Malzeme kartı okuması', kaynak: 'bagli', ayarlar: ['logo.malzeme-okumasi'], belgeTurleri: [], okuma: 'malzeme-karti',
    aciklama: 'Logo malzeme kartları (Material/list) en çok saatte bir, sayfa sayfa okunur ve aynaya yazılır; Malzemeler\'de "Logo\'dan gelenler" listesi buradan beslenir. TMI kartı kendiliğinden değişmez, Logo\'ya hiçbir şey gitmez. Sayı son turda okunan kart sayısıdır.' },
  { anahtar: 'stok-okuma', yon: 'logo-tmi', baslik: 'Stok toplamı okuması', kaynak: 'bagli', ayarlar: ['logo.stok-okumasi'], belgeTurleri: [], okuma: 'stok',
    aciklama: 'Logo\'daki ambar başına eldeki miktar (Stock/totals) en çok saatte bir okunur; yalnız TMI stoğuyla karşılaştırma ve bir kezlik açılış devri içindir, TMI stoğuna kendiliğinden yazılmaz. Sayı son turda okunan satır sayısıdır.' },
  { anahtar: 'kullanim-okuma', yon: 'logo-tmi', baslik: 'Malzeme kullanım okuması', kaynak: 'bagli', ayarlar: ['logo.kullanim-okumasi'], belgeTurleri: [], okuma: 'kullanim',
    aciklama: 'Logo malzeme kartlarının son hareket tarihi ve açık sipariş bilgisi (Material/usage) yalnız istekle, sayfa sayfa okunur; Logo geçişindeki "Kullanılanlar" süzgeci içindir. Logo\'ya hiçbir şey gitmez. Sayı son turda okunan kart sayısıdır.' },
  { anahtar: 'malzeme-arama', yon: 'logo-tmi', baslik: 'Malzeme araması (Logo geçişi)', kaynak: 'bagli', ayarlar: ['logo.malzeme-aramasi'], belgeTurleri: [], okuma: 'malzeme-arama',
    aciklama: 'Logo geçişinde okunan listede olmayan kart Logo\'da kod ya da adla aranır (Material/search, en çok 20) ve bulunan kart listeye eklenir; zamanlanmış okuma yoktur, Logo\'ya yazılmaz.' },
  { anahtar: 'cari-arama', yon: 'logo-tmi', baslik: 'Cari arama (müşteri ve tedarikçi)', kaynak: 'bagli', ayarlar: ['logo.cari-aramasi'], belgeTurleri: [], okuma: 'cari',
    aciklama: 'Müşteri-Tedarikçi\'de yeni firma açarken Logo carisi kod, ünvan ya da vergi numarasıyla aranır (Arp/search) ve seçilen cari forma doldurulur; zamanlanmış okuma yoktur, Logo\'ya yazılmaz.' },
  { anahtar: 'belge-arama', yon: 'logo-tmi', baslik: 'Belge araması (proje, sipariş, teklif, talep)', kaynak: 'bagli', ayarlar: ['logo.belge-aramasi'], belgeTurleri: [],
    aciklama: 'Beş listedeki "Logo\'da ara" Logo belgesini başlıkta ve satırda arar (Document/search, son 1 yıl, en çok 50); zamanlanmış okuma yoktur, Logo\'ya yazılmaz.' },
];

export type LogoAkisDurumu = 'hazir' | 'kapali' | 'ayar-eksik' | 'baglanmadi' | 'kodda-yok';

// LOGO-H1: akış ancak kodu bağlı, ortam değişkenleri tanımlı, "Logo bağlantısı" ve kendi anahtarı açıkken hazırdır.
export function logoAkisDurumu(t: Pick<LogoAkisTanimi, 'kaynak' | 'ayarlar' | 'ayarKosulu'>, d: { ortamVar: boolean; ayarlar: Readonly<Record<string, boolean>> }): LogoAkisDurumu {
  if (t.kaynak !== 'bagli') return t.kaynak;
  if (!d.ortamVar) return 'ayar-eksik';
  if (d.ayarlar['logo.baglanti'] !== true) return 'kapali';
  const acik = (a: string) => d.ayarlar[a] === true;
  return t.ayarlar.length === 0 || (t.ayarKosulu === 'hepsi' ? t.ayarlar.every(acik) : t.ayarlar.some(acik)) ? 'hazir' : 'kapali';
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

// 3204: order=desc cevabı. Zarfta order "desc" yoksa yardımcı eski sürümdür ve sayfa en eskiden başlar (geriye false).
export function geriHareketSayfasiniAyikla(govde: unknown): { sayfa: Sayfa<LogoMalzemeHareketi>; geriye: boolean } | null {
  const sayfa = sayfaAyikla(govde, hareketSatiri);
  return sayfa === null ? null : { sayfa, geriye: kayitMi(govde) && govde['order'] === 'desc' };
}

function alisFiyatiAyikla(o: Record<string, unknown>): LogoAlisFiyati | null {
  const logoKayitNo = kayitNumarasi(o, ['logicalRef']);
  const tarih = ilkMetin(o, ['date'], 10);
  const miktar = ilkSayi(o, ['quantity']);
  const fiyat = ilkSayi(o, ['price']);
  if (logoKayitNo === null || tarih === null || !ISO_TARIH.test(tarih) || miktar === null || fiyat === null) return null;
  const tur = tamSayi(ilkSayi(o, ['currencyType']));
  const dovizli = tur !== null && tur > 0;
  const dovizFiyati = dovizli ? ilkSayi(o, ['currencyPrice']) : null;
  return {
    logoKayitNo, tarih, cariKodu: ilkMetin(o, ['arpCode'], 64), faturaNo: ilkMetin(o, ['invoiceNo'], 40), miktar: String(miktar),
    birim: ilkMetin(o, ['unitCode'], 40), fiyat: String(fiyat), dovizTuru: dovizli ? tur : null, dovizFiyati: dovizFiyati === null ? null : String(dovizFiyati),
  };
}

export function alisFiyatlariniAyikla(govde: unknown): LogoAlisFiyati[] | null {
  if (!Array.isArray(govde)) return null;
  return govde.map((o) => (kayitMi(o) ? alisFiyatiAyikla(o) : null)).filter((x): x is LogoAlisFiyati => x !== null);
}

// 3384-c a: bütün kartların alış faturası satırları (GET /api/Material/purchases), kayıt sırasıyla sayfa. Kayıt numarası dönem tablosunundur:
// firma ya da dönem yoksa sayfa okunmamış sayılır. Döviz türü verilip döviz fiyatı okunamayan satır dövizsiz saklanır (kısıt ikisini birlikte ister).
export interface LogoTopluAlis extends LogoAlisFiyati {
  malzemeKodu: string;
}
export interface TopluAlisSayfasi extends Sayfa<LogoTopluAlis> {
  firma: number;
  donem: number;
}
export function topluAlisSayfasiniAyikla(govde: unknown): TopluAlisSayfasi | null {
  if (!kayitMi(govde)) return null;
  const firma = govde['firm'];
  const donem = govde['period'];
  if (!(typeof firma === 'number' && Number.isSafeInteger(firma) && firma > 0 && typeof donem === 'number' && Number.isSafeInteger(donem) && donem > 0)) return null;
  const sayfa = sayfaAyikla(govde, (o): LogoTopluAlis | null => {
    const malzemeKodu = ilkMetin(o, ['itemCode'], 64);
    const a = alisFiyatiAyikla(o);
    if (malzemeKodu === null || a === null) return null;
    return a.dovizFiyati === null ? { ...a, dovizTuru: null, malzemeKodu } : { ...a, malzemeKodu };
  });
  return sayfa === null ? null : { ...sayfa, firma, donem };
}

// Okuma sırası: son sayfa doluysa hemen devam, değilse en çok saatte bir (yeni fatura satırı için).
export const SON_ALIS_ARALIGI_MS = 60 * 60 * 1000;
export function sonAlisOkunmaliMi(imlec: { dolu: boolean; sonOkuma: Date } | null, simdi: Date): boolean {
  return imlec === null || imlec.dolu || simdi.getTime() - imlec.sonOkuma.getTime() >= SON_ALIS_ARALIGI_MS;
}

/* ---------------- Logo'da CORE MES dışında açılmış satın alma siparişini düzeltme (D7; kararlar 2986 a, 2987 a) ---------------- */

// Yardımcının GET /api/PurchaseOrder/{no}/content cevabı (araclar/logo-yardimcisi Islemler.cs). Sütunlar ölçülmedi (2980 b): alan adları
// yardımcının kendi JSON adlarıdır, Logo sütunu değil; ölçüm yalnız yardımcının sorgusunu değiştirir.
export interface LogoSiparisIcerikSatiri {
  ref: number;
  // Logo satır türü: 0 malzeme, 4 hizmet; başka tür (indirim, masraf satırı) okunur ama düzeltme gövdesi kurulmaz.
  turKodu: number;
  kod: string | null;
  ad: string | null;
  miktar: string;
  birim: string | null;
  // Yerel para birim fiyatı; dövizli siparişte döviz fiyatı ayrıca gelir. Fiyat gönderiminde siparişin kendi para birimi esastır.
  fiyat: string | null;
  dovizFiyati: string | null;
  kdv: string | null;
  termin: string | null;
  aciklama: string | null;
  kapali: boolean;
}

export interface LogoSiparisIcerigi {
  ref: number;
  no: string;
  tarih: string | null;
  cariKodu: string | null;
  // 0 ya da null: yerel para (TL).
  dovizTuru: number | null;
  kur: string | null;
  durum: number | null;
  iptal: boolean;
  satirlar: LogoSiparisIcerikSatiri[];
}

const sayiMetni = (n: number | null): string | null => (n === null ? null : String(n));
const isoTarihMi = (d: string | null): d is string => d !== null && ISO_TARIH.test(d);

// Biçimi tutmayan cevap (ref yok, satır dizisi yok, miktarsız satır) bütünüyle reddedilir: eksik okunan sipariş geri yazılırsa
// okunmayan açık satır gövdede olmadığı için Logo'da kapanır.
export function siparisIcerigiAyikla(govde: unknown): LogoSiparisIcerigi | null {
  if (!kayitMi(govde)) return null;
  const ref = kayitNumarasi(govde, ['logicalRef']);
  const no = ilkMetin(govde, ['number'], FIS_NO_EN_COK);
  const satirlar = govde['lines'];
  if (ref === null || no === null || !Array.isArray(satirlar)) return null;
  const okunan: LogoSiparisIcerikSatiri[] = [];
  for (const o of satirlar) {
    if (!kayitMi(o)) return null;
    const satirRef = kayitNumarasi(o, ['logicalRef']);
    const tur = tamSayi(ilkSayi(o, ['type']));
    const miktar = ilkSayi(o, ['quantity']);
    if (satirRef === null || tur === null || miktar === null || miktar < 0) return null;
    const termin = ilkMetin(o, ['dueDate'], 10);
    okunan.push({
      ref: satirRef, turKodu: tur, kod: ilkMetin(o, ['code'], STOK_KODU_EN_COK), ad: ilkMetin(o, ['name'], 200), miktar: String(miktar),
      birim: ilkMetin(o, ['unitCode'], 40), fiyat: sayiMetni(ilkSayi(o, ['price'])), dovizFiyati: sayiMetni(ilkSayi(o, ['currencyPrice'])),
      kdv: sayiMetni(ilkSayi(o, ['vatRate'])), termin: isoTarihMi(termin) ? termin : null, aciklama: ilkMetin(o, ['description'], 250),
      kapali: o['closed'] === true,
    });
  }
  if (new Set(okunan.map((s) => s.ref)).size !== okunan.length) return null;
  const tarih = ilkMetin(govde, ['date'], 10);
  const doviz = tamSayi(ilkSayi(govde, ['currencyType']));
  return {
    ref, no, tarih: isoTarihMi(tarih) ? tarih : null, cariKodu: ilkMetin(govde, ['arpCode'], 64), dovizTuru: doviz !== null && doviz > 0 ? doviz : null,
    kur: sayiMetni(ilkSayi(govde, ['rate'])), durum: tamSayi(ilkSayi(govde, ['status'])), iptal: govde['cancelled'] === true, satirlar: okunan,
  };
}

// Okuma anının izi: kaydetmeden önce Logo yeniden okunur, iz tutmazsa yazılmaz (V3: Logo'da aynı anda yapılan elle düzeltme ezilmesin).
// Yalnız düzeltmenin dayandığı alanlar ize girer; satır adı gibi gönderilmeyen alanın değişmesi düzeltmeyi durdurmaz.
export function siparisIcerikIzi(i: LogoSiparisIcerigi): string {
  const satirlar = [...i.satirlar].sort((a, b) => a.ref - b.ref)
    .map((s) => [s.ref, s.turKodu, s.kod, s.miktar, s.birim, s.fiyat, s.dovizFiyati, s.termin, s.aciklama, s.kapali]);
  const ham = JSON.stringify([i.ref, i.no, i.tarih, i.cariKodu, i.dovizTuru, i.kur, i.iptal, satirlar]);
  return createHash('sha256').update(ham).digest('hex');
}

// Yardımcının UpdateRich gövdesindeki ayırıcı (araclar/logo-yardimcisi Islemler.cs SiparisGuncelle).
export const DIS_SIPARIS_ALANI = 'externalOrder';

export interface DisSiparisSatirDuzeltmesi {
  ref: number;
  miktar?: string;
  // Siparişin kendi para biriminde birim fiyat (dövizli siparişte döviz fiyatı; yardımcı kurla çarpar).
  fiyat?: string;
  termin?: string;
  aciklama?: string;
  kapat?: boolean;
}

export interface DisSiparisYeniSatir {
  hizmet: boolean;
  kod: string;
  miktar: string;
  fiyat: string;
  birim: string;
  kdv: number;
  termin?: string;
  aciklama?: string;
}

export interface DisSiparisDuzeltmesi {
  tarih?: string;
  satirlar: readonly DisSiparisSatirDuzeltmesi[];
  yeniSatirlar: readonly DisSiparisYeniSatir[];
}

// Değişikliğin fiyatsız özeti: iş kaydında ve listede görünür; fiyat yalnız gövdededir.
export interface DisSiparisOzeti {
  tarih: boolean;
  degisen: number[];
  kapanan: number[];
  yeni: number;
}

const ACIKLAMA_EN_COK = 250;
const ayniOndalik = (a: string | null, b: string): boolean => a !== null && ONDALIK.test(a) && olcekli(a) === olcekli(b);

// Düzeltme gövdesi: başlık ve okunan satırlar okumadan gelir (G2: kayıt numarası istemciden alınmaz), değişen alan üstüne yazılır.
// Cari ve döviz okunduğu gibi gider (yardımcı değişikliği reddeder); durum gönderilmez (2967 a). Okunan açık satırların hepsi geri gider:
// gövdede olmayan açık satırı yardımcı kapatır, kapatma yalnız kullanıcının "kapat" dediği satırdır (2963 a: silme yok).
// Var olan satıra KDV gönderilmez; termin ve açıklama yalnız değiştiyse gider (gönderilmeyen alanı yardımcı yazmaz, A2 testi).
export function disSiparisDuzeltmeGovdesi(
  i: LogoSiparisIcerigi, d: DisSiparisDuzeltmesi,
): { govde: Record<string, unknown>; ozet: DisSiparisOzeti } | { hata: string } {
  const a = SIPARIS_ALANLARI;
  if (i.iptal) return { hata: 'İptal edilmiş sipariş düzeltilmez.' };
  const cari = i.cariKodu ?? '';
  if (cari === '') return { hata: 'Siparişin cari kodu okunamadı; düzeltilmez.' };
  const yabanci = i.satirlar.find((s) => !s.kapali && s.turKodu !== SATIR_TURU.malzeme && s.turKodu !== SATIR_TURU.hizmet);
  if (yabanci) return { hata: 'Siparişte malzeme ve hizmet dışında açık satır var (indirim, masraf); Logo\'da düzeltin.' };
  const okunan = new Map(i.satirlar.map((s) => [s.ref, s]));
  const duzeltme = new Map<number, DisSiparisSatirDuzeltmesi>();
  for (const x of d.satirlar) {
    const s = okunan.get(x.ref);
    if (!s) return { hata: 'Düzeltilen satır siparişte yok.' };
    if (s.kapali) return { hata: 'Kapalı satır düzeltilmez.' };
    if (duzeltme.has(x.ref)) return { hata: 'Aynı satır iki kez verilmiş.' };
    duzeltme.set(x.ref, x);
  }
  const tarihIso = d.tarih ?? i.tarih;
  const tarih = tarihIso === null ? null : logoTarihi(tarihIso);
  if (tarih === null) return { hata: 'Sipariş tarihi geçersiz.' };
  const ozet: DisSiparisOzeti = { tarih: d.tarih !== undefined && d.tarih !== i.tarih, degisen: [], kapanan: [], yeni: d.yeniSatirlar.length };
  const satirlar: Record<string, unknown>[] = [];
  const dovizli = i.dovizTuru !== null;
  for (const s of i.satirlar) {
    if (s.kapali) continue;
    const x = duzeltme.get(s.ref);
    if (x?.kapat === true) { ozet.kapanan.push(s.ref); continue; }
    const kod = s.kod ?? '';
    const birim = s.birim ?? '';
    const okunanFiyat = dovizli ? s.dovizFiyati : s.fiyat;
    if (kod === '' || birim === '' || okunanFiyat === null) return { hata: `Satır ${s.ref}: kod, birim ya da fiyat okunamadı; Logo'da düzeltin.` };
    let degisti = false;
    let miktar = s.miktar;
    if (x?.miktar !== undefined && !ayniOndalik(s.miktar, x.miktar)) {
      if (!ONDALIK.test(x.miktar) || olcekli(x.miktar) === 0n) return { hata: `Satır ${s.ref}: miktar sıfırdan büyük olmalı.` };
      miktar = x.miktar;
      degisti = true;
    }
    let fiyat = okunanFiyat;
    if (x?.fiyat !== undefined && !ayniOndalik(okunanFiyat, x.fiyat)) {
      if (!ONDALIK.test(x.fiyat)) return { hata: `Satır ${s.ref}: birim fiyat geçersiz.` };
      fiyat = x.fiyat;
      degisti = true;
    }
    const satir: Record<string, unknown> = {
      [KAYIT_ALANI]: s.ref, [a.tur]: s.turKodu, [a.kod]: kod, [a.miktar]: Number(miktar), [a.fiyat]: Number(fiyat), [a.birim]: birim,
    };
    if (x?.termin !== undefined && x.termin !== s.termin) {
      const t = logoTarihi(x.termin);
      if (t === null) return { hata: `Satır ${s.ref}: teslim tarihi geçersiz.` };
      satir[a.termin] = t;
      degisti = true;
    }
    if (x?.aciklama !== undefined && x.aciklama.trim() !== (s.aciklama ?? '')) {
      if (x.aciklama.trim().length > ACIKLAMA_EN_COK) return { hata: `Satır ${s.ref}: açıklama ${ACIKLAMA_EN_COK} karakteri aşıyor.` };
      satir[a.aciklama] = x.aciklama.trim();
      degisti = true;
    }
    if (degisti) ozet.degisen.push(s.ref);
    satirlar.push(satir);
  }
  for (const [n, x] of d.yeniSatirlar.entries()) {
    const sira = `Yeni satır ${n + 1}`;
    const kod = x.kod.trim();
    if (kod === '' || kod.length > STOK_KODU_EN_COK) return { hata: `${sira}: stok kodu 1-${STOK_KODU_EN_COK} karakter olmalı.` };
    if (!ONDALIK.test(x.miktar) || olcekli(x.miktar) === 0n) return { hata: `${sira}: miktar sıfırdan büyük olmalı.` };
    if (!ONDALIK.test(x.fiyat)) return { hata: `${sira}: birim fiyat geçersiz.` };
    if (x.birim.trim() === '') return { hata: `${sira}: birim yok.` };
    if (!Number.isFinite(x.kdv) || x.kdv < 0 || x.kdv > 100) return { hata: `${sira}: KDV oranı 0-100 olmalı.` };
    const satir: Record<string, unknown> = {
      [a.tur]: x.hizmet ? SATIR_TURU.hizmet : SATIR_TURU.malzeme, [a.kod]: kod, [a.miktar]: Number(x.miktar), [a.fiyat]: Number(x.fiyat),
      [a.birim]: logoBirimKodu(x.birim), [a.kdv]: x.kdv,
    };
    if (x.termin !== undefined) {
      const t = logoTarihi(x.termin);
      if (t === null) return { hata: `${sira}: teslim tarihi geçersiz.` };
      satir[a.termin] = t;
    }
    const aciklama = x.aciklama?.trim() ?? '';
    if (aciklama.length > ACIKLAMA_EN_COK) return { hata: `${sira}: açıklama ${ACIKLAMA_EN_COK} karakteri aşıyor.` };
    if (aciklama !== '') satir[a.aciklama] = aciklama;
    satirlar.push(satir);
  }
  if (satirlar.length === 0) return { hata: 'Siparişte en az bir açık satır kalmalı; siparişi kapatmak Logo\'da yapılır.' };
  if (!ozet.tarih && ozet.degisen.length === 0 && ozet.kapanan.length === 0 && ozet.yeni === 0) return { hata: 'Değişiklik yok.' };
  // Yardımcı bu alanla Logo'da açılmış siparişi ayırır: satırın Logo'daki birimi okunamazsa yazmaz (3007, Güvenlik K2).
  const govde: Record<string, unknown> = { [KAYIT_ALANI]: i.ref, [a.no]: i.no, [a.tarih]: tarih, [a.cari]: cari, [DIS_SIPARIS_ALANI]: true };
  if (dovizli) {
    govde[a.doviz] = i.dovizTuru;
    if (i.kur !== null && ONDALIK.test(i.kur) && olcekli(i.kur) > 0n) govde[a.kur] = Number(i.kur);
  }
  govde[a.satirlar] = satirlar;
  return { govde, ozet };
}

/* ---------------- 3201: malzeme kartının "Logo'da" bölümü (yalnız okuma) ---------------- */

// İşaretli ondalık (Logo'da eksi stok olabilir); altı basamağa kadar tam hesap, fazlası okunmaz.
const ISARETLI_ONDALIK = /^-?\d+(\.\d{1,6})?$/;
const KART_OLCEK = 1_000_000n;
function kartOlcekli(d: string): bigint | null {
  if (!ISARETLI_ONDALIK.test(d)) return null;
  const eksi = d.startsWith('-');
  const [tam = '0', kesir = ''] = (eksi ? d.slice(1) : d).split('.');
  const v = BigInt(tam) * KART_OLCEK + BigInt(kesir.padEnd(6, '0'));
  return eksi ? -v : v;
}
function kartMetni(v: bigint): string {
  const eksi = v < 0n;
  const m = eksi ? -v : v;
  const kesir = (m % KART_OLCEK).toString().padStart(6, '0').replace(/0+$/, '');
  return `${eksi ? '-' : ''}${m / KART_OLCEK}${kesir === '' ? '' : `.${kesir}`}`;
}

export interface KartEsliDepo { depoKod: string; depoAd: string; logoAmbarNo: number; miktar: string | null }
export interface KartStokSatiri {
  ambarNo: number; ambarAdi: string | null; logo: string | null;
  depo: { kod: string; ad: string } | null; core: string | null; fark: string | null;
}
export interface KartStokKarsilastirmasi {
  ambarlar: KartStokSatiri[];
  // Yalnız CORE deposuyla eşli ambarlar; eşli ambar yoksa null.
  eslenen: { logo: string; core: string; fark: string } | null;
  // Eşlenmemiş ambarlardaki Logo miktarı toplamı; böyle ambar yoksa null.
  eslenmemis: string | null;
}

// Logo'da satırı olmayan ambar ve CORE'da bakiyesi olmayan depo o yerde stok yok demektir: fark hesabında sıfır sayılır, satırda boş kalır.
// Birden çok depo aynı ambara eşliyse CORE miktarları toplanır, depo adı ilkinden. Okunamayan miktar satırı farksız bırakır.
export function kartStokKarsilastir(
  logo: readonly { ambarNo: number; miktar: string }[], depolar: readonly KartEsliDepo[], ambarAdlari: ReadonlyMap<number, string | null>,
): KartStokKarsilastirmasi {
  const satirlar = new Map<number, { logo: bigint | null; logoMetin: string | null; okunamadi: boolean; depo: { kod: string; ad: string } | null; core: bigint | null }>();
  const al = (no: number) => {
    let s = satirlar.get(no);
    if (!s) { s = { logo: null, logoMetin: null, okunamadi: false, depo: null, core: null }; satirlar.set(no, s); }
    return s;
  };
  for (const l of logo) {
    const s = al(l.ambarNo);
    const v = kartOlcekli(l.miktar);
    if (v === null) s.okunamadi = true;
    else s.logo = (s.logo ?? 0n) + v;
  }
  for (const d of depolar) {
    const s = al(d.logoAmbarNo);
    s.depo ??= { kod: d.depoKod, ad: d.depoAd };
    if (d.miktar === null) continue;
    const v = kartOlcekli(d.miktar);
    if (v === null) s.okunamadi = true;
    else s.core = (s.core ?? 0n) + v;
  }
  let esliVar = false; let esliLogo = 0n; let esliCore = 0n; let esliOkunamadi = false;
  let eslenmemis: bigint | null = null;
  const ambarlar = [...satirlar.entries()].sort(([a], [b]) => a - b).map(([ambarNo, s]): KartStokSatiri => {
    const fark = s.depo === null || s.okunamadi ? null : (s.logo ?? 0n) - (s.core ?? 0n);
    if (s.depo !== null) { esliVar = true; esliOkunamadi ||= s.okunamadi; esliLogo += s.logo ?? 0n; esliCore += s.core ?? 0n; }
    else if (s.logo !== null) eslenmemis = (eslenmemis ?? 0n) + s.logo;
    return {
      ambarNo, ambarAdi: ambarAdlari.get(ambarNo) ?? null, logo: s.logo === null ? null : kartMetni(s.logo),
      depo: s.depo, core: s.core === null ? null : kartMetni(s.core), fark: fark === null ? null : kartMetni(fark),
    };
  });
  return {
    ambarlar,
    eslenen: esliVar && !esliOkunamadi ? { logo: kartMetni(esliLogo), core: kartMetni(esliCore), fark: kartMetni(esliLogo - esliCore) } : null,
    eslenmemis: eslenmemis === null ? null : kartMetni(eslenmemis),
  };
}

// STLINE IOCODE: 1, 2 giriş; 3, 4 çıkış (VARSAYIM, gerçek Logo'da doğrulanmadı). Bilinmeyen değer null: ekran yön göstermez.
export function hareketYonu(ioCode: number): 'giris' | 'cikis' | null {
  return ioCode === 1 || ioCode === 2 ? 'giris' : ioCode === 3 || ioCode === 4 ? 'cikis' : null;
}

// Fiş türü adı yalnız köprü notunda ve sorgularda geçen kodlar için (1 alış, 12 sarf, 13 üretimden giriş); öbürleri numarasıyla gösterilir.
const HAREKET_FIS_ADLARI: Readonly<Record<number, string>> = { 1: 'Satın alma irsaliyesi', 12: 'Sarf fişi', 13: 'Üretimden giriş fişi' };
export function hareketFisAdi(trCode: number): string {
  return HAREKET_FIS_ADLARI[trCode] ?? `Fiş türü ${trCode}`;
}

// Kart bölümünde bir seferde gösterilen hareket sayısı; yardımcı geriye okumayı bilmiyorsa okunan en çok sayfa (500'lük).
export const KART_HAREKET_SAYFASI = 20;
export const KART_HAREKET_ESKI_YOL_SAYFA_SINIRI = 10;

// 3344: ekrandaki belge türünün giden kutusundaki karşılığı. Malzeme kartı malzeme ya da hizmet olarak gider (belge no kartın numarası).
export const ROZET_BELGELERI: Readonly<Record<LogoRozetTuru, readonly string[]>> = Object.freeze({
  malzeme: ['malzeme', 'hizmet'],
  proje: ['proje'],
  'satis-siparisi': ['siparisler-siparisi'],
  teklif: ['siparisler-teklifi'],
  'satin-alma-siparisi': ['siparis'],
});
// Logo'da olan önce gelir (gönderilmiş ya da Logo'da bulunup bağlanmış); sonra süreç belleğindeki bekleme (kart ya da proje), sonra giden kutusu.
// Gidecek izi olmayan belge için rozet yoktur (null): Logo'ya gitmeyen tür ya da ayarı kapalı.
// Rozet nedeni belgeyi gören herkese gider: ham hata iletisinin yalnız ilk satırı ve en çok 160 karakteri.
export const ROZET_NEDEN_SINIRI = 160;
export function rozetNedeni(m: string | null): string | null {
  if (m === null) return null;
  const ilk = (m.split(/\r?\n/).find((s) => s.trim() !== '') ?? '').trim();
  if (ilk === '') return null;
  return ilk.length > ROZET_NEDEN_SINIRI ? `${ilk.slice(0, ROZET_NEDEN_SINIRI - 1)}…` : ilk;
}

// Bekleme belleğinde bir saattir görülmeyen kayıt eskimiştir (izleme ekranıyla aynı süre): rozette bekleyen sayılmaz.
export const BEKLEYEN_ESKIME_MS = 60 * 60 * 1000;
export const bekleyenTaze = (goruldu: Date, simdi: Date): boolean => simdi.getTime() - goruldu.getTime() <= BEKLEYEN_ESKIME_MS;

export function belgeRozetDurumu(
  g: { sonSonuc: GidenSonucu | null; sonrakiDeneme: Date | null; sonHata: string | null; logoKayitNo: string | null } | null,
  bekleyen: { durum: 'kart-bekliyor' | 'proje-bekliyor'; ileti: string } | null,
  bagliKayitNo: string | null,
): { durum: LogoRozetDurumu; kayitNo: string | null; neden: string | null } | null {
  const kayitNo = g?.logoKayitNo ?? bagliKayitNo;
  if (kayitNo !== null) return { durum: 'logoda', kayitNo, neden: null };
  if (bekleyen !== null) return { durum: bekleyen.durum, kayitNo: null, neden: rozetNedeni(bekleyen.ileti) };
  if (g === null) return null;
  const durum = gidenIzlemeDurumu(g);
  return { durum, kayitNo: null, neden: durum === 'sirada' ? null : rozetNedeni(g.sonHata) };
}

/* ---------------- Logo irsaliyeleri (3345 a): yalnız okunur, CORE karşılığıyla gösterilir ---------------- */

// Logo STFICHE.TRCODE (yardımcının beyaz listesi araclar/logo-yardimcisi SqlOkuma.IrsaliyeTurleri ile aynı). 4 ve 5'in anlamı canlı dışı
// Logo'da ölçülmedi (yardımcının rehber tablosu ters yazar): ölçülene kadar konsinye türleri listede ve sayaçta görünmez (Risk N3).
export const IRSALIYE_TURLERI = LOGO_IRSALIYE_TURLERI;
export type IrsaliyeTuru = (typeof IRSALIYE_TURLERI)[number];
export const KONSINYE_TURLERI: readonly IrsaliyeTuru[] = [4, 5, 9, 10];
export const KONSINYE_TURLERI_DOGRULANDI = false;
export const ALIS_TURLERI: readonly IrsaliyeTuru[] = [1, 5, 6, 10];
export const SATIS_TURLERI: readonly IrsaliyeTuru[] = [8, 9, 3, 4];
export const IRSALIYE_TUR_ADLARI: Readonly<Record<IrsaliyeTuru, string>> = {
  1: 'Satın alma', 5: 'Konsinye giriş', 6: 'Satın alma iade', 10: 'Konsinye giriş iade',
  8: 'Toptan satış', 9: 'Konsinye çıkış', 3: 'Satış iade', 4: 'Konsinye çıkış iade',
};
export const gorunenIrsaliyeTurleri = (yon: 'alis' | 'satis', konsinyeDogrulandi = KONSINYE_TURLERI_DOGRULANDI): IrsaliyeTuru[] =>
  (yon === 'alis' ? ALIS_TURLERI : SATIS_TURLERI).filter((t) => konsinyeDogrulandi || !KONSINYE_TURLERI.includes(t));

// Yardımcı sayfası başlık sayısıdır; tam sayfa gelirse aynı okuma sonraki turda sürer.
export const IRSALIYE_SAYFASI = 100;
// İlk okuma ve değişen okuması bu kadar gün geriye bakar (Risk N2, K1).
export const IRSALIYE_GERI_GUN = 90;
// Silinen başlık denetimi (yalnız kayıt numaraları) en erken bu aralıkla.
export const IRSALIYE_REF_DENETIMI_MS = 60 * 60_000;
const IRSALIYE_EN_COK_BEKLEME_MS = 60 * 60_000;
// Başarısız okumadan sonra bekleme her ardışık hatada iki katına çıkar (5, 10, 20 dakika ...), en çok bir saat.
export const irsaliyeBeklemesiMs = (ardisikHata: number): number =>
  ardisikHata <= 0 ? 0 : Math.min(OKUMA_HATA_BEKLEME_MS * 2 ** Math.min(ardisikHata - 1, 20), IRSALIYE_EN_COK_BEKLEME_MS);

const LOGO_DEGISME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/;
const GUN = /^\d{4}-\d{2}-\d{2}$/;

export const irsaliyeBaslangicGunu = (simdi: Date): string => new Date(simdi.getTime() - IRSALIYE_GERI_GUN * 86_400_000).toISOString().slice(0, 10);

export interface IrsaliyeSatiriOkuma {
  kayitNo: number;
  malzemeKodu: string | null;
  malzemeAdi: string | null;
  miktar: string | null;
  birim: string | null;
  fiyat: string | null;
  dovizTuru: number | null;
  dovizFiyati: string | null;
  siparisRef: number | null;
  siparisSatirRef: number | null;
  siparisNo: string | null;
}

export interface IrsaliyeBasligiOkuma {
  kayitNo: number;
  tur: IrsaliyeTuru;
  fisNo: string | null;
  belgeNo: string | null;
  tarih: string;
  iptal: boolean;
  ambarNo: number | null;
  cariKodu: string | null;
  cariAdi: string | null;
  faturaNo: string | null;
  eIrsaliye: boolean;
  degisme: string | null;
  satirlar: IrsaliyeSatiriOkuma[];
}

export interface IrsaliyeSayfasi {
  firma: number;
  donem: number;
  basliklar: IrsaliyeBasligiOkuma[];
  // Yardımcının döndürdüğü başlık sayısı (atlananlar dahil): sayfa doluysa okuma sürer.
  gelen: number;
  atlanan: number;
}

const donemNo = (g: Record<string, unknown>, ad: string): number | null => {
  const d = g[ad];
  return typeof d === 'number' && Number.isSafeInteger(d) && d >= 0 ? d : null;
};
const alanSayiMetni = (k: Record<string, unknown>, ad: string): string | null => sayiMetni(ilkSayi(k, [ad]));
const tamSayiYaDaNull = (k: Record<string, unknown>, ad: string): number | null => {
  const n = ilkSayi(k, [ad]);
  return n !== null && Number.isSafeInteger(n) ? n : null;
};

// Firma ve dönem yoksa ya da dizi yoksa null (imleç ilerlemez). Kaydı, türü beyaz listede ya da tarihi olmayan başlık atlanır ve sayılır;
// kaydı olmayan satır atlanır. Sevk adresi, taşıyıcı, plaka, şoför yardımcıdan gelmez; gelse de okunmaz.
export function irsaliyeSayfasiniAyikla(govde: unknown): IrsaliyeSayfasi | null {
  if (!kayitMi(govde)) return null;
  const firma = donemNo(govde, 'firm');
  const donem = donemNo(govde, 'period');
  const dizi = govde['dispatches'];
  if (firma === null || donem === null || !Array.isArray(dizi)) return null;
  const basliklar = new Map<number, IrsaliyeBasligiOkuma>();
  let atlanan = 0;
  for (const o of dizi) {
    const kayitNo = kayitMi(o) ? kayitNumarasi(o, ['logicalRef']) : null;
    const tur = kayitMi(o) ? ilkSayi(o, ['trCode']) : null;
    const tarih = kayitMi(o) ? ilkMetin(o, ['date'], 10) : null;
    if (!kayitMi(o) || kayitNo === null || !IRSALIYE_TURLERI.includes(tur as IrsaliyeTuru) || tarih === null || !GUN.test(tarih)) { atlanan += 1; continue; }
    const degisme = ilkMetin(o, ['modifiedAt'], 23);
    const satirlar = new Map<number, IrsaliyeSatiriOkuma>();
    for (const s of Array.isArray(o['lines']) ? o['lines'] : []) {
      const ref = kayitMi(s) ? kayitNumarasi(s, ['logicalRef']) : null;
      if (!kayitMi(s) || ref === null) continue;
      satirlar.set(ref, {
        kayitNo: ref,
        malzemeKodu: ilkMetin(s, ['itemCode'], 64),
        malzemeAdi: ilkMetin(s, ['itemName'], 200),
        miktar: alanSayiMetni(s, 'quantity'),
        birim: ilkMetin(s, ['unitCode'], 40),
        fiyat: alanSayiMetni(s, 'price'),
        dovizTuru: tamSayiYaDaNull(s, 'currency'),
        dovizFiyati: alanSayiMetni(s, 'currencyPrice'),
        siparisRef: kayitNumarasi(s, ['orderRef']),
        siparisSatirRef: kayitNumarasi(s, ['orderLineRef']),
        siparisNo: ilkMetin(s, ['orderNo'], 64),
      });
    }
    basliklar.set(kayitNo, {
      kayitNo,
      tur: tur as IrsaliyeTuru,
      fisNo: ilkMetin(o, ['ficheNo'], 64),
      belgeNo: ilkMetin(o, ['docNumber'], 64),
      tarih,
      iptal: o['cancelled'] === true,
      ambarNo: tamSayiYaDaNull(o, 'warehouseNr'),
      cariKodu: ilkMetin(o, ['arpCode'], 64),
      cariAdi: ilkMetin(o, ['arpName'], 200),
      faturaNo: ilkMetin(o, ['invoiceNo'], 64),
      eIrsaliye: o['eDespatch'] === true,
      degisme: degisme !== null && LOGO_DEGISME.test(degisme) ? degisme : null,
      satirlar: [...satirlar.values()],
    });
  }
  return { firma, donem, basliklar: [...basliklar.values()], gelen: dizi.length, atlanan };
}

export function irsaliyeRefleriniAyikla(govde: unknown): { firma: number; donem: number; refler: number[] } | null {
  if (!kayitMi(govde)) return null;
  const firma = donemNo(govde, 'firm');
  const donem = donemNo(govde, 'period');
  const dizi = govde['refs'];
  if (firma === null || donem === null || !Array.isArray(dizi)) return null;
  return { firma, donem, refler: dizi.filter((r): r is number => typeof r === 'number' && Number.isSafeInteger(r) && r > 0) };
}

// Değişen okumasının imleci (Logo değişme zamanı, başlık kaydı) sözlük sırasıyla ilerler; hiç geri gitmez. Değişme zamanı olmayan başlık imleci oynatmaz.
export function degismeImleci(
  simdiki: { degisme: string | null; ref: number }, basliklar: readonly Pick<IrsaliyeBasligiOkuma, 'degisme' | 'kayitNo'>[],
): { degisme: string | null; ref: number } {
  let en = simdiki;
  for (const b of basliklar) {
    if (b.degisme === null) continue;
    if (en.degisme === null || b.degisme > en.degisme || (b.degisme === en.degisme && b.kayitNo > en.ref)) en = { degisme: b.degisme, ref: b.kayitNo };
  }
  return en;
}

// Tur sırası: yeni başlıklar bitince değişenler, onlar bitince (saatte bir) silinme denetimi, sonra yine yeniler.
export type IrsaliyeOkumaSirasi = 'yeni' | 'degisen' | 'refler';
export function sonrakiIrsaliyeSirasi(
  simdiki: IrsaliyeOkumaSirasi, sayfaDolu: boolean, sonRefDenetimi: Date | null, simdi: Date,
): IrsaliyeOkumaSirasi {
  if (simdiki === 'yeni') return sayfaDolu ? 'yeni' : 'degisen';
  if (simdiki === 'degisen') {
    if (sayfaDolu) return 'degisen';
    return sonRefDenetimi === null || simdi.getTime() - sonRefDenetimi.getTime() >= IRSALIYE_REF_DENETIMI_MS ? 'refler' : 'yeni';
  }
  return 'yeni';
}

/* Eşleşme: istek anında hesaplanır, hiçbir kayda yazılmaz. */

export type IrsaliyeEslesmeDurumu = (typeof IRSALIYE_ESLESME_DURUMLARI)[number];

export interface CoreSiparisSatiri {
  siparisSatiriId: number;
  siparisNo: string | null;
  birim: string;
  // Net teslim (düzeltme kayıtları düşülmüş).
  teslim: string;
}
export interface CoreKarsiligi { tur: 'siparis' | 'sevk' | 'mal-kabul'; id: number; no: string }

export interface EslesmeGirdisi {
  tur: IrsaliyeTuru;
  iptal: boolean;
  logodaYok: boolean;
  fisNo: string | null;
  belgeNo: string | null;
  satirlar: readonly { kayitNo: number; miktar: string | null; birim: string | null; siparisSatirRef: number | null }[];
}
export interface EslesmeKaynaklari {
  // Logo sipariş satır kaydı (metin, CORE'da logo_satir_ref) -> CORE sipariş satırı.
  siparisSatirlari: ReadonlyMap<string, CoreSiparisSatiri>;
  // Logo sipariş satırı kaydı -> aynadaki net irsaliye miktarı (satın alma eksi satın alma iade; iptal ve Logo'da olmayan sayılmaz).
  logoNetleri: ReadonlyMap<number, string>;
  // Belge numarası (fiş no ya da e-irsaliye no) -> CORE kaydı.
  sevkler: ReadonlyMap<string, CoreKarsiligi>;
  iadeMalKabulleri: ReadonlyMap<string, CoreKarsiligi>;
}
export interface SatirEslesmesi {
  kayitNo: number;
  durum: IrsaliyeEslesmeDurumu;
  neden: string | null;
  core: CoreKarsiligi | null;
  coreMiktari: string | null;
  coreBirimi: string | null;
}
export interface IrsaliyeEslesmesi {
  durum: IrsaliyeEslesmeDurumu;
  ozet: string;
  satirlar: SatirEslesmesi[];
}

// İşaretli ondalık metin (numeric::text) dört basamakla karşılaştırılır; okunamayan metin hiçbir şeye eşit değildir.
const IRSALIYE_ONDALIK = /^-?\d+(\.\d+)?$/;
const ondalikEsit = (a: string | null, b: string | null): boolean => {
  if (a === null || b === null || !IRSALIYE_ONDALIK.test(a) || !IRSALIYE_ONDALIK.test(b)) return false;
  const deger = (d: string): bigint => (d.startsWith('-') ? -olcekli(d.slice(1)) : olcekli(d));
  return deger(a) === deger(b);
};
const birimAnahtari = (b: string): string => b.trim().toLocaleLowerCase('tr-TR');
const sadeMiktar = (d: string): string => (d.includes('.') ? d.replace(/0+$/, '').replace(/\.$/, '') : d);

const DURUM_AGIRLIGI: Readonly<Record<IrsaliyeEslesmeDurumu, number>> = { eslesti: 0, 'karsiligi-yok': 1, fark: 2, eslesmedi: 3, iptal: 4, 'logoda-yok': 5 };

// Fark tanımı (ONIZLEME.md): aynı sipariş satırına bağlı Logo net miktarı ile CORE net teslimi farklıysa "fark"; kısmi kabulde toplamlar
// karşılaştırılır. Birim farklıysa çevrim yapılmaz, "fark" gösterilir (VARSAYIM; çevrim 3332 ile). Siparişsiz satır "eşleşmedi"dir.
// Satış (8) sevk işine, satış iadesi (3) iade mal kabulüne belge numarasıyla bağlanır; bu kayıtlar satır miktarı taşımadığı için yalnız başlık eşleşir.
export function irsaliyeEslesmesi(b: EslesmeGirdisi, k: EslesmeKaynaklari): IrsaliyeEslesmesi {
  const hepsi = (durum: IrsaliyeEslesmeDurumu, neden: string | null, core: CoreKarsiligi | null = null): SatirEslesmesi[] =>
    b.satirlar.map((s) => ({ kayitNo: s.kayitNo, durum, neden, core, coreMiktari: null, coreBirimi: null }));
  if (b.logodaYok) return { durum: 'logoda-yok', ozet: 'Logo\'da artık yok (silinmiş)', satirlar: hepsi('logoda-yok', null) };
  if (b.iptal) return { durum: 'iptal', ozet: 'Logo\'da iptal edilmiş', satirlar: hepsi('iptal', null) };
  if (KONSINYE_TURLERI.includes(b.tur)) {
    return { durum: 'karsiligi-yok', ozet: 'CORE\'da konsinye kaydı tutulmuyor', satirlar: hepsi('karsiligi-yok', 'CORE\'da konsinye kaydı tutulmuyor') };
  }
  if (b.tur === 8 || b.tur === 3) {
    const kaynak = b.tur === 8 ? k.sevkler : k.iadeMalKabulleri;
    const core = [b.fisNo, b.belgeNo].map((n) => (n === null ? undefined : kaynak.get(n))).find((x) => x !== undefined) ?? null;
    if (core === null) {
      const yok = b.tur === 8 ? 'CORE\'da sevk yok' : 'CORE\'da iade mal kabulü yok';
      return { durum: 'eslesmedi', ozet: yok, satirlar: hepsi('eslesmedi', yok) };
    }
    return { durum: 'eslesti', ozet: karsilikAdi(core), satirlar: hepsi('eslesti', null, core) };
  }
  const satirlar = b.satirlar.map((s): SatirEslesmesi => {
    const bos = { kayitNo: s.kayitNo, core: null, coreMiktari: null, coreBirimi: null };
    if (s.siparisSatirRef === null) return { ...bos, durum: 'eslesmedi', neden: 'Siparişsiz satır' };
    const c = k.siparisSatirlari.get(String(s.siparisSatirRef));
    if (c === undefined) return { ...bos, durum: 'eslesmedi', neden: 'Sipariş satırı CORE\'da yok' };
    const core: CoreKarsiligi = { tur: 'siparis', id: c.siparisSatiriId, no: c.siparisNo ?? `Sipariş satırı ${c.siparisSatiriId}` };
    const ortak = { kayitNo: s.kayitNo, core, coreMiktari: sadeMiktar(c.teslim), coreBirimi: c.birim };
    if (s.birim === null || birimAnahtari(s.birim) !== birimAnahtari(c.birim)) {
      return { ...ortak, durum: 'fark', neden: `Birim farklı: Logo ${s.birim ?? 'yok'}, CORE ${c.birim}` };
    }
    const logo = k.logoNetleri.get(s.siparisSatirRef) ?? null;
    if (ondalikEsit(logo, c.teslim)) return { ...ortak, durum: 'eslesti', neden: null };
    return { ...ortak, durum: 'fark', neden: `Logo net ${logo === null ? 'yok' : sadeMiktar(logo)}, CORE teslim ${sadeMiktar(c.teslim)}` };
  });
  if (satirlar.length === 0) return { durum: 'eslesmedi', ozet: 'Satırı yok', satirlar };
  const durum = satirlar.reduce<IrsaliyeEslesmeDurumu>((en, s) => (DURUM_AGIRLIGI[s.durum] > DURUM_AGIRLIGI[en] ? s.durum : en), 'eslesti');
  const say = (d: IrsaliyeEslesmeDurumu): number => satirlar.filter((s) => s.durum === d).length;
  const siparisler = [...new Set(satirlar.flatMap((s) => (s.core === null ? [] : [s.core.no])))];
  const parcalar = [
    siparisler.length > 0 ? `Sipariş ${siparisler.slice(0, 2).join(', ')}${siparisler.length > 2 ? ` ve ${siparisler.length - 2} sipariş daha` : ''}` : null,
    say('fark') > 0 ? `${say('fark')} satırda fark` : null,
    say('eslesmedi') > 0 ? `${say('eslesmedi')} satır eşleşmedi` : null,
  ].filter((x): x is string => x !== null);
  return { durum, ozet: parcalar.join(' · '), satirlar };
}

const karsilikAdi = (c: CoreKarsiligi): string => (c.tur === 'sevk' ? `Sevk ${c.no}` : c.tur === 'mal-kabul' ? `İade mal kabulü ${c.no}` : `Sipariş ${c.no}`);

// 3384 a: satın alma siparişinin Logo özeti. Kalem başına Logo'daki net irsaliye miktarı (alış iade düşülür) CORE mal kabul toplamıyla
// karşılaştırılır. CORE'da kabul yoksa CORE miktarı gerçek sıfırdır ve fark sayılır; Logo'da irsaliye yoksa da Logo sıfırdır, yeter ki sipariş
// irsaliye okumasının penceresinde (IRSALIYE_GERI_GUN) açılmış olsun. Pencereden eski siparişte irsaliyesiz kalem "okunmadi"dır, sıfır uydurulmaz.
// Birimi tutmayan kalemde fark hesaplanmaz.
export interface OzetKalemi {
  siparisNo: string; siparisTarihi: string | null; siparisSatiriId: number; kalemAdi: string; miktar: string; birim: string; teslim: string; logoSatirRef: string | null;
}
export interface OzetIrsaliyeSatiri {
  firma: number; donem: number; irsaliyeRef: number; fisNo: string | null; belgeNo: string | null; tarih: string; tur: number; faturaNo: string | null;
  siparisNo: string; siparisSatirRef: string; miktar: string | null; birim: string | null;
}
export interface SiparisOzetiKalemi {
  siparisSatiriId: number; kalemAdi: string; siparisMiktari: string; birim: string; coreMiktari: string; logoMiktari: string | null; logoBirimi: string | null;
  durum: SiparisLogoKalemDurumu; fark: string | null;
}
export interface SiparisOzeti {
  siparisNo: string; logoda: boolean;
  irsaliyeler: { firma: number; donem: number; kayitNo: number; fisNo: string | null; belgeNo: string | null; tarih: string; iade: boolean }[];
  kalemler: SiparisOzetiKalemi[]; irsaliyeliKalem: number; farkliKalem: number; faturalar: string[] | null;
}
const ALIS_IADE = 6;
const isaretliOlcekli = (d: string): bigint => (d.startsWith('-') ? -olcekli(d.slice(1)) : olcekli(d));
const isaretliMetin = (o: bigint): string => (o < 0n ? `-${metne(-o)}` : metne(o));

export function siparisLogoOzetleri(
  nolar: readonly string[], kalemler: readonly OzetKalemi[], irsaliyeSatirlari: readonly OzetIrsaliyeSatiri[],
  faturalar: ReadonlyMap<string, readonly string[]> | null, pencereBasi: string,
): SiparisOzeti[] {
  return nolar.map((no) => {
    const benim = kalemler.filter((k) => k.siparisNo === no);
    const satirlar = irsaliyeSatirlari.filter((x) => x.siparisNo === no && benim.some((k) => k.logoSatirRef === x.siparisSatirRef));
    const pencerede = benim.some((k) => k.siparisTarihi !== null && k.siparisTarihi >= pencereBasi);
    const ozetKalemler = benim.map((k): SiparisOzetiKalemi => {
      const temel = { siparisSatiriId: k.siparisSatiriId, kalemAdi: k.kalemAdi, siparisMiktari: sadeMiktar(k.miktar), birim: k.birim, coreMiktari: sadeMiktar(k.teslim) };
      if (k.logoSatirRef === null) return { ...temel, logoMiktari: null, logoBirimi: null, durum: 'logo-bagi-yok', fark: null };
      const ls = satirlar.filter((x) => x.siparisSatirRef === k.logoSatirRef);
      const okunamayan = ls.some((x) => x.miktar === null || !IRSALIYE_ONDALIK.test(x.miktar));
      if (ls.length === 0 && !pencerede) return { ...temel, logoMiktari: null, logoBirimi: null, durum: 'okunmadi', fark: null };
      if (okunamayan || !IRSALIYE_ONDALIK.test(k.teslim)) return { ...temel, logoMiktari: null, logoBirimi: null, durum: 'okunmadi', fark: null };
      const logoBirimi = ls.find((x) => x.birim !== null)?.birim ?? null;
      const net = ls.reduce((t, x) => t + (x.tur === ALIS_IADE ? -1n : 1n) * isaretliOlcekli(x.miktar!), 0n);
      const logoMiktari = isaretliMetin(net);
      if (ls.some((x) => x.birim === null || birimAnahtari(x.birim) !== birimAnahtari(k.birim))) {
        return { ...temel, logoMiktari, logoBirimi, durum: 'birim', fark: null };
      }
      const fark = net - isaretliOlcekli(k.teslim);
      if (fark !== 0n) return { ...temel, logoMiktari, logoBirimi, durum: 'fark', fark: isaretliMetin(fark) };
      return { ...temel, logoMiktari, logoBirimi, durum: net === 0n ? 'bekliyor' : 'ayni', fark: null };
    });
    const irsaliyeler = [...new Map(satirlar.map((x) => [`${x.firma}-${x.donem}-${x.irsaliyeRef}`, {
      firma: x.firma, donem: x.donem, kayitNo: x.irsaliyeRef, fisNo: x.fisNo, belgeNo: x.belgeNo, tarih: x.tarih, iade: x.tur === ALIS_IADE,
    }])).values()];
    const fatura = faturalar?.get(no) ?? null;
    const irsaliyeFaturalari = satirlar.flatMap((x) => (x.faturaNo === null ? [] : [x.faturaNo]));
    return {
      siparisNo: no,
      logoda: benim.some((k) => k.logoSatirRef !== null),
      irsaliyeler,
      kalemler: ozetKalemler,
      irsaliyeliKalem: benim.filter((k) => k.logoSatirRef !== null && satirlar.some((x) => x.siparisSatirRef === k.logoSatirRef)).length,
      farkliKalem: ozetKalemler.filter((k) => k.durum === 'fark').length,
      // Fatura okuması kapalıysa ya da sipariş henüz okunmadıysa yalnız irsaliyenin faturası bilinir; o da yoksa "bilinmiyor" (null).
      faturalar: fatura === null && irsaliyeFaturalari.length === 0 ? null : [...new Set([...(fatura ?? []), ...irsaliyeFaturalari])].sort(),
    };
  });
}

// 3359 a: CRM satış müşterisi okumasının sonucu. Yardımcı 404 ile "yok" der (bulma ucu). Ulaşılamayan yardımcıya aynı istekte yeniden
// sorulmaz: kalan cariler aynı nedenle "okunamadı" olur (her biri zaman aşımı beklemesin).
export type CrmSonucu = { durum: 'var' | 'yok' | 'okunamadi'; neden: string | null };
export function crmDurumu(r: KopruSonucu): CrmSonucu {
  if (r.tur === 'basarili') return r.logicalRef === null ? { durum: 'yok', neden: null } : { durum: 'var', neden: null };
  return { durum: 'okunamadi', neden: rozetNedeni(r.ileti) };
}
// 3391 a: cariye bağlı CRM satış müşterisi kodları, yardımcının sırasıyla (ilki tekliflerde kullanılır). En çok 20 kod taşınır, sayı
// bütün bağlardır (ekran fazlasını "+N" der). Yalnız "var" iken; eski yardımcı listeyi vermez (null).
export const LOGO_CRM_KOD_SINIRI = 20;
// secilebilir (3391-2 a): yardımcı teklifte verilen CRM kodunu (salesCustomerCode) kullanır; eski yardımcı alanı yok sayar.
export interface CrmKodlari { kodlar: string[]; sayi: number; secilebilir: boolean }
export function crmKodlariniAyikla(govde: unknown): CrmKodlari | null {
  const g = typeof govde === 'object' && govde !== null ? govde as { customers?: unknown; customerCount?: unknown; salesCustomerCodeAccepted?: unknown } : {};
  if (!Array.isArray(g.customers)) return null;
  const kodlar = g.customers.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
  const sayi = typeof g.customerCount === 'number' && Number.isInteger(g.customerCount) && g.customerCount > kodlar.length ? g.customerCount : kodlar.length;
  return { kodlar: kodlar.slice(0, LOGO_CRM_KOD_SINIRI), sayi, secilebilir: g.salesCustomerCodeAccepted === true };
}
export const crmKodlari = (r: KopruSonucu): CrmKodlari | null =>
  (r.tur === 'basarili' && r.logicalRef !== null ? r.crmKodlari ?? null : null);
// 3391-2 a: CRM bağı denetiminde carinin sorunu; sorun yoksa null. Seçim varken birden fazla bağ sorun değildir.
export type CrmSorunu = 'crm-yok' | 'cok-bag' | 'secim-kalkti';
export function crmSorunu(secili: string | null, r: KopruSonucu): CrmSorunu | null {
  if (r.tur !== 'basarili') return null;
  if (r.logicalRef === null) return secili?.trim() ? 'secim-kalkti' : 'crm-yok';
  const l = crmKodlari(r);
  const kod = secili?.trim() ?? '';
  if (kod !== '') return l !== null && !l.kodlar.some((k) => k.toUpperCase() === kod.toUpperCase()) ? 'secim-kalkti' : null;
  return l !== null && l.sayi > 1 ? 'cok-bag' : null;
}

// 3391-2 a: firma kartında seçilmiş CRM kodu teklif gitmeden denetlenir: yardımcı kodu kullanabilmeli ve kod Logo'da hâlâ bu cariye bağlı
// olmalı. Seçim yoksa null (bağ sırasının ilki gider). Ret iletisi kullanıcıya gösterilir.
export function seciliCrmEngeli(secili: string | null, cari: string, r: KopruSonucu): string | null {
  const kod = secili?.trim() ?? '';
  if (kod === '') return null;
  const l = crmKodlari(r);
  if (l === null || !l.secilebilir) {
    return kirp(`Firma kartında CRM satış müşterisi ${kod} seçili ama Logo yardımcısı seçimi desteklemiyor; yardımcıyı güncelleyin ya da seçimi kaldırın.`);
  }
  if (!l.kodlar.some((k) => k.toUpperCase() === kod.toUpperCase())) {
    return kirp(`CRM satış müşterisi ${kod} Logo'da artık cari ${cari} ile bağlı değil; firma kartında yeniden seçin.`);
  }
  return null;
}
export const crmSorulurMu = (f: { tur: string; logoCariKodu: string | null }): boolean =>
  f.tur !== 'tedarikci' && (f.logoCariKodu ?? '').trim() !== '';
export const crmSorguyuKeser = (r: KopruSonucu): boolean => r.tur === 'ulasilamadi' || r.tur === 'belirsiz';
