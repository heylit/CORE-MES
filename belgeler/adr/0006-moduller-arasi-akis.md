# ADR 0006 — Modüller arası akış

Durum: kabul (yön ve döngü); ters yöndeki haber 16.10.2026'da güncellendi (madde 6, kullanıcı kararı "Güncellensin");
katman tablosu 08.11.2026'da araçla girdi (karar 2270-1 a, 2270-2 a); açık madde bekliyor (07.10.2026, kart #167)

## Bağlam

Üretim emirleri bugün üç modüle bağlı; rota, stok ve kalite gelince birçok akışın ortasında duracak.
Modüllerin çoğu dışarıda, birbirini görmeden yazılıyor. Bir işin birden çok modülün kaydını
değiştirdiği akışlarda "kim kimi çağırır" yazılı değildi; sınır aracı yalnız hangi dosyanın ithal
edilebildiğine bakıyordu, yöne bakmıyordu. Karşılıklı çağıran iki modül ayrı ayrı doğru görünür,
birlikte ne ayrı yazılabilir ne ayrı teslim alınabilir.

## Karar

1. **Yön tektir.** Bir modül çifti arasında ithal tek yönde akar. Üstteki modül alttakini çağırır;
   alttaki üsttekini tanımaz. Sunucu modülleri ve istemci modülleri ayrı iki grafiktir, kural
   ikisinde de geçerlidir.
2. **Çok modüllü akışı üstteki modülün ucu başlatır.** Uç, alttaki modüllerin `disari.ts` komutlarını
   kendi transaction'ında çağırır: ya hepsi yazılır ya hiçbiri. Alttaki modül akışın bütününü bilmez,
   yalnız kendi kaydını ve kendi kuralını bilir.
3. **`disari.ts` komutu çağıranın `db`'sini alır.** Kendi transaction'ını açmaz, bağlantı almaz.
   Kendi tablosuna yalnız kendisi yazar; çağıran, alttaki modülün tablosuna SQL yazmaz.
4. **Grafik döngüsüzdür ve araç denetler.** `npm run sinir` modüller arası ithalden iki grafiği
   kurar; doğrudan (a, b, a) ve dolaylı (a, b, c, a) döngüyü, birbirine bağlı modül kümesi başına
   bir kez, kümenin modülleri ve içindeki en kısa yolla raporlar (kural f). Yalnız test
   dosyasından geçen ithal yön sayılmaz: test kurulumu üretimdeki akış değildir. Tip ithali yön
   sayılır: tipini bilen modül o modüle bağlıdır.
5. **Başka modülün yalnız `disari.ts` dosyası ithal edilir** kuralı (ADR 0001, madde 6) istemci
   modülleri için de araçla denetlenir.
6. **Ters yöndeki haber tek kalıpla ve tek yerde bağlanır** (16.10.2026). Alttaki modülün üsttekine
   haber vermesi gerektiğinde (emir bitti, sayım girildi) ya da üstteki bir çözücüye ihtiyaç
   duyduğunda:
   - Haberi veren modül olayı ve kayıt işlevini (`...Dinle`, `...Cozucusu`) kendi `disari.ts`'inde
     tanımlar; dinleyeni tanımaz.
   - Dinleyen modül karşılığını (`...Yansit`, çözücü işlevi) kendi `disari.ts`'inden verir; yüklenirken
     kendini kaydetmez.
   - Bütün bağlar `sunucu/kablolama.ts` içinde, tek listede kurulur. Sunucu, örnek veri yükleyici ve
     sunucu testleri yalnız bu dosyadan kablolanır.
   - Listede iki ucundan biri çalışma anında olmayan bağ varsa hiçbiri kurulmaz ve uygulama açılmaz.
   - Dinleyici, haberi verenin transaction'ında koşar; reddi komutu geri alır. Aynı olayın dinleyicileri
     listedeki sırayla koşar.
   - Test, modül dosyalarının yüklenirken bağ kurmadığını ve listenin eksiksiz olduğunu denetler
     (`sunucu/kablolama.test.ts`).
   Bağların tek kaynağı `sunucu/kablolama.ts`'tir; güncel liste `npm run harita` çıktısındadır (eski özet liste 01.11.2026'da kaldırıldı, 1495 a).
   Yeni bağ ancak bu listeye eklenerek kurulur; davranış ve ekran bu kalıptan etkilenmez.

