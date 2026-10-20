# UYUM-BORCU: nizamiye

## Bağlamada kapanacak
- Rol satırları Çekirdek'te (CEKIRDEK-ISTEKLERI 1); girene kadar ekranı yalnız yönetici görür.
- 18 simge gelince ekran simgeleri değişir (CEKIRDEK-ISTEKLERI 2).
- İstemcideki sözleşme sabiti kopyası (CEKIRDEK-ISTEKLERI 3).
- Ziyaretçilerim üst çubuk düğmesi 768-1023 genişlikte gizli: yöneticinin dolu çubuğunda /finans başlığını kesiyordu (ekran testi). Çubuğa taşma menüsü gelince geri açılır (CEKIRDEK-ISTEKLERI 4).

## Nizamiye 2
- Kart okuyucunun markaya özel ayrıştırıcısı yok (289 b, "cihaz: bilmiyorum"; ADR 0016 açık borç). Gövde şimdilik `{ anahtar, ham }`, `ham` dosya biçiminin başlıksız satırları (VARSAYIM). Marka gelince `kurallar.ts` `pdksCihazGovdesiniCoz` ve gerekirse uç gövdesi değişir; cihaz anahtarı başlıkta gönderiyorsa başlık okuma çekirdek isteği olur.
- Cihaz kapısı sayacı bellekte: sunucu yeniden açılınca sıfırlanır, birden çok süreçte paylaşılmaz (tek sunucu, VARSAYIM yeterli).
- Cihazın kart no ya da kullanıcı no gönderdiği marka çıkarsa `kisi` için eşleme alanı gerekir (kisiler isteği).
- Taşeron girişi (taşeron kartı tabloda var, akışı yok).
- Saklama süresi dolan ziyaretin anonimleşmesi (`ad` null, `anonimlesme` zamanı; sütunlar hazır, iş yok).
- PDKS dosya biçimi VARSAYIM (`kurallar.ts` `PDKS_BICIMI`): bilgi işlemden gerçek ad ve biçim gelince güncellenecek.
- PDKS hareketlerinin sahibi: şimdilik nizamiye; Aşama 2'de İK ile netleşir (İK de mesai için okuyabilir).
- Ev sahibine "ziyaretçin geldi" bildirimi (mesaj modülü).
- İK zimmet taşıma (170) ayrı onay.
