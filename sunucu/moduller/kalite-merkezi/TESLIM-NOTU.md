# Teslim notu: kalite-merkezi (Kalite Merkezi), taban baaf00c

Ekran yolu A: Kalite Merkezi (yerel sürüm, tek HTML) değiştirilmeden yalıtılmış çerçevede; ana menüde Kalite grubunda, 21 maddelik
ikinci menü kabukta. Kayıtlar PostgreSQL'de (jsonb, Arkon kalıbı), dosyalar ortak dosya deposunda. Yazan: ana oturum, depo kopyasında
(kullanıcı talimatı: depoya yazılmadı).

## Komutlar (git dışı kopya; CEKIRDEK-ISTEKLERI 1-2 ve İK teslimi uygulanmış; Node 22.22, PostgreSQL 16)
- npm run tip: hatasız. npm run lint: hatasız.
- npm run sinir -- --modul kalite-merkezi: "Sınır denetimi: 740 dosya, 0 ihlal." "0 döngü." "Göç damgası ... 0 ihlal."
  "Yol denetimi: 2 ihlal" = toplayıcı satırları (CEKIRDEK-ISTEKLERI).
- node --test sunucu/moduller/kalite-merkezi/*.test.ts (PostgreSQL, gerçek giriş): "# pass 12" "# fail 0".
- vitest istemci/src/moduller/kalite-merkezi: "Tests 19 passed (19)".
- CI=true npm run test (tamamı): sunucu "# tests 1943" "# pass 1943" "# fail 0"; istemci "Test Files 100 passed (100)".
- Tarayıcı (Chromium, TMI içinde, yönetici): örnek veriler sunucuya yazıldı ve yenilenince geldi; ikinci menü ile gezinme ve içeriden
  geçişin adrese yansıması; PDF+STEP okuma ve eşleştirme (12/12); 2 MB STEP 4 parçada yüklendi, 57 balon; görüntüde yazı tanıma
  (5 balon); 360, 768, 1280 genişlik; çerçeveden dış adrese istek yok; açılış yaklaşık 6 sn.

## Kullanıcı kararları (12.10.2026)
1. Örnek veri (DEMO) boşaltıldı. 2. Yazı tanıma kitaplıkları onaylandı. 3. Saklama iki adımlı: Aşama 1'de tek tablo (jsonb),
Aşama 2'de bağ ve kural gereken koleksiyonlar tek tek ayrıştırılır (sıra ON-PAKET'te). 4. Uygulamanın kullanıcı/PIN girişi, örnek veri, tümünü sil, geri yükleme açık kalır.
5. Depoya yazılmaz; teslim zip olarak verilir.

## Denetçi (tek tur, kırmızı çizgi ve sınır)
7 bulgu: yer tutucu taban `km.invalid` yapıldı; sayı pimleyen test kaldırıldı; belgeler eklendi; PIN özetli kullanıcı kayıtları
UYUM-BORCU "kullanıma açmadan önce"; örnek veri boşaltıldı ve tesseract kopyası onaylandı (kullanıcı 12.10.2026); yol ihlali CEKIRDEK-ISTEKLERI.
