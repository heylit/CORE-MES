# UYUM BORCU: ortak-dosyalar (kart 2067)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI (kod ya da komut), VARSAYIM, BİLMİYORUM.

## Bağlamada kapanacak
1. KAPANDI (kart 2195): ofis türleri (docx, xlsx, pptx), düz metin ve csv `ORTAK_DOSYA_TURLERI`'nde. Tür zip'in merkez dizininden ve
   `[Content_Types].xml`'den bulunur; makrolu belge reddedilir. Dosya adının uzantısı içerikle uyuşmalı (OD-18). DOĞRULANDI: `OD-7`, `OD-18`.
   VARSAYIM: içerik türleri girdisi yükleme şeridinin ilk ya da son iki parçasında durur (Office başa, LibreOffice sona yazar; denendi).
2. Sayfanın rollere dağıtımı (karar 2067-3 b): `sayfa.ortak-dosyalar` bütün rollere `kisiler` göçüyle verildi
   (`20261105090000_kisiler_ortak_dosyalar_sayfasi.sql`); `ortak-dosyalar.yetki-ver` yalnız yönetici rolünde kalır. Sonradan açılan rol sayfayı
   kendiliğinden almaz; rol açan göç satırı ekler (idari-isler ile aynı). Bağlamada ortak yetki matrisine taşınır.
3. Geçmiş sekmesi modülün kendi sütunlarından kurulur (açma, yükleme, sürüm, son arşiv ve geri alma, son yetki değişikliği). İndirme ve önceki
   arşiv/yetki olayları denetim kaydındadır (DOĞRULANDI: `OD-16`), Geçmiş'e gelmesi için `denetim/disari.ts`'e klasör yolu önekiyle okuma
   gerekir (BASKA-MODUL-ISTEKLERI 1). Yollar bunun için klasör kimliğini taşır.
4. Klasör ad değiştirme, taşıma ve klasör arşivi (ADR 0030, 3) uçsuz ve ekransız; prototipte yer yok. İstenirse ayrı kartla.
5. Ortak simge setinde klasör simgesi yok; ağaçta `layers`, ana menüde (simge tekil olmalı, `sayfa-simgeleri.test.ts`) `more` kullanılıyor. Ortak sete `folder` eklenmesi çekirdek isteği (CEKIRDEK-ISTEKLERI 1).
6. VARSAYIM: klasör sayısı yüzlerle sınırlı; düzey her istekte bütün ağaçtan çözülür. Binleri geçerse önbellek ya da özyinelemeli sorgu.
7. KAPANDI (kart 3288-2): firma değişti, sipariş değişti, proje açıldı ve değişti olayları ile mevcut kayıt kaynağı `sunucu/kablolama.ts`'te
   bağlı; firma, sipariş ve proje ayrıntısında "Klasör" bağlantısı (`istemci/src/ortak/arayuz/KlasorBaglantisi.tsx`).
8. KAPANDI (kilit 07:51Z): Ayarlar ikinci menüde, `islem: 'ortak-dosyalar.yetki-ver'`.
9. Kayda bağlı işaret `pin` simgesiyle; ortak sette bağlantı (zincir) simgesi yok (CEKIRDEK-ISTEKLERI 2).
10. Kaydın firması ya da siparişi değişirse (taslak siparişte firma, projede firma) klasör taşınmaz; ad ve arşiv eşitlenir. Klasör taşıma
   ucu yok (madde 4). VARSAYIM: seyrek; gerekirse taşıma ayrı kartla.
11. Proje iptal ya da kapanınca klasörü arşive kalkmaz (onaylı listede yalnız sipariş iptali var).
12. Firma musteriden yalniz tedarikciye donerse klasoru ve siparis klasorleri Musteriler altinda kalir, arsive kalkmaz. Yeni siparis acilamaz
   (siparisler SIP-01 `firmaReddi`). VARSAYIM: seyrek; gerekirse firma olayina arsiv ayri kartla.
