# Çekirdek istekleri: cizimler (kart #708)

Hiçbiri bu dalda yapılmadı; modül onlarsız çalışır.

- C1. `dosya` türlerine GLB, GLTF ve DXF. Neden: atölye modelleri GLB; taşıma (karar CM2) ve DXF çizimleri bunsuz merkeze giremez. Öneri: GLB ve GLTF şimdi, DXF görüntüleyiciyle birlikte.
- C2. Rol dağılımı (ortak yetki matrisi): `sayfa.cizimler`, `cizimler.oku`, `cizimler.yaz`, `cizimler.yayinla`. Aşama 2'de.
- C3. `istemci/src/ortak/veri`: dosya yükleme (SHA-256 yazılım yedeği, parçalama, base64) tek ortak parça. Bugün atölye ve merkezde kopya.
- C4. `api` için ikili okuma (`api.ikili(yol)`): aynı hata ve oturum bitişi davranışıyla. Merkez şimdilik `fetch` ile kendi kuruyor.
- C5. Ortak 3B ve PDF görüntüleyici bileşeni: malzeme kartı, istasyon ve kalibrasyon aynı görüntüyü gösterecek. Öneri: merkezdeki `goruntu/` ortak parçaya taşınır.
