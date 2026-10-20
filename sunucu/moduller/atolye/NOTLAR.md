# atolye notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Yerleşim tek komutla kaydedilir (`yerlesim-kaydet`): düzenleyicideki bütün değişiklik tek transaction'dır. Eşzamanlılığı
  salonun `surum` sütunu ayırır (`FOR UPDATE` + `WHERE surum = $eski`); tetikleyici sürümü yalnız birer artırır.
  Vazgeçilen yol: her kayıtta yerleşimin yeni sürüm kopyası (önceki taslak); ON-PAKET sorusu 4'ün önerisi (a) seçildi.
- Kayıt kuralları (ATL-04..22) yalnız kayıtta, sunucuda denetlenir; ayrı "denetle" ucu yok (yazmayan POST olmaz,
  bütün yerleşim GET sorgusuna sığmaz). Düzenleyici anlık uyarı göstermez, ret listesini 422 ayrıntısından alır.
- 422 ayrıntısındaki öğe anahtarı gövdedeki dizi sırasıdır (`raf:<sıra>`), istasyonda istasyon kimliğidir.
- Salon içinde kalma (ATL-06) hem kuralda hem ertelenmiş kısıt tetikleyicisinde (`atolye_salon_icinde`); salon
  küçültme ile öğe taşıma aynı transaction'da olabildiği için denetim COMMIT'tedir. Hata 422'dir.
- `atolye_salonda` SQL işlevinde parametreler konumla anılır: adla anılınca salon tablosunun aynı adlı sütunları öne geçer.
- Raf kodu benzersizliği ertelenmiştir (iki rafın kodu tek kayıtta yer değiştirebilir). Başka salondaki kod ön denetimle
  409 alır; yarışta COMMIT'teki 23505 çekirdeğin genel 409 iletisine düşer.
- Göz satırı yalnız yeni ya da bölme/kat/göz sayısı değişen rafta eşitlenir; dışarıda kalan göze ileride bağlanan kayıt
  (stok) varsa silme yabancı anahtarda durur ve 409 BAGIMLI_KAYIT döner (ATL-12; testte fikstür tablosuyla sınanır).
- Alan ve duvar satırları kayıtta silinip yeniden yazılır: kimlikleri kararlı değildir, başka kayıt onlara bağlanmaz.
- İstasyon yeri upsert'i başka salondaki satırın üstüne yazmaz; yazılan sayı eksikse 409 (eşzamanlı yerleştirme).
- Rota (ATL-20) saklanmaz, her istekte hesaplanır. Izgara adımı 0,5 m; hücre sayısı 160 bini geçerse adım büyür.
  Hedef kapalıysa rota başlangıçtan ulaşılan en yakın noktada biter.
- Koordinat ve ölçüler numeric(…, 2) metin döner; rota noktaları hesaplanmış değerdir, sayı döner.
- Kişi adı `kisiAdlari` ile (çekirdek isteği), yoksa null. Hiçbir göç `atolye.yaz` vermiyor; akış testi geçici rol kurar.
- Canlı durum sunucuda bu modülde değil: istemci üretim emirleri ucunu 15 sn'de bir okur. Uretim-emirleri `disari.ts`
  durum işlevi verince sunucuya taşınır (BASKA-MODUL-ISTEKLERI 1).
- 3B model dosyası veritabanında (kullanıcı kararı: depoya ve diske değil). Uç gövdesi JSON ve en çok 1 MiB olduğu için
  dosya 512 KiB'lik base64 parçalarla gelir; tamamlamada parça sayısı, boy, GLB başlığı ve SHA-256 (Postgres
  `sha256(string_agg(veri ORDER BY sira))`) denetlenir. Tamamlanan modelin dosyası değişmez (tetikleyici); yalnız ayar değişir.
- STEP sunucuda çevrilmez (CAD çekirdeği yok): tarayıcı occt-import-js (wasm) ile GLB'ye çevirir, yalnız GLB saklanır.
  Kurum içi http'de `crypto.subtle` yok; istemci özeti yazılım SHA-256 ile hesaplar.
