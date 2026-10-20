# FARK: durus-nedenleri (kart #247, dal 247-tanim-modulleri)

Taban: `main` 1b74736. Göç yok, tablo değişmedi, `disari.ts` imzaları değişmedi.

## Eklenen
- `paylasilan/sayfalar/durus-nedenleri.ts`: `DURUS_NEDENLERI_IKINCI_MENU` (maddeler `durus` -> `/durus-nedenleri`, `hurda` -> `/durus-nedenleri/hurda`; işlem `sayfa.durus-nedenleri`).
- `paylasilan/sayfalar.ts`: yalnız bu modülün ithali ve `IKINCI_MENULER`'deki adı (ayrı commit, kullanıcı kararı T1 a).
- `istemci/src/moduller/durus-nedenleri/rotalar.tsx`: `/durus-nedenleri/hurda` rotası; `DurusNedenleri.tsx`: `HurdaNedenleri` ekranı.
- Testler: DN-S4 (sayfa ya da terminal okur, ikisi de olmayan 403; okuma yazma vermez), DN-S5 (`disari.ts` okuması uç yetkisinden geçmez); istemcide hurda bölümü testi.
- Belgeler: `UYUM-BORCU.md`, `ORTAKLIK-durus-nedenleri.md`, `GUVENLIK-DENETIMI.md`, bu dosya.

## Değişen
- `GET /durus-nedenleri`, `GET /hurda-nedenleri`: `yetki: 'oturum'` -> `{ biri: ['sayfa.durus-nedenleri', 'sayfa.terminal'] }`.
- Ekran: kendi sekme şeridi kalktı; bölüm adresten gelir. Tablo, form ve düzen aynı.
- Testler: DN-S3 başlığı "okuma oturumlu herkese açık" -> "oturumsuz okuma 401"; liste yardımcıları yönetici oturumuyla okur (eski oturum ölçüsü DN-S4'e geçti).

## Silinen
- Ekrandaki `SEKMELER` ve `Sekmeler` kullanımı.

## Onaylı kararlar
- Değişmedi: #73 (bağ `id` ile, yalnız yönetici düzenler, silme yok), #96 (hazır nedenler çağrısız, simge adları onaylı).
- Yeni (kullanıcı, 08.10.2026, #247): okuma sayfa ya da terminal yetkisine bağlı; rol satırı şimdilik yok; sürüm denetimi ve tablo adları borçta.

## Varsayımlar
- Nedenleri HTTP ile okuyan başka ekran yok (grep: yalnız kendi sayfası ve terminal). Yeni okuyan sayfa listeye eklenir. Geri alma: tek satır.
