# FARK: ortak-dosyalar (kart 2067, dal 2067-dosya-yetkisi)

Taban: `main` cb79a3f üzerinde `2067-kisiler-rolleri` (kisiler: `kisininRolleri`, `rollerVeBayraklari`). Yeni modül; depoda önceki hâli yok.
Başvuru: onaylı prototip (2067-1 a) ve ADR 0030 (2067-2 a), kodu "2067 teyit".

## Eklenen
- ADR `belgeler/adr/0030-ortak-dosyalar.md` (onaylı taslağın aynısı) ve dizin satırı.
- Göç `sunucu/gocler/20261105085000_ortak_dosyalar_tablolar.sql`: yalnız yeni, boş tablolar (`ortak_dosyalar_klasor`, `_yetki`, `_dosya`, `_surum`).
- Sözleşme `paylasilan/sozlesme/ortak-dosyalar.ts`, işlem `paylasilan/islemler/ortak-dosyalar.ts` (`ortak-dosyalar.yetki-ver`), sayfa ve ikinci menü
  `paylasilan/sayfalar/ortak-dosyalar.ts` (`/ortak-dosyalar`, grup Yönetim; Klasörler, Son eklenenler, Arşiv).
- Toplayıcı satırları ayrı commit'te: `paylasilan/islemler.ts`, `paylasilan/sayfalar.ts`, `paylasilan/islem-adlari.ts` (yalnız bu modülün satırları).
- Sunucu `sunucu/moduller/ortak-dosyalar/`; ekran `istemci/src/moduller/ortak-dosyalar/`.

## Prototipten farklar
- Eski sürümün indirilmesi (ADR 0030, 7) için prototipte yol yok: birden çok sürümü olan dosyada sürüm hücresi (`s2`) sürüm listesini açar,
  her sürüm indirilir. Düzen değişmedi.
- Klasör ad değiştirme, taşıma ve klasör arşivi ADR 0030, 3'te yonetir hakkıdır; prototipte ekranı yoktur, bu teslimde ucu da yoktur (UYUM-BORCU 4).
- Klasör simgesi ortak sette yok; `layers` kullanıldı (UYUM-BORCU 5).
- Prototipteki rol düğmeleri ve tema anahtarı prototip denetimidir; ekrana girmez (rol oturumdan, tema kabuktan).
