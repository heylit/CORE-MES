# FARK: siparisler (soru 144 a)

Taban: `main` 2ace540. Yeni modül; depoda önceki hâli yok. Bu PR yalnız sunucu tarafıdır (1. parça).

Eklenen:
- Göç `sunucu/gocler/20261019070100_siparisler_tablolar.sql`: `siparisler_siparis`, `siparisler_siparis_satiri`, `siparisler_numara_sayaci`. Yeni tablolar; dolu tabloya dokunmaz.
- Göç `sunucu/gocler/20261019071500_siparisler_teklif.sql` (soru 148, kullanıcı kuralı: teklif de Siparişler'in): `siparisler_teklif`, `siparisler_teklif_satiri`, `siparisler_teklif_surumu`, `siparisler_teklif_fiyati` (son ikisi yalnız eklenir), `siparisler_teklif_sayaci`.
- Sunucu `sunucu/moduller/siparisler/` (uclar, servis, kurallar, sorgular, disari, testler).
- Paylaşılan: `paylasilan/sozlesme/siparisler.ts`, `paylasilan/islemler/siparisler.ts`.
- Toplayıcı satırları (ayrı commit): `paylasilan/islemler.ts` (tek satır), `paylasilan/islem-adlari.ts` (üç işlem adı, modül adı).

Değişen onaylı karar: yok. Silinen: yok. Rol x işlem satırı yok (yalnız yönetici bayrakla taşır; dağılım soru 139 tablosuyla gelir).
2. parça (disari): `disari.ts` sipariş ve teklif servislerini dışa açar (siparisListesi, siparisAyrintisi, siparisEkle, siparisGuncelle, durumDegistir,
teklifListesi, teklifAyrintisi, teklifEkle, teklifGuncelle, surumVer, notluGecis, kabulEt, siparisDonustur). Yeni işlem yok; yetki çağıran uçta.

Sonraki parçalar: ekran (149 a, Portal "Satış siparişleri" düzeni), Portal köprüsü (portal modülü sahibinde).

3. parça (öncelik alanları, 177-179 a): göç `20261019084500_siparisler_oncelik_alanlari.sql` siparişe `gecikme_ceza_orani` (%/gün) ve `ceza_tavani_orani` (%) ekler; ikisi boş olabilir.
Sözleşmede `cezaOraniGun`, `cezaTavaniOrani` (ekle, güncelle, tekliften dönüşüm; cevapta da). `siparisSatiriOzetleri` satır tutarı (KDV hariç), para birimi ve iki ceza alanını da verir.
VARSAYIM: ceza sipariş başlığında (satır başına değil); tutar satır tutarıdır. Yeni işlem yok; görünürlük 180 cevabına kadar mevcut siparisler.* yetkileriyle.

4. parça (ödeme vadesi, 205 a): göç `20261019094000_siparisler_odeme_vadesi.sql` siparişe boş olabilen `odeme_vadesi_gun` (0-365) ekler. Sözleşmede `odemeVadesiGun`
(ekle, güncelle, tekliften dönüşüm; cevapta da); `siparisSatiriOzetleri` de verir. Fiyat alanı değildir, `siparisler.yaz` yazar.
VARSAYIM: üst sınır 365 gün; müşterinin varsayılan vadesi (`vadeGunu`) forma kendiliğinden gelmez.

5. parça (elle çarpan ekranı, 195 a): sipariş ayrıntısında "Öncelik çarpanı" kartı; veri Plan uçlarındadır (`GET/POST /plan/siparisler/:id/carpan`), sunucu tarafı değişmez.
Kartı `plan.yaz`, `plan.bedel-ayari`, `siparisler.fiyat-oku` ya da `siparisler.onayla` olan görür (237 a); "Çarpan ver" yalnız `plan.yaz` ya da `siparisler.onayla` olana. Sınırı sunucu denetler, ekran planlamaya 2 üstünde yalnız uyarır.
VARSAYIM: düğme yalnız açık (taslak, onaylı) siparişte; kayıt yoksa "çarpan 1" yazılır.

6. parça (emir sipariş satırı bağı, 224, 225): `disari.ts` `siparisinSatirOzetleri(db, siparisId)` siparişin satırlarını sıra ile verir; `SiparisSatiriOzeti` `birimFiyat` taşır.
Emir payı birim fiyat × emir adedidir (225); hesap emri tutan modüldedir. Sipariş ayrıntısında satır numarası ("No") görünür.
VARSAYIM: fiyat yetkisi denetimi çağıran modülün ucundadır; disari fiyatı her zaman verir.

7. parça (teslim planı E-24, E-9): her sipariş ve teklif ucunun ret testi (403 işlemi olmayan ve salt okuyan, 404 olmayan kayıt; SIP-15, TKL-09). Davranış değişmez.
Formdaki ödeme vadesi ipucu artık plan sırasının vadeyi okumadığını söyler; vadeyi yalnız proje maliyeti finansmanda kullanır.
VARSAYIM: plan vadeyi okumaya başlayınca ipucu yeniden yazılır.
