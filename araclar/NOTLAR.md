# Araç notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Onaylı lint paketi üç tanedir (JS lint, TS köprüsü, CSS lint); eklenti, hazır kural kümesi ya da geçişli paketi doğrudan ithal yeni bağımlılıktır. Kural tek tek girer; ihlal kural kapatarak giderilmez.
- Kaynağa bakan denetim test olarak yazılmaz; lint ya da sınır aracına girer.
- Tasarım kuralında yalnız onaylı durumlar kırmızıdır: değişken üzerinden gelen hex ve yayma ile gelen stil araçla yakalanmaz, denetçi bakar (eski metin taraması sahte kırmızı veriyordu).
- Sözleşme ithal kuralı "zod ithal eden dosya" diye hesaplanmaz; serbest liste açık yazılır. Listeye eklemeden önce dosyada zod olmadığını doğrula.
- `CI=true` iken TS ayrıştırıcısı tek koşu kipine geçer ve sanal kod yerine diskteki dosyayı
  denetler; lint testi yerelde yeşil, CI'da kırmızı olabilir. Tip bilgili kural sanal dosyada
  çalışmaz; sanal kod var olan bir dosyanın yoluyla verilir.
- Lint seçici ayrıştırıcısı desende eğik çizgiyi kabul etmez; `\x2F` çalışır. İthal yasağı kuralı
  dinamik ithal ve `require` çağrısını görmez, ayrı seçici gerekir. Aynı kural iki yapılandırma
  bloğunda geçerse sonraki öncekini tümüyle ezer.
- Güvenli çağrı seçeneği yalnız ad ve paketle eşleşir; iç içe alt test çağrısı ayrılamıyor.
- Göç damgası: dalda bir göç eskiyse dalın bütün yeni göçleri birlikte yeniden damgalanır; yalnız eskiler yenilenirse dalın kendi sırası ters döner ve sonradan saptanamaz.
- Git Bash: tek başına `/` gibi argümanlar Windows yoluna çevrilir (`MSYS_NO_PATHCONV=1`); tırnaklı
  heredoc ve `sed` ters eğik çizgiyi yutar. Bu makinede `python` ve `bc` yok.
- Mutasyonun uygulandığını göster: eşleşmeyen değiştirme sessizce yeşil bırakır.
- Durum: gh yalnız kart numaralı açık dal varken çağrılır (alt süreç testi bu yüzden kartsız dalla
  kurulur). Kart yokluğu gh'nin hata metninden anlaşılır; metin değişirse "gh yok"a düşer. Commit'siz iş okunmaz.
- Harita: tablo sahibi yazan tek modül, yoksa kuran göç, yoksa satır yazan adlı göçlerin tek modülü (K2: `rol_islemi` kisiler), değilse "belirsiz"; iç içe şablon yanlış bölünür.
- Geçici depo ağacında takma adlı ithal çözülmez; oradaki uç dosyası uç özetini düz nesne verir.
- Ortam (kullanıcı kararı D-N2, D-N4): `.env` görülen ağaçta süreç ortamı kaynak değildir. Farklı değerle koşu (atılacak küme, taşıma denemesi) depo dışı `.env`'siz kopyada: yerel klon ve bağımlılık bağlantısı; worktree ana ağacın dosyasına düşer.
- Veritabanı betikleri. Vazgeçildi: toplu sahiplik devri (önyükleme süper kullanıcısından reddedilir). Deneme
  verisi ASCII: Windows komut satırı bozar. Küme başlatma komutu Windows'ta kabuğu bırakmaz: arka planda başlat.
- Teslim: zip kendi okuyucumuzla bellekte okunur (paket ve sistem aracı yok; Windows arşivleyicisi ters eğik çizgi yazar). Komutlar kabuksuz koşar, betiklerden ve `test-modul.ts`'ten türetilir; `npm`/`npx` Windows'ta kabuk betiği olduğundan paketin giriş dosyası `node` ile çağrılır.
  Test koşucusu içinde test olmayan ya da yüklenirken süreçten çıkan dosyayı dosya adıyla GEÇEN tek test sayar ve sıfırla çıkar; atlanan test de "koşan" sayılır. Sayı yalnız son özet bloğundan, geçen olarak okunur.
- Teslim ağacı: gelen hal ayrı commit olur (oturtma düzeltmeleri sonraki farkta okunur); temizleme zorlamaz, commit taşıyan dal kalır. Windows'ta dosya kopyalama
  kaynağın değişme zamanını taşır: aynı saniyede çekilmiş aynı boydaki dosyayı git değişmemiş sanar; kopyalanmaz, yeniden yazılır.
