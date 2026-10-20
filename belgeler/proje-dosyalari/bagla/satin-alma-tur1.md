# Bağla tur 1, akış C (tedarik): satın alma planı

- Kart: #162 (modülün mevcut kartı; yeni kart gerekmiyor).
- Dal ve çekme isteği: `162-satin-alma-bagla` dalı, tek çekme isteği.
- Ön koşul: kullanıcı "yaz" deyip aşağıdaki soruları yanıtlamadan dal açılmaz ve commit atılmaz.
- Kaynak: ana dal `c73e2d4` ve `bagla/HAZIRLIK.md`.
- Kullanılan kararlar: SR1 a, SH1 a, SH2 b, SH4 a, SH6 a, TR1 a.
- Bekleyen kullanıcı sorusu: TS1 (kalanı aşan teslim). Koordinatör soruyor; cevaba kadar iki yol da aşağıda varsayım olarak yazılı.

İşaretler: DOĞRULANDI (dosya ya da komutla), VARSAYIM (gerekçesiyle), BİLMİYORUM.

---

## 1. Bugünkü durum (DOĞRULANDI, ana dal `c73e2d4`)

| Konu | Bugün | Dosya |
|---|---|---|
| Firma | `firma-gecici.ts` finansın adlarını taklit ediyor ve boş dönüyor. Sonuç: yeni tedarikçi eklenemiyor. | `sunucu/moduller/satin-alma/firma-gecici.ts`, UYUM-BORCU 1-3 |
| Firma bağı | `satin_alma_tedarikci.firma_id` düz `int`, yabancı anahtarı yok. | `gocler/20261007230000_satin_alma_tablolar.sql` |
| Finans imzaları | `firmaAdlari`, `firmaVarMi` (`{var, aktif}` döner), `firmaAra(db, {metin, sinir, yalnizAktif?, tur?})`, `firmaOzeti`. Toplu özet fonksiyonu yok; firmada şehir alanı yok. | `finans/disari.ts`, `finans/servis.ts:118-143` |
| Teslim | `teslim-bilgisi.ts`'teki `teslimAlinanlar` ve `gkkSonuclari` boş dönüyor. Talep hiçbir zaman "teslim alındı"ya geçmiyor. | `satin-alma/teslim-bilgisi.ts`, UYUM-BORCU 24 |
| Katalog | `satin_alma_katalog` kendi `kod`, `ad`, `kategori` ve `birim` alanlarını tutuyor. `malzeme_no integer` alanı yabancı anahtarsız. | göç `20261008133000`, UYUM-BORCU 5 |
| Kur | `satin_alma_kur` her para birimi için tek bir güncel kur ve aylık faiz tutuyor (TRY, USD, EUR, GBP). Finansın `finans_kur` tablosu ise tarihli günlük kur tutuyor ve TRY satırı yok. | `20261008132300_finans_cekirdek.sql:22` |
| Ekran | Onay ve sipariş düğmeleri durumdan bağımsız görünüyor; sunucu 422 döndürüyor. | UYUM-BORCU 29 |

---

## 2. Bu turda satın almada yazılacaklar

### 2.1 Firma finanstan (C1, C3; borç 1-3 kapanır)
- `firma-gecici.ts` silinir. Servis ve ikinci menü `../finans/disari.ts`'i ithal eder.
- Çağrılar finansın gerçek imzasına göre düzeltilir:
  - `firmaVarMi` artık `{var, aktif}` döner; tedarikçi eklerken firma hem var hem aktif olmalı (SAT-41).
  - `firmaAra` artık `{metin, sinir, yalnizAktif: true}` alır.
- Açılış toplu özet ister. Finansa `firmaOzetleri` gelene kadar özetler `firmaOzeti` ile tek tek okunur. VARSAYIM: tedarikçi sayısı az. Geri alması tek satır.
- Finansta şehir alanı yok; bu alan o gelene kadar `null` döner ve ekranda boş görünür.
- Testler:
  - Beş "[uydurma firma]" testi finansın gerçek `finans_firma` satırıyla kurulur ve işaret kalkar.
  - `firmaKaynagi` test kancası silinir.
  - Yeni test: pasif firma tedarikçi olamaz.

### 2.2 Tedarikçiye yabancı anahtar (C2; borç 1 kapanır; soru 1)
- Yeni göç ekler: `satin_alma_tedarikci.firma_id` alanına `finans_firma(id)` yabancı anahtarı (`ON DELETE RESTRICT`).
- Göç önce finansta karşılığı olmayan satırları sayar. Sayı sıfır değilse sayıyı yazar ve durur; hiçbir veriyi değiştirmez.
- Test: karşılıksız satır varken göç durur ve şema değişmez. Mevcut göç testinin kalıbı kullanılır.

