# ON PAKET: finans (Finans ve Muhasebe), Sürüm 4

Taban: `tmi-core-v2-kit-c2c9871.zip` (son göç 20261007222500). Durum: s3 ONAYLANDI; bu sürüm s3'e işlenen ek kararları ve teslim planını yazar. Burada yazmayan her madde s3'teki gibidir.

## 0. İşlenenler

- K-9 Çapraz kapatma ilk sürümde: dağıtım satırı iki tutar ve aradaki kuru taşır.
- K-10 Kur kaynağı: elle girilen günlük kur tablosu `finans_kur`; o gün kur yoksa belgenin ya da ödemenin kuru.
- K-11 Kur farkı bilgidir: `kur_farki_tl` dağıtımda saklanır, ekstrede görünür, gelir tablosuna girmez; gelir tablosundaki "Kur farkı" satırı yalnız "kur farkı geliri" ve "kur farkı gideri" kategorili belgelerden gelir.
- K-12 Cari mahsup ilk sürümde: `finans_mahsup`.
- K-13 Avans: ödemenin dağıtılmamış kalanı (onaylı).
- D-8 Ciro ilişkisi tek yönlü: `finans_cek.ciro_odeme_id` kalktı; ilişki ödemedeki `cek_id` + yöntem `ciro`.
- D-9 Vergi no biçimi yalnız `ulke_kodu = 'TR'` iken denetlenir; yabancı firmada en çok 30 karakter serbest metin; tekillik kalır. (Firma teslimine işlendi.)
- FNS-50 (D-7), FNS-51, FNS-52 onaylı.
- Teslim iki parça: (1) firma, (2) finansın tamamı (bölüm 14).

## 4. Yetki (s3'teki gibi)

Firma teslimi yalnız `finans.firma-oku` ve `finans.firma-yaz` işlemlerini kaydeder; `finans.oku`, `finans.yaz`, `finans.yonet` ikinci teslimle gelir. İkinci menüde ilk teslimde yalnız "Firmalar" maddesi vardır (öteki maddeler ikinci teslimle eklenir; çalışmayan madde konmadı). Sayfa sırası `sira: 5` (Sistem Ayarları Yönetim grubunda en sonda kalır; kabuk testi bunu ister).

## 5. Tablo değişiklikleri (s3'e göre)

- `finans_firma` (göç `20261008132200_finans_firma.sql`, firma teslimi): s3'teki alanlar; ek olarak `ulke_kodu` vergi no kısıtına bağlandı (D-9); `olusturan_id` ve `olusturma` tetikleyiciyle değişmez; silme tetikleyiciyle yasak; `guncelleyen_id`, `guncelleme` sunucu yazar. Uzunluk kısıtları: kod ve Logo cari kodu 40, ad 200, vergi dairesi 100, adres 500.
- `finans_kur` (yeni, K-10): `para_birimi char(3)` (ISO kısıtı, `TRY` hariç) · `tarih date` · `kur numeric(18,6) CHECK (kur > 0)` · PK (para_birimi, tarih) · `olusturan_id`, `olusturma`, `surum`. Yazma `finans.yonet`.
- `finans_odeme_dagilimi` (K-9): `belge_tutari numeric(18,2) CHECK (> 0)` (belgenin para biriminde kapanan) · `odeme_tutari numeric(18,2) CHECK (> 0)` (ödemenin para biriminde ödenen) · `capraz_kur numeric(18,8) CHECK (> 0)` (ödeme birimi başına belge birimi; aynı para biriminde 1 ve iki tutar eşit, kısıt) · `kur_farki_tl` (bilgi, K-11). Tetikleyiciler iki tarafı da denetler: belge başına aktif `belge_tutari` + aktif mahsup ≤ belge toplamı; ödeme başına aktif `odeme_tutari` ≤ ödeme tutarı.
- `finans_mahsup` (yeni, K-12): `id` · `firma_id NOT NULL REFERENCES finans_firma` · `satis_belge_id`, `alis_belge_id REFERENCES finans_belge` · `satis_tutari`, `alis_tutari numeric(18,2) CHECK (> 0)` (iki belgenin para biriminde) · `tarih` · iptal alanları · `surum`. Kısıt ve tetikleyici: iki belge aynı firmanın, biri gelir biri gider; aynı para biriminde iki tutar eşit.
- `finans_cek`: `ciro_odeme_id` sütunu YOK (D-8).
- Kategoriler: gelire "kur farkı geliri", gidere "kur farkı gideri" eklenir (elle de girilir; K-11).

## 7. Kural değişiklikleri (s3'e göre)

