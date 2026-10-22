# KURAL-TEST: etiket-merkezi

| Kural | Test |
|---|---|
| EM-1 öğe etiketin dışına taşmaz, yazı kutusundan büyük olmaz | `EM-1: hazır şablonların hepsi etiketin içinde kalır` (kurallar.test.ts) |
| EM-2 mm -> nokta yuvarlama | `EM-2: milimetre yazıcı noktasına yuvarlanır` |
| EM-3 Türkçe harf sadeleştirme, QR'a dokunmaz | `EM-3: sadeleştirme yalnız Türkçe harfleri çevirir` |
| EM-4 değeri olmayan alan basılmaz | `EM-4: değeri olmayan alan basılmaz` |
| EM-5 ZPL kaçışı, metin komut açamaz | `EM-5: ZPL alanında ^, ~ ve _ kaçırılır` |
| EM-6 PPLB kaçışı, satır sonu atılır | `EM-6: PPLB metninde tırnak ve ters bölü kaçırılır` |
| EM-7 QR içeriği kod sözlüğüne uyar | `EM-7: örnek QR içerikleri kod sözlüğünde` |
| EM-8 ağ yazıcısı tek IP ve aralık içi; aralık yalnız kurum içi | `EM-8` (iki test, kurallar.test.ts), `EM-U6` |
| EM-9 doğrudan baskı ayar ve aralıkla açılır | `EM-9 ve EM-10` (kurallar.test.ts), `EM-U7` |
| EM-10 pasif, dosya, aralık dışı yazıcı ve deneme dışı şablon basılmaz | `EM-9 ve EM-10`, `EM-U7` |
| EM-11 örnek değer yalnız deneme şablonunda; kayıt yalnız kendi türündeki şablonla | `EM-11` (kurallar.test.ts), `EM-U9`, `EM-U10` |
| EM-12 bir baskıda kayıt x adet en çok 500 | `EM-12`, `EM-U9` |
| EM-13 konum etiketi stok kodu ve LOC önekli QR; 20 karakterlik kod kesilmez | `EM-13`, `EM-U9`, `EM-U10` |
| EM-14 komut dosyası yalnız kullanımdaki dosya yazıcısına, türü uyan şablonla iner | `EM-14` (kurallar.test.ts), `EM-U11` |
| EM-15 lot etiketi stokun lot satırlarını basar; boş alan basılmaz, miktar Türkçe, tarih tesis günü | `EM-15` (kurallar.test.ts), `EM-U12` |
| EM-16 istasyon etiketi istasyonun stok konum kodunu LOC önekiyle basar | `EM-16`, `EM-U12` |
| EM-18 malzeme etiketi kart no QR, ad, stok kodu basar | `EM-18`, `EM-U14` |
| EM-19 mal kabul seçimi lot şablonuyla basılır, deftere lot olarak yazılır; sınır basılan etiket sayısıyla | `EM-11` (kurallar.test.ts), `EM-U14` |
| EM-17 refakat kartı etiketi emrin refakat kartını basar; termin yoksa "yok", basım tesis günü, işlem sırası tek metin | `EM-17`, `EM-U13` |
| Okuma yalnız sayfayı görene | `EM-U1` (etiket-merkezi.test.ts, gerçek PostgreSQL) |
| Çıktı dil, dpi, adet; adet 1-500 | `EM-U2`, `EM-U4` |
| Ekran: seçimler isteğe gider, sınır dışı adet indirmeyi kapatır | `EtiketMerkezi.test.tsx` |
| Yazıcı tanımı yetkisi, sürüm, ad tekil | `EM-U5` |
| Baskı defteri yalnız eklenir, gönderilemeyen baskı "hata" ile yazılır | `EM-U8` |
| Ekran: yalnız ağ yazıcısına gönderim, tekrar kimliği, kapalıysa neden, yetkiye göre düğmeler | `EtiketMerkezi.test.tsx` |
| Kayıttan çıktı istenen sırada, bulunamayan eksiklerde; basılan konum baskıya bağlı ve değişmez | `EM-U9`, `EM-U10` |
| Dosya yazıcısı indirmesi yazıcının diliyle, "indirildi" sonucuyla deftere; tekrar korumalı; `bas` ister | `EM-U11` |
| Lot ve istasyon kayıttan çıktı; konumsuz istasyon eksikte; basılan lot deftere bağlı | `EM-U12` |
| Malzeme karttan; mal kabul bütün lotlarından, deftere lot olarak; lot etiketinde tür adı | `EM-U14` |
| Refakat kartı emirden çıktı; olmayan emir eksikte, iptal emir 409; basılan deftere bağlı | `EM-U13` |
| EM-20: raf etiketi RAF önekiyle; kodla aynı ad ve bilinmeyen ölçü basılmaz (#116) | `kurallar.test.ts` EM-20 |
| Raf Fabrika Haritası'ndan; bölüm ve bölme/kat gözlerden; pasif ve olmayan raf eksikte; deftere raf; seçim ucu ve kayıt çıktısı `oku` ister | `EM-U15` |
| Ekran: konum ve raf seçimi toplu ve tek tek, adrese yazılır; konum listesi stok okuması ister; okuması olmayan kartı görmez | `EtiketMerkezi.test.tsx` (#116) |
| Ekran: stok adresi seçili konumlarla açılır, çıkarma adresi günceller, bozuk adres örneğe döner | `EtiketMerkezi.test.tsx`, `kayit-secimi.test.ts` |
