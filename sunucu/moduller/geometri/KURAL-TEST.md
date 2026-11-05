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
| Montaj ağacı (2109): adsız dosya kökü atlanır; düğümler ön sıralı; montaj kutusu altlarını kapsar; konumlar dünya koordinatında | `GEO-MO1`, `GEO-MO-A1` |
| Bileşen listesi: aynı ad ve ölçüdeki parça tek satır ve adetli; döndürülmüş yerleşim aynı bileşen | `GEO-MO2`, `GEO-MO-A1` |
| Tek parçalı model tek düğümdür (montaj false); montajı okunmamış analiz 'montaj-yok', analiz yoksa 'analiz-yok' | `GEO-MO3`, `GEO-MO-A2`, `GEO-MO-A1` |
| Güvenilmeyen girdi: boş ağ parça değil, parçasız ve sınırı aşan model null, bozuk alan yok sayılır, ad kısalır, derin yapı yığını taşırmaz | `GEO-MO4` |
| Montaj analizle aynı işlemde yenilenir, yinelenmez; yalnız öneri | `GEO-MO-A1` |
| Sağlık raporu (2143): açık kenar, geçersiz yüz ya da geçersiz şekil, kapanmayan ağ, 0,1 mm üstü tolerans "guvenme"; 0,01 mm üstü tolerans, 0,01 mm'den kısa kenar, mm olmayan birim, 1 mm'den küçük ya da 10 m'den büyük parça "dikkat"; bulgu yoksa "iyi" | `GEO-SA1`..`GEO-SA4`, `GEO-SA-A1`..`GEO-SA-A4` |
| Birim: STEP'te okuyucunun bildirdiği ad, IGES'te global bölümün 14./15. alanı; okunamazsa null ve bulgu yok | `GEO-SA4`, `GEO-SA5`, `GEO-SA6`, `GEO-SA-A3` |
| Sağlık analizle aynı işlemde yenilenir, yinelenmez; satırı olmayan analiz 'saglik-yok' | `GEO-SA-A5` |
| Yüzey işaretleri (2144, 2144-1 a): bir yüz tek işleme atanır; işlem rotadaki yüzey adımı ya da maske; alan işlem başına B-rep yüz alanından, işaretsiz = toplam - işaretli | `GEO-YZ1`, `GEO-YZ-A1` |
| Kayıt sürümlü ve bütün olarak; yüz modelde olmalı, yinelenmez; rota adımı bugünkü rotada olmalı, kalkan adımın kayıtlı işareti uyarıyla kalır (2140-3) | `GEO-YZ2`, `GEO-YZ-A1`..`GEO-YZ-A3` |
| Rota bağı kurulmadıysa liste boş ve 'rota-bagli-degil'; malzemenin yürürlükte rotası yoksa 'rota-yok' | `GEO-YZ-A1`, `GEO-YZ-A3` |
| Yeni revizyon (2140-4 a): önceki işaretli revizyonun işaretleri tür, yön, alan, yarıçap, eksen ve konumu aynı yüzlere öneri olarak gelir; okumada yazılmaz; eşleşmeyen taşınmaz | `GEO-YZ3`, `GEO-YZ-A4` |
