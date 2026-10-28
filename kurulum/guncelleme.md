# Güncelleme paketini uygulama (kart #1210)

Sunucu internete kapalıdır; yeni sürüm imzalı bir paketle (`.tmip`) gelir. Sistem Ayarları > Güncelleme'de paket yüklenir,
listeden seçilir ve "Uygula" ile kurulur. Kurulumu sunucu değil, sunucuyu açan güncelleyici yapar (`npm run baslat`).

## Nasıl çalışır

1. Yönetici "Uygula"ya basar. Sunucu paketi ve geri gitme kuralını (AY-G1) denetler, güncelleme klasörüne `uygula.json` yazar.
2. Güncelleyici birkaç saniye içinde isteği alır. Önce, eski sürüm çalışmayı sürdürürken:
   - paketin imzası ve içeriği yeniden doğrulanır, AY-G1 yeniden denetlenir;
   - yük `surumler/<commit>.yarim` klasörüne açılır, `.env` kopyalanır, bağımlılıklar paketin taşıdığı npm önbelleğinden
     `npm ci --offline --cache .npm-onbellek` ile kurulur (internete çıkılmaz), önbellek silinir, ekran derlenir; bitince
     klasör `surumler/<commit>` adını alır.
3. Sonra kısa kesinti: eski sunucu durur, veritabanı yedeklenir (`TMIV2_YEDEK_DIZINI`, kurulum/yedek.md), yeni sürümün göçleri
   koşar, yeni sunucu açılır ve sağlık ucu cevap verene kadar beklenir.
4. Sonuç `uygulama-sonucu.json`'a yazılır ve Güncelleme sekmesinde görünür:
   - **Kuruldu**: yeni sürüm çalışıyor. `calisan.json` yeni sürümü gösterir.
   - **Başarısız**: 2. adımda ya da yedekte bozuldu. Veritabanı değişmedi, eski sürüm çalışıyor.
   - **Geri alındı**: göç ya da açılış bozuldu. Yedek geri yüklendi, eski sürüm açıldı.
   - Geri yükleme de bozulursa sunucu kapalı bırakılır ve güncelleyici durur: eski kod yeni şemayla çalışmasın.
     Yedek elle geri yüklenir (kurulum/yedek.md "Geri yükleme"), sonra `npm run baslat`.

Eski sürüm klasörleri yerinde kalır; geri dönüş klasör değiştirmektir. Elle eski sürüme dönülmez (AY-G1): çalışan sürüm,
uygulanmış göçlerin hepsini taşımayan ya da çalışandan eski derlenmiş paket reddedilir.

Aynı paket ikinci kez yüklenemez (commit bazında). Bekleyen istek varken yenisi istenemez.

## Kurulum (sunucuda bir kez)

1. `.env`'e üç değer (ilk kurulum klasöründe; ayarların tek kaynağı budur, sürüm klasörlerine her açılışta kopyalanır):
   ```
   TMIV2_GUNCELLEME_DIZINI=D:\TMIV2-GUNCELLEME
   TMIV2_GUNCELLEME_ANAHTARI=<npm run paket -- anahtar-uret çıktısındaki ortak anahtar>
   TMIV2_YEDEK_DIZINI=E:\TMIV2-YEDEK
   ```
   Yedek klasörü yoksa güncelleme yapılmaz. Güncelleme öncesi yedek de şifrelidir: `.env`'de `TMIV2_YEDEK_ANAHTARI` olmalı
   (kurulum/yedek.md, Kurulum 2); yoksa yedek alınamaz ve güncelleme yapılmaz. pg_dump tam yolla bulunduysa (`TMIV2_PG_DUMP` ya da Windows kurulum klasörü,
   kurulum/yedek.md) `pg_restore` ve `psql` aynı klasörden alınır.
   Geri yükleme göç kullanıcısıyla yapılır (`TMIV2_PG_GOC_USER`, `TMIV2_PG_GOC_PASSWORD`); bu değerler sunucu sürecine geçmez.
2. Sunucuyu `npm run baslat` ile açın. Güncelleme klasörü ve anahtar tanımlıysa güncelleyici açılır ve şunu yazar:
   `Güncelleyici: <klasör> açılıyor (<commit>)`. Tanımlı değilse eski davranış sürer (derle, aç).
