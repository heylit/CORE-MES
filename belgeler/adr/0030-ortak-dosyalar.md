# ADR 0030 — Ortak dosyalar CORE içinde, klasör başına rol düzeyiyle yetkilendirilir

Durum: kabul (2067 c, 2067-1 a, 04.11.2026; kabul 2067-2 a, dizin düzeltmesi 2197-10 a, 07.11.2026). Numara 0030 koordinatörce 2067 için ayrıldı (04.11 03:10). ADR 0003'ü ve ADR 0009'u tamamlar.

## Bağlam

- Atölyede rollere göre ayrılmış ortak klasörler (duyuru, şablon, kalite, satın alma, insan kaynakları) gerekiyor. Kullanıcı önce CORE
  içinde dosya ve klasör yönetimini, sonra sunucudaki Windows paylaşımını yöneten bağlayıcıyı seçti (2067 c). Ekran prototipi onaylı
  (2067-1 a, `devir-heylit/2067/prototip/ortak-dosyalar-prototip.html`).
- Yetki birimi işlemdir ve yalnız rolle verilir; kişiye özel yetki yoktur (ADR 0003). Kayda göre süzme bugün yalnız iş merkezi
  kapsamıyla yapılır (`sunucu/cekirdek/kapsam.ts`). Klasör başına rol yetkisi bu ikisinin dışında yeni bir boyuttur.
- Dosya içeriği `dosya` modülünde, PostgreSQL'de özetle tekil tutulur; indirme bağlayan modülün ucundan verilir (ADR 0009).
  Kabul edilen türler `paylasilan/sozlesme/dosya.ts` `DOSYA_TURLERI` (pdf, resim, 3B, dxf, mp4); ofis belgesi yoktur. Depo sınırı
  `sunucu/moduller/dosya/kurallar.ts` `DOSYA_SINIRI.depoBayt` (50 GB), tek dosya `AZAMI_DOSYA` (200 MB).
- Belge Merkezi onaylı, revizyonlu belgenin tek sahibidir (ADR 0026). Ortak klasördeki dosya onay akışı taşımaz.

## Seçenekler

- **a) Yeni `ortak-dosyalar` modülü, klasör x rol düzeyi modülün kendi tablosunda:** yetki sunucuda tek yerde; rol modeli değişmez.
  Bedeli: yeni bir yetki boyutu ve onun testleri.
- **b) Belge Merkezi genişler (klasör ve serbest dosya):** tek belge ekranı; ama onaysız dosya kontrollü belgeyle karışır, ADR 0026 bozulur.
- **c) Her klasör için ayrı işlem (`ortak-dosyalar.<klasor>.oku`):** mevcut işlem modeliyle çalışır; ama işlem listesi veriyle büyür,
  klasör açmak göç ister.

## Karar

Seçenek a.

1. **Tek sahip.** Klasör, dosya, sürüm ve klasör yetkisinin sahibi `ortak-dosyalar` modülüdür. İçerik `dosya` modülünde kalır;
   sürüm `dosya_bagi` ile bağlanır (`modul = 'ortak-dosyalar'`). Belge Merkezi'nin belgeleri buraya taşınmaz.
2. **İki işlem.** `sayfa.ortak-dosyalar` sayfayı açar; `ortak-dosyalar.yetki-ver` klasör yetkisini değiştirir. Yetki ver yalnız
   yönetici rolündedir (rol x işlem matrisine yeni satır göçle; başka role verilmez).
3. **Klasör düzeyi.** Her klasörde her rolün düzeyi `yok`, `gorur`, `ekler`, `yonetir`'den biridir; düzeyler sıralıdır (üstteki
   alttakini içerir). Gorur: listeler, indirir. Ekler: yükler, yeni sürüm ekler. Yonetir: alt klasör açar, ad değiştirir, taşır,
   arşive kaldırır ve geri alır. Kişinin düzeyi rollerinin en yükseğidir. Yönetici her klasörde `yonetir`dir.
4. **Miras.** Üst düzey klasör kendi yetkisini taşır. Alt klasör, `ozel_yetki` işaretli değilse en yakın özel yetkili üst klasörün
   satırlarını kullanır. Çözüm saf işlevdir (`kurallar.ts`) ve her istekte sunucuda yapılır; ekranda gizlemek yetki değildir.
5. **Görünmezlik.** `yok` düzeyindeki klasör ve içindeki dosyalar listede, aramada ve "Son eklenenler"de görünmez; doğrudan istek 404
   döner (varlığı sızdırılmaz).
6. **Silme yok.** Dosya ve klasör arşive kalkar ve geri alınır; arşivdeki dosya indirilmez. Otomatik imha yoktur.
7. **Sürüm.** Aynı klasörde aynı adla (tr-TR, büyük-küçük harf duyarsız) yükleme yeni sürüm ekler; eski sürüm değişmez ve indirilebilir.
   Klasörde aynı adlı iki etkin dosya ya da aynı ebeveynde aynı adlı iki klasör olamaz (benzersiz dizin).
8. **İz.** Yükleme, indirme, taşıma, arşiv, geri alma ve yetki değişikliği denetim kaydına yazılır (ADR 0008 eki); Geçmiş sekmesi
   bundan okur. Kişi ve zaman sunucudan gelir; her yazma ayrı uç ve sürüm denetimlidir.
9. **Türler ve sınır.** Ortak klasör ofis belgesi (docx, xlsx, pptx), düz metin ve csv kabul eder; tür ilk baytlardan bulunur,
   sunucuda açılmaz ve önizlenmez, yalnız ek olarak indirilir. Makrolu tür (docm, xlsm) ve çalıştırılabilir dosya reddedilir.
   Depo sınırı `dosya` modülünden okunur, kopyalanmaz.
10. **Windows paylaşımı ayrıdır.** Sunucudaki gerçek paylaşım klasörünü ya da NTFS yetkisini değiştiren bağlayıcı bu ADR'nin
    kapsamında değildir; ayrı kart ve ADR ile sorulur. Sunucu servis hesabına işletim sistemi yönetici yetkisi verilmez.

## Sonuçlar

- `paylasilan/sozlesme/dosya.ts` tür listesi genişler (ortak nokta, ayrı kart ve kilit). Ofis belgesi diğer modüllere açılmaz;
  her modül kendi `BagSiniri.turler` listesiyle sınırlı kalır.
- Yeni boş tablolar ve yeni işlemler göçle gelir; dolu tablo değişmez.
- Ortak klasörün büyümesi 50 GB depo sınırını öteki modüllerle paylaşır; dolulukta yükleme reddedilir.

## Vazgeçilenler

- b: kontrollü belge ile serbest dosya karışır, Belge Merkezi'nin onay ve yürürlük kuralı zayıflar.
- c: klasör açmak göç ve rol x işlem matrisi değişikliği ister; işlem listesi veriyle büyür.
- Kişi başına klasör yetkisi: ADR 0003'teki "kişiye özel yetki yok" kuralıyla çelişir.

## Doğrulanmadı

- Ofis belgelerinin ilk bayt imzası (zip) docx/xlsx/pptx ayrımı için içteki `[Content_Types].xml` okunmadan yapılamaz; ayrım için
  zip dizini okunacak (sunucuda açma yok, yalnız dizin). Denenmedi.
- 50 GB'ın ortak klasör kullanımına yeteceği bilinmiyor.
