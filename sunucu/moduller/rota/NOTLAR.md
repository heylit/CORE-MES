# rota notları

- Ekran prototipin "Ürün ve rotalar" bölümüdür: tam sayfa tahta (akış şeması, tekerlekle yakınlaşma), seçilen kutunun yanında sekmeli
  yüzen düzenleme kartı, akış tablosu, revizyon şeridi. İkinci menüyü kabuk çizer (`ROTA_IKINCI_MENU`); sayfa prototipin bütün
  bölümlerini taşır (karar K2), sahibi başka modül olan bölüm o modülün ucu yoksa "modülü bekleniyor" gösterir.
- İlk değişiklik taslağı kendiliğinden açar, her değişiklik okunan sürümle tek komutta kaydedilir. Kural sunucudadır.
- Adımın kaynağı makine ya da kişidir (K3); istasyon tutulmaz.
- Rota emre kopyalanır (K1): rota ucu üretim emirleri komutunu çağırır (ADR 0006: rota üstte).
- Revizyon silinmez, iptal olur; OP numarası hiç yeniden verilmez; dört göz `rota.dort-goz`.
- Tekrar korumalı komutlar: taslak aç, kopyala, emre kopyala (istek kimliği başlığı).