- FNS-7 Belgenin kapanan toplamı = aktif dağıtımların `belge_tutari` + aktif mahsupların o belgedeki tutarı; belge toplamını aşamaz (tetikleyici). degisti: K-9, K-12
- FNS-8 Belge durumu bu toplamdan hesaplanır. degisti: K-12
- FNS-14 Belge iptalinde o belgenin aktif dağıtımları ve aktif mahsupları iptal edilir; dağıtım tutarı ödemenin kalanına döner; mahsubun karşı belgesi yeniden açılır. degisti: K-12
- FNS-16 Ödemenin para birimi yazıldığı hesabın para birimiyle aynıdır. aynı (K-9 ile kalır)
- FNS-20 Ödeme başka para birimindeki belgeye dağıtılabilir; dağıtım satırı belgenin para biriminde kapanan ve ödemenin para biriminde ödenen tutarı ve aradaki kuru taşır; belge kuru ile ödeme kuru farkından doğan TL farkı `kur_farki_tl` olarak saklanır, ekstrede görünür, gelir tablosuna girmez. yeniden yazıldı: K-9, K-11
- FNS-26 Ciro edilen çek için sunucu `ciro` yöntemli ödeme açar; çekten ödemeye ayrı bağ yoktur. degisti: D-8
- FNS-54 Ciro durumundaki her alınan çekin `cek_id` ile ona bağlı tam bir `ciro` ödemesi vardır; ciro ödemesi olmayan çek `ciro` durumuna geçemez, ciro ödemesi iptal edilince çek portföye döner (servis + test). yeni: D-8
- FNS-55 Cari mahsup aynı firmanın açık satış ve alış belgesini para hareketi olmadan kapatır; hesaba ve nakde girmez, kâr/zararı etkilemez; açma `finans.yaz` (tekrar korumalı), iptal `finans.yonet`. yeni: K-12
- FNS-56 Mahsupta iki belge farklı para birimindeyse iki tutar ve aradaki kur saklanır (K-9 ile aynı biçim); aynı para biriminde iki tutar eşittir. yeni: K-9, K-12
- FNS-57 Güncel değerleme (ana sayfa, nakit tahmini, danışman) `finans_kur` tablosundaki o günün kurunu, yoksa kaydın kendi kurunu kullanır. yeni: K-10
- FNS-58 Kur farkı yalnız "kur farkı geliri" ve "kur farkı gideri" kategorili belgelerle gelir tablosuna girer. yeni: K-11
- FNS-53 Pasife alma yalnız aktif firmada, aktif yapma yalnız pasif firmada. yeni (firma teslimi; s3'te kural olarak adlandırılmamıştı)
- D-9 (firma): vergi no biçimi yalnız TR'de; yabancıda en çok 30, tekillik kalır.

## 9. Ekrana eklenen alanlar (s3'e göre)

27. Tahsilat ve ödeme penceresinde farklı para birimli belge seçilebilir; seçilince "Kur" sorulur ve satırda belgenin para biriminde kapanacak tutar ile ödemenin para biriminde ödenen tutar birlikte gösterilir (K-9).
28. Ayarlar'da yeni "Kurlar" sekmesi: para birimi, tarih, kur; yazma `finans.yonet` (K-10).
29. Firma kartında "Alacak ve borcu mahsup et" kartı: firmanın açık satış ve alış belgeleri, kapatılacak tutarlar, tarih; farklı para biriminde kur (K-12).
30. Cari ekstre ve dağıtım satırlarında "kur farkı (bilgi)" sütunu (K-11).
31. Kategori seçiminde "Kur farkı geliri" ve "Kur farkı gideri" (K-11).
32. Firma teslimiyle gelen: Firmalar listesi (kod, ad, tür, fason, vergi no, il, durum, Logo cari kodu; sıralama, tür ve aktiflik süzgeci, arama, sayfalama), firma kartı (kimlik, adres ve iletişim, Logo bölümü salt okunur), firma penceresi (yeni ve düzenle; sunucu hatası alanın altında), pasife alma ve aktif yapma (onaylı ikinci tıklama).

## 14. Teslim planı ve birleşme sırası

1. `teslim-finans-firma-c2c9871.zip`: `finans_firma` ve göçü, firma uçları, `disari.ts`, sayfa ve ikinci menü (yalnız Firmalar), Firmalar ekranı ve firma penceresi, işlemler, testler. Satın alma ve stok bunu bekler.
2. `teslim-finans-c2c9871.zip`: ilk teslimin üstüne gelir; firma göçünü değiştirmez, yeni göçle ekler; ikinci menüyü tamamlar, `finans.oku/yaz/yonet` işlemlerini ekler, çerçeve kapsamını `tam` yapar.
Birleşme sırası: finans (firma) önce; satın alma ve stok ondan sonra (CLAUDE.md'de güncellendi: "finans (firma kaydı dahil), malzemeler, ...").

## 15. Doğrulananlar (bu sürümde eklenen)

- Taban c2c9871: son göç `20261007222500_uretim_emirleri_tek_calisan.sql` (`ls sunucu/gocler`); CLAUDE.md birleşme sırası "finans (firma kaydı dahil), malzemeler" (diff).
- Ortam: Node 24.21.0, PostgreSQL 16.15; firma teslimiyle `npm run test:sunucu` "tests 992, pass 992, fail 0", `npm run test:istemci` "Tests 504 passed (504)".
- Kabuk testleri finans sayfasının sırasını ve kök yolunu sınar: `istemci/src/ortak/arayuz/Kabuk.test.tsx` "Sistem Ayarlari kendi Yonetim grubundadir ve menude en sonda durur", `istemci/src/App.test.tsx` "menudeki her baglanti acilir". İlk denemede ikisi kırmızıydı (sıra 20 ve kökün yönlendirilmesi); düzeltildi.

## 16. Tam teslim notu

- Para kayıtları göçü: `20261008132300_finans_cekirdek.sql` (firma göçüne dokunmaz).
- Uç sayısı: 62 (7 firma, 55 para). İşlemler: `finans.firma-oku`, `finans.firma-yaz`, `finans.oku`, `finans.yaz`, `finans.yonet`.
- Eklenen kural testleri: FNS-3 (belge no), FNS-34 (açılış belgesinde geçmiş vade), FNS-37 (olmayan firma), FNS-56 (farklı para birimli mahsup).
- İkinci menü tam (13 madde), sayaç ucu `/finans/menu-sayaclari` (`firmalar`, `cekler`; `finans.oku` yoksa null).
