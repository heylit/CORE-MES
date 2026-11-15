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

## Kayda bağlı klasörler (kart 3288)
| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Firma (müşteri) | kimlik; ad klasör adında | `ortak_dosyalar_klasor.kaynak_tur = 'firma'`, `kaynak_id` | musteri-tedarikci (`finans_firma.id`); yabancı anahtar yok, olayla |
| Satış siparişi | kimlik; no klasör adında | `kaynak_tur = 'siparis'` | siparisler (`siparisler_siparis.id`); olayla |
| Proje | kimlik; kod ve ad klasör adında | `kaynak_tur = 'proje'` | projeler (`projeler_proje.id`); olayla |
| Alt klasör şablonu | sahibi | `ortak_dosyalar_sablon` | başka modüle açılmaz |
| Açılamayan klasör | sahibi; zincir (kayıt adları) | `ortak_dosyalar_acilamayan` | başka modüle açılmaz |
| Kayıt olayları (3288-2) | dinler | `firmaDegistiDinle`, `siparisDegistiDinle`, `projeAcildiDinle`, `projeDegistiDinle` | bağ `sunucu/kablolama.ts`; olay kimlik ve kişi taşır |
