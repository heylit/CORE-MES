# ADR 0018 — Plan motoru tek kaynak, son söz sunucuda

Durum: kabul (kullanıcı kararı 21.10.2026: "ADR 0018 a onaylı, yaz"; seçenek a: motor `sunucu/moduller/recete-rota/motor/` altında).
Motorun yeri ADR 0020 ile değişti (26.10.2026): motor ve planlama kodu `sunucu/moduller/plan/motor/` altında, plan modülünündür; öteki
maddeler aynen sürer.
Dayandığı kararlar: 354 (asıl plan motoru sunucuda; denemeler ve stüdyodaki asıl plan öncesi değişiklikler tarayıcıda), 391 a (başlamış adımın
kalanını sunucu adetten hesaplar, motor kullanır), 396 a, 397 a, 338 a (tek plan motoru Reçete ve Rota'da, plan sunucusu plan modülünde),
364 c (motor JS kalır). Canlıya alma (356 b) bu belgenin kapsamında değildir.

## Bağlam

- İki motor vardı. Sunucudaki `plan/kurallar.ts` `oner` asıl planı kurar: planlama çerçevesi sırayı `POST /plan/kuyruklari-yaz` ile yazar,
  saatleri sunucu bu motorla yeniden hesaplar. Ortak motor (`engine`, `kisitlar`, `mip`) yalnız tarayıcıdaki çerçevede koşuyordu.
- Ortak motor tarayıcı nesnesi kullanmaz; Node'da boş `vm` bağlamında değişmeden yüklenir. Deneme veri setlerinde (54-370 işlem) ilk plan
  Node'da 22-296 ms sürdü; 1.500 işlem ölçülmedi.
- Başlamış adımın kalanı iki yolla hesaplanıyordu: sunucu adetten (`plan/servis.ts` `gerceklesenler`), motor geçen süreden. Çerçeveye
  çalışan adımın gerçekleşeni sunucudan gelmiyordu.
- Motorun girdisi bu modülün kaydından tarayıcıda kurulur (`zz27-rr-veri` `rrDenemeyeCevir`). Sunucu aynı girdiyi kuramazsa aynı motor
  farklı plan verir.
- Reçete ve Rota plan modülüne bağımlıdır (`canliOzeti`, `planAyariOku`); plan bu modülü ithal ederse döngü olur (ADR 0006 madde 4).
- Motorun iyileştirme araması zaman bütçelidir (`W0.lnsMs`): aynı girdiyle iki makinede farklı sonuç verebilir.

## Karar

1. **Tek motor kodu.** Motor dosyaları `sunucu/moduller/recete-rota/motor/*.betik` altında tek kaynaktır ve Reçete ve Rota'nındır.
   Planlama çerçevesinin sayfası onları buradan gömer (`planlama-derle.ts`, derleme zamanı okuma); sunucu aynı dosyaları yükler. Girdiyi kuran
   çevirici de aynı yere taşınır (sonraki iş).
2. **Sunucuda çalışma.** `plan-motoru.ts`: motor `node:worker_threads` iş parçacığında, boş `vm` bağlamında koşar; olay döngüsünü tutmaz.
   Aynı anda tek çözüm, süre sınırı (`COZUM_SURESI_MS`), süre aşılınca ya da iş parçacığı çökünce ret. Dış çağrı ve yeni paket yok.
3. **Son söz sunucuda.** Tarayıcı önizler (deneme, stüdyo, senaryo; aramalı). Asıl plana yazan komutta (kuyruk yaz, canlıya al) sunucu
   motoru aramasız kipte (`sabit`: tabandaki tezgâh sırası korunur; `yeni`: kuraldan) yeniden koşar ve kendi sonucunu yazar. Aynı girdi her
   koşuda aynı planı verir. Önizlemeyle sunucu sonucu farklıysa cevap farkı döner.
4. **Kalan tek kaynak (391 a).** Çalışan adımın kalanını yalnız plan modülü hesaplar (396 a standart birim süre, 397 a hurda adım bitince).
   Motorun gerçekleşen kaydı `{ m, S, kalan, sayim }` taşır: `kalan` verimli çalışma saati, `sayim` son sayım anı (yoksa başlama). `kalan`
   varsa motor bitişi `sayim`dan takvimle `kalan` kadar ilerletir; yoksa bugünkü yol sürer (elle giriş, deneme).
5. **Bağ.** Plan motoru ithal etmez: `plan/disari.ts` `planMotoruCozucusu` kaydını tanımlar (ADR 0006 madde 6), Reçete ve Rota karşılığını
   verir, bağ `sunucu/kablolama.ts`'te kurulur. Plan çözücüye isteği verir (kip, şimdi, kuyruklar, çalışan adımlar); motorun girdisini
   Reçete ve Rota kurar, iç biçimi dışarı açılmaz. Çözücü kayıtsızken plan bugünkü `oner` yolunu sürdürür.
6. **Kıyas önce.** Asıl plan ortak motora geçmeden önce aynı veriyle `oner` ve ortak motor kıyaslanır; farklar kullanıcıya liste olarak gelir.

## Vazgeçilenler

- Motoru TypeScript'e yeniden yazmak (364 c).
- Tarayıcının hesapladığı saatleri sunucunun doğrudan yazması (354).
- Motorun kalanı kendi hesaplaması (deneme sürümündeki `adetKalan`; 391 a ile çelişir).
- Motorun istemci klasöründe kalıp sunucunun oradan okuması; `paylasilan` altına alınması (çekirdek şeridi, sahiplik bölünür).

## Sonuçlar

- Asıl plan `oner`'den ortak motora canlıya alma kararıyla (356 b) geçer; o güne kadar `oner` kalır.
- Sunucu motoru bugün HiGHS kullanmaz (aramasız kipler); HiGHS sunucuda gerekirse `highs` paketinin yeri ayrıca sorulur.
- Plan sonuçları değişir (iki motor aynı planı vermez); plan testleri kıyastan sonra güncellenir.
