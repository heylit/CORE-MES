# GUVENLIK-DENETIMI: stok (kart #206, dal 206-stok-depo)

Oturtmada yazıldı (teslimde yoktu). Kaynak: `uclar.ts`, `servis.ts`, testler `stok.test.ts` (gerçek PostgreSQL) ve `istemci/src/moduller/stok/stok.test.tsx`.
Her uç `uc({...})` ile; kişi ve zaman sunucudan (`kullanici.id`, sütun varsayılanları). Aşama 1'de işlemler yalnız yöneticidedir; rol x işlem satırları Aşama 2'de, onayla.
"Test" sütunu test başlığının başıdır (DEP numarası); parantezdeki durum kodları test başlığından ve teslim belgelerinden alındı, satır satır doğrulanmadı (VARSAYIM). YOK: o yön için test yok (borç, UYUM-BORCU "kullanıma açmadan önce").
Okuma uçları (ST5, Aşama 2 tur 1) `{ biri: ['sayfa.stok', ...STOK_ISLEMLERI] }`; yalnız `GET /stok/menu-sayaclari` `oturum`. Ortak reddeden test: "yetki (ST5)" girişsiz 401, operatör 403, kalite 200.
Tekrar korumalı yazma uçları: mal kabul, üretim girişi, taşıma, çıkış, sayım, sepete ekleme, teslim, stoktan düşüm, toplama açma; test "tekrar koruması" (aynı kimlik tek belge, kimliksiz 400).
Veri kapsamı (DEP-36): üretime sarf (`/stok/cikis` emirli, `/stok/sepet/stoktan-dus`) emrin iş merkezine göre; test "DEP-36" (kapsam dışı 403, hiçbir şey yazmaz).

## Okuma uçları (`sayfa.stok` ya da bir stok işlemi)

| Uç | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|
| `GET /stok/is-kutusu` | sayılamayan madde null | menü (K6) | yetki (K3) girişsiz 401 (ortak) |
| `GET /stok/menu-sayaclari` | sayı kişinin işlemine göre süzülür: `stok.giris` olmayana mal kabul sayısı null | menü (K6) | menü (K6): satın almacıda `mal-kabul` null |
| `GET /stok/panel` | stok değeri yok (maliyet tutulmaz) | panel, DEP-34 | YOK |
| `GET /stok/depolar` | — | YOK | YOK |
| `GET /stok/konumlar`, `/:id` | sayfalı liste | DEP-09/13 | YOK |
| `GET /stok/raflar`, `/:id` | sayfalı liste; matris | DEP-14/12/13 | YOK |
| `GET /stok/malzemeler`, `/:id`, `/:id/ozet` | ad malzemeler `disari.ts`'ten; stoksuz malzeme uydurulmaz | DEP-28 | YOK |
| `GET /stok/malzemeler/:id/cikis-onerisi` | en eski giriş; bakiye yoksa veri yetersiz (DEP-05, DEP-08) | DEP-05/08 | DEP-05/08 (bakiyesiz: veri yetersiz) |
| `GET /stok/malzemeler/:id/goz-onerisi` | DEP-34 | panel, DEP-34 | YOK |
| `GET /stok/partiler`, `/:id/iz` | parti izi emirden partiye (DEP-25) | DEP-47/48/25 | YOK |
| `GET /stok/mal-kabuller`, `/:id` | saf hizmet satırında konum ve hareket boş; fason satırında giden kart, kutu ve siparişin hizmet kartı | DEP-53, DEP-58 | YOK |
| `GET /stok/uretim-emirleri/:id/tamamlama` | olmayan emir 404, ürün kartsız eski emir 422; miktarlar stoktan ve emrin ihtiyacından, uydurulmaz | emir tamamlama | emir tamamlama (olmayan emir 404) |
| `GET /stok/acik-siparis-satirlari` | satın almanın açık satırları; kartın türü (`malzemeTur`) malzemelerden, kartsız kalemde null | ST2, DEP-58 | ST2 (kalite 403) |
| `GET /stok/hareketler` | süzgeçsiz istekte toplam null | hareket listesi sayfalı | yetki (K3) girişsiz 401 |
| `GET /stok/kod-coz` | bilinmeyen kod uydurulmaz (DEP-55) | DEP-55 | DEP-55 (bilinmeyen kod) |
| `GET /stok/fisler`, `/:id` | fiş değişmez | DEP-54/40/41 | YOK |
| `GET /stok/toplamalar`, `/:id` | kapsam: teslim yeri kapsam dışı istasyon olan liste listede yok, tekil 403; teslim yeri istasyon olmayan süzülmez | DEP-42/56, STK-K3 | STK-K3 (kapsam dışı 403, sınırsız hepsi) |
| `GET /stok/yerlesim` | — | DEP-57 | YOK |
| `GET /stok/ara` | bilinmeyen sonuç uydurulmaz | stok içi arama | YOK |
| `GET /stok/sayim-bekleyenler` | süre deponun yerleşiminden (DEP-15) | DEP-15 | YOK |
| `GET /stok/ozet` (oturum) | her alan kendi işlemiyle; yetkisize null, hesaplanmaz | stok özeti | stok özeti (girişsiz 401, operatörde hepsi null, satın almada istek ve sayım null) |
| `GET /stok/malzeme-istekleri`, `/:id` | karşılanan teslimden önce null; kapsam: kapsam dışı istasyonun isteği listede yok, tekil 403; istasyonsuz istek süzülmez | malzeme isteği, STK-K1 | STK-K1 (kapsam dışı 403, sınırsız hepsi, sayaç) |