3. Güncelleyici açıkken Güncelleme sekmesinde "Uygula" açılır. `npm run sunucu` ile açılan sunucuda "Uygula" kapalıdır.
   Bekçiyle, başlangıç betiğiyle ya da Görev Zamanlayıcı ile açılan güncelleyici de "Uygula"yı yapar (kurulum/servis.md): npm'i
   önce `npm run` ortamında, yoksa Node'un yanında arar (Windows: `<nodejs>\node_modules\npm`; Linux: `<önek>/lib/node_modules/npm`).
   İkisinde de yoksa "Uygula" doğrulama adımında "npm bulunamadı" ile durur, veritabanı değişmez.

## Eski sürümler

Her kurulan sürüm `surumler/<commit>` klasöründe kalır (bağımlılıklarıyla birkaç yüz MB). Sistem Ayarları > Güncelleme'de
"Kurulu sürümler" kartı ve "Yüklenen paketler" tablosu satır başına "Sil" gösterir. Çalışan sürümün klasörü, bekleyen ya da
şu an uygulanan sürüm silinmez; çalışan sürümün paket dosyası silinebilir (kurulumda okunmaz). Güncelleyici isteği aldığında
uygulama bitene kadar `uygulaniyor.json` yazar; ekran o sürede kurulan sürümü "Kuruluyor" gösterir.

## Sınırlar

- Sunucu internete çıkmaz. Paket, lock dosyasındaki bütün npm paketlerini (yalnız sunucunun işletim sistemi ve işlemcisi için)
  `.npm-onbellek` klasöründe taşır; imza bunları da kapsar ve npm her tarball'ı lock'taki bütünlük değeriyle denetler. Lock
  dosyası değişse de kurulum için ağ gerekmez. Önbellek taşımayan eski bir paket "Başarısız" olur, sistem değişmez.
- Paket, paketi hazırlayan makinede `npm run paket` ile yapılır; o makinenin npm kayıt adresine erişmesi gerekir. Sunucu
  Windows x64 değilse `--platform` verilir (ör. `--platform linux-x64`); yanlış platformla yapılan paket hazırlıkta bozulur.
- `@playwright/test` (yalnız ekran testleri) sunucuya kurulmaz: paketteki `package.json` ve lock'tan çıkarılır. Sunucuda
  `npm run ekran` çalışmaz; ekran testleri geliştirme makinesinde ve CI'da koşar.
- Paket boyutu çoğunu npm önbelleği tutar: 2026-10-16'da Windows x64 için 143 MB (önbellek 118 MB, 662 npm paketi).
  Yükleme sınırı 200 MB'tır (`AZAMI_GUNCELLEME`); paket bunu aşarsa ekran yüklemeyi reddeder, sınır çekirdek işidir.
- Kurulum sırasında paket bellekte açılır; sunucuda paket boyutunun birkaç katı boş bellek gerekir (doğrulanmadı, ölçülmedi).
- İlk kurulum git ağacıysa güncelleyici, kurduğu sürümü (`calisan.json`) ağaçtaki koddan önce açar. Ağacı git ile güncelleyip
  o kodu açmak için `calisan.json` silinir.
- Güncelleyicinin kendi kodu ilk kurulum klasöründendir; paketle gelen güncelleyici değişikliği ancak ilk kurulum güncellenince gelir.
- Kesinti süresi: durdurmadan sağlık cevabına kadar (yedek ve göç süresi). Bu ortamda, neredeyse boş veritabanıyla birkaç saniyeydi;
  dolu veritabanında yedek süresi kadar uzar.

## İnternetsiz kanala ilk geçiş (bir kez, elle)

Sunucudaki güncelleyici ilk kurulum klasörünün kodudur; o kod eski olduğu sürece paketi `--prefer-offline` ile kurmaya çalışır
ve lock değişmişse internet arar. İlk kurulum klasörü bir kez elle yenilenir, sonraki paketler ekrandan uygulanır.
Yönetici yetkisi gerekmez; komutlar sunucuyu açan kullanıcıyla koşulur.

