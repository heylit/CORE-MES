# Çekirdek istekleri: cizimler (kart #708)

Hiçbiri bu dalda yapılmadı; modül onlarsız çalışır.

- C1. `dosya` türlerine GLB, GLTF ve DXF. Neden: atölye modelleri GLB; taşıma (karar CM2) ve DXF çizimleri bunsuz merkeze giremez. Öneri: GLB ve GLTF şimdi, DXF görüntüleyiciyle birlikte.
- C2. Rol dağılımı (ortak yetki matrisi): `sayfa.cizimler`, `belge-merkezi.oku`, `belge-merkezi.yaz`, `belge-merkezi.yayinla`. Aşama 2'de.
- C3. `istemci/src/ortak/veri`: dosya yükleme (SHA-256 yazılım yedeği, parçalama, base64) tek ortak parça. Bugün atölye ve merkezde kopya.
- C4. `api` için ikili okuma (`api.ikili(yol)`): aynı hata ve oturum bitişi davranışıyla. Merkez şimdilik `fetch` ile kendi kuruyor.
- C5. Ortak 3B ve PDF görüntüleyici bileşeni: malzeme kartı, istasyon ve kalibrasyon aynı görüntüyü gösterecek. Öneri: merkezdeki `goruntu/` ortak parçaya taşınır.
- C6. İkili cevapta önbellek (kart #688): `cekirdek/uc.ts` ikili cevabı her zaman `private, no-store` gönderir; küçük resim listesinde (50 satır) her açılışta kareler yeniden iner. Kare revizyon ve sıra numarasıyla değişmez (yeniden üretim aynı adrese yazar, VARSAYIM: nadir). Öneri: `ikiliCevap` için isteğe bağlı `private, max-age=<sn>` ya da ETag (özet); merkez şimdilik istemcide tek sorgu ve 60 sn tazelik ile idare ediyor.
