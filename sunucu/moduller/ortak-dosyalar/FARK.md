# FARK: ortak-dosyalar (kart 2067, dal 2067-dosya-yetkisi)

Taban: `main` cb79a3f üzerinde `2067-kisiler-rolleri` (kisiler: `kisininRolleri`, `rollerVeBayraklari`). Yeni modül; depoda önceki hâli yok.
Başvuru: onaylı prototip (2067-1 a) ve ADR 0030 (2067-2 a), kodu "2067 teyit".

## Eklenen
- ADR `belgeler/adr/0030-ortak-dosyalar.md` (onaylı taslağın aynısı) ve dizin satırı.
- Göç `sunucu/gocler/20261105089000_ortak_dosyalar_tablolar.sql`: yalnız yeni, boş tablolar (`ortak_dosyalar_klasor`, `_yetki`, `_dosya`, `_surum`).
- Göç `sunucu/gocler/20261105090000_kisiler_ortak_dosyalar_sayfasi.sql` (karar 2067-3 b): yönetici olmayan bütün rollere `sayfa.ortak-dosyalar`; veri silinmez.
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

## Kart 3288 dilim 1 (2067-4 a, 2067-5 a; taban main 65e4844)
- Göç `20261115073335_ortak_dosyalar_kayit_klasorleri.sql`: yalnız ekler. `ortak_dosyalar_klasor`'a boş olabilen `kaynak_tur`, `kaynak_id`,
  `toplu_is` ve varsayılanlı `arsiv` (+ iz); kaynak başına tekil kısmi dizin. Yeni boş tablolar `ortak_dosyalar_acilamayan` ve sistem
  sabitiyle dolan `ortak_dosyalar_sablon`. Kurgudaki ayrı `sistem` işareti yerine `kaynak_tur IS NOT NULL` kullanıldı (tek gerçek).
- `kayit-klasorleri.ts`: kayıt zincirinden klasör açma (ara noktalı), ad izleme, iptalde arşiv, kök açma, şablon, açılamayanlar, toplu komut,
  kayıt bağlantısı. `disari.ts` dinleyicilerin kullanacağı işlevleri açar; kaynak modüller henüz bağlı değil (UYUM-BORCU 7).
- Ekran: Ayarlar görünümü (`/ortak-dosyalar/ayarlar`, ikinci menüde yalnız `ortak-dosyalar.yetki-ver` ile), ağaçta arama ve "Kayda bağlı" işareti,
  kaynak şeridi ve kayda bağlantı, tek dosyada ad önerisi penceresi.
- Ön izlemeden fark: zincir yerine `pin` simgesi (UYUM-BORCU 9); sistem
  klasörü menüsündeki pasif "Adı değiştir / Taşı / Arşive kaldır" maddeleri çizilmedi, çünkü klasör için bu uçlar hiç yok (UYUM-BORCU 4).
- Ayarlar'da ön izlemede çizilmemiş "Müşteriler klasörü" ve "Toplu işler" kartları (onaylı madde 8 ve 7). Bakış sonrası şablon
  ekleme biçimi ("Alt klasör ekle", hemen kayıt), açılamayanlar tablosu, onay penceresindeki sayı kutuları ve uyarı bandı ön izlemeye uyduruldu.

## Kart 3288-2 (dilim 2; taban main d03f9fa)
- Kaynak olayları: `FirmaDegistiOlayi`'na `kisiId` (6 yazma yeri), siparişlerde `siparisDegistiBildir` (açılış, düzenleme, her durum geçişi),
  projelerde `proje-olaylari.ts` (`projeAcildiBildir`, `projeDegistiBildir`; 3272 ile ortak, imza yalnız eklenerek değişir).
- `kayitEsitle`: klasör yoksa açar, varsa adı ve sipariş arşivini eşitler. Zincir ve mevcut kayıt listesi `sunucu/kablolama.ts`'te kaynakların
  `disari.ts`'inden kurulur (bu modül kaynakları ithal etmez). Yalnız müşteri ya da ikisi türündeki firmaya klasör açılır.
- Ekran: firma, sipariş ve proje ayrıntısında "Klasör" bağlantısı (ortak arayüzde, CEKIRDEK-ISTEKLERI 3); Ortak Dosyalar `?klasor=` ile açılır.

## Kart 3443 (3443 a; ADR 0030 madde 6 değişti)
- Yüklemede müşteri ve proje: `ortak_dosyalar_dosya.firma_id`, `proje_id` (boş olabilir); yalnız dosya ilk yazılırken; kayda bağlı klasörde
  klasörün kaydından. Seçici uçları `GET /ortak-dosyalar/secim/musteriler`, `/secim/projeler`; Son eklenenler `firmaId`, `projeId` süzgeci.
- Kalıcı silme: yalnız arşivdeki dosya, Yönetir, ad yazılarak; ayar `ortak-dosyalar.silme-dort-goz` (varsayılan kapalı) açıkken istek, başka
  Yönetir kişinin onayı ya da reddi, isteyenin geri çekmesi. Defter `ortak_dosyalar_silme`; Geçmiş'e beş yeni olay; Arşiv'de "Onay bekleyen".
- Ön izlemeden fark: seçici uçları firma ve proje modüllerinde değil bu modülde; okuma `sunucu/kablolama.ts`'ten (3020 a).
