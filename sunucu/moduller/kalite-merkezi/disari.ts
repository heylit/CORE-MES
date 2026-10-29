import type { KapanisCozucusu } from '../uretim-emirleri/disari.ts';
import * as servis from './servis.ts';

// Başka modüller (yönetici paneli) kalite özetini buradan alır. Çağıranın db'sini kullanır, yetki denetlemez (denetim çağıran modülün ucundadır).
export { ozet } from './servis.ts';
// İlk parça kararı (229 a): Arkon numune kararı buradan verir; yetkiyi Arkon'un ucu denetler.
export { ilkParcaKarari } from './servis.ts';
// Arkon'un ilk parça kapısı kararı buradan okur (denetim #12): emir başına son karar; kararsız emir haritada yoktur. Yetki denetlemez.
export { adimIlkParcaKararlari, ilkParcaKararlari } from './servis.ts';
// Askıdaki tedarikçi (karar 87): Satın alma tedarikçinin kalite onayını buradan okur. Uygulamanın tedarikçisinde firma kimliği yoktur; ad
// ve kod döner, firmaya eşleme okuyanındır. Yetkiyi çağıranın ucu denetler.
export { kaliteAskisindakiTedarikciler } from './servis.ts';
// Tedarikçi onay durumu (236 a): durumun sahibi Kalite Merkezi'dir. Satın alma firma kimliğiyle okur; kaydı olmayan firma haritada
// yoktur. Firma kimliği olmayan eski kayıt kod ya da adla bağlanır (kurallar.ts). Yetkiyi çağıranın ucu denetler.
export { tedarikciOnayDurumlari } from './servis.ts';
export type { KmTedarikciDurumu } from '#paylasilan/sozlesme/kalite-merkezi.ts';
// Kalibrasyon hazırlığı (262 a): Üretim emirlerinin hazırlık kapısı emir başına buradan okur. Emrin cihazları emrin muayenelerindedir;
// cihazı olmayan emir seçili değildir (secildi false). Geçerliliği kalibrasyon modülü verir. Yetki denetlemez.
export { kalibrasyonHazirlikDurumlari } from './servis.ts';
export type { KalibrasyonHazirligi } from './kurallar.ts';
// DÖF (155 a): DÖF'ün tek sahibi Kalite Merkezi'dir. Denetim hazırlığı bulgusundan DÖF'ü buradan açar (aynı kaynak anahtarı ikinci DÖF
// açmaz, var olanı döner) ve kaynak anahtarı başına durumunu buradan okur. Yetkiyi çağıranın ucu denetler; açan kişi kayıtta yazan olur.
export { dofAc, dofDurumlari } from './servis.ts';
export type { DofAcIstegi, DofDurumu, DofKaynagi } from './kurallar.ts';
// AQL lot planı ve lot kararı (564 2 a, 4 a, 6 a): Arkon kalite istasyonu numune sayısını ve kabul sayısını buradan alır, lot kararını
// buraya lot kabul kaydı olarak yazar. Plan uygulamanın varsayılan AQL ayarından (ya da Hazırlık'ın değiştirdiği ayardan) ve parti
// büyüklüğünden; karar sunucuda hesaplanır. Stok yansıması çağıranındır. Yetkiyi çağıranın ucu denetler.
export { lotKarariYaz, muayenePlaniOner } from './servis.ts';
export type { MuayenePlaniSonucu } from './servis.ts';
export type { AqlSinifi, LotBulunani, LotKarariIstegi, MuayeneAqlAyari, MuayenePlani } from './kurallar.ts';
// Stüdyo (595 1 b, 597 a, 600 a): teknik resim, balon, numune planı, numune ve ölçümün sahibi Kalite Merkezi'dir. Arkon kalite
// istasyonu ve Hazırlık parçanın resim ve planını buradan okur; numuneyi, ölçümü (kaynak: operatör, kalite, CMM) ve numune kararını
// buraya yazar. Yetkiyi ve emrin kapsamını çağıranın ucu denetler; yazan kişi kayıtta tutulur.
export { acikNumuneler, emirNumuneleri, emirOlcumleri, numuneIste, numuneKarari, numuneOku, olcumYaz, resimDosyasi, studyoParcasi } from './studyo.ts';
export type { KmNumune, KmNumuneIstegi, KmNumuneKarari, KmOlcum, KmOlcumKaynagi, KmOlcumVerisi, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
// Kapanış maddeleri (1074 a): Üretim Emirleri emrin kapanışında "ölçüm ve numune kararları" ile "açık NCR" maddelerini emir başına
// buradan okur (bağı kablolama.ts kurar). Var olmayan emirde null döner. NCR emre hatalı parça kararının kaynak bağıyla ya da emir
// alanındaki numarayla bağlanır; bağdan önce açılmış hatalı parça NCR'si açıkken madde bilinmiyordur (null). Yetki denetlemez.
export const kapanisNcrDurumu: KapanisCozucusu = servis.kapanisNcrDurumu;
export const kapanisOlcumDurumu: KapanisCozucusu = servis.kapanisOlcumDurumu;
// Açık NCR'li partiler (1222 a): stok ürün sevkinde ve depo çıkışında verilen partilerden açık NCR'nin lotuna ya da emrine uyanları
// buradan alır ve sevk etmez (bağı kablolama.ts kurar). Salt okur, yetki denetlemez.
export { acikNcrPartileri } from './servis.ts';
