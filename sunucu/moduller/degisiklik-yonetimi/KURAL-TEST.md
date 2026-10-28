# KURAL-TEST: degisiklik-yonetimi

Kural, saf işlev (`kurallar.ts`), test (`kurallar.test.ts` ve `degisiklik-yonetimi.test.ts` başlıkları) ve kısıt (göç 20261028110000).

| Kural | Ne | İşlev | Test | Kısıt |
|---|---|---|---|---|
| DY-1 | yalnız süre ya da tezgah tercihi değişiyorsa talep gerekmez | `talepGerekmezMi` (S0 `onerilenSinif`) | "DY-1: yalnız süre", "DY-1, DY-2: sınıflandırma" | |
| DY-2 | adım yalnız sıradaki durumda; ilk parça kararla ya da uygulamada | `talepAdimiUygunMu`, `emirAdimiUygunMu` | "DY-2: adım yalnız", "DY-1, DY-2: sınıflandırma" | `_sinifli`, `_analizli` |
| DY-3 | açan kendi talebine CCB veremez | `kendiTalebiMi` | "DY-3: talebi açan", "DY-3, DY-5: açan" | |
| DY-4 | ilk parça şartı sınıftan | `faiGereksinimi` | "DY-4 ve DY-5" | |
| DY-5 | D1 müşteri onayı ister, müşteri bilgisi yoksa da | `musteriOnayiIstenirMi` | "DY-4 ve DY-5", "DY-3, DY-5: açan" | |
| DY-6 | iki yönde değiştirilebilir değilse yeni parça no | `yeniParcaNoGerekirMi` | "DY-6: değiştirilebilirlik", "D1 akışı" | |
| DY-7 | yayına gönderim eksikleri | `yayinaGonderimEksigi` | "DY-7: yayına gönderimde", "D1 akışı" | |
| DY-8 | ilk parça türü | `ilkParcaTuru` | "DY-8: ilk parça", "D1 akışı" | `degisiklik_yonetimi_ilk_parca_kalem_tek`, `_onay_alanlari` |
| DY-9 | emir karar önerisi | `emirKarariOner` | "DY-9: emir karar önerisi", "DY-9 - DY-13" | |
| DY-10 | stok karar önerisi | `stokKarariOner` | "DY-10: stok önerisi", "DY-9 - DY-13" | |
| DY-11 | izinli kodlar | `izinliKodlar` | "DY-11: izinli kodlar", "DY-9 - DY-13" | `_verilen_izinli`, `_kod_degeri` |
| DY-12 | MRB kararı ayrı işlem | `kararIslemi` (S0 `mrbKarariMi`) | "DY-12: hurda", "DY-9 - DY-13" | |
| DY-13 | toplu onay neyi atlar | `topluUygulanirMi` | "DY-13: toplu onay", "DY-9 - DY-13" | `_alanlar`, `_sapmali` |
| DY-14 | emir ilerlemesi | `emirIlerler` | "DY-14: emir kararlar", "D1 akışı" | `_yayinli` |
| DY-15 | kapanış koşulları | `kapanisKosullari`, `kapatilabilirMi` | "DY-15: eksik koşul", "D1 akışı" | `_kapanisli` |
| DY-16 | seri uyumu | `seriUyumu` | "DY-16: seri uyumu" | `_gecerlilik_butun` |
| DY-17 | iş günü; çevrim müşteri onayını beklemeyi saymaz | `isGunuFarki`, `cevrimIsGunu` | "DY-17 ve DY-18", "listeler" | |
| DY-18 | görev hedef süresi | `gorevSuresi` | "DY-17 ve DY-18", "listeler" | |
| DY-19 | görev adımları ve hat | `talepGorevi`, `emirGorevleri`, `talepHatti`, `emirHatti` | "DY-19: görev adımları", "listeler" | |
| DY-20 | talep yalnız aktif mamul ya da yarı mamul kartına | servis `talepParcalariniDenetle` (malzemeler `disari.ts`) | "DY-20: talep yalnız" | `_talep_kalemi_tek` |
