# Ortaklık: ortak-dosyalar

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Kaynak: `sunucu/gocler/20261105089000_ortak_dosyalar_tablolar.sql`,
`paylasilan/sozlesme/ortak-dosyalar.ts`.

## Tablolar
- `ortak_dosyalar_klasor`: `id`, `ust_id` -> kendisi, `ad`, `ad_anahtari`, `ozel_yetki`, `surum`, `olusturan_kisi_id` -> `kisi`, `olusturma_zamani`,
  `yetki_degistiren_kisi_id` -> `kisi`, `yetki_degisme_zamani`.
- `ortak_dosyalar_yetki`: `klasor_id`, `rol_id` -> `rol`, `duzey`.
- `ortak_dosyalar_dosya`: `id`, `klasor_id`, `ad`, `ad_anahtari`, `arsiv`, `arsiv_kisi_id` -> `kisi`, `arsiv_zamani`, `geri_alan_kisi_id` -> `kisi`,
  `geri_alma_zamani`, `surum`.
- `ortak_dosyalar_surum`: `id`, `dosya_id`, `sira`, `ozet` (dosya_bagi: modül `ortak-dosyalar`, kayıt = sürüm kimliği), `boyut`, `yukleyen_kisi_id` -> `kisi`, `zaman`.

## Kavramlar
| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Kişi | yalnız kimlik | `*_kisi_id` | `kisi` yabancı anahtar; ad `kisiler/disari.ts` `kisiAdlari` |
| Rol | yalnız kimlik | `ortak_dosyalar_yetki.rol_id` | `rol` yabancı anahtar; kişinin rolleri `kisininRolleri`, liste `rollerVeBayraklari` |
| Dosya içeriği | özet ve boyut | `ortak_dosyalar_surum.ozet`, `boyut` | `dosya` modülü (ADR 0009), `dosyaTutamagi('ortak-dosyalar')` |
| Belge (onaylı, revizyonlu) | tutmaz | - | Belge Merkezi'nindir (ADR 0026); buraya taşınmaz |
| Klasör, klasör düzeyi, sürüm, arşiv | sahibi | yukarıdaki tablolar | başka modüle açılmaz |