## Yazma uçları

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `POST /stok/konumlar` | `stok.tanim` | kod tekil (kısıt); tür `kabul`, `depo_zemini`, `fason` (DEP-58) | DEP-09/13, DEP-58 (fason kutusu) | YOK |
| `POST /stok/konumlar/:id/duzenle` | `stok.tanim` | sürüm (`surumluGuncelle`) | YOK | YOK |
| `POST /stok/konumlar/:id/pasif-yap` | `stok.tanim` | sürüm; stoklu konum pasife alınamaz (bileşik yabancı anahtar, DEP-13) | DEP-09/13 | DEP-09/13 (stoklu konum 409) |
| `POST /stok/raflar` | `stok.tanim` | kod biçimi, ölçü, kat aralığı (kısıtlar) | DEP-14/12/13 | yetki (K3): depo 403 |
| `POST /stok/raflar/:id/duzenle` | `stok.tanim` | sürüm (DEP-29); göz kimliği korunur | DEP-14/12/13 | DEP-29 (eski sürüm 409) |
| `POST /stok/raflar/:id/pasif-yap` | `stok.tanim` | sürüm; stoklu göz kapatılamaz | DEP-14/12/13 | DEP-14/12/13 (409) |
| `POST /stok/malzemeler/:id/ayar-duzenle` | `stok.tanim` | sürüm; varsayılan konum aktif olmalı (DEP-59) | DEP-28 DEP-59 | DEP-59 (olmayan ve pasif konum 422) |
| `GET /stok/malzeme-kart-bilgileri` | `oturum` | yalnız kritik seviye ve varsayılan konum kodu; sayfalı | DEP-60 (operatör 200) | DEP-60 (oturumsuz 401) |
| `POST /stok/mal-kabul` | `stok.giris` | hammaddede parti zorunlu (DEP-20), kullanılamaz kart reddi (DEP-10), demirbaş parti almaz (DEP-49); başka malzemenin partisi 409 (DEP-22); başka kartın sipariş satırı 400 (KD-009); hizmet siparişinde fason ya da saf hizmet (DEP-58): giden yalnız aktif `fason` konumundan, yetmezse ONAY_GEREKLI (gövdede `eksiOnay`), saf hizmette konum ve parti girilmez; belge ve satır değişmez (tetikleyici); no sunucuda | DEP-20/21/10/49, DEP-58 | yetki (K3): satın almacı 403; DEP-20/21/10/49 (400/422); DEP-23/22 (409); KD-009 (400); DEP-58 reddedilenler (400), yetmeyen giden (409 ONAY_GEREKLI) |
| `POST /stok/uretim-emirleri/:id/tamamla` | `stok.giris` ve servis içinde `stok.cikis` | emir `bitti`, eksik yok, bir kez (409); sağlam adet girilmemiş adedi aşamaz (400); sarf kapsamı DEP-36; emir başına işlem kilidi (eşzamanlı ikinci istek yeniden hesaplar); bakiye kilitte azalmışsa 409; tek işlem, tekrar korumalı | emir tamamlama | kalite 403, yalnız giriş işlemi olan 403, kapsam dışı 403, eşzamanlı ikinci 409, bitmemiş, eksikli ve ikinci kez 409, aşım 400, çıktı yazılamazsa sarf geri alınır |
| `POST /stok/hareketler/geri-al` | `stok.geri-al` | tek işlemde, yeniden eskiye; biri reddedilirse hiçbiri yazılmaz; aynı hareket iki kez 400; tekrar korumalı | toplu geri alma | toplu geri alma (depo 403, tekrar 400, geri alınmış hareket 409 ve hiçbir şey yazılmaz) |
| `POST /stok/mal-kabuller/:id/duzelt` | `stok.geri-al` | belge bir kez düzeltilir; eski hareketler, fason çıkışı dahil, ters çevrilir, teslim geri alınır (DEP-53, DEP-58); fason çıkışı tek başına geri alınmaz | DEP-53, DEP-58 | DEP-53 (depo 403, ikinci düzeltme 409); DEP-58 (fason çıkışını tek başına geri alma 409) |
| `POST /stok/uretim-girisi` | `stok.giris` | yalnız mamul ve yarı mamul (DEP-47); emir var olmalı (oturtmada: `uretim-emirleri/disari.ts` `emirOzeti`, STK6 b) | DEP-47/48/25 | DEP-47/48/25 (hammadde 400, olmayan emir 409) |
| `POST /stok/tasima` | `stok.transfer` | ilk giriş ve parti taşınır (DEP-09); yetersizde onay (DEP-02) | DEP-09/13 | YOK (işlem reddi) |
| `POST /stok/cikis` | `stok.cikis` | yetersizde ONAY_GEREKLI, onaylı eksi (DEP-02/03/04/37); gözde iki parti seçim ister (DEP-23); sarf emirli (kısıt); emir var olmalı | DEP-02/03/04/37 | yetki (K3): kalite 403; DEP-02/03/04/37 (onaysız 409/ONAY_GEREKLI); DEP-23/22 (400) |
| `POST /stok/sayim` | `stok.sayim` | beklenen değiştiyse 409 (DEP-16) | DEP-16 | DEP-16 (409) |
| `POST /stok/hareketler/:id/geri-al` | `stok.geri-al` | bir kez; geri almanın geri alınması yok; mal kabul hareketi tek başına geri alınmaz (DEP-17/18/19) | DEP-17/18/19 | DEP-17/18/19 (depo 403, ikinci kez 409) |
| `GET /stok/sepet` | `stok.transfer` | kişinin kendi sepeti (kişi sunucudan) | DEP-54/40/41 | DEP-54/40/41 (satın almacı 403) |
| `POST /stok/sepet/satir-ekle` | `stok.transfer` | kişiye özel satır | DEP-54/40/41 | YOK |
| `POST /stok/sepet/satirlar/:id/degistir` | `stok.transfer` | yalnız kendi satırı (sorgu kişiyle süzer; VARSAYIM, ayrı test yok) | DEP-54/40/41 | YOK |
| `POST /stok/sepet/satirlar/:id/sil` | `stok.transfer` | yalnız kendi satırı (aynı) | DEP-54/40/41 | YOK |
| `POST /stok/sepet/teslim-et` | `stok.transfer` | tek işlemde fiş; yetmezse onay ister ve hiçbir şey yazmaz (DEP-40/41) | DEP-54/40/41 | DEP-54/40/41 (onaysız ret, yazı yok) |
| `POST /stok/sepet/stoktan-dus` | `stok.cikis` | aynı; emir var olmalı | DEP-54/40/41 | DEP-54/40/41 (kalite 403) |
| `POST /stok/toplamalar` | `stok.toplama` | istek ve teslim yeri istasyonu kapsamda olmalı, değilse 403 (STK-K3); en eski girişten ayrılır, eksik söylenir (DEP-42) | DEP-42/56 | DEP-42/56 (kalite 403) |
| `POST /stok/toplamalar/:id/adimlar/:adimId/topla` | `stok.toplama` | liste kapsam dışıysa 403 (STK-K3); sürüm; adım iki kez toplanmaz; kapalı liste toplanmaz (DEP-56) | DEP-42/56 | DEP-42/56 (409) |
| `POST /stok/toplamalar/:id/kapat` | `stok.toplama` | liste kapsam dışıysa 403 (STK-K3); sürüm; açan ya da işlemi olan başkası kapatır, kapatan kişi kayıtta (ST4) | DEP-42/56 | ST4 (işlemsiz 403) |
| `POST /stok/yerlesim/kaydet` | `stok.tanim` | tek işlem; stoklu raf kaldırılmaz; aynı adres ve eski sürüm 409 (DEP-57) | DEP-57 | DEP-57 (depo 403, 409) |
| ~~`POST /stok/yerlesim/kare-adi`~~ kaldırıldı (borç #441) | `stok.tanim` | — | DEP-57 | YOK |
| `POST /stok/malzeme-istekleri/:id/hazirla`, `/teslim-et`, `/iptal-et` | `stok.transfer` | kapsam dışı istasyonun isteği 403 (STK-K2); sürüm; geçiş yalnız ileri, kapanan değişmez (409); teslimde karşılanan pozitif | malzeme isteği | malzeme isteği (operatör 403, ikinci hazırla ve teslimden sonra iptal 409, eski sürüm 409, olmayan 404) |
| `disari.malzemeIstegiAc` (uç değil, çağıranın işleminde) | üretim işlemi (`uretim-emirleri` `KOMUT_ISLEMI`) servis içinde | istasyon kapsamı (DEP-36 gibi); hizmet kartı, olmayan ya da pasif istasyon, olmayan emir 400; kaynak kimliği tekil, eşzamanlıda tek kayıt | malzeme isteği | malzeme isteği (işlemsiz 403, kapsam dışı 403, 400'ler; satır yazılmaz) |

## Yalnız ekranda kalan kurallar

- Mal kabulün emirden dolması (`?emir=`) kolaylıktır: satırlar olağan mal kabul gövdesiyle gider, sunucu parti, kart ve hizmet kurallarını her satırda yine uygular.
- Ambalaj kataloğu ölçüleri, sığma ve matris doluluğu ekran hesabıdır (`ambalaj.ts`), sunucu ölçü kodunu saklar.
- Depocu / yönetici görünümü cihaz tercihidir (`localStorage`), yetki değildir; menü ve uçlar işlemle süzülür.
- Ekran içi düğmelerin işleme göre görünmesi kolaylıktır; her yazma ucu işlemi sunucuda ister.

## Kullanıcı metni

- Ekran React ile basar (kaçırılır). Etiketlerin HTML indirmesi (`Etiketler.tsx` `htmlOlarakIndir`) metni `& < > "` kaçırarak yazar; tek tırnak kaçırılmaz ama öznitelikler çift tırnaklıdır.

## Kart #1124
| Uç | Kural | Test (izinli) | Test (reddeden) |
|---|---|---|---|
| `GET /stok/siparis-irsaliyeleri` (stok okuma ya da `satin-alma.oku`/`yaz`) | fiyat taşımaz; kimlik listesi biçimi | #1124 (satın alma, depo) | #1124 (operatör 403, bozuk liste 400) |

## Kart #1208
| Uç | Kural | Test (izinli) | Test (reddeden) |
|---|---|---|---|
| `GET /stok/teslim-kutusu`, `/sayac` (`stok.istek`) | kişinin kapsamındaki istasyonlara gelenler; depo konumuna gelen yalnız `stok.transfer` olana | teslim.test "STK-T2/T4" | "yetki" (işlemsiz 403) |
| `GET /stok/teslim-kutusu/yerdeki-stok` (`stok.istek`) | istasyon kapsamda olmalı; depo konumu `stok.transfer` ister | "STK-T2/T4" | kapsam dışı istasyon 403, depo konumu operatöre 403 |
| `GET /stok/istek-malzemeleri` (`stok.istek`) | yalnız stoklanan katalog kartı, miktar; fiyat yok | "istek seçicisi" | "yetki" |
| `POST /stok/malzeme-istekleri/ac` (`stok.istek`) | istasyon kapsamda; kaynak kimliği kişiyle öneklenir | "STK-T1" | kapsam dışı 403, hizmet 400 |
| `POST /stok/teslimler/gonder` (`stok.istek`) | kaynak istasyon kapsamda, kaynak depo `stok.transfer`; isteğe bağlıysa STK-T5 | "STK-T2/T4", "STK-T5" | aynı yer 400, istasyon konumu konum olarak 400, depo değil 400 |
| `POST /stok/teslimler/:id/teslim-al`, `/reddet` (`stok.istek`) | STK-T4, sürümlü | "STK-T2/T4", "depoya gelen" | gönderen 403, kapsam dışı 403, kapanmış 409 |
| `POST /stok/teslimler/:id/iptal-et` (`stok.istek`) | STK-T3 | "STK-T3" | başkası 403, kapanmış 409 |
- `stok.istek` `STOK_ISLEMLERI` dışında tutulur: stok okuma uçları (`OKUMA`) bu işlemle açılmaz (test "yetki": operatör `/stok/malzemeler` 403).

## Depo bölümü yazımı (kart #1304, DEP-61)

Kayıt Fabrika Haritası'nındır (`atolye/disari.ts` `rafYerlesimiKaydet`, `gozKalemiYaz`, `gozKalemiSil`); stok yetkiyi ve bölümün stok deposu olduğunu denetler. Haritanın kendi yazma uçları `atolye.yaz` ister, değişmedi; rol x işlem değişmedi.

| Uç | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|
| `POST /stok/depo-bolumleri/:id/raflari-kaydet` (`stok.tanim`) | DEP-61 bölüm etkin stok deposu; gövde yalnız raflar, bölümün ölçüsü, istasyon ve makine yerleri, alanları, duvarları ve geçişleri kayıtlı haliyle kalır; haritanın yerleşim kuralları (ATL-*) ve sürüm (ATL-16) aynen; kişi sunucudan | "DEP-61" 200 | kalite 403, depo olmayan bölüm 403, eski sürüm 409, başka bölümün rafı 4xx |
| `POST /stok/depo-goz-kalemleri/yaz` (`stok.tanim`) | DEP-61 gözün bölümü stok deposu; doluluk kuralı ATL-29 | "DEP-61" 200 | kalite 403, depo dışı göz 403 |
| `POST /stok/depo-goz-kalemleri/sil` (`stok.tanim`) | DEP-61 kalemin bölümü stok deposu | "DEP-61" 200/204 | kalite 403, depo dışı kalem 403, olmayan kalem 404 |

Yalnız ekranda kalan: depo kipinde düzenleyici makine, alan ve duvarı seçtirmez, paleti yalnız raf sunar (sunucu zaten yalnız rafları yazar).

## Hazırlık ve Taşı (kart #1319, #1323)

Rol x işlem değişmedi. Kişi her uçta oturumdan; gövde kişi taşımaz.

| Uç | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|
| `POST /stok/toplamalar` (`stok.toplama`; istek varsa ayrıca `stok.transfer`) | teslim yeri zorunlu (istekli), STK-H1, istek açık olmalı; tekrar korumalı, kilitlenmede yinelenir | "STK-H1/H2/H4" 200 | yeri yok 400, `stok.transfer` yok 403, listedeki istek 409 |
| `POST /stok/toplamalar/:id/adimlar/:adimId/topla` (`stok.toplama`) | STK-H2, sürüm, liste açık; hedefe transfer ya da sevk çıkışı; tekrar korumalı | "STK-H1/H2/H4" 200 | fazla miktar 400, eski sürüm 409 |
| `POST /stok/toplamalar/:id/kapat` (`stok.toplama`) | STK-H4 dağıtım, iptalde bağ silinir; tekrar korumalı | "STK-H1/H2/H4", "STK-H1/H3" 200 | kapalı liste 409 |
| `POST /stok/sepet/teslim-et` (`stok.transfer`) | satır yerleri kişinin sepetinde olmalı, her satırın yeri olmalı, aktif konum | sepet testleri 200 | yersiz satır 400 |
| `POST /stok/teslimler/gonder` ve `/stok/malzeme-istekleri/:id/teslim-et` | STK-H1, STK-H3 (istek kilitlenir) | "STK-H1/H3" 200 | ikinci yolda teslim 400, listedeki istek 400/409 |
