# Ortaklık: denetim

Sütunlar `npm run harita -- --modul denetim` çıktısından (DOĞRULANDI, `9b6582f`).

## Tablolar

| Tablo | Sütunlar | Sahibi |
|---|---|---|
| `denetim_kaydi` | id, zaman, kisi_id? -> kisi, yontem, yol, parametre? jsonb, govde? jsonb | denetim |

## Kavramlar

| Kavram | Tablo ve sütun | Başka modülde | Not |
|---|---|---|---|
| denetim kaydı (kim, ne zaman, ne yaptı) | `denetim_kaydi` | modüllerin kendi olay ve değişiklik tabloları (ör. üretim olayı, Arkon kayıtları) | bu tablo komut defteridir; iş olayı değildir. Yalnız ekleme (`denetim_kaydi_degismez`, `denetim_kaydi_bosaltilmaz`) |
| kişi | `denetim_kaydi.kisi_id` | sahibi kisiler | boşsa komut oturumsuzdur (giriş) |
| ayar değişikliği | `denetim_kaydi` | ayarlar | ayarlar eski ve yeni değeri `denetimYaz` ile buraya yazar |

## Başka modüle bağlar

`kisiler/disari.ts` `kisiAdlari` (okuma ekranında kişi adı, kart #48). `kisi.id` yabancı anahtarı şemadadır. Ona bağımlı: ayarlar; uç katmanı `sunucu/uygulama-secenekleri.ts` ile.

## Doğal sahibi başka modül olabilecekler

Yok.
