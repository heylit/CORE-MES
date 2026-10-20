# Ortaklık: ayarlar

Sütunlar `npm run harita -- --modul ayarlar` çıktısından (DOĞRULANDI, `9b6582f`).

## Tablolar

| Tablo | Sütunlar | Sahibi |
|---|---|---|
| `ayar` | anahtar (PK), deger jsonb, guncelleyen_kisi_id -> kisi, guncelleme | ayarlar |

## Kavramlar

| Kavram | Tablo ve sütun | Başka modülde | Not |
|---|---|---|---|
| sistem ayarı değeri | `ayar.anahtar`, `ayar.deger` | tanımlar modüllerde: `paylasilan/ayarlar/malzemeler.ts`, `paylasilan/ayarlar/satin-alma.ts` | değer deposu ayarlar'da, tanım (anahtar, tür, varsayılan) sahibi modülde; okuma `sistemAyariOku` (`disari.ts`) |
| değiştiren kişi | `ayar.guncelleyen_kisi_id` | sahibi kisiler | sunucudan (komutu veren) |
| ayar değişiklik kaydı | `denetim_kaydi` (denetim modülü) | sahibi denetim | eski ve yeni değer `denetimYaz` ile yazılır |

Kullananlar (DOĞRULANDI, grep): `malzemeler/servis.ts` (`malzemeler.dort-goz`), `satin-alma/servis.ts` (`satin-alma.dort-goz`).

Not: malzemeler modülünün kendi ayar tablosu da var (`malzeme_katalog_ayari`, uç `POST /malzeme-katalogu-ayarlari/:anahtar/kaydet`).
İki ayar deposu yan yana duruyor; hangisinin neyi tutacağı Aşama 2'de sorulur.

## Başka modüle bağlar

denetim (`denetimYaz`), kisiler (`kisi.id` yabancı anahtar).

## Doğal sahibi başka modül olabilecekler

Yok; tanımlar zaten sahibi modüldedir.