### 2.3 Teslim satın almada (C6; borç 24 kapanır; SH1 a, SH2 b)
- Yeni tablo `satin_alma_teslim`. Dolu tabloya dokunmaz. Yalnız ekleme yapılır (`yalniz_ekleme` tetikleyicisi). Sütunlar:
  - `id`
  - `siparis_satiri_id` (yabancı anahtar)
  - `mal_kabul_satiri_id` (düz, anahtarsız; stoğun satırı)
  - `miktar` (eksi değer yalnız ters kayıtta)
  - `tarih timestamptz`
  - `kisi_id`
- `disari.ts`'e iki fonksiyon eklenir. İmza stokla aynı; koordinatör isteğiyle stok oturumuyla bu biçimde anlaşıldı:
  - `teslimIsle(db, kullanici, { siparisSatirId, miktar, malKabulSatirId })`
  - `teslimGeriAl(db, kullanici, { malKabulSatirId })`
- Fonksiyonların davranışı:
  - Kişi `kullanici.id`'den, tarih sunucu saatinden alınır.
  - Çağıranın işlemini kullanır, yetki denetlemez; yetki stok ucundadır.
  - Sipariş satırı yoksa ya da talep iptal edilmişse 422 döner.
  - Geri alma kaydı silmez; aynı mal kabul satırına ters kayıt ekler.
- Kalanı aşan teslim (TS1, iki yol da varsayım olarak yazılı):
  - Ret çıkarsa: `teslimIsle` 409 döner. Kalanı sipariş satırının sahibi olan satın alma hesaplar.
  - Kabul çıkarsa: fazla miktar yazılır, satır "tamam" görünür.
- `teslim-bilgisi.ts`'teki `teslimAlinanlar` kendi tablosunu okur. `gkkSonuclari` kalkar; kalite, kalite modülü gelene kadar boş kalır (SH2 b).
- Döngü yok: stok satın almayı ithal eder, satın alma stoğu ithal etmez (ADR 0006; `sinir` döngü denetimiyle doğrulanır).
- Testler:
  - Teslim işlenir; kısmi ve tamam durumları oluşur.
  - Bölünmüş kararda iki sipariş de tamam olunca talep "teslim alındı" görünür (SAT-57'nin kalan yarısı).
  - Geri alma durumu geri çevirir.
  - Kayıt yalnız eklenir, değiştirilemez.
  - İptal edilmiş talebe teslim 422 döner.

### 2.4 Katalog malzeme kartına bağlı (C8; borç 5 kapanır; soru 2)
- `satin_alma_katalog.malzeme_no` alanına `malzeme_katalog_karti(no)` yabancı anahtarı eklenir. Göç karşılıksız numaraları sayar ve gerekirse durur.
- Önerilen yol (soru 2 b):
  - Kalem bir malzeme kartına bağlıysa adı, birimi ve kategorisi karttan okunur.
  - Bağsız kalem kendi kopyasını tutar; SAT-58 (talep edenin yeni kalem açması) bozulmaz.
- Okuma malzemelerin `malzemeOzetleri(db, nolar)` fonksiyonuyla yapılır. Bu fonksiyon gelene kadar `malzemeOzeti` tek tek çağrılır. Bugün `malzemeOzeti` var (DOĞRULANDI `malzemeler/disari.ts`).
- Birim listesi (SH4 a) malzemelerden gelince katalog ve talep kalemi birimi o listeye göre doğrulanır. Liste gelene kadar birim serbest metin kalır.

### 2.5 Kur finanstan (C9; soru 3)
- Önerilen yol (soru 3 a):
  - Güncel kur finanstan okunur: `kurGetir(db, paraBirimi, tarih)`; açık talepte bugünün tarihi kullanılır.
  - `satin_alma_kur.kur` sütunu düşer.
  - Para birimi listesi ve aylık faiz yüzdesi satın almada kalır, çünkü net bugünkü maliyet satın almanın hesabıdır (VARSAYIM; HAZIRLIK C9 ile aynı).
  - Sipariş anında sabitlenen kur (`satin_alma_sabit_kur`) değişmez.
- Finansta kur yoksa değer `null` döner, sıfır uydurulmaz. Ekran o para birimini "kur yok" diye gösterir.
- Ekran etkisi: Ayarlar ekranındaki kur alanı salt okunur olur. Kaynağı finans olarak gösterilir.

### 2.6 Ekran ve metin (C16; borç 29, 30; soru 4, 5)
- Düğmeler (soru 4 a): onay ve ret düğmeleri yalnız "onayda" durumunda, sipariş düğmesi yalnız onaylı kararda görünür. `approvalState` zaten var (`merkez/calc.ts`); yalnız düğme koşulları değişir.
- SAT-56 (soru 5 a): metin "sunucu ekranın değerini yok sayar, kendisi hesaplar" diye düzeltilir. Kod ve testler değişmez.

### 2.7 Doğrulama
- İlk iş: her madde için kırmızı test.
- Sonra şu komutlar koşulur: `tip`, `lint`, `sinir -- --modul satin-alma --taban origin/main` (döngü ve göç damgası dahil), `test:modul -- satin-alma`.
- Tam `kontrol` çekme isteğinde koşar.
- Çekme isteği gövdesi şu bölümleri taşır: gelen, çalıştırılan komutlar, varsayımlar.

---

## 3. Diğer parçalara istekler (ben yazmıyorum)

| Parça | İstek | Neden |
|---|---|---|
| finans | `firmaOzetleri(db, idler): Map<number, FirmaOzeti>`; şehir ve iletişim alanları (C4) | Açılış tek çağrı; tedarikçi listesinde şehir |
| finans | `kurGetir(db, paraBirimi, tarih): Promise<string \| null>`: tarihteki ya da tarihten önceki son kur; TRY için 1. İmza VARSAYIM. | C9 |
| stok | `stok_mal_kabul_satiri.siparis_satir_id` sütunu; `satin_alma_siparis_satiri(id)`'ye yabancı anahtar (C7). Ad stoğun. | SH1 a |
| stok | Mal kabul komutunda aynı işlem içinde `teslimIsle`, mal kabul iptalinde `teslimGeriAl` çağrısı | SH1 a |
| stok | `BASKA-MODUL-ISTEKLERI.md` 55. satırdaki `teslimAlinanlar` isteği düşer | SH1 a ile yön değişti |
| malzemeler | `malzemeBirimleri(db)` | SH4 a |
| malzemeler | `malzemeOzetleri(db, nolar)` (ad, birim, kategori) | C8 |
| malzemeler | `malzemeAra(db, {metin, sayfa})` | Katalogda bağ kurarken arama; stok ve rota da istiyor |

---

## 4. Varsayımlar (geri alması ucuz)

| Varsayım | Gerekçe | Geri alma |
|---|---|---|
| Toplu firma özeti gelene kadar firmalar tek tek okunur | Tedarikçi sayısı az | Tek satır |
| Şehir finansa gelene kadar `null` | Finans firmasında alan yok | Finans eklenince okunur |
| Teslim kaydı yalnız eklenir; geri almada ters kayıt eklenir | Denetim izi korunur (SAT-63 ile aynı ilke) | Fonksiyon gövdesi |
| Kalanı aşan teslim: TS1 cevabına göre ret (409) ya da kabul | Kullanıcıya soruluyor | Tek kural ve test |
| Aylık faiz satın almada kalır | Net bugünkü maliyet satın almanın hesabı | Göç |
| Birim listesi gelene kadar birim serbest metin | SH4 a malzemelerde | Doğrulama eklenir |

---

## 5. Sorulur (tek liste)

1. **C2 göçü.** Dolu `satin_alma_tedarikci` tablosuna finans firmasına yabancı anahtar eklensin mi? Neden: firma bağı bugün anahtarsız; karşılıksız satır varsa göç sayıyı yazıp durur, veri değişmez.
   - a) Evet (öneri)
   - b) Hayır, bu turda değil