## Katman tablosu

Karar 2270-1 a ve 2270-2 a (08.11.2026). Madde 1'deki "üstteki" ve "alttaki" bu tabloyla tanımlanır.

1. **Tablo kodda, tek yerdedir:** `araclar/sinir-denetimi.ts` içindeki `KATMANLAR`. Sıra kattır, 0 en alttır.
   ADR tabloyu kopyalamaz; güncel hali o dosyadadır, modülün katı `npm run harita -- --ozet` çıktısında görünür.
2. **Sunucu ve istemci ayrı tablodur.** İki grafik ayrıdır (madde 1); ekran başka modülün bileşenini gömer
   ve sunucu sırasını izlemez.
3. **Modül yalnız kendinden alt kattaki modülü ithal eder** (kural g). Aynı kattakini de ithal etmez: iki
   modül arasındaki yön tabloda yazılı değilse yön yoktur. Yalnız test dosyasından geçen ithal sayılmaz
   (madde 4'teki gibi); tip ithali sayılır.
4. **Tabloda olmayan modül kırmızıdır.** Yeni modül, dış teslim dahil, tabloya kendi katıyla girer.
5. **Tablo değişikliği:** ilk tablo kabul anındaki ithal grafiğinden çıkarıldı (her modül, bağımlı olduğu
   modüllerin en yükseğinin bir üstünde). Yeni modülü eklemek ya da aynı kattaki bir modüle bağ için
   ithal edeni yukarı taşımak teknik iştir, kartla girer. Üst kattaki modüle bağ ters bağdır: önce
   "Döngü çıkarsa" sırası denenir (madde 6 kalıbı dahil); tabloda iki modülün sırası çevrilecekse
   kullanıcıya sorulur.

## Vazgeçilenler

- **Çekirdekte genel olay kaydı** (modül adı verilmemiş olay yayar, kim dinlerse dinler). Bağımlılık
  ithal grafiğinde görünmez olur; çekirdeğe yeni bir yüzey ekler. Yerine madde 6 seçildi: olaylar
  adlı ve türlüdür, bağlar tek dosyada okunur.
- **Modülün yüklenirken kendini kaydetmesi** (16.10.2026'ya kadarki fiili durum). Yükleme sırasına
  bağlıydı; dinleyen modül yüklenmeden koşan süreçte olay sessizce kaçar, çözücüsü olmayan sayım
  statüsüz yazılırdı.
- **Ayrı akış modülü** (akışları taşıyan, bütün modüllerin üstünde duran modül). Akışın ucunu
  sahibi modülden alıp oraya taşımak gerekir; dışarıda yazılan modülün ucu depoda yeniden yazılmış
  olur, bu da gelen modülün esas alınmasıyla çelişir.

## Döngü çıkarsa

Araç yolu yazar; çözüm sırayla denenir:

1. Alttaki modülün üsttekinden istediği şey bir bilgiyse üstteki onu parametre olarak verir; alttaki
   sormaz.
2. Alttaki modül bir işi tetiklemek istiyorsa akış ters kurulmuştur: işi üstteki modülün ucu başlatır
   ve alttakinin komutunu çağırır.
3. İki modül de birbirinin kaydına muhtaçsa ortak kısım ikisinin altındaki bir modüle iner.
4. Hiçbiri olmuyorsa karar kartı açılır; kural gevşetilmez, muaf listesi yazılmaz.

## Açık

Onaylı tasarımda (kart #94 Ç9, kart #36) üretim emirleri yayın denetimi için kontrol planını ve
istasyon kayıtlarını çağırıyor; bu, yön kuralıyla çelişiyor. Kullanıcıya soruldu; cevap gelene kadar
bu modüller arasındaki yön yazılmadı.

## Sonuçlar

- Karşılıklı ithal eden iki modül birleştirmede kırmızı verir; dış teslim oturtulurken döngü ilk
  koşuda görünür.
- Çok modüllü yazma tek transaction'dadır; yarım kalan akış kaydı olmaz.
- Alttaki modül üsttekinin durumuna göre davranamaz; bu bilgi ona parametreyle gelir.
- Kod haritası ile sınır aracı bağımlılığı aynı yerden okur; ikisi farklı şey söyleyemez.
