# Değişiklik yönetimi notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır.

- Aşama 1'de etkilenen emir ve stok kaynağı yok. Karar üretimi `yayinla`'ya verilen `EtkiCozucusu` ardındadır; varsayılan "bağlı değil" (null): karar satırı açılmaz, `kararKaynagiBagli` false, kapanışta kararlar koşulu 'bilinmiyor'. Testler sahte kaynağı servisi doğrudan çağırarak verir.
- Bilinmeyen kapanışı durdurmaz, eksik durdurur (S0 varsayım 5). Bağlamada kaynak gelince 'bilinmiyor' kendiliğinden kalkar.
- Otomatik kararlar yayınlayan kişi adına yazılır: karar satırı kişi ister ve sistemin kişisi yok.
- Numara `ECR-`/`ECO-` ve dört hane kimliktir; yıla göre sıfırlanmaz (prototip numarası yıl taşımıyordu).
- Çevrim talebin açılışından emrin kapanışına kadardır; CCB onayından müşteri onayına geçen iş günleri düşülür (prototip hedef metni "müşteri onay süresi hariç"). `acilis` bu yüzden talebin açılış günüdür.
- İş günü pazartesi-cuma; tatil takvimi yok (bağlamada).
- Malzemeye yabancı anahtar yok (Aşama 2 ayrı göç); kişiye var (`kisi` çekirdek tablosu).
- Seri listesi ucu satırsız ve toplamı null döner: seri kaydı (markalama) bağlı değil; sıfır uydurulmaz.
- Vazgeçilen yol: karar önerisini istemcide hesaplamak; izinli kodlar satıra yazılır ki kısıt (`_verilen_izinli`) veritabanında da tutsun.
- Hata gövdesi düzdür (`{ kod, mesaj, alan }`); doğrulama 400, iş kuralı ihlali de `dogrulama` ile 400.
