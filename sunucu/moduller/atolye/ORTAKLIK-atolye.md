# Ortaklık: atolye

Modülün tuttuğu ve başka modülde de olabilecek kavramlar; Aşama 2 tablosuna girer. Kaynak: `sunucu/gocler/2026101120300{1-9}_atolye_*.sql`,
`paylasilan/sozlesme/atolye.ts`.

## Tablolar
- `atolye_salon` (fabrika bölümü): kod, ad, ölçü, hücre boyu, giriş, `fabrika_x`, `fabrika_z`, `fabrika_donus`, sürüm.
- `atolye_istasyon_yeri`: `istasyon_id` -> `istasyon`, salon, konum, dönüş, ayak izi, `model_id`.
- `atolye_makine_yeri`: `makine_id` -> `makine`, salon, konum, dönüş, ayak izi, `model_id` (kart #1120).
- `atolye_raf`, `atolye_goz`: raf (tür, bölme, kat, göz sayısı, ölçü, net ölçüler), göz adresi.
- `atolye_goz_kalemi`: göz, kod eşleme anahtarı, kod, ad, doluluk yüzdesi, kaydeden kişi.
- `atolye_alan`, `atolye_duvar`: bölge, oda, duvar.
- `atolye_model`, `atolye_model_parca`: 3B model kütüphanesi (GLB, bytea parçalar).
- `atolye_kalem_gorunumu`: kod -> model ya da ambalaj, rafta gösterim.
- `atolye_kroki`, `atolye_kroki_parca`: fabrika ya da bölüm krokisi (PDF), hizalama.

## Kavramlar
| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| İstasyon | yalnız yeri ve 3B görünümü | `atolye_istasyon_yeri.istasyon_id` | sahibi istasyonlar; yabancı anahtar `istasyon` |
| Makine | yalnız yeri ve 3B görünümü | `atolye_makine_yeri.makine_id` | sahibi istasyonlar; yabancı anahtar `makine`; makinenin istasyonu `makine.istasyon_id`'den okunur |
| Depo, raf, göz | raf ve göz tanımı, yerleşimi | `atolye_raf`, `atolye_goz` | kullanıcı kararı 11.10.2026 (3b, 2a): raf ve göz atölyenin; stok Aşama 2'de atölyeden okur, `stok_raf` / `stok_konum` raf gözü kopyası kalkar |
| Gözdeki kalem | kod, ad, doluluk | `atolye_goz_kalemi` | adet ve hareket stokun; kod malzeme kartına bağlı değil (serbest metin) |
| Malzeme ve parça no | eşleme anahtarı, ad | `atolye_goz_kalemi.kod`, `atolye_kalem_gorunumu` | sahibi malzemeler (`malzeme_katalog_karti.no`); kod stok koduyla eşleşirse okumada karta çözülür (ATL-36, kart #1123), yabancı anahtar yok |
| Üretim emri | okunur (istemci `GET /uretim-emirleri`) | - | sahibi uretim-emirleri (dışarıda); yazılmaz |
| Fabrika konumu | bölümlerin fabrika planı | `atolye_salon.fabrika_*` | sevkiyatın fabrika noktası da var (kart #598) |
| Kişi | kaydeden | `*.kaydeden_kisi_id` -> `kisi` | ad kisiler `disari.ts` `kisiAdlari` ile |
| Durum listeleri | raf ve alan türleri, ambalaj | sözleşme | modül içi |
