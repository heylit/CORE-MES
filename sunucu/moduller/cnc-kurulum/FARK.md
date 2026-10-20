# cnc-kurulum: fark

Depoda karşılığı olmayan yeni modül; silinen ya da değişen modül dosyası yok. Taban: `main` b610f0f.

## Eklenen
- `sunucu/gocler/20261012172817_cnc_kurulum_kayit.sql` (teslimde `20261012110000`; main'deki göçle çakıştığı için oturtmada yeniden damgalandı): `cnc_kurulum_kayit` (anahtar başına kayıt, jsonb), `cnc_kurulum_surum` sayacı.
- `sunucu/moduller/cnc-kurulum/`: `uclar.ts`, `servis.ts`, `sorgular.ts`, `kurallar.ts`, `disari.ts`, testler, `UYGULA.md`, `UYUM-BORCU.md`, `ORTAKLIK-cnc-kurulum.md`.
- `paylasilan/sozlesme/cnc-kurulum.ts`, `paylasilan/islemler/cnc-kurulum.ts`, `paylasilan/sayfalar/cnc-kurulum.ts`.
- `istemci/src/moduller/cnc-kurulum/`: `CncKurulumCercevesi.tsx`, `cerceve-kopru.ts`, `kopru.ts`, `rotalar.tsx`, `cnc-kurulum.css`, testler.
- `istemci/src/moduller/cnc-kurulum/cerceve/cnc-kurulum-motoru.html`: prototip, bayt bayt aynı
  (2. sürüm, sha256 `22739c63e3d7de093aa8c0a566702e84ce257af8e3c7edaa439da7b67eba12ac`, 12 307 958 bayt).

## Prototipe göre
Prototip dosyası değişmedi. Açılışta yalnız iki şey eklenir: içerik politikası ve köprü betiği. Görünüm, yerleşim, kullanım ve
özellikler aynıdır (8 ekran: Ana Sayfa, Kurulum, Hazırlık, Kütüphane, Ham Malzeme, Oto-CAM, G-Kod Sim., Takım Ömrü; dışa aktarım ve yazdırma dahil).

- Veri: prototip bütün durumunu tarayıcıda tek anahtarda (`cnc-kurulum-motoru.v1`) tutuyordu; köprü bu anahtarı TMI veritabanına
  yazar. Kayıt atölyede ortaktır (herkes aynı kütüphaneyi, stoğu, takım ömrünü görür), sürüm denetimlidir.
- Yeni uyarı (yalnız hata anında): başka biri aynı anda değiştirdiyse "sayfayı yenileyin", kayıt 1 MB'ı aşarsa (çok büyük NC
  programı) "kaydedilemedi". Prototipte bu durumlar sessizdi.
- Yazma işlemi olmayan kişide (kalite, bakım) ekran aynı çalışır; değişiklikler yalnız açık sekmede kalır.
- Yazı tipi sistemin yazı tipidir (prototip de öyle). Dış istek yok.
- 2. sürümde Oto-CAM ve ayar süresi ekranlarındaki kaynak bağlantıları (makale ve forum adresleri, yeni sekmede açılan) çerçevede açılmaz;
  çerçeve açılır pencereye izin vermez. Metin ve hesap aynıdır.

## 2. sürüm (12.10.2026, kart #897)
Yalnız prototip dosyası değişti. Yeni: Oto-CAM ekranı (parça, bağlama, takım yolu, NC programı; torna, freze, torna-freze),
ayar süresi, sığma kontrolü, ilk ürün muayenesi, malzeme davranışı bölümleri; üç gömülü örnek STEP parçası (Open CASCADE ile üretilmiş,
müşteri ya da parça adı yok). Saklama aynı: tek anahtar `cnc-kurulum-motoru.v1`; Oto-CAM ayarları `cam` alanında. Sunucu, göç,
köprü ve rol satırları değişmedi. Teslimdeki simge `bolt` alınmadı; `rotate` kalır.

