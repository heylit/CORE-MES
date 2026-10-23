// Başka modüller (yönetici paneli) kalite özetini buradan alır. Çağıranın db'sini kullanır, yetki denetlemez (denetim çağıran modülün ucundadır).
export { ozet } from './servis.ts';
// İlk parça kararı (229 a): Arkon numune kararı buradan verir; yetkiyi Arkon'un ucu denetler.
export { ilkParcaKarari } from './servis.ts';
// Arkon'un ilk parça kapısı kararı buradan okur (denetim #12): emir başına son karar; kararsız emir haritada yoktur. Yetki denetlemez.
export { ilkParcaKararlari } from './servis.ts';
// Askıdaki tedarikçi (karar 87): Satın alma tedarikçinin kalite onayını buradan okur. Uygulamanın tedarikçisinde firma kimliği yoktur; ad
// ve kod döner, firmaya eşleme okuyanındır. Yetkiyi çağıranın ucu denetler.
export { kaliteAskisindakiTedarikciler } from './servis.ts';
// Kalibrasyon hazırlığı (262 a): Üretim emirlerinin hazırlık kapısı emir başına buradan okur. Emrin cihazları emrin muayenelerindedir;
// cihazı olmayan emir seçili değildir (secildi false). Geçerliliği kalibrasyon modülü verir. Yetki denetlemez.
export { kalibrasyonHazirlikDurumlari } from './servis.ts';
export type { KalibrasyonHazirligi } from './kurallar.ts';
// DÖF (155 a): DÖF'ün tek sahibi Kalite Merkezi'dir. Denetim hazırlığı bulgusundan DÖF'ü buradan açar (aynı kaynak anahtarı ikinci DÖF
// açmaz, var olanı döner) ve kaynak anahtarı başına durumunu buradan okur. Yetkiyi çağıranın ucu denetler; açan kişi kayıtta yazan olur.
export { dofAc, dofDurumlari } from './servis.ts';
export type { DofAcIstegi, DofDurumu, DofKaynagi } from './kurallar.ts';
