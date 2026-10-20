# recete-rota: uygulama notu

Taban commit: `main` 3cbc270. Teslim türü 1 (depo yollarıyla dosya zip'i).

## Adımlar
1. Paketteki `depo/` klasörünün içini depo köküne kopyala (hepsi yeni dosya). `cerceve/recete-rota-motoru.html` ve `cerceve/yazi/` elle oturtulan varlıklardır.
2. Çekirdek satırları: `git apply cekirdek-yamasi.diff` (paket kökünde).
3. `npm run goc` (`20261013061900_recete_rota_kayit.sql`, yamadaki `20261013061901_kisiler_recete_rota_yetkileri.sql`).
4. `npm run tip`, `npm run lint`, `npm run sinir -- --modul recete-rota`, `npm run test:modul -- recete-rota`, sonra tam `npm run kontrol`.

## Koştuğum denetimler (temiz `main` 3cbc270 kopyasında, paket kopyalanıp yama uygulanmış; Node 22.22, PostgreSQL 16)
Sonuçlar paket kökündeki KURULUM.md'de.
