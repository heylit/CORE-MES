# UE-LISTESI ile rota-plan teslimi (08.10.26 14.34) karsilastirmasi

Sonuc: teslimde uretim-emirleri kodu YOK; UE maddelerinin hicbiri karsilanmiyor. Teslim rota ve plan modullerinin teslimidir; uretim-emirleri'nden istedigi fonksiyonlari CAGIRIR ve imzalarini istek olarak yazar. UE-LISTESI'nin UE1, UE4, UE5 maddeleri zaten bu teslimin istek dosyalarindan alinmistir.

## Kanit (DOGRULANDI)
- Teslimde `uretim-emirleri` klasoru yok: `find` ciktisi yalniz `rota` ve `plan` dosyalari (istemci/src/moduller/rota, sunucu/moduller/rota, sunucu/moduller/plan, paylasilan/*/rota|plan, iki goc).
- Teslimin kendi borcu: `sunucu/moduller/rota/UYUM-BORCU.md:10` "B6 | `uretimEmriAc` (uretim-emirleri) yok"; `sunucu/moduller/plan/UYUM-BORCU.md:5` "P-B1 | `planlanacakIsEmirleri`, `isEmriKaynagiYaz`, `uretimEmriAc` (uretim-emirleri) yok; plan sunucusu derlenmez".
- `UYGULA-rota.md:4`: "uretim-emirleri (`uretimEmriAc`) fonksiyonlari ... Bunlar olmadan rota sunucusu derlenmez."
- Cagri yerleri: `sunucu/moduller/rota/servis.ts:14` `import { uretimEmriAc } from '../uretim-emirleri/disari.ts'`; `sunucu/moduller/plan/servis.ts:11` `import { isEmriKaynagiYaz, planlanacakIsEmirleri } ...`.

## Ana dalla iliski (DOGRULANDI, origin/main 134aaa8)
- Teslim ana dalda zaten var: rota `97b0692` "route module from the external delivery (base c2c9871), seated as is", plan `9336c3b`/`d6550a3`/`38cd8c4`. 61 kod dosyasinin 44'u ana daldakiyle bayt bayt ayni; 17 dosya farkli cunku ana dal sonra ilerledi (son commitler `c101266` fason, `854b34f`, `2a42606`). Farkli dosyalarin 10'u ana dalin ilk oturtma surumuyle ayni; kalan 7'sinin (plan servis/test/borc, rota kurallar/servis/test) ana dalda hic esi yok: oturtmada degistirilmis. Servis dosyalarinda `../uretim-emirleri/disari.ts` yerine `./baglanti.ts` gecici karsiligi var (`rota/servis.ts:19`, `plan/servis.ts:11`, DOGRULANDI); kurallar ve testlerdeki farkin nedeni BILMIYORUM (incelenmedi).
- Goc adlari oturtmada degismis: `20261008090000_rota_tablolar.sql` -> `20261008140954_rota_tablolar.sql`, `20261008100000_plan_tablolar.sql` -> `20261008143604_plan_tablolar.sql`.
- Yani bu teslimden depoya alinacak yeni bir sey yok.

## Madde madde
| Madde | Teslimde | Durum |
|---|---|---|
| UE1 uretimEmriAc | `BASKA-MODUL-ISTEKLERI-rota.md:23` imza (istek); cagri `rota/servis.ts:673` | Uygulama yok; istegin kaynagi bu teslim |
| UE2 emir malzeme kartina bagli | `BASKA-MODUL-ISTEKLERI-rota.md` K1 notu (istek) | Uygulama yok |
| UE3 fason is emri | yok (teslim 08.10, fason karari 09.10; imza ana dalda `c101266` sonrasi) | Yok |
| UE4 planlanacakIsEmirleri | `BASKA-MODUL-ISTEKLERI-plan.md:4` imza (istek); cagri `plan/servis.ts:64` | Uygulama yok |
| UE5 isEmriKaynagiYaz | `BASKA-MODUL-ISTEKLERI-plan.md:7` imza (istek); cagri `plan/servis.ts:176` | Uygulama yok |
| UE6-UE11 Arkon istekleri | yok | Yok (Arkon'un istekleri, bu teslimin konusu degil) |
| UE12-UE14 stok istekleri | yok | Yok |
| UE15 okuma uclari yetkisi | yok | Yok |
| UE16-UE17 istasyon istekleri | yok | Yok |
| UE18 terminal ekrani | yok | Yok |

## Listede olmayan, teslimde olan bir istek
- Adimli emir uclari: `istemci/src/moduller/rota/beklenen/uretim-emirleri-adimli.ts` (`/adimli-emirler*`, rotadan emir govdesi, adim istasyonu) ve onu kullanan `EmirlerEkrani.tsx:6`. Rota sayfasindaki "Uretim emirleri" bolumu bunu bekliyor (`BASKA-MODUL-ISTEKLERI-rota.md` "K2"). UE-LISTESI'nde karsiligi yok; listeye UE19 olarak eklenmesi gerekir (VARSAYIM: ayni sahibe gidecek).

## Kimin isi
Teslim rota-plan yazarinin isidir (dosya adlari, FARK-rota.md, FARK-plan.md). Uretim-emirleri sahibinin teslimi degildir; o modulun kodu henuz hic gelmedi.
