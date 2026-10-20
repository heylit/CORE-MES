# istek-kimligi notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.
- Modülün ucu yoktur; depoyu uç katmanına giriş dosyası verir (kart #188, plan öneriyle onaylı).
- Eşzamanlı yinelemeyi sıraya sokan şey, çakışan eklemenin öteki transaction'ı beklemesidir (READ COMMITTED). Yalıtım
  düzeyi değişirse bekleyen istek saklı cevap yerine serileştirme hatası alır; karşılığı yazılmadı.
- Hakları göç vermez: tablo veritabanının varsayılan yetkileriyle açılır (ADR 0005).
- Saklama süresi istemci kuyruğunun bir komutu en geç yeniden gönderebileceği süreden uzun kalmalı (kart #188 şartı).
- Vazgeçildi: saati enjekte etmek; testte satır eskitilir.
- Süresi dolmuş ama henüz silinmemiş satır saklı cevabını vermeyi sürdürür (çift yazmaktansa). Saklı cevap jsonb'dir:
  alan sırası ilk cevaptan farklı dönebilir.
- Bekleme sınırı yalnız anahtar eklemesinde geçerlidir ve transaction içinde oturumun değerine geri alınır; sınır
  istemcinin deneme süresinden uzun olursa tek takılı komutun yinelemeleri havuzu doldurur (denetim bulgusu, kart #188).
- Depo verilmeyen kurulumda korumalı uç kayıtta değil istek anında hata verir (şef kararı, kart #188): kayıtta durmak,
  uygulamayı deposuz kuran bütün modül testlerini ilk bayraklı uçla birlikte düşürüyordu.
- Vazgeçildi: saklı durum kodunu cevaba taşımak (yazma komutunun kodu gövdenin varlığından çıkar; sütun gövdesiz cevabı
  null gövdeden ayırır) ve uç adını ayrıca karşılaştırmak (özet yöntemi ve yolu taşır).
