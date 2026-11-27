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
815 (699/3 a): plana yalnız emrin önceliği girer. Kart "Öncelik çarpanı geçmişi" oldu: yalnız eski kayıtları okur, geçmişi yoksa çizilmez; "Çarpan ver" ve bant kalktı. Tablo silinmez.

6. parça (emir sipariş satırı bağı, 224, 225): `disari.ts` `siparisinSatirOzetleri(db, siparisId)` siparişin satırlarını sıra ile verir; `SiparisSatiriOzeti` `birimFiyat` taşır.
Emir payı birim fiyat × emir adedidir (225); hesap emri tutan modüldedir. Sipariş ayrıntısında satır numarası ("No") görünür.
VARSAYIM: fiyat yetkisi denetimi çağıran modülün ucundadır; disari fiyatı her zaman verir.

7. parça (teslim planı E-24, E-9): her sipariş ve teklif ucunun ret testi (403 işlemi olmayan ve salt okuyan, 404 olmayan kayıt; SIP-15, TKL-09). Davranış değişmez.
Formdaki ödeme vadesi ipucu artık plan sırasının vadeyi okumadığını söyler; vadeyi yalnız proje maliyeti finansmanda kullanır.
VARSAYIM: plan vadeyi okumaya başlayınca ipucu yeniden yazılır.

## 2663 (2661 a, 2669 b): gizli genel gider oranı
- Teklif denemesi gizli ayda oranı, genel gider payını ve onu içeren her maliyeti (kalem birim ve toplam, maliyet toplamı, adet denemesi) ve dökümün bütün tutarlarını (genel gidersiz satırların toplamı hariç maliyet olurdu, 2669 b) null verir; `genelGiderGizli` alanı terminDenemesiCevabi ve adetDenemesiCevabi'ne eklendi. Genel gider hariç maliyet gösterilmez (2669 b). Plan taslağına maliyet toplamı null yazılır (sütun boş olabilir).
- Ekran "Gizli" ve "Fiyat önerisi yok: genel gider oranı gizli" yazar; birim maliyet null olduğu için fiyat önerilmez (Arayüz K8).

## 3625: dövizli satış teklifi Logo kuru
- Kur teklifte saklanmaz; TRY dışı teklifte `logoyaGidecekSatisTeklifleri` her gönderimde `finans/disari.ts` `kurCiftiGetir(db, paraBirimi, teklif tarihi)` ile okur. Finans'ın kur tablosuna yazılmaz. Göç yok.
- Oran: alış kuru (`ORAN_KULLANIMLARI.muhasebe.kur`). VARSAYIM: Logo'ya giden satış belgesi muhasebe kaydıdır; döviz alacağı bankaya satılacağı için alış kuru, satın almanın "satış" seçimi (döviz alıp ödeme) ters yöndür. Doğrulanmadı: Logo kullanıcısı satış belgesinde hangi kurun beklendiğini teyit etmeli. Değişirse tek satır (`ORAN_KULLANIMLARI.<kullanım>.kur`); yeni bir `satisBelgesi` kullanımı paylasilan'a eklemek ayrı çekirdek isteğidir, eklenmedi.
- Kur yoksa ya da teklif tarihine kadarki son kur `ORAN_ESKIME_GUNU` (30 gün) sınırından eskiyse (tam 30 gün geçerli) teklif o turda gitmez; sıraya "<para birimi> için <tarih> kuru Finans'ta yok ya da çok eski." yazılır, sıra "hata" ile bekleyenlerin arkasına geçer, kur girilince sonraki turda gider. Kur 0 ya da 1 uydurulmaz; teklif tarihinden sonra girilmiş kur kullanılmaz. VARSAYIM (güvenli yön): eski kur sessizce gitmesin diye 30 gün sınırı; sınır Finans'ın eskime işaretiyle aynıdır. TRY teklifte kur boş (davranış aynı).
- Sınırlama: kuru olmayan teklifler kuyruk sınırı (200) içinde yer tutar; hata satırları hep bekleyenlerin arkasına gider, ama 200'den fazla kursuz teklif birikirse arkadakiler gecikir.
- Teklifin kendi kurunu saklamak (kur dondurma) ayrı karardır; bu işte yapılmadı.
- EkoTigerAPI `m.Rate ?? 1` davranışına dokunulmadı.

## 3794 Teklif formu alanları (karar 27.11, A: alan paneli)
- Form içeriğine (şablon ve teklife özel metin, ikisi de jsonb) isteğe bağlı `alanlar` eklendi: alan anahtarı -> { durum: gizli | kaldirildi, etiket, deger }. Göç yok; alanı olmayan eski içerik eskisi gibi basılır.
- Değeri forma yazılabilen yalnız metin alanlarıdır (müşteri ünvan, adres, vergi dairesi, vergi no; teklif türü ve konu). Teklif no, sürüm, tarih, geçerlilik, para birimi, miktar, fiyat, tutar, toplamlar, teslim ve ödeme sürümden gelir: sunucu bunlara değer yazılmasını 400 ile reddeder, yalnız gizlenir. Para ve sürüm kuralı değişmedi.
- Şablonda alan değeri yazılmaz (400); şablon yalnız etiket ve görünüm taşır.
- Kabul, red ya da siparişe dönen teklifte form metni kapalıdır (değişmedi).
- VARSAYIM: gizli ile kaldırılan kâğıtta aynı çıkar (basılmaz); fark yalnız panelde (gizli listede kalır, kaldırılan Kaldırılanlar'a gider). Genel toplam gizlenebilir; ön izlemede sessiz not çıkar, engel yoktur.
