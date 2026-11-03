# NOTLAR: geometri

- Hesap ayrı Node sürecindedir (1427 a): `surec.ts` fork eder, `hesap-sureci.ts` occt-import-js ile okur. IPC `serialization: 'advanced'`:
  dosya baytları kopyalanır ama metne çevrilmez. Port açılmaz.
- Süreç ve kanal `unref` edilir; iş sürerken kanal `ref` edilir. Böylece sunucu kapanışını beklemez, test süreci iş ortasında çıkmaz.
- Döndürülmüş kutu genel en küçük kutu değildir: aday eksen (model eksenleri ve yüzey ana bileşenleri) sabit tutulup dik düzlemde döner
  kumpas yapılır. Bir ekseni adaylardan birine hizalı parçada (prizmatik, döner, ekstrüzyon) kesindir. Vazgeçilen: yalnız ana bileşen
  (kutu gibi parçada eğik sonuç verdi).
- Hacim ve alan üçgen ağındandır: yuvarlatılmış yüzeyde ağ inceliğine bağlı yaklaşıktır (10 mm yuvarlatılmış küpte 946 mm3); ekran "yaklaşık" yazar.
- Kapalılık, aynı konumdaki köşeler birleştirilerek her kenarın iki üçgende olmasıyla anlaşılır (OCCT yüz başına köşe çoğaltır).
- Analiz revizyon başınadır ve özeti taşır: özet değişmişse (aynı revizyon kimliği başka içerik) ekran analizi göstermez.
- Turda geçici hatayla kuyruğa dönen iş aynı turda yeniden alınmaz (`siradakiIsiAl` `haric`).
- Kesin yüz türü (1984; 1923 b, 1983 a): aynı süreçte libcascade (tek iş parçacıklı derleme) dosyayı ikinci kez okur ve her B-rep yüzünün
  türünü, alanını, yarıçapını, eksenini `geometri_yuz`'a yazar. Ölçüler (kutu, hacim, alan) hâlâ occt-import-js ağındandır; libcascade
  okuyamazsa ya da yüz sayısı `YUZ_EN_COK`'u aşarsa analiz yine biter, yüz özeti null kalır. İki wasm aynı süreçte: ilk iş birkaç saniye
  yükleme alır, bellek NIST AP242 modellerinde 0,6-0,9 GB ölçüldü (eşik 2 GB).
- Emscripten nesneleri çöp toplayıcıyla serbest kalmaz: yüz döngüsünde oluşturulan her nesne `delete` ile bırakılır.
