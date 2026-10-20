# Platform esligi, kart #122: yazim oncesi liste

Ana dal: 9b6582f (8bf861a'nin ustunde). Dal acilacak: `122-platform-esligi-2`, guncel ana daldan.
Eski dal `122-platform-esligi` ana dalla ortak atasi yok (ana dal yeniden yazilmis; `git merge-base` cikis 1). Bu yuzden cherry-pick degil, ayni degisiklik elle yeniden yazilir.

## Eski daldaki dort commit

| Commit | Ne | Ana dalda durum | Karar |
|---|---|---|---|
| d698ffb | `.nvmrc` = 24 | DOGRULANDI: ana dalda `.nvmrc` yok | Yeniden yazilir (D-N1) |
| 0c9a549 | `.gitattributes`: `* text=auto`, `*.sh eol=lf`, ikililer `binary` | DOGRULANDI: ana dalda hala `* text=auto eol=lf` | Yeniden yazilir (D-N3) |
| fe7bba4 | Ortam yukleyici: `.env` varsa tek kaynak; surecte farkli ya da `.env`'de olmayan `TMIV2_` adiyla durdurur; `TMIV2_ORTAM` zorunlu; giris noktasi testleri `.env`'siz depo disi kopyada | DOGRULANDI: `araclar/ortam.ts`, `ortam.test.ts`, `giris-noktalari.test.ts`, `ortam-yukle*.ts`, `.env.ornek`, `vt/tasima-denemesi.sh` ana dalda o commit'in atasiyla ayni; yalniz `NOTLAR.md` farkli | Yeniden yazilir (D-N2, D-N4) |
| f2d2f6d | `test-modul.ts` deseni tirnaksiz | DOGRULANDI: ana dalda zaten var (`araclar/test-modul.ts`, "Desen tirnaksiz") | Atlanir |

## Eski denetimin uc bulgusu (kart #122 yorumu, 06.10.2026)
1. `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR` surecteyken `.env`'siz kopya ana agacin `.env`'ine duser (`araclar/ortam.ts` `anaAgacKoku`). Duzeltme: git cagrisinin ortamindan bu uc degisken dusurulur; test.
2. Windows'ta ortam degiskeni adi buyuk-kucuk harf duyarsiz; `tmiv2_port` gibi farkli harfli ad celiski sayilmiyor. Duzeltme: karsilastirma buyuk harfe cevrilerek yapilir; test (Windows'ta dogrulanmadi).
3. `test-modul.ts` duzeltmesini olcen test yok. Duzeltme: sunucu deseninin tirnak tasimadigini ve kabuksuz kosuda en az bir dosya bulundugunu olcen test.

## Yeni bulgu (bu tur)
4. `test-modul.ts` Windows'ta `shell: true` ile argv dizisi veriyor. VARSAYIM: Node 24 bunu DEP0190 ile uyariyla kosar (belgeden dogrulanmadi). Duzeltme: `teslim.ts`'in yaptigi gibi kabuksuz: `node` icin `process.execPath`, vitest icin paketin giris dosyasi (`binYolu`). Boylece iki platformda ayni cagri. `binYolu` `teslim.ts`'ten kucuk ortak dosyaya alinir (dongu olmasin diye; ikisi de `araclar/` icinde).

## Bakilan, degisiklik gerekmeyen
- `package.json` betikleri: `&&`, cift tirnakli glob (`node --test` kendisi genisletir), `.bin` kisayollari cmd ve sh'de ayni. Betik satiri DEGISMEZ.
- `goc`: goc ozeti CRLF'yi LF'ye cevirerek hesaplaniyor (`sunucu/cekirdek/goc.ts` `ozetle`); satir sonundan etkilenmez.
- `sinir`: dosya yollari `/` ile kuruluyor, icerik `/\r?\n/` ile bolunuyor. `harita`: `readdir` sonucu `\` -> `/` cevriliyor.
- CRLF saklanan dosya: 0 (626 LF, 16 woff2 ikili).

## Sonraya (yazilmaz, oneri)
- `harita` ve `durum` siralamada `localeCompare` kullaniyor; makinenin dil ayari (tr-TR) sirayi degistirebilir mi: BILMIYORUM. Adlar ASCII oldugundan dusuk risk.
- `teslim-incele.ts` iki yerde `split('\n')`: CRLF dosyada satir sonunda `\r` kalir. Dort komutun disinda.

## Dokunulacak dosyalar
`.nvmrc` (yeni), `.gitattributes`, `.env.ornek`, `araclar/ortam.ts`, `araclar/ortam-yukle.ts`, `araclar/ortam-yukle-goc.ts`, `araclar/ortam.test.ts`, `araclar/giris-noktalari.test.ts`, `araclar/test-modul.ts`, `araclar/test-modul.test.ts`, `araclar/teslim.ts` (yalniz `binYolu` ithali), yeni `araclar/paket-bin.ts`, `araclar/vt/tasima-denemesi.sh` (yalniz yorum), `araclar/NOTLAR.md`.
Dokunulmaz: `.github`, `package.json` (bagimlilik ve betik), `sunucu/`, `istemci/`, `paylasilan/`, moduller.

Not: `.nvmrc`, `.gitattributes`, `.env.ornek` kok dosya ama betik degil; kartin "Neyi degistirecek" satirinda var. Kapsam disi sayarsan bu ucu cikaririm.

## Dogrulama
Her degisiklik: Linux'ta `npm run tip`, `lint`, `sinir`, `araclar` testleri; PR'da `kontrol`. Windows'ta hicbiri dogrulanmadi; her commit mesajinda ve PR'da yazilir.
Yerel ortam: Node 22 kurulu (CI 24). Node 24 kurmayi deneyecegim; kurulamazsa "Node 22'de kosuldu" diye yazilir.
