# Özellik karşılama (OZELLIK-LISTESI-ilk-sistem.md, vardiya maddeleri)

| Madde | Dosya | Test |
|---|---|---|
| Vardiya saatleri ve molalar (ad, başlangıç, bitiş, mola ekle ve kaldır, kullanımda / dışı, + Vardiya) | istemci VardiyaDuzeni.tsx `Saatler` | Vardiya.test.tsx "yeni vardiya istek kimliğiyle gider..." |
| Haftalık vardiya matrisi iş merkezi x gün, haftalık vardiya saati | VardiyaDuzeni.tsx `Matris` | Vardiya.test.tsx "matris aktif iş merkezlerini gösterir..." |
| Takvim günleri, "Resmî tatilleri ekle", "Tatiller ve kapalı günler (N)" listesi | VardiyaDuzeni.tsx `Tatiller` | Vardiya.test.tsx "yazma yetkisi olmayan kişi..."; vardiya.test.ts "VR-02, VR-03, VR-10..." |
| EK: Haftalık vardiya "Tüm iş merkezlerine uygula" (iki adımlı) | `Matris` `IkiAdimli`; servis `haftaUygula` | Vardiya.test.tsx "haftayı uygula ve tatilleri temizle..."; vardiya.test.ts "VR-06..." |
| EK: "Tümünü temizle" (tatiller, iki adımlı) | `Tatiller`; servis `tatilleriTemizle` | aynı testler |
| EK: Personel kartı "Vardiya" alanı | Vardiya.tsx `PersonelEkrani`; uç `/kisi-vardiyalari/:kisiId/belirle` | Vardiya.test.tsx "vardiya başına personel..."; vardiya.test.ts "VR-07, VR-08 (K3)..." |
| İkinci tarama: personelde "Vardiya başına personel" | `PersonelEkrani` | Vardiya.test.tsx "vardiya başına personel..." |
| Kurallar VR-01..VR-05 | kurallar.ts | KURAL-TEST.md |
| Planın çalışma takvimi (PL-03, PL-04 için veri) | disari.ts `calismaTakvimleri` | vardiya.test.ts "VR-07, VR-08 (K3)..." |
| Kaynaklar > Vardiyalar sekmesi ve Genel bakış (rota ekranı) | uçlar ilk sistemle aynı yollarda | rota ekranının kendi testleri; sürüm ve istek kimliği rotadan istek (UYUM-BORCU V-B2) |
| Personel kartının öbür alanları (görev, ücret, yetkinlik, aktif) | yok | T2 (istasyonlar, #409) |