Paketi hazırlayan (internetli) bilgisayarda:
1. Depoyu güncel ana dala alın: `git pull`, sonra `npm.cmd ci`.
2. Paketi ve açık klasörünü üretin (klasör yok ya da boş olmalı):
   `npm.cmd run paket -- --anahtar <gizli.pem> --cikti D:\aktar\<sürüm>.tmip --klasor D:\aktar\tmiv2-<sürüm>`
   Çıktıda `npm: ... paket (win32-x64)` ve `Yük açıldı: ...` satırları görünür.
3. `D:\aktar\tmiv2-<sürüm>` klasörünü sunucuya taşıyın (ör. `D:\TMIV2\tmiv2-<sürüm>`). `.tmip` dosyası bu geçişte gerekmez.

Sunucuda:
4. Eski ilk kurulum klasöründeki `.env`'i yeni klasöre kopyalayın.
5. Yeni klasörde bağımlılıkları paketin önbelleğinden kurun; internete çıkılmaz:
   `npm.cmd ci --offline --cache .npm-onbellek --no-audit --no-fund`
   Son satır `added ... packages` olmalı. Hata verirse eski sistem değişmemiştir; durun.
6. Sunucuyu kapatın (`npm.cmd run baslat` penceresinde Ctrl+C).
7. Yeni klasörde: `npm.cmd run yedek`, sonra `npm.cmd run goc`.
8. Güncelleme klasöründeki `calisan.json`'u silin (yoksa güncelleyici eski kurulu sürümü açar).
9. Yeni klasörde `npm.cmd run baslat`. Beklenen satır: `Güncelleyici: D:\TMIV2\tmiv2-<sürüm> açılıyor (commit bilinmiyor).`
   Bu klasör artık ilk kurulum klasörüdür; Windows'ta başlatma kısayolu ya da zamanlanmış görev varsa yolu buna çevrilir.
10. Uygulamada Sistem Ayarları > Güncelleme açılır. Eski ilk kurulum klasörü, yeni sürüm bir gün sorunsuz çalışınca silinebilir;
    geri dönmek için 6. adımdan önceki duruma: yeni klasörü kapatın, yedeği geri yükleyin (kurulum/yedek.md), eski klasörde
    `npm.cmd run baslat`.

`.npm-onbellek` klasörü bu adımlardan sonra silinebilir. Bu adımlar Windows'ta denenmedi; Linux'ta 5. adım internetsiz ağda
denendi (aşağıda).

## Deneme kaydı (2026-10-16, Linux, PostgreSQL 16, internetsiz ağ)

Güncelleyici ve sunucu ağ erişimi olmayan bir ağ ad alanında (`unshare -n`, yalnız yerel döngü) açıldı; npm kayıt adresi
çözülemiyordu. Lock dosyasına yeni bir npm paketi ekleyen B paketi (`--platform linux-x64`, 156 MB, 664 npm paketi) sunucunun
yükleme koduyla yüklendi ve uygulandı.
- `npm ci --offline` paketteki önbellekten 618 paketi 11 saniyede kurdu; yeni paket kuruldu, `@playwright/test`, `playwright`
  ve `.npm-onbellek` sürüm klasöründe yoktu. Yedek alındı, sonuç "kuruldu", sağlık ucu cevap verdi.
- `--klasor` ile açılan klasörde 5. adımdaki komut aynı ağda 618 paketi kurdu.
- Sürüm klasöründeki esbuild kurulum betikleri (`install.js`) internetsiz ağda hatasız bitti.

## Deneme kaydı (2026-10-14, Linux, PostgreSQL 16)

Güncelleyici bir git ağacından açıldı. İki paket yüklendi.
- Ekranda görünür bir metin değişikliği taşıyan B paketi: 2119 dosya açıldı, `npm ci` 18 saniye sürdü, yedek alındı, sonuç
  "kuruldu". Sunucu ve önizleme yeni klasörden açıldı, yeni metin derlenmiş pakette vardı.
- B üstüne iki göç ekleyen C paketi: birinci göç tablo açar, ikincisi `SELECT 1/0` ile bozulur. Sonuç "geri alındı, goc".
  Açılan tablo yoktu, göç kaydı 196'ya döndü, kişi tablosu yerindeydi, B yeniden açıldı ve sağlık 200 döndü.
- Ctrl+C sunucuyu ve önizlemeyi kapattı, `guncelleyici.json` silindi. Yeniden açılışta kurulu sürüm (B) açıldı.

Windows'ta denenmedi.
