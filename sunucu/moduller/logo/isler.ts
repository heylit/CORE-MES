import { isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import type { IsBekliyor, IsTanimi } from '#cekirdek/zamanlayici.ts';
import { logoyaGuncellemeGidecekMalzemeler, logoyaPasifGidecekMalzemeler, malzemeLogoGuncellemeSonucu, malzemeLogoPasifSonucu } from '../malzemeler/disari.ts';
import {
  karsilamaLogoSonucu, logoyaGidecekKarsilamalar, logoyaGidecekSiparisler, logoyaGidecekTalepler, logoyaGuncellemeGidecekSiparisler, logoyaIptalGidecekSiparisler,
  logoyaBekletmeGidecekSiparisler, logoyaKapatmaGidecekSiparisler, siparisLogoBekletmeSonucu, siparisLogoGuncellemeSonucu, siparisLogoIptalSonucu, siparisLogoKapatmaSonucu, siparisLogoSonucu, talepLogoSonucu,
} from '../satin-alma/disari.ts';
import { logoyaGidecekSatisSiparisleri, logoyaGidecekSatisTeklifleri, satisSiparisiLogoSonucu, satisTeklifiLogoSonucu } from '../siparisler/disari.ts';
import { emirlerinMalzemeFisleri, logoIcinMalzemeFisleri, malzemeFisiDegisiklikleri } from '../stok/disari.ts';
import { disDuzeltmeAcik, ortamKoprusu } from './baglanti.ts';
import { disDuzeltmeTuru, disSiparisOku } from './dis-siparis.ts';
import type { DisDuzeltmeOrtami } from './dis-siparis.ts';
import type { KopruIstemcisi } from './kopru.ts';
import { IS_ARALIGI_MS, OKUMA_ISI_ARALIGI_MS } from './kurallar.ts';
import { BEKLEME_NEDENLERI, faturaTuru, listeOkumaTuru, malKabulTuru, malzemeFisiTuru, malzemeKartiOkumaTuru, malzemeKoduTuru, malzemeTuru, stokOkumaTuru, satinAlmaTuru, satisTuru, stokMalzemeFisiKaynagi, yeniSurecBellegi } from './servis.ts';
import { logoCariAra, logoCariOku } from './servis.ts';
import type { CariOkumasi, MalzemeFisiKaynagi, SatinAlmaKaynagi, SatisKaynagi, TurSonucu, TxAcan } from './servis.ts';
import type { LogoCari } from './kurallar.ts';
import type { DisSiparisCevabi } from '#paylasilan/sozlesme/logo.ts';

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
    case 'mal-kabul-kapali': case 'liste-kapali': case 'fatura-kapali': case 'malzeme-fisi-kapali': case 'malzeme-karti-kapali': case 'stok-kapali': case 'dis-duzeltme-kapali':
      return isBekliyor(BEKLEME_NEDENLERI[sonuc.tur]);
    case 'bos': case 'gonderim': case 'guncelleme': case 'pasif': case 'pasif-niyet': case 'iptal': case 'kapatma': case 'bekletme': case 'karsilama': case 'liste':
    case 'malzeme-fisi-niyet': case 'malzeme-fisi': case 'niyet': case 'okuma': case 'siparisler-siparisi-niyet':
    case 'siparisler-siparisi': case 'siparisler-teklifi-niyet': case 'siparisler-teklifi': case 'talep-niyet':
    case 'talep': case 'dis-duzeltme':
    default:
      return undefined;
  }
}

// İş transaction dışında koşar: tur kendi kısa transaction'larını açar, köprü cevabını transaction dışında bekler (UYUM-BORCU 2).
function kopruIsi(ad: string, aralikMs: number, tur: (vt: TxAcan) => Promise<TurSonucu>): IsTanimi {
  return isTanimi({ ad, aralikMs, txDisi: (vt) => sirali(async () => beklemeyeCevir(await tur(vt))) });
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

// Okuma işleri (logo -> TMI): ayrı bellek; her biri kendi anahtarı açıkken istek atar, okunanı yalnız saklar.
const okumaBellegi = yeniSurecBellegi();
const okumaOrtami = () => ({ kopru: ortamKoprusu, bellek: okumaBellegi, saat: () => new Date() });

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
  malzemeFisiIsi(stokMalzemeFisiKaynagi({ degisiklikler: malzemeFisiDegisiklikleri, fisler: logoIcinMalzemeFisleri, emirFisleri: emirlerinMalzemeFisleri })),
  kopruIsi('logo-mal-kabul-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => malKabulTuru(vt, okumaOrtami())),
  kopruIsi('logo-liste-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => listeOkumaTuru(vt, okumaOrtami())),
  kopruIsi('logo-fatura-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => faturaTuru(vt, okumaOrtami())),
  // Logo malzeme kodu aynası (2089-2 a): yeni stok kodu Logo'da kullanılan numarayı atlar.
  kopruIsi('logo-malzeme-kodu-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => malzemeKoduTuru(vt, okumaOrtami())),
  // 2116: Logo malzeme kartı ve stok toplamı aynası (yalnız okunur).
  kopruIsi('logo-malzeme-karti-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => malzemeKartiOkumaTuru(vt, okumaOrtami())),
  kopruIsi('logo-stok-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => stokOkumaTuru(vt, okumaOrtami())),
  // D7: Logo'da açılmış siparişin düzeltmesi; istek ancak TMIV2_LOGO_SIPARIS_DUZELTME=acik ve "Logo bağlantısı" açıkken çıkar.
  kopruIsi('logo-dis-siparis-duzeltme', IS_ARALIGI_MS, (vt) => disDuzeltmeTuru(vt, disDuzeltmeIsOrtami())),
];

// 2118: cari arama kullanıcı isteğiyle gelir; köprüye zamanlanmış işlerle aynı sıradan gider (tek oturum). Uç transaction dışında çağırır.
export const logodaCariAra = (vt: TxAcan, metin: string): Promise<CariOkumasi<LogoCari[]>> => sirali(() => logoCariAra(vt, ortamKoprusu, metin));
export const logodanCariOku = (vt: TxAcan, kod: string): Promise<CariOkumasi<LogoCari | null>> => sirali(() => logoCariOku(vt, ortamKoprusu, kod));
// D7: Logo'daki siparişi okuma kullanıcı isteğiyle gelir; köprüye zamanlanmış işlerle aynı sıradan gider. Uç transaction dışında çağırır.
export const logodanDisSiparisOku = (vt: TxAcan, kisiId: number, no: string): Promise<DisSiparisCevabi> =>
  sirali(() => disSiparisOku(vt, ortamKoprusu, kisiId, no));
