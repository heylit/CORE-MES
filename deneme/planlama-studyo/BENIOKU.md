# Planlama stüdyosu denemesi

Bu klasör bir denemedir: tarayıcıda tek dosya olarak açılan planlama prototipi. Uygulamanın parçası değildir.

- Uygulamaya, menüye ve derlemesine girmez; `npm run kontrol` bu klasörü taramaz (lint dışlaması `eslint.config.js`).
- Uygulamanın plan motoru değildir. Uygulamada tek plan motoru vardır (karar 338 a); `motor/` altındaki motor yalnız bu denemeyi çalıştırır.
- Veriler uydurmadır (`veri/`); gerçek firma, kişi, parça ya da tezgâh bilgisi yoktur.
- Sayfa ağa çıkmaz; her şey tek HTML dosyasına gömülür.

## Derleme

Gerekenler: Python 3 ve Node. Depo kökünde `npm install` yapılmış olmalı (tasarım dosyaları `istemci/src/ortak/` altından okunur).

    sh deneme/planlama-studyo/derle.sh

Çıktı `deneme/planlama-studyo/cikti/planlama-modulu.html` dosyasıdır; tarayıcıda doğrudan açılır. `cikti/` depoya girmez.

## Bilinen eksikler

- Sürükle-bırak ve tanıtım turu bu kopyada kapalıdır. Deneme bunlar için dört dış kütüphane kullanıyordu; dış kod depoya alınmaz (karar 401 c). Uygulama için kendi kütüphanelerimizi yazma kararı (362 a) verildiğinden, deneme ileride o kütüphanelere geçirilecektir. Tam çalışan derlenmiş sayfa devir paketindedir.
- HiGHS çözücüsü onaylı `highs` paketinden alınır ve depoya ikili olarak konmaz. Paket `node_modules/highs` altında yoksa sayfa derlenir, ancak HiGHS seçeneği hata verir.

## Yapı

- `app-v1.js`, `parca/`, `cp-*.txt`: sayfa kodu. `birlestir.py` bunları `cikti/app.js` olarak birleştirir.
- `build.py`: tasarım dosyalarını, motoru, veriyi ve kodu tek HTML'e gömer.
- `motor/`: deneme motoru (`engine.js`), kısıt kataloğu ve MIP yardımcıları.
- `rr/`: Reçete ve Rota ekranının denemedeki kopyası.
- `modul.css`, `rr-tema.css`: denemenin stilleri.
