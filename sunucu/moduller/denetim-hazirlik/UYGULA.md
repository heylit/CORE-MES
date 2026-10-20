# denetim-hazirlik: uygulama notu

Taban commit: `main` 708190c. Teslim türü 1 (depo yollarıyla dosya zip'i).

## Adımlar
1. Zip'i depo köküne aç (yollar depoyla aynı). `cerceve/*.html`, `cerceve/yazi/*.woff2` ve `*-OFL.txt` elle oturtulan varlıklardır (teslim aracı yalnız .ts/.tsx/.css/.md tanır).
2. Çekirdek satırlarını gir: `git apply cekirdek-yamasi.diff` (`tmi-moduller.zip` kökünde; üç modülün satırları birlikte). Tek modül alınacaksa CEKIRDEK-ISTEKLERI.md'deki satırlar elle.
3. `npm install` (yama `xlsx` 0.20.3'ü cdn.sheetjs.com'dan ekler, kilit dosyasını günceller; sunucunun o adrese kurulumda erişmesi gerekir), `npm run goc` (göç: `sunucu/gocler/20261012165213_denetim_hazirlik_belge_deposu.sql` ve yamadaki rol göçü).
4. `npm run tip`, `npm run lint`, `npm run sinir -- --modul denetim-hazirlik`, `npm run test:modul -- denetim-hazirlik`, sonra tam `npm run kontrol`.
5. Rol satırları yamadaki göçle gelir (onaylı dağılım).

## Koştuğum denetimler (geçici kopyada, üç modül birlikte, son satırlar)
```
$ npm run tip            -> 0 tip hatası
$ npm run lint           -> 0 bulgu
$ npm run sinir      -> Sınır denetimi: 882 dosya, 0 ihlal.
$ npm run sinir      -> Döngü denetimi (denetim-hazirlik): 0 döngü.
$ npm run sinir      -> Göç damgası denetimi (denetim-hazirlik, taban main): 0 ihlal.
$ npm run test:modul -> # tests 20
$ npm run test:modul -> # pass 20
$ npm run test:modul -> # fail 0
$ npm run test:modul -> Tests  12 passed (12)
$ npm run kontrol (üç modül + çekirdek yaması birlikte) -> sunucu # pass 2108, # fail 1; istemci Tests  1165 passed (1165)
  kırmızı: not ok 17 - aynı çiftten 20 eşzamanlı deneme beklemeyi atlatamaz ve havuzu doldurmaz: yalnız biri parolaya bakar, başka kullanıcı girer
```

## Koşamadıklarım
- Tam `kontrol`daki tek sunucu kırmızısı `oturum.test.ts` "aynı çiftten 20 eşzamanlı deneme..." testidir; bu makinede değişmemiş tabanda (708190c) da aynı biçimde kırmızıdır (DOĞRULANDI: ayrı ağaçta yalnız taban ile koşuldu). `plan.test.ts` PL-03 bir koşuda kırmızı, öbüründe yeşil; tabanda da kırmızı görüldü (saate bağlı). İkisinin de bu paketle ilgisi yok; GitHub'daki koşuda yeşil olması beklenir (VARSAYIM).
- SheetJS tarayıcıda 0.18.5 ile denendi: gömülü `XLSX` içerik politikası altında örnek Excel dosyasını okudu, dış istek yok (DOĞRULANDI). Yamadaki 0.20.3 bu ortamda indirilemediği için denenmedi (BİLMİYORUM: aynı dosya yolu ve `window.XLSX` ile çalışması beklenir, VARSAYIM).
- `kontrol` sunucu testinde durduğu için istemci testleri ayrıca `npm run test:istemci` ile koşuldu.
- Tarayıcı denemesi (Chromium, 1280/768/360): giriş, çerçevenin açılması, gömülü yazı tipleri, köprüyle yazma ve sayfa yenilenince kaydın durması üç modülde DOĞRULANDI; dış adrese istek yok. Prototiplerin bütün ekranları tek tek gezilmedi.
