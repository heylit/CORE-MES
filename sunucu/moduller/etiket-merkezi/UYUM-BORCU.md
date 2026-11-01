# UYUM BORCU: etiket-merkezi

Sınıflar: TUTAN, ETKİLEYEN, SONRA.

## Bağlamada kapanacak
1. ETKİLEYEN: altı kaynağın hepsi gerçek kayıttan basılır: konum, lot ve mal kabul (stok `konumAdlari`, `lotEtiketleri`), istasyon (stok `istasyonKonumlari` + istasyonlar `istasyonAdlari`), refakat kartı (stok `refakatPartisi` + uretim-emirleri `refakatKarti`; emirden lotsuz kart #589 ile kalktı), malzeme (malzemeler `malzemeOzetleri`, 269 a). Mal kabul seçimi kabulün bütün lotlarını basar (270 a); ekranda çip lottur, tek lot çıkarılamaz. Ekrandaki adet uyarısı seçili kabul sayısıyla hesaplanır; lot sayısıyla sınırı sunucu denetler (400).
2. ETKİLEYEN: sahip ekranlar `/etiket-merkezi?tur=<konum|lot|istasyon|refakat-partisi|malzeme|mal-kabul>&id=…` adresini açacak (sahiplerin işi); emir ayrıntısı kartları `refakat-partisi` ile açar (kart #588).
3. ETKİLEYEN: refakat kartı etiketinde işlem tablosu ve "Bitti" kutuları yok; işlem sırası tek metin alanında (`adimlar`) satır satır kırılır, sığmayan kesilir (EM-17). İptal emir seçimde varsa bütün baskı 409 ile durur (emrin kendi kuralı).

15. SONRA: lot etiketi malzeme türü adını basar (271 a, "Kart 1001 · Hammadde"); tür adları `kurallar.ts`'te stok ekranındakinin kopyasıdır. Ortak tür adı sözlüğü çekirdek isteği (CEKIRDEK-ISTEKLERI 4).

## Sonra
16. SONRA (kart #1292, 1288): dışarıdaki dört baskı yolu (stok `Etiketler.tsx` ve `LotEtiketi.tsx`, malzemeler `katalog/EtiketPenceresi.tsx`, Üretim Hazırlık `hazirlik/etiket.ts`, Kalite Merkezi KF-19) Etiket Merkezi'ne taşınacak; her biri sahibinin dalında, o gelince satırdaki `disaridaki_yol` göçle boşalır. İstisna (1309 c): Üretim Hazırlık seri no etiketi markalama modülüyle birlikte ikinci turda ele alınır; o zamana kadar tarayıcı baskısı kalır, deftere yazılmaz.
17. SONRA (kart #1292): etiket listesi salt okunur; satır değişikliği göçle. Listeden düzenleme gerekirse `etiket-merkezi.sablon-yaz` ile ayrı uç.
18. SONRA (1285 a, 1286 a, 1287 a): hatalı parça (`hatali-parca`), kalite durum (`kalite-durum`) ve sevk koli (`sevk-koli`) etiketleri yapıldı (kart 1525). Koli etiketinde QR yeter (1287 a). Kaynak okumaları sahiplerin `disari.ts`'inden (stok, uretim-emirleri, sevkiyat).
5. SONRA: şablon tasarım ekranı ve kullanıcı şablonu tablosu.
6. ETKİLEYEN: önizlemede harf genişliği tahmindir (`HARF_ORANI`); yazıcıdaki satır kırılımı farklı olabilir. Deneme etiketiyle doğrulanacak.
7. SONRA: QR çizimi istemcide dördüncü kez yazıldı (`Onizleme.tsx`); ortak QR bileşeni çekirdek isteği.
8. SONRA: ana menü simgesi `book` geçici; uygun "yazıcı" simgesi ortak sette yok (çekirdek isteği).
9. ETKİLEYEN: doğrudan baskı deneme etiketi ve seçili kayıtlar (altı kaynak) için açık (EM-11).
12. ETKİLEYEN: konum etiketinde ad ve yer boş (stok yalnız kod veriyor); 94 a için yeterli.
13. SONRA: kalıcı "yeniden basılmalı" rozeti yok (koordinatör kararı, 19.10); uyarı yalnız stokun kod değiştirdiği anda. Basılan konumlar `etiket_merkezi_baski_kaydi`'nda tutulur.
14. ETKİLEYEN: deftere yalnız dosya yazıcısı seçilerek yapılan indirme yazılır ("indirildi"); önizlemedeki düğme "Önizleme için indir (<dosya>, deftere yazılmaz)" adını taşır (koordinatör kararı b, 19.10).
10. ETKİLEYEN: "gönderildi" yazıcının bağlantıyı kabul ettiğini gösterir; etiketin çıktığını göstermez (yazıcıdan durum okunmaz).
11. SONRA: Argox OS-214 USB'de (100): doğrudan baskı yok, dosya indirilir. PPLB komutları cihazda doğrulanmadı.
15. VARSAYIM (kart #127): refakat partisinin baskısı deftere emrin refakat kartı olarak yazılır (`kaynak_tur = 'refakat'`, emir kimliği); hangi partinin basıldığı defterde yok. Ayrı tür için dolu tabloya kısıt göçü gerekir (sorulur). Geri alma maliyeti: göç ve tek satır.
19. SONRA (kart 1525): hatalı parça ve sevk koli etiketinin QR'ı emrin `UE:<kimlik>`idir; ayrı önek açılmadı (`paylasilan/kod-sozlugu.ts` ortak). Okutan emri açar, hatalı kaydı değil. Ayrı önek istenirse ortak kart.
20. ETKİLEYEN (kart 1525): hatalı parça etiketi basıldığı andaki kararı basar; karar sonradan değişirse etiket kendiliğinden değişmez, yeniden basılır (Etiket Merkezi ekran notunda yazılı). Kalite durum etiketi de böyledir.
21. SONRA (kart 1525, 1286 a): kalite durum etiketi karar tarihi, karar veren, GKK ya da NCR no ve şartlı kabul notunu basmaz: stok bakiye satırı bunları tutmaz. Kalite kararının kaydı Kalite Merkezi'ndedir; bağlamada o modülün `disari.ts`'inden okunur (adım 3, KF-19).
22. SONRA (kart 1525): kalite durumu adları (SERBEST, KARAR BEKLİYOR, ŞARTLI, RED) stok ekranının hal adlarının kopyasıdır (`kurallar.ts KALITE_DURUM_ADLARI`); ortak sözlük çekirdek isteği (15 gibi).
23. SONRA (kart 1525, 1287 a): sevk koli etiketi müşteri sipariş no, revizyon ve lot basmaz: Sevkiyat kalemi bunları tutmaz (sipariş bağı Siparişler'de, lot stokta). Bağlamada sahiplerin `disari.ts`'inden okunur. Koli sayısı ve koli içi adet her baskıda elle girilir; giden ambalaj kaydı yoktur, deftere yalnız kalem yazılır (kaç koli basıldığı defterde yok).
24. SONRA (kart 1525): elle girilen sevk kalemi (numune, tamir vb.) emirsizdir; etiketinde QR yoktur, parça yerine kalemin açıklaması basılır.