## 3. sürüm (13.10.2026, kart #952)
Yalnız prototip dosyası değişti (sha256 `bd0d1349977e2b11ed0ed7b090e8ac7066587222bf14cacb571eb14546c7bde0`, 12 336 137 bayt).
Sunucu, göç, rol, köprü (`cerceve-kopru.ts`, `kopru.ts`) ve çerçeve bileşeni değişmedi. Saklama aynı: tek anahtar `cnc-kurulum-motoru.v1`;
yeni alanlar `stock.axis = 'auto'`, `stock.idAllow`, `stock.idStep`, `stock.idMan`, `stock.axV`, `cam.route`, `cam.routeKey`, `cam.rt`
(birkaç yüz bayt). `CNC3D`, `CNCDATA` ve `CNCDATA.MACHINES` aynı. Dış istek, yeni paket ya da CDN yok.

1. STEP'e sadakat (Ham Malzeme)
   - Eksen seçiminde X'in Z'ye düşmesi giderildi.
   - Torna ekseni "Otomatik" (yeni varsayılan): her eksende kesitler alınır, dairesel kesit oranı en yüksek eksen seçilir; elle X, Y, Z yine seçilebilir.
   - Çok gövdeli STEP: en büyük hacimli gövde parça olur, gövdeler sonuç kutusunda listelenir, biri ya da "hepsi birlikte" seçilir.
   - Sonuçta yeni satırlar: dönme ekseni (otomatik / elle, dairesel kesit oranı) ve geometriden yöntem.
2. Boru (içi boş çubuk)
   - Ham türüne "Boru" eklendi. Dış çap çubuk listesinden gelir. İç çap, parçanın boydan boya deliğinden iç çap payı düşülerek bulunur ve iç çap adımına (varsayılan 1 mm) aşağı yuvarlanır; elle de girilebilir.
   - Delik yoksa uyarı verilir ve dolu çubuk gibi hesaplanır.
   - Ağırlık, talaş ve fiyat içi boş hamla hesaplanır.
   - Torna programında alın tornalama iç çapta biter, matkap delmesi yapılmaz ve kaba delik tornalama iç çaptan başlar.
   - Torna-freze tezgâh simülasyonu içi boş hamla başlar.
   - Yeni örnek: "Örnek burç (boru)", Ø60 × 80, iç Ø32.
3. Tezgâh otomatik seçimi (Oto-CAM)
   - Her rota için bütün tezgâhlar ön sığma ölçüsünden geçer. Tornada ölçülenler: çap, boy, ayna, iş mili deliği, kontrol. Frezede ölçülenler: X/Y/Z kursu, tabla, yük, mengene.
   - Liste sıralıdır: sığanlar önce, uyarısı az olan, sınırının %85'ini aşmayan, sonra en küçük sığan. İlki önerilir; "Seç" tek tıkla seçer.
   - Sığmayanın nedeni satırda yazar. Programa bağlı denetimler (takım uzanımı, Y kursu) program üretilince Sığma kontrolü'nde kalır.
4. Yöntem geometriden, üç rota (Oto-CAM)
   - Yöntemi ham türü değil parça geometrisi belirler: dönel değil ise freze, dönel ise torna, dönel ve freze yüzeyi en az %1,5 ise torna-freze.
   - Parça yüzeyleri renklenir: mavi torna, turuncu freze.
   - Üç rota kartı: (A) torna + ayrı freze tezgâhı, (B) tek bağlamada torna-freze, (C) bloktan freze. Her kartta tezgâh, bağlama sayısı ve süre yazar.
   - "Üç rotayı hesapla ve karşılaştır" üçünü sırayla üretir. Kullanıcı bir kartı seçer; program ve tezgâh o rotaya göre üretilir.
   - Rota yalnız motorda kalır; rota modülüne kayıt yazılmaz (karar 2-a).

