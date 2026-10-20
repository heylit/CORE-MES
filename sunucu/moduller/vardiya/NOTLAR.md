# Vardiya notları

- Takvim günü o gün BAŞLAYAN vardiyaları kaldırır: önceki gün başlayıp tatil sabahına taşan gece vardiyası çalışır (ilk sistem ve prototip böyle).
- Aralıklar tarih + dakika olarak hesaplanır, ana veritabanı oturumunun saat diliminde çevrilir (`anlaraCevir`): yaz ve kış saati geçişinde gece vardiyası bir saat uzun ya da kısa olabilir; net dakika duvar saatidir.
- Kişinin iş merkezi istasyon atamasından türer; ataması olmayan kişi ve istasyonsuz makinenin takvimi null'dır (sürekli çalışma uydurulmaz).
- Haftayı uygula matrisi tablo kilidiyle yazar: aynı anda gelen hücre yazısı ya önce ya sonra uygulanır, yarım kopya kalmaz.
