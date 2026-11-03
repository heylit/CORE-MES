# Kural -> test (geometri)

Testler: `kurallar.test.ts` (saf), `geometri.test.ts` (gerçek PostgreSQL, gerçek giriş, gerçek hesap süreci), `istemci/src/moduller/geometri/Atolye3B.test.tsx`.
Model dosyası `test-ortak.ts` ile üretilen sentetik kutudur (gerçek parça depoya girmez).

| Kural | Test |
|---|---|
| Dış kutu, hacim, alan, üçgen ağından; kapalı ağda hacim | `G-K1`, `G-A1` (40x20x10, 8000 mm3, 2800 mm2) |
| Döndürülmüş kutu parçanın kendi ölçüsünü bulur | `G-K2` |
| Açık ağda hacim null, sıfır uydurulmaz | `G-K3`; kısıt `geometri_analiz_kapali_hacim` |
| Çok gövde: hacim toplanır, kutu kapsar; boş model analiz vermez | `G-K4` |
| Ham: her kenara iki yüzün payı; pay sorgudan, yoksa ayardan, o da yoksa 0 ve kaynak 'yok' | `G-K5`, `G-A1`, `G-A2` |
| Ağırlık (1446 a, 1480): yoğunluk boşken önerinin kalitesinden (özel/ayar sunucudan, yerleşik Malzemeler tablosundan), yazılan geçerlidir; hacim yoksa net ağırlık yok | `G-A1`, istemci `Atolye3B.test.tsx`, `malzemeler/kalite-yogunlugu.test.ts` |
| Stok önerisi (1469 a): aktif hammadde kartlarından her formda sığan en küçük; ölçüsü eksik kart ve boru/profil/disk önerilmez; sığan yoksa neden | `G-K9`, `G-A1` |
| Biçim başlığı tutmayan dosya sürece gitmez | `G-K6` |
| Kalıcı hata bir denemede biter; geçici hata 3 denemeye kadar, aynı turda yinelenmez | `G-K7`, `G-A2`, `G-A5` |
| Süre aşımında süreç öldürülür ve yeniden açılır | `G-A5` |
| Öksüz 'calisiyor' iş sonraki turda kuyruğa döner | `G-A6` |
| Eski bağlantı aynı belgenin yayındaki revizyonuna gider; belge arşivdeyse null | `G-A7`, istemci `Atolye3B.test.tsx` |
| Yeni yayın en geç bir turda kuyruğa girer; bitmiş iş yeniden hesaplanmaz | `G-A1` |
| Yeniden hesaplatma sürümlü; iş yokken açılır | `G-A3`, `G-A4` |
| Yetki: okuma ve hesaplatma ayrı işlem | `G-A3` |
| Özellik tanıma (2044, 1923 b): tam tur iç silindir ve koni aynı eksende delik zinciri; içbükey dik düzlem düz dip, dışa daralan uç koni matkap ucu (derinliğe girmez), dipsiz delik geçiş | `GEO-OZ1`, `GEO-OZ2`, `GEO-OZ7`, `G-A9` |
| Delikte büyük çaplı silindir kademe, koni havşa; giriş kör delikte dibin karşısı, geçişte geniş uç; çapraz delikle kesilen aynı çaplı delik tek delik | `GEO-OZ7`, `G-A9` |
| Yarım tur iç silindir delik değildir; dış silindir (mil) delik değildir; eğik eksenli delik de deliktir | `GEO-OZ3`, `GEO-OZ8`, `GEO-OZ9` |
| Radyüs: iki komşusuna teğet silindir, torus ya da küre; iç ya da dış | `GEO-OZ4`, `G-A9` |
| Pah: iki düzlem komşu arasındaki açıyı bölen, dışbükey kenarlı dar düzlem; mil ucunda aynı eksenli dış silindire bağlı dış koni | `GEO-OZ5`, `GEO-OZ6`, `G-A9` |
| Özellikler yalnız öneridir; analizle aynı işlemde yenilenir, yinelenmez | `G-A9` |
