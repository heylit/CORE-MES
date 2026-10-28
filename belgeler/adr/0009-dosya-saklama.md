# ADR 0009 — Dosya saklama

Durum: kabul (kullanıcı kararları DS1-DS10 a, DSm a ve DSb a, 08.10.2026, kart #82)

## Bağlam

Malzeme belgeleri, kalibrasyon sertifikaları ve Arkon çizimleri dosya ister. Arkon kendi tablosunda (`arkon_dosya`) tek parça
`bytea` ve base64 JSON cevapla tutuyordu; özetini bilen her Arkon rolü dosyayı okuyabiliyordu. Her modülün kendi deposunu
kurması aynı kotayı, temizliği ve yetki açığını çoğaltırdı.

## Karar

1. **PostgreSQL içinde, özetle tekil, parça parça (DS1).** `dosya` (özet, boyut, tür), `dosya_icerigi` (en çok 1 MB parça).
   Aynı içerik bir kez saklanır. Yedek veritabanı yedeğiyle gelir (DS8, #44).
2. **Yükleme JSON gövdesinde parça parça (DS3), kişi başına şerit.** `POST /dosyalar/eksikler`, `POST /dosyalar/:ozet/parca`;
   özet tamamlamada doğrulanır. Kota Arkon'la aynı: tek dosya 200 MB (413), kişi başına 5 açık yükleme (en eskisi atılır),
   kişinin bağlamadığı dosyalar 2 GiB (429, VARSAYIM), depo 50 GB (429). Tür ilk baytlardan bulunur; bildirilen MIME kullanılmaz.
   İçeriği kendisi gönderip özetini doğrulatan her kişi `dosya_yukleyeni`ne girer; aynı içeriği ikinci yükleyen de bütün parçaları gönderir.
3. **İndirme ikili cevapla (DS2), dosyayı bağlayan modülün ucundan (DS6).** Uç katmanı `cevap: ikiliCevap` kabul eder; üst bilgi
   okuma transaction'ında, içerik transaction bittikten sonra parça parça okunur. Okuma yetkisi ve veri kapsamı bağlayan modülün
   ucundadır; `dosya` modülü üst modülleri ithal etmez.
4. **Bağ kaydı.** Modül dosyayı kendi kaydına `dosyaBagla` ile bağlar (modülün tür ve boyut sınırıyla); bağı olan dosya silinemez.
   Bağlayan, içeriği kendisi göndermiş olmalıdır: özeti bilmek yetmez (kullanıcı kararı DSb a, 08.10.2026).
   Bağı kalmayan dosya 7 gün sonra silinir (DS4); yarım yükleme 1 gün.
5. **Denetim (DS9).** Yükleme içeriği deftere girmez (gövdesiz uç); bağlama ve kaldırma denetim ekiyle özet, ad, boyut, tür yazar.

## Sonuçlar

- Akış transaction dışında okunduğu için yalnız değişmeyen içerik ikili cevapla verilir. Akış sırasında dosya silinirse
  (yalnız bağsız ve süresi dolmuş dosya) bağlantı kesilir; istemci yarım dosya almaz.
- Temizlik zamanlanmış iş gelene kadar yüklemede fırsatla koşar (UYUM-BORCU).
- Sınırlar ortam değişkeni değil sabittir: modüller ayarı almaz; değiştirmek kod ve karar ister.
- Malzemeler (#300), kalibrasyon (#301) ve Arkon (#302) kendi kartlarıyla bağlanır; Arkon'un eski tabloları ayrı göçle düşer (DS7).

## Ek: kart #732 (kullanıcı kararları 732 a ve 743 a, 27.10.2026)

- **Kaynaktan bağlama (DSb a'ya istisna).** Sunucu kodu, başka bir modülün kaydına zaten bağlı dosyayı kişisiz bağlayabilir
  (`kaynaktanBagla`). İlk kullanım: TMI emrinden açılan Arkon paketine malzemenin Çizimler'de yayındaki PDF ve STEP'i. Özet kişiden gelmez;
  kişinin özetle bağlaması kuralı (DSb a) aynen sürer.
- **Modül deposu ve `ikili` türü.** Kendi yükleme şeridi olan modül (Arkon) tamamladığı içeriği ortak depoya yazar; imzasız içerik
  (3B ağ dizileri gibi) `ikili` türüyle girer. Kişinin yükleme ucu bu türü üretmez.
- **Arkon deposunun taşınması (DS7).** `arkon_dosya` içeriği ortak depoya göçle taşınır; eski tablo ayrı göçle düşer.

## Ek: talimat medyası (kullanıcı kararları 994 a, 995 a, 1004 a, 1005 a, 28.10.2026)

- **Yalnız talimat medyası diskte (1004 a, DS1'e istisna).** Rota talimatının adım resim ve videoları içerik özetiyle adlandırılmış,
  değişmeyen dosya olarak sunucunun diskinde durur: `TMIV2_MEDYA_DIZINI/<özet[0:2]>/<özet[2:4]>/<özet>` (sha256, 64 küçük hex,
  uzantısız). Dosya bir kez yazılır (geçici ad, sonra yeniden adlandırma), üzerine yazılmaz; aynı içerik ikinci kez saklanmaz.
  Künye (özet, boyut, tür) ve bağ veritabanında kalır; öteki bütün dosyalar (çizim, sertifika, STEP) veritabanında kalır.
- **Sınırlar (995 a).** Resim en çok 10 MB, video en çok 200 MB ve 3 dakika, ürünün bütün talimatlarında en çok 1 GB.
- **Silme (1005 a).** Bağı kalmayan medyanın künyesi DS4 ile silinir; diskteki dosyası en az 30 gün bekler, sonra silinir. Böylece
  eski bir veritabanı yedeği geri yüklendiğinde o yedekteki künyelerin dosyası bulunur.
- **Yedek.** Medya gece veritabanı yedeğine girmez. Veritabanı yedeğinden sonra artımlı, şifreli bir ayna yalnız aynada olmayan
  özetleri kopyalar; ayna ve geri yükleme ayrı kartla çekirdekte yazılır. Bu ayna gelmeden disk deposu canlıda açılmaz.
- **Bağ.** Rota medyayı özet başına tek kayda bağlar (`medya:<özet>`); ilk bağlayan içeriği kendisi göndermiş olmalıdır (DSb). Bağlı
  medya oturumla okunur, çünkü talimat da oturumla okunur.
