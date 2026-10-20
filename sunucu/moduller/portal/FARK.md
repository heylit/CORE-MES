# portal: fark

Depoda karşılığı olmayan yeni modül; silinen ya da değişen dosya yok. Taban: `main` 708190c.

## Eklenen
- `sunucu/gocler/20261012110500_portal_belge_deposu.sql`: `portal_belge` (belge deposu), `portal_ek` (ekler), `portal_surum` sayacı.
- `sunucu/moduller/portal/`: `uclar.ts`, `servis.ts`, `sorgular.ts`, `kurallar.ts`, `disari.ts`, testler, `UYUM-BORCU.md`.
- `paylasilan/sozlesme/portal.ts`, `paylasilan/islemler/portal.ts`, `paylasilan/sayfalar/portal.ts`.
- `istemci/src/moduller/portal/`: `PortalCercevesi.tsx`, `cerceve-kopru.ts`, `kopru.ts`, `yazi-tipleri.ts`, `rotalar.tsx`, `portal.css`, testler.
- `istemci/src/moduller/portal/cerceve/portal.html`: prototip, bayt bayt aynı (sha256 `373ce22a646c714b05943a5937fe0adf68fab49dae85f438139a616b8be5d2cb`).
- `istemci/src/moduller/portal/cerceve/yazi/`: prototipin yazı tipleri (SIL OFL 1.1, lisansları yanında).

## Prototipe göre
Prototip dosyası değişmedi. Açılışta yalnız şunlar eklenir: içerik politikası, gömülü yazı tipi stili ve köprü betiği; Google
yazı tipi bağlantıları çıkarılır (dış servis yok). Köprü `navigator.storage.persist` isteğini "kalıcı" diye karşılar (opak kökende
tarayıcı reddeder; veri zaten sunucuda kalıcıdır). Görünüm, yerleşim ve kullanım aynıdır.

## Değişen onaylı karar
Yok.

## Oturtma (kart #744, 12.10.2026)
- Taban `main` ec273f6. Teslim dosyaları değişmeden alındı; teslim belgeleri modül klasörüne kondu.
- Göç yeniden damgalandı: `20261012073200` yerine `20261012110500` (main'in ve açık dalların son göcünden sonra).
- Toplayıcı satırları ayrı commit'te ve yalnız portalın satırları: `paylasilan/islemler.ts`, `paylasilan/sayfalar.ts`,
  `paylasilan/islem-adlari.ts`, `sunucu/cekirdek/uygulama.test.ts` (`TAM_DENETLENMEYEN_UCLAR`).
- Ortak `cekirdek-yamasi.diff` uygulanmadı: `xlsx` eklenmedi (kullanıcı kararı, portal kullanmıyor); rol göçü ve matris
  rol x işlem değişikliği olduğu için bu PR'da değil, ayrı PR'da gelir.
- Eklenen belge: `GUVENLIK-DENETIMI.md`. `UYUM-BORCU.md`'ye dış giriş maddesi eklendi.
- Kart #1163: müdür rolündeki kişinin portal unvanının "Müdür" olduğu ve kart #1007 öncesinden kalan "Satın alma müdürü"
  kaydının açılışta düzeldiği gerçek rol ve veritabanıyla sınanır (BD-18). Kod değişmedi; düzeltme #1007 ile main'de.
- Kart #1163 (kullanıcı kararı "kişi kartı"): portal kullanıcısına sunucunun yazdığı `unvan` alanı eklendi; kenar çubuğu rol adı yerine
  onu gösterir. Unvan kişi kartındaki görevdir; kisiler okuması gelene kadar portal rolüne düşer. Onay eşleşmesi rol adıyla kalır.
- Kart #1162: kalite bölümü Satış ve Satın alma menüsünü görmez; sunucu satış ve satın alma kayıtlarını bölümü olmayana okutmaz
  (liste süzülür, tek kayıt 403), var olan siparişe yalnız türünün bölümü ve finans yazar; kalitenin portal izinlerinden teslim
  alma çıktı. Kalite, uygunsuzluk kaydı için satın alma siparişini okumaya devam eder.
- Kart #1163: unvan artık `kisiler/disari.ts` `kisiGorevi` ile kişi kartındaki görevden gelir; geçici karşılık ve borç maddesi kalktı.
