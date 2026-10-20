# 1280 olcumu: Arkon ve malzemeler, once / sonra (kart #172, dal 172-ortak-arayuz-2)

Tarih 2026-10-08. Once: origin/main 7cccb80. Sonra: dal b72bac0 (kod) + 5602c26 (belge).
Ortam: bulut kapsayicisi, Node 24.21, PostgreSQL 16 (yerel, bos veritabani + yonetici), `npm run goc` (37 goc), `npm run derle:arkon`,
sunucu 4100, istemci (vite) 4101. Pencere 1280x800, basliksiz Chromium (Playwright depo disinda). Giris yonetici rolu.
Olcum islevi N7 betiginin aynisi (`tur3-raporlar/ekran-olcumu/olc.cjs` icindeki `olcFn`). Veri yok (N7'den az: istasyon ve paket yok);
hedef ve yazi sayilari bos ekrana goredir.

Hucre: cerceve genisligi x yuksekligi / Arkon zoom / hedef<24 / hedef<44 / toplam hedef / metin<12 px (efektif). Sayfa tasmasi hepsinde 0.

| Rota | Once (main) | Sonra, varsayilan dar | Sonra, tam ekran |
|---|---|---|---|
| /arkon | 960x744 / 0.570 / 7 / 30 / 34 / 60 | 1136x744 / 0.675 / 7 / 30 / 34 / 57 | 1280x744 / 0.760 / 6 / 30 / 34 / 46 |
| /arkon/planlama | 960x744 / 0.570 / 4 / 5 / 5 / 8 | 1136x744 / 0.675 / 3 / 5 / 5 / 7 | 1280x744 / 0.760 / 1 / 5 / 5 / 5 |
| /arkon/cizim | 960x744 / 0.570 / 31 / 48 / 48 / 105 | 1136x744 / 0.675 / 30 / 39 / 48 / 104 | 1280x744 / 0.760 / 1 / 39 / 48 / 97 |
| /arkon/raporlar | 960x744 / 0.570 / 14 / 15 / 15 / 78 | 1136x744 / 0.675 / 10 / 15 / 15 / 73 | 1280x744 / 0.760 / 5 / 15 / 15 / 70 |
| /malzemeler | 960x632 / 1 / 0 / 7 / 10 / 0 | 1136x632 / 1 / 0 / 7 / 10 / 0 | 1280x632 / 1 / 0 / 7 / 10 / 0 |
| /malzemeler/operasyonlar | 960x1242 / 1 / 288 / 794 / 797 / 0 | 1136x1191 / 1 / 288 / 794 / 797 / 0 | 1280x1191 / 1 / 288 / 794 / 797 / 0 |

- Once degerleri N7 ile ayni (Arkon 960 px, zoom 0.570071). DOGRULANDI.
- Sonra degerleri listedeki hesapla ayni (1136/0.675, 1280/0.760). DOGRULANDI.
- Arkon zoom 1'e cikmaz: masaustu duzeni 1684 px genislik ister (1600 + kendi rayi 84); 1280 pencerede en cok 0.760.
- Malzemeler: cercevede zoom yok; genislik artti, kendi yan menusu 1280'de hala gorunur (B3, karar bekliyor). Cerceve yuksekligi 632
  (B4, malzemeler tarafinda).
- Malzemeler operasyonlar hedef sayilari degismedi (B2, borcta).

## Kabuk denetimi (360x740, 768x1024, 1280x800)
- B7: 360'ta "Durus ve Hurda Nedenleri" ve "Malzeme Kartlari" iki satir, kesik degil; 768 ve 1280'de tek satir. Yatay tasma 0.
- B8: 360 ve 768'de seritte gizli madde olan kenarda ok (basta sag); sona kaydirinca yalniz sol. Sigan seritte ok yok (/ayarlar).
- B1: 1280'de cerceveli /malzemeler ve /arkon dar acildi; cercevesiz sayfalar genis.

Gorseller: `1280-olcum/` (once-arkon, sonra-dar-arkon, sonra-tam-ekran-arkon, once-malzemeler, sonra-dar-malzemeler,
kabuk-360_durus-nedenleri, kabuk-768_satin-alma).
