# sevkiyat notları

- Çözücü (cozucu.ts) ve yol ağı (yol-agi.ts) saftır; süre yerine yineleme sınırıyla ve tohumlu rastgelelikle çalışır: aynı girdi aynı planı verir, test saat beklemez.
- Yineleme bütçesi 1500 + 150 x iş, en çok 4000 (kurallar.yinelemeButcesi). Önceki paketteki 800 ms süre sınırının kalitesine 3000 yinelemede ulaşıldı (ölçüm).
- Çözücü istek içinde koşar: 10 iş, 4 araç, Ankara yol ağı ile dağıt 0,45-0,8 sn (2026-10-06 ölçümü). İş sayısı ya da eşzamanlı kullanıcı artarsa çekirdekten iş parçacığı istenecek.
- Süre matrisi ve trafik seviyeleri harita paketi nesnesine bağlı önbellekte tutulur (WeakMap); paket değişince kendiliğinden düşer.
- Ankara harita paketi depodadır (`harita-paketi/`, OpenStreetMap, ODbL; kullanıcı kararı 12.10.2026) ve ayarsız okunur. TMIV2_HARITA_DIZINI verilirse
  onun yerini alır (harita.json, yol.json, arama.json). Dosya okunamazsa plan kaydedilir; saat, dağıtma ve onay çalışmaz.
- Kent merkezi ve ana arter adları (trafik hassasiyeti) yol.json içindeki merkez ve anaArterler alanlarından gelir; kodda yer adı yoktur.
- Plan sürümü (surum) her yazmada artar; ekranın gördüğü sürüm tutmazsa komut 409 ile reddedilir.
- Onaylı planın satırları ve plandaki işler tetikleyiciyle de kilitlidir; onay anının saatleri durak satırına yazılır.
- Gün planı okunurken her seferinde değerlendirilir (kip 'degerlendir'); saatler kaydedilmez, onayda yazılır.
- Ekran kural hesaplamaz: taşıma yalnız listeyi değiştirir (rota-duzeni.ts), kaydı ve uyarıyı sunucu üretir.
- Vazgeçilen: QR kod (yeni paket gerekirdi), haritadan serbest nokta ile tek rota (kayıtlı nokta zorunlu), ayrı pencerede harita.
