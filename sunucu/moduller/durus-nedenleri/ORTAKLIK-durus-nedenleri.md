# Ortaklık: durus-nedenleri

Modülün tuttuğu ve başka modülde de olabilecek kavramlar; Aşama 2 tablosuna girer. Kaynak: `sunucu/gocler/20261006164439_durus_nedenleri_tablolar.sql`, `paylasilan/sozlesme/durus-nedenleri.ts`.

## Tablolar
- `durus_nedeni`: `id` (sayı kimlik), `kod` (tekil, değişebilir), `ad`, `simge`, `kategori` (plansiz, planli), `cagri_ekibi`, `cagri_gecikme_dk`, `aktif`, `sira`.
- `hurda_nedeni`: `id`, `kod` (tekil), `ad`, `aktif`, `sira`.

## Kavramlar
| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Duruş nedeni | kod, ad, kategori, çağrı | `durus_nedeni` | sahibi bu modül; `uretim_olayi.durus_nedeni_id` yabancı anahtarla bağlı (uretim-emirleri) |
| Hurda nedeni | kod, ad | `hurda_nedeni` | sahibi bu modül; `uretim_sayimi.hurda_nedeni_id` yabancı anahtarla bağlı |
| Duruş kategorisi (durum listesi) | plansız, planlı | `durus_nedeni.kategori` kısıtı; `KATEGORILER` sözleşmede | modül içi |
| Çağrı ekibi (durum listesi) | bakım, kalite, malzeme, amir | `durus_nedeni.cagri_ekibi` kısıtı | metin; ekip ya da rol kavramı başka modülde olursa Aşama 2'de sorulur |
| Neden kopyası | Arkon `kv/reasons`, `kv/scraps` (salt okuma) | Arkon | Aşama 2: Arkon bu modülden okur |

Kişi, istasyon, zaman tutulmaz (tanım tablosu; kayıt zamanı ve kişi denetim kaydında).
