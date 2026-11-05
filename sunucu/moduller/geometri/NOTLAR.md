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
- Özellik tanıma (2044, 1923 b): aynı libcascade okumasında yüz komşuluğu (`TopExp.MapShapesAndAncestors`) ve kenar türü
  (`ChFi3d.DefineConnectType`: içbükey, dışbükey, teğet; 1 dereceden küçük kırılma teğet) çıkar; kural `kurallar.ts`
  `ozellikleriTani` saftır. Yüz sırası şeklin yüz dizinindedir (`TopExp.MapShapes`, aynı yüz bir kez); `geometri_yuz.sira` ve
  `geometri_ozellik.yuzler` bu sıradır. Delik derinliği girişten dibe eksen boyudur; çapraz delikle kesilen ya da iki duvardan geçen aynı
  çaplı delik tek delik sayılır (matkap tek geçer). Eğik delik de tanınır (eksen yönünden bağımsız; `GEO-OZ9`). Tanınmayan: cep, kanal, basamak, diş,
  tolerans (PMI); düzlem pah yalnız iki düzlem arasında. Ölçüler yalnız sentetik modelle denendi; gerçek dosyada oran bilinmiyor.
- Montaj ağacı (kart 2109, M1; 2101-1 b): occt-import-js'in aynı okumasından (`root`), ek okuma ve paket yok. Düğümler montajdır, parçalar
  düğümün ağlarıdır; ağ konumları dünya koordinatındadır (yerleşim uygulanmış; paketin CAx-IF as1 örneğiyle ve `montajStep` ile denendi).
  Alt düğümü olmayan tek ağlı düğüm parçanın kendisidir: bazı yazıcılar parçayı düğüm yapar ve ağa genel ad verir (as1_pe_203'te ağ adı
  "SOLID"). Tersi de var: birden çok ağlı düğümde ağ adları genel kalabilir. Bileşen listesi okumada hesaplanır (ad ve döndürülmüş kutu,
  hacim). Alt montajın kendisi bileşen listesinde satır değildir; adedi ağaçtan sayılır. Yerleşim dönüşümü (matris) tutulmaz; patlatma
  (2098 H3) için dünya kutusu var. Ölçüler yalnız öneri (2101-2 b): gerçek montaj dosyasıyla denenmedi.
- Dosya sağlık raporu (kart 2143, 2140-1 a): aynı libcascade okumasında `ShapeAnalysis_FreeBounds` (0,001 mm dikiş) açık kenar ve sınırı,
  `BRepCheck_Analyzer` şekil ve (şekil geçersizse) yüz geçerliliğini, `BRep_Tool.Tolerance` en büyük kenar toleransını, kenar boyu kısa kenarı,
  STEP'te `FileUnits` dosya birimini verir; IGES birimi global bölümden saf kuralla okunur. Ölçüm okuyucunun kendi onarımından sonradır:
  STEP okuyucusu (FromSTEP sırası) yüzeyi kenardan kaymış yüzü geçerli yapar ama kenar toleransını kayma kadar büyütür (5 mm kaymada 5 mm
  ölçüldü); bu yüzden tolerans bulgudur. Onarımdan sonra geçersiz kalan yüzü üreten sentetik dosya bulunamadı: geçersiz yüz yolu yalnız saf
  kural testiyle denendi. Değerlendirme (`saglikDegerlendir`) okumada yapılır, eşikler kayıtta değil kuraldadır. Sağlık ölçümü yüz
  sınırından (`YUZ_EN_COK`) bağımsızdır. Gerçek dosyayla denenmedi.
