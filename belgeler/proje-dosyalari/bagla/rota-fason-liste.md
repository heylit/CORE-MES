# Rota: fason adim (karar "FASON ROTA ADIMIDIR") - once liste, yazim yok

Kaynak: ana dal `c73e2d4`; kart #260. Yazim yok; sema ve ekran isi onaydan sonra.

## Bugun ne var (DOGRULANDI)
- Rota teslimi ve rota ekranlarinda fason adim YOK (`grep -i fason` teslim klasoru ve `istemci/src/moduller/rota`: 0 sonuc). Yeniden tasarlanacak bir prototip yok.
- Malzemeler prototipi (`katalog.html`): operasyon katalogunda tip basina "Fason" onay kutusu (satir 8075), FAS grubu ve `FSN Fason islem` tipi (5793); kart operasyon listesinde fason satir rengi (`tr.opfason`, 216). Firma, termin ya da hizmet alani yok.
- Istasyonlar katalogu: `FAS` grubu ve `FSN Fason islem` tipi var (`20261008050200_istasyonlar_operasyon_tipi_tohum.sql:102`); tipte ayri fason isareti yok.
- Finans: firma kartinda `fason boolean` (`20261008132200_finans_firma.sql:7`); `firmaOzeti` `fason` alanini veriyor (`finans/servis.ts:139-141`). `firmaAra` fason suzgeci tasimiyor.
- Rota adimi: kaynak `makine_id` ya da `kisi_id` (en cok biri, `rota_adimi_tek_kaynak`); sure `ayar_suresi_dk`, `birim_sure_dk`; onaya gonderirken sureler zorunlu (`kurallar.ts` `onayaHazirMi`).

## Fason adim icin gerekenler

| No | Madde | Nerede | Isaret |
|---|---|---|---|
| F1 | Adimin kaynagi fason firma olabilir: `rota_adimi.fason_firma_id` -> `finans_firma(id)`; tek kaynak kisiti uce cikar (makine, kisi, fason firmadan en cok biri) | rota goci | [G-DOLU] var olan tabloya sutun + kisit degisimi; goc once sayar |
| F2 | Sunucu kurali: firma var, aktif ve `fason = true` olmali (finans `firmaOzeti`); degilse 422 | rota servis/kurallar, test | |
| F3 | Sure yerine termin gunu: `rota_adimi.termin_gun int` (>0). Fason adimda ayar/birim suresi bos, termin dolu; diger adimda termin bos (adli kisit). Onaya hazirlik buna gore | rota goci + kurallar | [G-DOLU] |
| F4 | Adimin alinan hizmet karti: `rota_adimi.hizmet_karti_no` -> `malzeme_katalog_karti(no)`; kart turu `hizmet`, yonu `alinan` olmali (sunucuda ret, testli). Hizmet turu malzemelerde gelmeden yazilamaz | rota goci + servis | [G-DOLU]; malzemeler `hizmet` turunu bekler |
| F5 | Operasyon tipiyle iliski: fason firma yalniz `FAS` grubundaki tipte secilir (yeni sutun yok; kataloğun grubu kullanilir) | rota kurallar | soru FS3 |
| F6 | Sure hesaplari (teorik sure, rota ozeti, kaynaktaki sure) fason adimi dakika toplamina katmaz; termin gun olarak ayri gosterilir | rota kurallar, test | |
| F7 | Ekran: adim panelinde kaynak secicisine "Fason firma" secenegi, termin gunu ve hizmet karti alanlari; fason adimda sure alanlari gizlenir. Prototipte karsiligi olmadigi icin once ve sonra goruntusu onaydan once verilir | `AdimPaneli.tsx` | [EKRAN] onay |
| F8 | Finans istegi: `firmaAra(db, { metin, sinir, yalnizAktif, fason: true })` suzgeci (secici yalniz fason firmalari listelesin) | finans `disari.ts` | finansa istek |
| F9 | Uretim emirlerine istek (UE listesine yeni madde): emre kopyalamada adim kaynagi `{ tur: 'fason', firmaId }`, `terminGun`, `hizmetKartiNo`; fason is emri operatorle baslatilmaz, sayim yerine gidis ve donus kaydi | `rota/baglanti.ts` `UretimEmriGirdisi` | [UE] yalniz istek |
| F10 | Plan istegi: fason adim takvimde termin gunuyle yer kaplar, makine kapasitesi kullanmaz (B akisi) | plan | sonraki tur |
| F11 | Satin alma (yalniz liste): hizmet siparisi elle mi, adimdan mi acilir | satin-alma | kullanici sorusu satin alma listesinde |
| F12 | Stok borcu: "fason konumu rota adimina baglanir" (ST6 ile sonraki tur) | stok UYUM-BORCU | stoka yazilir |

## Sorular (cevap gelene kadar yazim yok)

FS1. Fason adim rota adimi tablosunda nasil tutulsun? Neden: dolu olabilecek `rota_adimi`'na sema degisikligi.
- a) `rota_adimi`'na uc bos olabilen sutun (`fason_firma_id`, `termin_gun`, `hizmet_karti_no`) ve tek kaynak kisiti uce cikar; var olan satirlar degismez. (oneri)
- b) Ayri `rota_fason_adimi` tablosu (adim kimligiyle 1-1); `rota_adimi` degismez, okuma iki tablodan.

FS2. Aday kaynak listesinde fason firma olabilsin mi (ayni adimi baska fasoncu da yapabilir)? Neden: `rota_aday_kaynagi` da dolu tablo.
- a) Bu turda hayir; adimin tek fasoncusu olur, aday yalniz makine ve kisi. (oneri)
- b) Evet; aday tablosuna da `fason_firma_id`.

FS3. Fason firma hangi operasyon tipinde secilebilir?
- a) Yalniz `FAS` grubundaki tiplerde (bugun `FSN`); katalogda grup degistirerek yeni fason tipi acilir. (oneri)
- b) Her tipte; fason oldugu yalniz kaynaktan anlasilir.

FS4. Termin gunu hangi gun?
- a) Takvim gunu (vardiya modulu yok; plan bugun 7/24). (oneri)
- b) Is gunu (vardiya modulu gelene kadar takvim gunu gibi sayilir).

Varsayimlar (geri almasi ucuz): termin tam gun, 1-365; fason adimda `bagimlilik` 'bekleyen' zorunlu degil, ekranda varsayilan 'bekleyen'; hizmet karti zorunlu degil, taslakta bos, onaya gonderirken dolu (F4 malzemeler gelince).

## Durum (cevap: FS1 a, FS2 a, FS3 b, FS4 a; varsayimlar kabul)
- Yazildi, PR #377: F1, F2, F3, F5 (FS3 b: her tipte), F6. Goc once sayar.
- Bekliyor: F4 (malzemelerde hizmet turu), F7 (ekran onayi; goruntuler `bagla/rota-fason-ekran/`), F8 (finans fason suzgeci), F9 (UE3), F10 (plan).

## UE3 imzasi (rotadan uretim-emirlerine; UE-LISTESI sahibine iletilecek)
`rota/baglanti.ts` `uretimEmriAc(db, kullanici, g: UretimEmriGirdisi)`, is emri basina:
`kaynak: { tur: 'makine' | 'kisi' | 'fason'; id } | null` (fason: finans firma kimligi), `terminGun: number | null` (yalniz fasonda, takvim gunu),
`ayarSuresiDk`, `birimSureDk` (fasonda null). Fason is emri operatorle baslamaz; sayim yerine gidis ve donus kaydi (UE tarafinin isi).
Hizmet karti no F4 ile eklenecek.
