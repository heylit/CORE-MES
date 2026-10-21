// Başka modüller (üretim emirleri, sevkiyat, portal) sipariş ve teklifi buradan alır ve yazar. Fonksiyonlar çağıranın db'sini
// kullanır, transaction açmaz, yetki denetlemez (denetim çağıran modülün ucundadır; siparisler.oku/yaz/onayla dağılımı uçtakiyle aynı
// tutulmalı). Yazmalar satırı FOR UPDATE ile kilitler, çağıranın işlemi içinde çağrılır. Hata UygulamaHatasi'dır (400, 404, 409, 422).
export { siparisinSatirOzetleri, siparisSatiriOzetleri } from './servis.ts';
export type { SiparisSatiriOzeti } from './servis.ts';
// Sipariş: okuma, taslak ekleme ve düzenleme (siparisler.yaz), onay, kapatma ve iptal (siparisler.onayla).
export { durumDegistir, siparisAyrintisi, siparisEkle, siparisGuncelle, siparisListesi } from './servis.ts';
// Siparişe bağlı kayıt açarken (projeler): satır çağıranın işlemi boyunca FOR UPDATE ile kilitli okunur; yoksa 404.
export { siparisKilitliAyrinti } from './servis.ts';
// Plan stüdyosundan acil sipariş (287 b): yalnız müşteri, termin ve kalemle fiyatsız taslak; yetki çağıranın ucunda.
export { taslakSiparisAc } from './servis.ts';
export type { TaslakSiparisVerisi } from './servis.ts';
export type { DurumKomutu } from './kurallar.ts';
// Onay olayı (286 b): dinleyici onayla aynı işlemde çağrılır; reddi onayı geri alır. Plan kablolama.ts'te bağlanır.
export { siparisOnaylandiDinle } from './siparis-olaylari.ts';
export type { SiparisOnaylandiDinleyicisi, SiparisOnaylandiOlayi } from './siparis-olaylari.ts';
// Teklif (soru 148): okuma, talep, sürüm, kabul, revizyon ya da red ve siparişe dönüşüm; hepsi siparisler.yaz.
export {
  iskontoOnayla, kabulEt, notluGecis, siparisDonustur, surumVer, teklifAyrintisi, teklifDurumlari, teklifEkle, teklifGuncelle, teklifListesi, terminOnayla,
} from './teklif-servis.ts';
// Teklif termin ve fiyat denemesi (44): motoru Reçete ve Rota verir, kablolama.ts kaydeder (siparişler onu ithal edemez, ADR 0006).
// Planlama atölyesi yer tutan satış taslaklarını kilitli iş olarak buradan okur (49); bu yön döngü yapmaz.
export { satisTaslagiKilitleri, teklifDenemeCozucusuKaydet as teklifDenemeCozucusu } from './teklif-deneme.ts';
export type { SatisTaslagiKilidi, TeklifDenemeCozucusu } from './teklif-deneme.ts';
export type { MotorGirdisi as TeklifDenemeGirdisi, MotorSonucu as TeklifDenemeSonucu } from './kurallar.ts';
