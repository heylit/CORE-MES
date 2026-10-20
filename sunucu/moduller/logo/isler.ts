import { isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import type { IsBekliyor, IsTanimi } from '#cekirdek/zamanlayici.ts';
import { logoyaGuncellemeGidecekMalzemeler, malzemeLogoGuncellemeSonucu } from '../malzemeler/disari.ts';
import {
  karsilamaLogoSonucu, logoyaGidecekKarsilamalar, logoyaGidecekSiparisler, logoyaGidecekTalepler, logoyaGuncellemeGidecekSiparisler, logoyaIptalGidecekSiparisler,
  logoyaKapatmaGidecekSiparisler, siparisLogoGuncellemeSonucu, siparisLogoIptalSonucu, siparisLogoKapatmaSonucu, siparisLogoSonucu, talepLogoSonucu,
} from '../satin-alma/disari.ts';
import { emirMalzemeFisleri } from '../stok/disari.ts';
import { emirHurdalari, emirNolari } from '../uretim-emirleri/disari.ts';
import { logoyaGidecekSatisSiparisleri, logoyaGidecekSatisTeklifleri, satisSiparisiLogoSonucu, satisTeklifiLogoSonucu } from '../portal/disari.ts';
import { ortamKoprusu } from './baglanti.ts';
import { IS_ARALIGI_MS, OKUMA_ISI_ARALIGI_MS } from './kurallar.ts';
import { BEKLEME_NEDENLERI, emirMalzemeFisiKaynagi, faturaTuru, listeOkumaTuru, malKabulTuru, malzemeFisiTuru, malzemeTuru, satinAlmaTuru, satisTuru, yeniSurecBellegi } from './servis.ts';
import type { MalzemeFisiKaynagi, SatinAlmaKaynagi, SatisKaynagi, TurSonucu, TxAcan } from './servis.ts';

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
    case 'mal-kabul-kapali': case 'liste-kapali': case 'fatura-kapali': case 'malzeme-fisi-kapali':
      return isBekliyor(BEKLEME_NEDENLERI[sonuc.tur]);
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

// Satış işi (teklif, tekliden sipariş): kaynağı portalın disari.ts işlevleridir (kart #941).
export function satisIsi(kaynak: SatisKaynagi): IsTanimi {
  const satisBellegi = yeniSurecBellegi();
  return kopruIsi('logo-satis-gonderimi', IS_ARALIGI_MS, (vt) => satisTuru(vt, { kopru: ortamKoprusu, bellek: satisBellegi, saat: () => new Date(), kaynak }));
}

// Malzeme fişi (sarf, üretimden giriş): kuyruk logonun, satırlar stok ve üretim emirlerinin disari.ts işlevlerinden (335).
export function malzemeFisiIsi(kaynak: MalzemeFisiKaynagi): IsTanimi {
  const fisBellegi = yeniSurecBellegi();
  return kopruIsi('logo-malzeme-fisi-gonderimi', IS_ARALIGI_MS, (vt) => malzemeFisiTuru(vt, { kopru: ortamKoprusu, bellek: fisBellegi, saat: () => new Date(), kaynak }));
}

// Okuma işleri (logo -> TMI): ayrı bellek; her biri kendi anahtarı açıkken istek atar, okunanı yalnız saklar.
const okumaBellegi = yeniSurecBellegi();
const okumaOrtami = () => ({ kopru: ortamKoprusu, bellek: okumaBellegi, saat: () => new Date() });

export const isler = [
  kopruIsi('logo-malzeme-gonderimi', IS_ARALIGI_MS, (vt) =>
    malzemeTuru(vt, {
      kopru: ortamKoprusu, bellek, saat: () => new Date(),
      // Kuyruğu ve sonucu malzemelerin işlevleridir; istek ancak "Logo: malzeme adı güncellemesi" açıkken çıkar.
      malzemeGuncelleme: { gidecekler: logoyaGuncellemeGidecekMalzemeler, sonuc: malzemeLogoGuncellemeSonucu },
    })),
  satinAlmaIsi({
    gidecekler: logoyaGidecekSiparisler,
    sonuc: siparisLogoSonucu,
    guncellemeGidecekler: logoyaGuncellemeGidecekSiparisler,
    guncellemeSonucu: siparisLogoGuncellemeSonucu,
    kapatmaGidecekler: logoyaKapatmaGidecekSiparisler,
    kapatmaSonucu: siparisLogoKapatmaSonucu,
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
  malzemeFisiIsi(emirMalzemeFisiKaynagi({ emirNolari, emirMalzemeFisleri, emirHurdalari })),
  kopruIsi('logo-mal-kabul-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => malKabulTuru(vt, okumaOrtami())),
  kopruIsi('logo-liste-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => listeOkumaTuru(vt, okumaOrtami())),
  kopruIsi('logo-fatura-okumasi', OKUMA_ISI_ARALIGI_MS, (vt) => faturaTuru(vt, okumaOrtami())),
];
