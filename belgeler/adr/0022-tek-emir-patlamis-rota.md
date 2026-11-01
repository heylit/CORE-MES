# ADR 0022 — Tek üretim emri çok katmanlı reçeteyi taşır; patlamış rota donmuş kopyadır

Durum: kabul (kart 1517, 1500-c; kullanıcı kararı 01.11.2026: ADR 0022 taslağına "Onay"). Dayandığı kararlar: 01.11.2026 kapsam kararı (tek üretim emri çok katmanlı
reçetenin tamamını karşılar, patlamış rota tablosu), 1481 a (donmuş anlık görüntü), 1482 a (yarı mamul ara stok hareketi olmadan akar),
1483 a (stoktan karşılanan düğüm emirden çıkar), 1484 a (emir içi op_no yeniden numaralanır, rotadaki numara `kaynak_op_no`'da),
"1476 teyit" (göç ve dolu tablo). Kod kart 1476 ile main'dedir (göç `20261031207000`, `20261031208000`).

## Bağlam

- Reçete rota adımının bileşenidir (`rota_bileseni`). Bileşen kendi rotası olan bir ürünse (yarı mamul) emir açılırken açılmıyordu:
  emir yalnız kök ürünün rotasını kopyalıyordu.
- `uretim_emri.ust_emir_id` vardır ve "bölünmüş parti" anlamındadır; alt parça için ikinci bir emir bağı bu sütunu kullanamaz.
- Emir içinde `UNIQUE (uretim_emri_id, op_no)` vardır ve `op_no`'yu "emrin ürününün rotasındaki numara" sayan kod çok modülde geçer
  (stok, plan, arkon, etiket-merkezi, kalite-merkezi, sevkiyat). Dolu tablonun kısıtını değiştirmek bütün bu yerleri birden kırar.
- Emir içi adım bağı zaten yönlü ve döngüsüzdür (`uretim_emirleri_is_emri_onculu`, dal tablosu); alt parçanın son adımını üst parçanın
  tüketen adımına bağlamaya yeter.
- Reçete ve emre kopya rota modülündedir; Reçete ve Rota modülü rotaya bağımlıdır (ADR 0006 madde 1), emir açılışı onu okuyamaz.

## Karar

1. **Tek emir.** Çok katmanlı reçetenin bütün düğümleri tek üretim emrinin iş emirleridir. Alt parça için ayrı emir açılmaz, emirler
   arasında üst-alt bağı kurulmaz; `ust_emir_id` yalnız bölünmüş parti anlamında kalır.
2. **Patlamış rota donmuş kopyadır ve sahibi rota modülüdür.** Kök ürünün rotası, bileşenlerinden yürürlükte rotası olanların rotalarıyla
   yinelemeli açılır; bütün katmanların adımları tek düz tabloda saklanır: `rota_patlatma` (kök, kök revizyonu, kullanılan revizyonların
   özeti, kişi, zaman) ve `rota_patlamis_rota` (adım başına satır: düğüm yolu, katman, malzeme, revizyon, rota adımı, `kaynak_op_no`,
   `birim_carpani`, tüketen düğüm ve adım). İki tablo yalnız eklenir (`yalniz_ekleme()` tetiği). Aynı revizyon kümesi aynı patlatmayı
   kullanır (`UNIQUE (kok_rota_revizyonu_id, ozet)`). Alt parçanın revizyonu sonra değişirse açık emir etkilenmez; yeni emir yeni patlatmayı
   alır. Ham malzeme satırı kopyalanmaz: ihtiyaç rota adımının bileşenlerinden birim çarpanıyla okunur.
3. **Emir içi numara tekil kalır.** Kök adımlar rotadaki `op_no` ile, alt düğüm adımları kökün en büyük numarasından sonraki binlikten
   onar artan yeni numarayla açılır. Rotadaki numara iş emrinin `kaynak_op_no` sütunundadır. Çok katmanlı emirde her iş emri `dugum`,
   `dugum_malzeme_id`, `kaynak_op_no`, `birim_carpani` taşır (dördü birlikte dolu ya da birlikte boş); emir `patlatma_id` taşır.
   Tek katmanlı emirde bu sütunlar boştur ve davranış değişmez.
4. **Akış.** Alt düğüm emirde bir dal olur (`K` + yol, kendi dalı varsa `/` ile); dalın adet çarpanı kök başına adettir (1-1000 tam sayı,
   kesirliyse emir açılmaz). Alt düğümün son adımları, ürününü tüketen üst adımın bekleyen öncülüdür. Alt düğümün ürünü stoğa girmeden
   tüketen adıma akar; tüketen adımın bileşenlerinden çıkar (1482 a). Emir açılırken "stoktan karşıla" seçilen düğüm alt ağacıyla emre
   girmez, ürünü tüketen adımda bileşen olarak kalır (1483 a); kök stoktan karşılanmaz.
5. **Sınırlar.** En çok 5 katman açılır (düğüm yolu emrin 20 karakterlik dal adına sığmalı). Reçete döngüsü, döngüdeki malzemelerle
   reddedilir. Yürürlükte rotası olmayan bileşen satın alınan ya da stoktaki malzeme sayılır; patlatma durmaz. Bileşen firesi adet
   çarpanına girmez; fire adımın fire payıyla karşılanır.
6. **Uç ve yetki.** Çok katmanlı emir var olan `POST /rota/revizyonlar/:id/emre-kopyala` ucuyla açılır (`cokKatmanli: true`, isteğe bağlı
   `stoktanDugumler`); patlatma `GET /rota/patlatmalar/:id` ile okunur. İkisi de `rota.emre-kopyala` işlemini ister; yeni işlem yoktur.
7. **Geçiş koruması.** Okuyan modüller düğümü tanıyana dek çok katmanlı emir yalnız taslak açılır; plana alma, bölme, birleştirme,
   birleşme planı ve yürürlükteki rotayı yeniden uygulama 409 döner. Taslak koşulu ve plana alma koruması stok (1476-C) ve plan motoru
   (1476-D) düğümü okuyunca kalkar.

## Sonuçlar

- Emrin `op_no`'sunu rotaya geri eşleyen her modül (stok, plan, arkon, etiket-merkezi, kalite-merkezi, sevkiyat) çok katmanlı emirde
  `dugum_malzeme_id` + `kaynak_op_no` kullanmalıdır; tek katmanlı emirde bugünkü yol sürer. Bu işler 1476-C, 1476-D ve 1476-E kartlarıdır.
- Stok statüsü ve tüketimi düğümün malzemesiyle çözülmedikçe (1476-C) çok katmanlı emir atölyeye çıkamaz; madde 7 bu yüzden vardır.
- Patlatma silinmez ve değişmez; yanlış patlatma yeni revizyonla yeni patlatma olarak düzeltilir. Tablo zamanla büyür.
- MRP (1472) ihtiyacı aynı patlatmadan okur; ikinci bir patlatma kurulmaz.
- Ekran ("Patlamış rota" görünümü, emir açılışında çok katmanlı seçimi) prototip onayıyla ayrıca gelir (1476-F).
- Reddedilen yollar: alt parçaya ayrı emir ve emirler arası üst-alt bağı (kapsam kararı); alt revizyon değişince yeniden hesaplanan canlı
  tablo (1481 b); her yarı mamulün stoğa girip stoktan tüketilmesi (1482 b); `op_no`'nun rotadaki gibi kalıp tekilliğin
  (emir, düğüm, op_no) olması (1484 b: dolu tablonun kısıtı değişir, bütün kullanım yerleri taranır).
