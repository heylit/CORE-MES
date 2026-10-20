# cnc-kurulum: uygulama notu

Taban commit: `main` b610f0f. Teslim türü 1 (depo yollarıyla dosya zip'i).

## Adımlar
1. Paketteki `depo/` klasörünün içini depo köküne kopyala (hepsi yeni dosya). `cerceve/cnc-kurulum-motoru.html` elle oturtulan varlıktır.
2. Çekirdek satırları: `git apply cekirdek-yamasi.diff` (paket kökünde).
3. `npm run goc` (`20261012172817_cnc_kurulum_kayit.sql`).

## Oturtmada değişen (kart #795)
- Göç damgası `20261012110000` main'deki `20261012110000_cizimler_eski_dosyalar.sql` ile çakışıyordu; `20261012172817` oldu, içerik aynı.
- Yamadan yalnız modülün kendi kayıt satırları alındı (`paylasilan/islemler.ts`, `paylasilan/sayfalar.ts`, `paylasilan/islem-adlari.ts`,
  `sunucu/cekirdek/uygulama.test.ts`). Rol göçü (`20261012172818_kisiler_cnc_kurulum_yetkileri.sql`), `kurulum/yetki-matrisi.md` ve onaylı
  matris testleri ilk oturtmada alınmadı; kullanıcı rol dağılımını onaylayınca (12.10.2026, "seçenek 2") ayrı commit'le girdi, rol göçü `20261012172818` damgasıyla.
4. `npm run tip`, `npm run lint`, `npm run sinir -- --modul cnc-kurulum`, `npm run test:modul -- cnc-kurulum`, sonra tam `npm run kontrol`.

## Koştuğum denetimler (temiz `main` kopyasında, paket kopyalanıp yama uygulanmış; Node 24, PostgreSQL 16)
```
$ git apply --check cekirdek-yamasi.diff (asıl depoda, değişiklik yapmadan) -> temiz
$ cmp cerceve/cnc-kurulum-motoru.html <yüklenen dosya>             -> aynı
$ npm run tip            -> 0 tip hatası
$ npm run lint           -> 0 bulgu (lint:ts + lint:css)
$ npm run sinir -- --modul cnc-kurulum -> Sınır 885 dosya 0 ihlal; döngü 0; göç damgası 0 ihlal
  (yol denetimi yalnız yamadaki çekirdek dosyalarını gösterir; çekirdek satırları ayrı commit'le girer)
$ npm run test:modul -- cnc-kurulum -> sunucu # tests 14 # pass 14; istemci Tests 12 passed (12)
$ npm run test:sunucu    -> # tests 2104 # pass 2103 # fail 1
$ npm run test:istemci   -> Tests 1187 passed (1187)
$ npm run derle:istemci  -> başarılı; cnc-kurulum-motoru parçası 11 486 kB (gzip 4 469 kB), yalnız bu ekranda iner
```

## Koşamadıklarım ve bilinenler
- Tek sunucu kırmızısı `oturum.test.ts` "aynı çiftten 20 eşzamanlı deneme..." testidir; değişmemiş tabanda (b610f0f) da aynı biçimde
  kırmızıdır (DOĞRULANDI: ayrı ağaçta yalnız taban ile koşuldu). Paketle ilgisi yok; GitHub koşusunda yeşil olması beklenir (VARSAYIM).
- Tarayıcı denemesi (Chromium, 1280/768/360): giriş, çerçevenin açılması, Kurulum ekranında seçim değiştirme, sunucuya yazma,
  sayfa yenilenince seçimin durması, CSV indirme, Ham Malzeme'de STEP yükleme (OpenCascade, örnek yuvarlatılmış küp), G-Kod örnek
  programı, 8 ekranın açılması (2. sürüm, Oto-CAM örnek gövde ve program üretimi dahil) DOĞRULANDI; konsolda içerik politikası hatası yok, dış adrese istek yok. Ekranlardaki her düğme tek tek gezilmedi.
- Yazdır (`window.print`) çerçevede `allow-modals` ile açık; başsız tarayıcıda yazdırma penceresi denenmedi (BİLMİYORUM, beklenen: çalışır).