2. **C8 katalog kopyaları.** Neden: bugün satın alma kataloğu kendi kod, ad, kategori ve birimini tutuyor; talep eden yeni kalemi burada açıyor (SAT-58).
   - a) Malzeme bağı zorunlu olur, kopya sütunlar düşer, yeni kalem malzemelerde açılır (SAT-58 değişir).
   - b) Bağ isteğe bağlı olur. Bağlı kalemde ad, birim ve kategori malzeme kartından okunur; kopyalar bağsız kalem için kalır. (öneri)
   - c) Bu turda değişmez.
3. **C9 kur.** Neden: finans günlük kuru tarihle tutuyor, satın alma tek bir güncel kur tutuyor; iki kaynak farklı kur gösterebilir.
   - a) Kur finanstan okunur, `satin_alma_kur.kur` sütunu düşer; para birimi listesi ve aylık faiz satın almada kalır. (öneri)
   - b) Satın alma kendi kurunu tutar; finans kuru yalnız öneri olarak gösterilir.
4. **C16 düğmeler.** Onay ve sipariş düğmeleri talebin durumuna göre gizlensin mi? Neden: bugün tıklanınca sunucu 422 döndürüyor.
   - a) Evet (öneri)
   - b) Kalsın
5. **SAT-56 ile Karar 10 çelişkisi.** Neden: kural "ekranın gönderdiği farklı toplam reddedilir" diyor; onaylı Karar 10 ise "kaydedilen türetilmiş değer sunucuda hesaplanır" diyor.
   - a) Karar 10 geçerli; sunucu ekranın değerini yok sayar, SAT-56 metni buna göre düzeltilir. (öneri)
   - b) Farklı değer reddedilir.
6. **Dal temizliği.** Neden: açık dal sınırı 5 ve uzak depoda benim beş dalım duruyor. `162-satin-alma-3`, `-4` ve `-5`'in çekme istekleri birleşti (#305, #319, #336); `-2` ve `-uyum` silinmeden önce ayrıca denetlenir.
   - a) Çekme isteği birleşmiş olanlar silinsin. (öneri)
   - b) Kalsın.