Doğrulama (tarayıcıda, çerçevesiz prototip):
- Örnek mil X ya da Y'ye döndürüldüğünde ham yine Ø85 × 130 çıkar.
- Burç: boru Ø65 × Ø28 × 90 1,909 kg, dolu çubuk 2,344 kg; programda delme yok, alın X26'da biter.
- Torna-freze örneğinde: A 6 bağlama 8:01, B 2 bağlama 7:52 (önerilen), C 3 bağlama 44:22.
- Ø180 çubukta tezgâh listesi nedenleriyle çıkar.
- 360, 768 ve 1280 genişlikte yatay taşma yok ve sayfa hatası yok.
- `test:modul -- cnc-kurulum`: sunucu 14/14, istemci 12/12.

## Toplu aktarım (kart #1196, 14.10.2026)
- İkinci menüye "Çizim Merkezi'ne aktar" (`/cnc-kurulum/aktar`, işlem `cizimler.yaz`). Prototip görünmez çerçevede `toplu` kipte açılır
  (düğme yok, kayıt yazmaz), makine listesini yollar ve kabuğun istediği makinenin GLB'sini üretir. Satırda sistemdeki istasyon seçilir
  (makine numarası istasyon koduyla aynıysa önerilir); eşleşen model yayına alınır (kullanıcı kararı: doğrudan yayınla; `cizimler.yayinla`
  yoksa taslak kalır) ve istasyona bağlanır. Üst çubuktaki tek makine aktarımı aynen kalır; sonraki adımlar Çizim Merkezi'ndeki eşleştirmeyi gösterir.

## Köşe düğmesi toplu aktarımı açar (kart #1238, 14.10.2026)
- Kullanıcı bildirimi: motordan yalnız tek model alınabiliyordu (köşe düğmesi gizli Kurulum > Tezgâh seçimindeki makineyi aktarıyordu),
  toplu aktarım sayfası fark edilmemişti (kullanıcı kartı "Sayfayı görmedim").
- Üst çubuğun sağ köşesindeki düğme artık model üretmez; toplu aktarım sayfasını açar, prototipte seçili tezgâh işaretli gelir
  (`/cnc-kurulum/aktar?makine=<id>`). Üst çubuktaki tek makine aktarımı ve sonraki adımlar kutusu (AktarimTarifi) kalktı.
- "Sistemdeki makine" listesi İstasyonlar'daki kayıtlardır. Eşleşmeyen işaretli satırda nasıl açılacağı (tezgâh koduyla) ve İstasyonlar
  bağlantısı yazar (`sayfa.istasyonlar` taşıyana); sistemde hiç istasyon yoksa sayfanın altında uyarı çıkar. Aktarım sayfasından
  istasyon açılmaz (kullanıcı kartı "Hayır, bağlantı"); istasyonlar modülüne istek yok.

## Eşleştirme Çizim Merkezi'nde (15.10.2026)
- Kullanıcı isteği: CNC Kurulum'daki makineler doğrudan Çizim Merkezi'nde görünsün, eşleştirme orada yapılsın; "Çizime aktar" kalksın.
- Toplu aktarım sayfası Çizim Merkezi'nin "CNC makineleri" bölümü oldu (`/cizimler/cnc-makineleri`, ikinci menüde, `cizimler.yaz`).
  Ekran bu modülde kalır (modeli prototipin kütüphanesi üretir; cnc-kurulum zaten cizimler/disari.ts'yi ithal eder, ters ithal döngü olurdu).
- Satır makinenin Çizim Merkezi'ndeki durumunu gösterir (aynı adlı 3B model belgesi ve bağlı istasyon); var olan eşleşme seçili gelir.
- CNC ikinci menüsündeki "Çizim Merkezi'ne aktar" maddesi ve çerçevenin köşe düğmesi kalktı; eski `/cnc-kurulum/aktar` adresi yeni sayfaya
  seçili makineyle yönlenir. Yeni yetki, göç ya da sunucu değişikliği yok.

## Değişen onaylı karar
- Kart #1084 "aktarım taslak açar": eşleştirilen modelde yayına alınır (kullanıcı kararı, kart #1196). Eşleştirmesiz aktarım taslak kalır.
- Operatöre verilmedi (kart #713 kararı: operatör yalnız terminal ve kuyruğu görür).
