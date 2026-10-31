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
