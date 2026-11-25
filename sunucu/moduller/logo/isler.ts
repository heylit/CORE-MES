import { hataOzeti, isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import { okumaSikligiMi, turBaslasinMi, turBitti, yeniSiklikDurumu, type SiklikDurumu } from '#paylasilan/okuma-sikligi.ts';
import { GUNLUK_ILETI_EN_COK, GUNLUK_SAKLAMA_GUN, gunlukIletisi } from '#paylasilan/sozlesme/entegrasyon.ts';
import * as s from './sorgular.ts';
import type { AyarAnahtari } from '#paylasilan/ayarlar.ts';
import type { IsBekliyor, IsTanimi } from '#cekirdek/zamanlayici.ts';
import { logoyaGuncellemeGidecekMalzemeler, logoyaPasifGidecekMalzemeler, malzemeLogoGuncellemeSonucu, malzemeLogoPasifSonucu } from '../malzemeler/disari.ts';
import {
  karsilamaLogoSonucu, logoyaGidecekKarsilamalar, logoyaGidecekSiparisler, logoyaGidecekTalepler, logoyaGuncellemeGidecekSiparisler, logoyaIptalGidecekSiparisler,
  logoyaBekletmeGidecekSiparisler, logoyaKapatmaGidecekSiparisler, siparisLogoBekletmeSonucu, siparisLogoGuncellemeSonucu, siparisLogoIptalSonucu, siparisLogoKapatmaSonucu, siparisLogoSonucu, talepLogoSonucu,
} from '../satin-alma/disari.ts';
import { logoyaGidecekSatisSiparisleri, logoyaGidecekSatisTeklifleri, satisSiparisiLogoSonucu, satisTeklifiLogoSonucu } from '../siparisler/disari.ts';
import { emirlerinMalzemeFisleri, logoIcinMalzemeFisleri, malzemeFisiDegisiklikleri } from '../stok/disari.ts';
import { emirlerinProjeleri } from '../uretim-emirleri/disari.ts';
import { disDuzeltmeAcik, ortamKoprusu } from './baglanti.ts';
import { disDuzeltmeTuru, disSiparisOku } from './dis-siparis.ts';
import type { DisDuzeltmeOrtami } from './dis-siparis.ts';
import type { KopruIstemcisi } from './kopru.ts';
import { IS_ARALIGI_MS, OKUMA_ISI_ARALIGI_MS, gunlukSatiri, kapiSonucu, yonetimAkisi } from './kurallar.ts';
import type { YonetimAkisi } from './kurallar.ts';
import { cariHareketTuru, faturaListesiTuru } from './fatura-cari.ts';
import { irsaliyeTuru } from './irsaliye.ts';
import { sonAlisTuru } from './son-alis.ts';
import { BEKLEME_NEDENLERI, faturaTuru, listeOkumaTuru, malKabulTuru, malzemeFisiTuru, malzemeKartiOkumaTuru, malzemeKoduTuru, malzemeTuru, stokOkumaTuru, kullanimOkumaTuru, satinAlmaTuru, satisTuru, stokMalzemeFisiKaynagi, yeniSurecBellegi } from './servis.ts';
import { cariCrmKodlariOku, logoBelgeAra, logoCariAra, logoCariOku, logoMalzemeAra } from './servis.ts';
import type { CariOkumasi, MalzemeFisiKaynagi, SatinAlmaKaynagi, SatisKaynagi, TurSonucu, TxAcan } from './servis.ts';
import type { LogoCari, LogoMalzemeKarti } from './kurallar.ts';
import type { DisSiparisCevabi, LogoBelgeAramaCevabi, LogoBelirsizKontrolCevabi, LogoKontrolluGonderCevabi, LogoTekKayitCevabi, LogoBelgeAramaTuru, LogoKartAlislariCevabi, LogoKartHareketleriCevabi } from '#paylasilan/sozlesme/logo.ts';
import { kartAlislari, kartHareketleri } from './kart-bolumu.ts';
import { logoKontrol, logoKontrolluGonder } from './kontrollu-gonder.ts';
import type { Db } from '#cekirdek/db.ts';
import { tekKayitOku } from './tek-kayit.ts';
import type { KontrolIstegi } from './kontrollu-gonder.ts';
import { yardimciSurumunuSor } from './yardimci-surumu.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { projeSecenekleri } from '../projeler/disari.ts';
import { projeTuru } from './proje.ts';
import type { ProjeKaynagi, ProjeTurOrtami } from './proje.ts';

const YARDIMCI_SURUM_ARALIGI_MS = 60 * 60 * 1000;

// Köprü parametre olarak verilir ki "bağlantı kapalıyken istek yok" kuralı sahte köprüyle ölçülebilsin (3314 Test T2).
export async function yardimciSurumIsi(vt: TxAcan, kopru: KopruIstemcisi | null): Promise<IsBekliyor | undefined> {
  if (kopru === null) return isBekliyor(BEKLEME_NEDENLERI['ortam-degiskeni-yok']);
  if ((await vt.tx((db) => sistemAyariOku(db, 'logo.baglanti'))) !== true) return isBekliyor(BEKLEME_NEDENLERI.kapali);
  await yardimciSurumunuSor(kopru);
  return undefined;
}

// İş her zaman koşar; istek ancak "Logo bağlantısı" ayarı açık ve köprü değişkenleri varken çıkar (malzemeTuru).
const bellek = yeniSurecBellegi();

// Köprü tek oturumla çalışır: işler ayrı zamanlayıcıda koşsa da Logo'ya istek aynı anda iki değil, sırayla gider.
let sonIs: Promise<unknown> = Promise.resolve();
function sirali<T>(is: () => Promise<T>): Promise<T> {
  const bu = sonIs.then(is, is);
  sonIs = bu.catch(() => undefined);
  return bu;
}

// Ayar kapalıyken ya da ortam değişkeni yokken iş hata değil "bekliyor" döner; sabit neden sağlık ayrıntısında görünür.
function beklemeyeCevir(sonuc: TurSonucu): IsBekliyor | undefined {
  switch (sonuc.tur) {
    case 'kapali': case 'ortam-degiskeni-yok': case 'satin-alma-kapali': case 'satis-kapali':
    case 'mal-kabul-kapali': case 'liste-kapali': case 'fatura-kapali': case 'malzeme-fisi-kapali': case 'malzeme-karti-kapali': case 'stok-kapali': case 'kullanim-kapali': case 'irsaliye-kapali': case 'son-alis-kapali': case 'fatura-listesi-kapali': case 'cari-hareket-kapali':
    case 'dis-duzeltme-kapali': case 'irsaliye-yazma-kapali':
      return isBekliyor(BEKLEME_NEDENLERI[sonuc.tur]);
    case 'proje-kapali':
      return isBekliyor(BEKLEME_NEDENLERI['proje-kapali']);
    case 'proje-kurulum-bekliyor':
      return isBekliyor(sonuc.ileti);
    case 'proje': case 'proje-niyet':
      return undefined;
    case 'bos': case 'gonderim': case 'guncelleme': case 'pasif': case 'pasif-niyet': case 'iptal': case 'kapatma': case 'bekletme': case 'karsilama': case 'liste':
    case 'malzeme-fisi-niyet': case 'malzeme-fisi': case 'irsaliye-niyet': case 'irsaliye': case 'niyet': case 'okuma': case 'siparisler-siparisi-niyet':
    case 'siparisler-siparisi': case 'siparisler-teklifi-niyet': case 'siparisler-teklifi': case 'talep-niyet':
    case 'talep': case 'dis-duzeltme':
    default:
      return undefined;
  }
}

// 3445: akış günlüğü. Yazılamayan günlük satırı turu düşürmez (günlük bilgi içindir). Eski satırlar saatte bir silinir.
let sonTemizlik = 0;
export async function gunlugeYaz(vt: TxAcan, k: s.GunlukKaydi, saat: () => Date = () => new Date()): Promise<void> {
  const simdi = saat();
  try {
    await vt.tx(async (db) => {
      await s.gunlukYaz(db, { ...k, ileti: gunlukIletisi(k.ileti, GUNLUK_ILETI_EN_COK) }, simdi);
      if (simdi.getTime() - sonTemizlik >= 3_600_000) {
        sonTemizlik = simdi.getTime();
        await s.gunlukTemizle(db, new Date(simdi.getTime() - GUNLUK_SAKLAMA_GUN * 24 * 3_600_000));
      }
    });
  } catch {
    // Günlük yazılamadıysa tur yine sayılır; hata zamanlayıcının kendi kaydında görünür.
  }
}

// 3445: zamanlanmış okumaların sıklık kapısı (süreç belleği). İş her zamanki aralığıyla döner; istek ancak tur sırası gelince çıkar.
const kapilar = new Map<string, SiklikDurumu>();
export const kapiDurumu = (anahtar: string): SiklikDurumu => kapilar.get(anahtar) ?? yeniSiklikDurumu();
// "Şimdi oku": bir sonraki iş turunda okuma hemen başlar; art arda basmak tek istek sayılır (Risk K8).
export function simdiOkuIste(anahtar: string): void {
  kapilar.set(anahtar, { ...kapiDurumu(anahtar), istendi: true });
}
export function kapilariSifirla(): void {
  kapilar.clear();
}

// İş transaction dışında koşar: tur kendi kısa transaction'larını açar, köprü cevabını transaction dışında bekler (UYUM-BORCU 2).
// Sıklık kapısı olan okumada tur yalnız sırası gelince koşar; her turun sonucu akış günlüğüne yazılır.
function kopruIsi(ad: string, aralikMs: number, tur: (vt: TxAcan, zorlaAni: Date | null) => Promise<TurSonucu>, kapi?: YonetimAkisi): IsTanimi {
  return isTanimi({ ad, aralikMs, txDisi: (vt) => sirali(() => kapiliTur(vt, ad, tur, kapi)) });
}

export async function kapiliTur(
  vt: TxAcan, ad: string, tur: (vt: TxAcan, zorlaAni: Date | null) => Promise<TurSonucu>, kapi?: YonetimAkisi, saat: () => Date = () => new Date(),
): Promise<IsBekliyor | undefined> {
  let d: SiklikDurumu | null = null;
  if (kapi?.siklikAyari !== undefined) {
    const anahtar = kapi.siklikAyari;
    const deger: unknown = await vt.tx((db) => sistemAyariOku(db, anahtar as AyarAnahtari));
    const acilan = turBaslasinMi(kapiDurumu(kapi.anahtar), typeof deger === 'string' && okumaSikligiMi(deger) ? deger : '15dk', saat());
    if (acilan === null) return undefined;
    d = acilan;
    kapilar.set(kapi.anahtar, d);
  }
  let sonuc: TurSonucu;
  try {
    sonuc = await tur(vt, d?.zorlaAni ?? null);
  } catch (e) {
    if (kapi && d) kapilar.set(kapi.anahtar, turBitti(d, { kayitGeldi: false }, 1, saat()));
    const akis = kapi?.anahtar ?? gunlukSatiri(ad, { tur: 'gonderim', sonuc: 'belirsiz', no: 0 })?.akis;
    if (akis !== undefined) await gunlugeYaz(vt, { akis, yon: kapi ? 'okuma' : 'yazma', sonuc: 'hata', sayi: null, ileti: hataOzeti(e) }, saat);
    throw e;
  }
  if (kapi && d) kapilar.set(kapi.anahtar, turBitti(d, kapiSonucu(sonuc), kapi.enAzTur ?? 1, saat()));
  const satir = gunlukSatiri(ad, sonuc as Parameters<typeof gunlukSatiri>[1]);
  if (satir !== null) await gunlugeYaz(vt, satir, saat);
  return beklemeyeCevir(sonuc);
}

// Satın alma işi (talep fişi, sipariş, karşılama): kaynağı satın almanın disari.ts işlevleridir; istek ancak "Logo: satın alma gönderimi"
// açıkken çıkar (gövde alan adları gerçek köprüde doğrulanana kadar kapalı tutulur, UYUM-BORCU 13). Belleği ayrıdır: niyet anahtarı belge kimliğidir, kart no ile sipariş kimliği karışmaz.
export function satinAlmaIsi(kaynak: SatinAlmaKaynagi): IsTanimi {
  const siparisBellegi = yeniSurecBellegi();
  return kopruIsi('logo-satin-alma-gonderimi', IS_ARALIGI_MS, (vt) => satinAlmaTuru(vt, { kopru: ortamKoprusu, bellek: siparisBellegi, saat: () => new Date(), kaynak }));
}

// Satış işi (teklif, tekliften sipariş): kaynağı Siparişler'in disari.ts işlevleridir.
export function satisIsi(kaynak: SatisKaynagi): IsTanimi {
  const satisBellegi = yeniSurecBellegi();
  return kopruIsi('logo-satis-gonderimi', IS_ARALIGI_MS, (vt) => satisTuru(vt, { kopru: ortamKoprusu, bellek: satisBellegi, saat: () => new Date(), kaynak }));
}

// Malzeme fişi: fişin sahibi stoktur (293 a); Logo değişiklik akışını izler, satırları stoğun disari.ts işlevlerinden okur.
export function malzemeFisiIsi(kaynak: MalzemeFisiKaynagi): IsTanimi {
  const fisBellegi = yeniSurecBellegi();
  return kopruIsi('logo-malzeme-fisi-gonderimi', IS_ARALIGI_MS, (vt) => malzemeFisiTuru(vt, { kopru: ortamKoprusu, bellek: fisBellegi, saat: () => new Date(), kaynak }));
}

// 3315 c: proje kartı; kaynağı projelerin disari.ts'idir (aktif projeler). Belleği ayrıdır: anahtar proje kimliğidir.
export function projeIsi(kaynak: ProjeKaynagi, kopru: KopruIstemcisi | null = ortamKoprusu): IsTanimi {
  const o: ProjeTurOrtami = { kopru, bellek: yeniSurecBellegi(), saat: () => new Date(), kaynak, kurulum: { son: null, ileti: null } };
  return kopruIsi('logo-proje-gonderimi', IS_ARALIGI_MS, (vt) => projeTuru(vt, o));
}
const projeKaynagi: ProjeKaynagi = {
  aktifProjeler: async (db) => (await projeSecenekleri(db, { yalnizAktif: true })).map((p) => ({ id: p.id, kod: p.kod, ad: p.ad })),
};

// Okuma işleri (logo -> TMI): ayrı bellek; her biri kendi anahtarı açıkken istek atar, okunanı yalnız saklar.
const okumaBellegi = yeniSurecBellegi();
const okumaOrtami = (zorlaAni: Date | null = null) => ({ kopru: ortamKoprusu, bellek: okumaBellegi, saat: () => new Date(), zorlaAni });
const kapisi = (anahtar: string): YonetimAkisi => {
  const a = yonetimAkisi(anahtar);
  if (a === undefined) throw new Error(`Logo yönetim akışı yok: ${anahtar}`);
  return a;
};

// Kayıtlı işin ortamı; testte köprü sahtesiyle kurulur, anahtar bağlantısı ise burada kalır (anahtar kuyruğa girmiş işi de durdurur).
export const disDuzeltmeIsOrtami = (kopru: KopruIstemcisi | null = ortamKoprusu): DisDuzeltmeOrtami => ({ kopru, acik: disDuzeltmeAcik, saat: () => new Date() });

export const isler = [
  kopruIsi('logo-malzeme-gonderimi', IS_ARALIGI_MS, (vt) =>
    malzemeTuru(vt, {
      kopru: ortamKoprusu, bellek, saat: () => new Date(),
      // Kuyruğu ve sonucu malzemelerin işlevleridir; istek ancak "Logo: malzeme adı güncellemesi" açıkken çıkar.
      malzemeGuncelleme: { gidecekler: logoyaGuncellemeGidecekMalzemeler, sonuc: malzemeLogoGuncellemeSonucu },
      // 2114b: silinen Logo kartı Logo'da pasife alınır; istek ancak "Logo bağlantısı" açıkken çıkar (istek de yalnız o zaman alınır).
      malzemePasif: { gidecekler: logoyaPasifGidecekMalzemeler, sonuc: malzemeLogoPasifSonucu },
    })),
  satinAlmaIsi({
    gidecekler: logoyaGidecekSiparisler,
    sonuc: siparisLogoSonucu,
    guncellemeGidecekler: logoyaGuncellemeGidecekSiparisler,
    guncellemeSonucu: siparisLogoGuncellemeSonucu,
    kapatmaGidecekler: logoyaKapatmaGidecekSiparisler,
    kapatmaSonucu: siparisLogoKapatmaSonucu,
    bekletmeGidecekler: logoyaBekletmeGidecekSiparisler,
    bekletmeSonucu: siparisLogoBekletmeSonucu,
    iptalGidecekler: logoyaIptalGidecekSiparisler,
    iptalSonucu: siparisLogoIptalSonucu,
    talepGidecekler: logoyaGidecekTalepler,
    talepSonucu: talepLogoSonucu,
    karsilamaGidecekler: logoyaGidecekKarsilamalar,
    karsilamaSonucu: karsilamaLogoSonucu,
  }),
  satisIsi({
    teklifGidecekler: logoyaGidecekSatisTeklifleri,
    teklifSonucu: satisTeklifiLogoSonucu,
    siparisGidecekler: logoyaGidecekSatisSiparisleri,
    siparisSonucu: satisSiparisiLogoSonucu,
  }),
  projeIsi(projeKaynagi),
  malzemeFisiIsi(stokMalzemeFisiKaynagi({ degisiklikler: malzemeFisiDegisiklikleri, fisler: logoIcinMalzemeFisleri, emirFisleri: emirlerinMalzemeFisleri, emirProjeleri: emirlerinProjeleri })),
  kopruIsi('logo-mal-kabul-okumasi', OKUMA_ISI_ARALIGI_MS, (vt, z) => malKabulTuru(vt, okumaOrtami(z)), kapisi('mal-kabul')),
  kopruIsi('logo-liste-okumasi', OKUMA_ISI_ARALIGI_MS, (vt, z) => listeOkumaTuru(vt, okumaOrtami(z)), kapisi('liste')),
  kopruIsi('logo-fatura-okumasi', OKUMA_ISI_ARALIGI_MS, (vt, z) => faturaTuru(vt, okumaOrtami(z)), kapisi('fatura')),
  // Logo malzeme kodu aynası (2089-2 a): yeni stok kodu Logo'da kullanılan numarayı atlar.
  kopruIsi('logo-malzeme-kodu-okumasi', OKUMA_ISI_ARALIGI_MS, (vt, z) => malzemeKoduTuru(vt, okumaOrtami(z)), kapisi('malzeme-kodu')),
  // 2116: Logo malzeme kartı ve stok toplamı aynası (yalnız okunur).
  kopruIsi('logo-malzeme-karti-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => malzemeKartiOkumaTuru(vt, okumaOrtami())),
  kopruIsi('logo-stok-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => stokOkumaTuru(vt, okumaOrtami())),
  kopruIsi('logo-kullanim-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => kullanimOkumaTuru(vt, okumaOrtami())),
  kopruIsi('logo-irsaliye-okumasi', OKUMA_ISI_ARALIGI_MS, (vt, z) => irsaliyeTuru(vt, okumaOrtami(z)), kapisi('irsaliye')),
  // 3384-c a: Logo son alış kopyası (yalnız okunur, yalnız eklenir).
  kopruIsi('logo-son-alis-okumasi', OKUMA_ISI_ARALIGI_MS, (vt, z) => sonAlisTuru(vt, okumaOrtami(z)), kapisi('son-alis')),
  // 3675 D1: fatura başlığı ve cari hareket aynası (yalnız okunur, varsayılan kapalı).
  kopruIsi('logo-fatura-listesi-okumasi', OKUMA_ISI_ARALIGI_MS, (vt, z) => faturaListesiTuru(vt, okumaOrtami(z)), kapisi('fatura-listesi')),
  kopruIsi('logo-cari-hareket-okumasi', OKUMA_ISI_ARALIGI_MS, (vt, z) => cariHareketTuru(vt, okumaOrtami(z)), kapisi('cari-hareket')),
  // 3314: çalışan yardımcının sürümü saatte bir sorulur (yalnız GET); bağlantı kapalıyken ya da köprü yokken istek atılmaz.
  isTanimi({ ad: 'logo-yardimci-surumu', aralikMs: YARDIMCI_SURUM_ARALIGI_MS, txDisi: (vt) => sirali(() => yardimciSurumIsi(vt, ortamKoprusu)) }),
  // D7: Logo'da açılmış siparişin düzeltmesi; istek ancak TMIV2_LOGO_SIPARIS_DUZELTME=acik ve "Logo bağlantısı" açıkken çıkar.
  kopruIsi('logo-dis-siparis-duzeltme', IS_ARALIGI_MS, (vt) => disDuzeltmeTuru(vt, disDuzeltmeIsOrtami())),
];

// 3445: yönetim sayfasındaki "Bağlantıyı test et"; zamanlanmış işlerle aynı sıradan (tek oturum).
export const siraliYardimciSurumu = (kopru: KopruIstemcisi) => sirali(() => yardimciSurumunuSor(kopru));

// 2118: cari arama kullanıcı isteğiyle gelir; köprüye zamanlanmış işlerle aynı sıradan gider (tek oturum). Uç transaction dışında çağırır.
export const logodaCariAra = (vt: TxAcan, metin: string): Promise<CariOkumasi<LogoCari[]>> => sirali(() => logoCariAra(vt, ortamKoprusu, metin));
// 3080 a: Logo geçişinde tek kart araması; cari aramasıyla aynı sıradan gider. Uç transaction dışında çağırır.
export const logodaMalzemeAra = (vt: TxAcan, kisiId: number, metin: string): Promise<CariOkumasi<LogoMalzemeKarti[]>> =>
  sirali(() => logoMalzemeAra(vt, ortamKoprusu, kisiId, metin));
// 3360 a: beş listedeki "Logo'da ara"; cari aramasıyla aynı sıradan gider. Uç transaction dışında çağırır.
export const logodaBelgeAra = (
  vt: TxAcan, tur: LogoBelgeAramaTuru, metin: string, fiyatGorunur: boolean, a: { kisiId?: number; belge?: number } = {},
): Promise<LogoBelgeAramaCevabi> => sirali(() => logoBelgeAra(vt, ortamKoprusu, tur, metin, fiyatGorunur, a));
// 3626: sonucu bilinmeyen belgeyi gönderme öncesi Logo'da arama; köprüye zamanlanmış işlerle aynı sıradan gider. Uç transaction dışında çağırır.
export const logodaBelgeKontrol = (vt: TxAcan, kisiId: number, g: KontrolIstegi): Promise<LogoBelirsizKontrolCevabi> => sirali(() => logoKontrol(vt, ortamKoprusu, kisiId, g));
// 3626: onayda göndermeden hemen önce yeniden arama (köprüye tek GET); POST transaction içinde çalışır, sıradan gider.
export const logodaKontrolluGonder = (db: Db, kisiId: number, g: KontrolIstegi, simdi: Date): Promise<LogoKontrolluGonderCevabi> =>
  sirali(() => logoKontrolluGonder(db, ortamKoprusu, kisiId, g, simdi));
// 3626: okuma akışında tek kaydı yeniden okuma; köprüye zamanlanmış işlerle aynı sıradan gider. Uç transaction dışında çağırır.
export const logodanTekKayitOku = (vt: TxAcan, kisiId: number, akis: string, kod: string): Promise<LogoTekKayitCevabi> =>
  sirali(() => tekKayitOku(vt, ortamKoprusu, kisiId, akis, kod));
export const logodanCariOku = (vt: TxAcan, kod: string): Promise<CariOkumasi<LogoCari | null>> => sirali(() => logoCariOku(vt, ortamKoprusu, kod));
// 3391-2 a: firma kartında CRM kodu seçimi; kullanıcı isteğiyle, sırayla.
export const logodanCrmKodlari = (vt: TxAcan, kod: string): Promise<CariOkumasi<{ kodlar: string[]; secilebilir: boolean } | null>> =>
  sirali(() => cariCrmKodlariOku(vt, ortamKoprusu, kod));
// D7: Logo'daki siparişi okuma kullanıcı isteğiyle gelir; köprüye zamanlanmış işlerle aynı sıradan gider. Uç transaction dışında çağırır.
export const logodanDisSiparisOku = (vt: TxAcan, kisiId: number, no: string): Promise<DisSiparisCevabi> =>
  sirali(() => disSiparisOku(vt, ortamKoprusu, kisiId, no));
// 3201 a: malzeme kartında hareket ve son alış okuması kullanıcı isteğiyle gelir; köprüye zamanlanmış işlerle aynı sıradan gider. Uç transaction dışında çağırır.
export const logodanKartHareketleri = (vt: TxAcan, kod: string, once: number | null): Promise<LogoKartHareketleriCevabi> =>
  sirali(() => kartHareketleri(vt, ortamKoprusu, kod, once));
export const logodanKartAlislari = (vt: TxAcan, kod: string): Promise<LogoKartAlislariCevabi> => sirali(() => kartAlislari(vt, ortamKoprusu, kod));
