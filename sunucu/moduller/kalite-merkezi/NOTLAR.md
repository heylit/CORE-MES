# kalite-merkezi notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır.
- Kaynak: Kalite Merkezi yerel sürümü, tek dosya `KaliteMerkezi.html` (20.443.145 bayt, sha256 350fd627…e8d603). Kullanıcı talimatı
  (12.10.2026): hiçbir özellik ve yapı değişmez; İK gibi menüye girer. Uygulamanın kodu değişmedi.
- Örnek veri: uygulamanın `DEMO` sabiti (örnek firma, parça, kişi, proje adları) paket üretilirken boş nesneye çevrilir (kullanıcı
  kararı 12.10.2026); "Örnek verileri yükle" düğmesi durur, hiçbir şey yüklemez.
- Paket üretimi: `uygulama/paket.ts` = HTML'den 10 gömülü kitaplık (`<script type="text/x-lib" id="lib-…">`) ve Chart.js betiği
  çıkarılıp yerlerine `<!--km-kitaplik:lib-…-->`, `<!--km-grafik-->` konmuş hâli; `uygulama/ocr*.ts` = çıkarılan dört yazı tanıma
  kitaplığı olduğu gibi (`ocr.ts`, `ocr-cekirdek.ts`: teslim aracının 5 MB dosya sınırı). Betik: `PAKET-URETIMI.md`
  (`python3 -I km_paket_uret.py KaliteMerkezi.html istemci/src/moduller/kalite-merkezi/uygulama`).
- Kitaplıklar depodaki paketlerden: three-147 (three.min.js, OrbitControls.js), pdfjs-dist 6.4.299 (`legacy/build/pdf.min.mjs`, `pdf.worker.min.mjs`; 17.10.2026'da 6.3.289, 141 a ile 19.10.2026'dan beri 6.4.299; HTML'dekinden yeni),
  occt-import-js 0.0.23 (js ve wasm), chart.js 4.4.1. HTML'deki gömülü kopyalarla bayt bayt aynı (yalnız sondaki satır sonu farkı).
  Yazı tanıma (tesseract.js 5.1.1, çekirdek 5.x, İngilizce veri) depoda aynı sürümle yok; uygulamadan alındığı gibi pakettedir
  (kullanıcı onayı 12.10.2026). Depodaki tesseract.js-core 6.1.2'ye geçmek uygulamanın OCR yükleyicisini değiştirirdi.
- Uygulamaya üç dokunuş sayfa kurulurken yapılır, kaynağa değil (sayfa.ts): (1) çerçevede `fetch` köprüsü: `api/*` istekleri kabuğa
  gider; (2) uygulamanın sunucu kipini seçen tek koşul (`location.protocol` http mi) `window.__TMI_KM` ile değiştirilir
  (çerçevenin adresi about:srcdoc); (3) `URL` göreli adresi about: tabanına göre çözemediğinde yer tutucu taban (tesseract işçi
  dosya adları; istek doğmaz). Ayrıca `render` sarılır (ikinci menü eşlemesi) ve geniş ekranda uygulamanın sol menüsü gizlenir.
- Saklama Arkon kalıbı: kayıt uygulamanın biçiminde jsonb. Sürüm tek dizidir; yazanlar tabloyu SHARE ROW EXCLUSIVE kilitler ki sürüm
  sırası işlenme sırası olsun (okuyan bir sürümü atlayıp sonrakini görmesin). Okuma kilitlenmez.
- Dosyalar ortak dosya deposunda (`dosya` modülü, bağ: modül `kalite-merkezi`, kayıt = uygulamanın dosya kimliği). Aynı kimliğe yeni
  içerik eski bağı kaldırır.
- Kullanıcı kararı 12.10.2026: kullanıcı/PIN girişi, örnek veri, tümünü sil ve geri yükleme açık kalır.
- Saklama iki adımlı (kullanıcı kararı 12.10.2026): Aşama 1'de tek tablo; Aşama 2'de bağ ve kural gereken koleksiyonlar tek tek
  ayrıştırılır. Hepsini birden ayrıştırmaktan vazgeçildi: alan listeleri formlarda dağınık, eksik alan uygulamayı kırar.
- 325 a, 326 a (kullanıcı onayı 20.10.2026, prototip değişikliği): ilk parça kararı Bugün görünümünün başında, geçmiş "Geçmiş"
  penceresinin altında; ikisi de `acilis.ts` betiği + köprü (`api/ilk-parca/...`, `api/gecmis/...`), paket dosyası değişmedi.
  Geçmişte "değiştiren" kaydı yerine yazan kişidir (silmede de bilinir: servis silmeyi gövdeyi boşaltarak yapar); en çok 50 sürüm.
