# Ön paket: akis (Akış Süresi), kart #1338

- Ad: `akis`; sayfa "Akış Süresi" (`/akis`, Üretim grubu); ikinci menü: Emir yolculuğu. Sonraki adımda: Akış panosu, Rapor.
- Kapsam: üretim emrinin hammadde mal kabulünden sevke kadar geçen zamanı, bekleme dahil, kaynak kayıtlardan hesaplar. Yalnız okur.
- Uçlar: `GET /akis/emirler`, `GET /akis/emirler/:id`; yetki `sayfa.akis`. Önerilen rol: planlama, üretim müdürü, yönetici.
- Tablolar: yok. İş kuralları: AKS-1..AKS-7 (`KURAL-TEST.md`). `disari.ts`: yok (kimse ithal etmez; bağımlılık zincirinin en üstü).
- Açık sorular: yok (yer ve başlama kartla cevaplandı).
