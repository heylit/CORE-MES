# ADR 0018 — Plan motoru tek kaynak, son söz sunucuda

Durum: kısmen yerine geçildi (kabul: kullanıcı kararı 21.10.2026: "ADR 0018 a onaylı, yaz"; seçenek a: motor `sunucu/moduller/recete-rota/motor/` altında).
Madde 5'in "motorun girdisini Reçete ve Rota kurar" cümlesi ADR 0028 ile değişti (01.11.2026, 1728 a). Motorun yeri ADR 0020 ile değişti (26.10.2026): motor ve planlama kodu `sunucu/moduller/plan/motor/` altında, plan modülünündür; öteki
maddeler aynen sürer. 01.11.2026 bakımı (1495 a): A motoru (`oner`, `/plan/oner`, `/plan/karsilastir`) 1381 a ile kalktı;
motor JavaScript'te kalır (364 a, sunucuda çözüm süre sınırı 60 sn, `plan-motoru.ts` `COZUM_SURESI_MS`); yıllık çözücü HiGHS kullanır (361 b).
02.11.2026 bakımı (1888 b, 1888 teyit): madde 7 eklendi; kişiye yerleşen işi motor dizer (1409 a'daki "motor kişi işini dizmez" kısıtı kalktı).
02.11.2026 bakımı (1891 A b, 1891 B a, 1891 teyit-2 a): madde 7'de insanlı istasyon kapasite kaynağıyla tanınır ve işleri yetkin kişilere paralel dizilir.
Dayandığı kararlar: 354 (asıl plan motoru sunucuda; denemeler ve stüdyodaki asıl plan öncesi değişiklikler tarayıcıda), 391 a (başlamış adımın
kalanını sunucu adetten hesaplar, motor kullanır), 396 a, 397 a, 338 a (tek plan motoru; yeri ADR 0020 ile plan modülü),
364 a (motor JS kalır), 1381 a (A motoru kalktı). Canlıya alma (356 b) bu belgenin kapsamında değildir.

## Bağlam

- (Karar anındaki durum; A motoru 1381 a ile kalktı.) İki motor vardı. Sunucudaki `plan/kurallar.ts` `oner` asıl planı kurar: planlama çerçevesi sırayı `POST /plan/kuyruklari-yaz` ile yazar,
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

1. **Tek motor kodu.** Motor dosyaları tek kaynaktır; tarayıcı ve sunucu aynı dosyaları kullanır. Yeri ve sahibi ADR 0020'dedir
   (`sunucu/moduller/plan/motor/`).
2. **Sunucuda çalışma.** `plan-motoru.ts`: motor `node:worker_threads` iş parçacığında, boş `vm` bağlamında koşar; olay döngüsünü tutmaz.
   Aynı anda tek çözüm, süre sınırı (`COZUM_SURESI_MS`), süre aşılınca ya da iş parçacığı çökünce ret. Dış çağrı ve yeni paket yok.
3. **Son söz sunucuda.** Tarayıcı önizler (deneme, stüdyo, senaryo; aramalı). Taslağa yazan komutta (kuyruk yaz) sunucu motoru aramasız
   kipte (`sabit`: tabandaki tezgâh sırası korunur; `yeni`: kuraldan) yeniden koşar ve kendi sonucunu yazar. Aynı girdi her koşuda aynı
   planı verir. Önizlemeyle sunucu sonucu farklıysa cevap farkı döner. Canlıya alma motoru koşmaz (762 b): onaylanan taslağın saatleri
   aynen yayınlanır; taslak yazıldıktan sonra zaman geçse de yeniden dizilmez. Geçmişte kalan başlangıç terminalde gerçek saatle kaydedilir.
   Vardiyası tanımsız tezgâhtaki taslak yeri (168 b) canlıya geçmez; sunucu bunu tezgâhın takviminden okur.
   Plan varken planın girdisini değiştiren değişiklik çalışmada bekler (755 a); atölyede uygulanınca sunucu motoru kayıtlı planı taban
   alıp yalnız o değişikliğin etkilediği işleri yeniden dizer (`plan-uygula`), kilitli ve donuk işler yerinde kalır. Bekleyen varken onaya
   gönderilmez. Plan iyileştirme ("Plan iyileştirme ara") ayrı ve pasiftir.
4. **Kalan tek kaynak (391 a).** Çalışan adımın kalanını yalnız plan modülü hesaplar (396 a standart birim süre, 397 a hurda adım bitince).
   Motorun gerçekleşen kaydı `{ m, S, kalan, sayim }` taşır: `kalan` verimli çalışma saati, `sayim` son sayım anı (yoksa başlama). `kalan`
   varsa motor bitişi `sayim`dan takvimle `kalan` kadar ilerletir; yoksa bugünkü yol sürer (elle giriş, deneme).
5. **Bağ.** Plan motoru ithal etmez: `plan/disari.ts` `planMotoruCozucusu` kaydını tanımlar (ADR 0006 madde 6), Reçete ve Rota karşılığını
   verir, bağ `sunucu/kablolama.ts`'te kurulur. Plan çözücüye isteği verir (kip, şimdi, kuyruklar, çalışan adımlar); motorun girdisini
   Reçete ve Rota kurar, iç biçimi dışarı açılmaz.
6. **Kıyas.** `oner` kalktığı için (1381 a) iki motor kıyası yoktur; motor değişikliği kıyas setiyle denenir (kart 1475).
7. **Kişi işi (1888 b).** Motor önerisinde (`yeni` kip) kişiye yerleşen adım da dizilir: rotada kaynağı kişi olan adım ve makinesi olmayan
   istasyonun adımı. İnsanlı istasyon, istasyon kartında kapasite kaynağı "insan" olan istasyondur (1891 A b); alanı boş istasyon makine
   sayılır. İnsanlı istasyon makineleri olsa da kişilere açılır: istasyonda bugün yetkin ve vardiyası olan kişiler, yani terminalin iş
   başlatmayı kabul ettiği kişiler (1891 B a). Kapasite kaynağı insan olmayan ve makinesi olmayan istasyonun adımı adaysız kalır. Terminal
   makinesiz istasyonda aynı anda birden çok el işi açtırır (1891 teyit-2 a); bu yüzden istasyonun işleri yetkin kişilerin el
   tezgâhlarına paralel dizilir, istasyonun kapasitesi bu kişilerin vardiyalarının toplamıdır. Motor girdisinde her aday kişiye kendi vardiyasıyla çalışan bir "el tezgâhı"
   kurulur (`motor/emirler.betik`); personel kısıtı açıkken tezgâhın tek operatörü o kişidir, böylece kişi aynı saatte hem baktığı makinede
   hem el işinde gösterilmez ve devamsızlığı sayılır. Sonuç plana kişi kaynağıyla yazılır; şema ve ortak sözleşme değişmez. Bölünmüş ve elle
   sıralı iş motorla dizilmez (1409 a sürer): yeri varsa yerinde kalır, yoksa nedeniyle yerleşmez. Kuyruk yazımı (`sabit` kip) değişmez.

## Vazgeçilenler

- Motoru TypeScript'e yeniden yazmak (364 a).
- Tarayıcının hesapladığı saatleri sunucunun doğrudan yazması (354).
- Motorun kalanı kendi hesaplaması (deneme sürümündeki `adetKalan`; 391 a ile çelişir).
- Motorun istemci klasöründe kalıp sunucunun oradan okuması; `paylasilan` altına alınması (çekirdek şeridi, sahiplik bölünür).

## Sonuçlar

- Canlıya alma (356 b) ayrı karardır; `oner` yolu 1381 a ile kalktı.
- Sunucu motorunun aramasız kipleri HiGHS kullanmaz; yıllık çözücü (`sunucu/moduller/plan/yillik-cozucu.ts`) `highs` paketiyle çalışır (361 b).
- Plan sonuçları değişir (iki motor aynı planı vermez); plan testleri kıyastan sonra güncellenir.
