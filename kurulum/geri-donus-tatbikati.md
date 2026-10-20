# Geri dönüş tatbikatı

Yedeğin gerçekten geri yüklendiğini ve bozuk bir güncellemeden eski hale dönülebildiğini canlıdan önce bir kez, sonra üç ayda bir
denemek için. Tatbikat sunucu bilgisayarında yapılır; gerçek veri varsa önce aşağıdaki "Gerçek veri varken" bölümünü okuyun. Komutlar
depo klasöründe, PowerShell'de koşulur. Yedeğin nasıl alındığı ve geri yüklendiği `kurulum/yedek.md`'de, sunucunun açılıp kapanması
`kurulum/servis.md`'dedir; bu belge yalnız sırayı ve neye bakılacağını verir.

Bu adımlar Windows'ta henüz denenmedi; komutların kendisi Linux'ta PostgreSQL 16 ile denendi (`kurulum/yedek.md`).

## Gerekenler

- `npm.cmd run yedek` ve `npm.cmd run geri-yukle` çalışıyor olmalı: `.env`'de `TMIV2_PG_GOC_USER`, `TMIV2_PG_GOC_PASSWORD` ve
  `TMIV2_YEDEK_ANAHTARI` dolu, pg_dump ve pg_restore bulunuyor (`kurulum/yedek.md`, Kurulum 2 ve 3). Yedekler şifrelidir; tatbikat
  bilgi işlemde saklanan anahtarın `.env`'dekiyle aynı olduğunu da sınar: emin değilseniz önce "Deneme geri yüklemesi"ni yapın.
- Saat ölçümü için bir kâğıt ya da not. Tatbikatın amacı süreyi de bilmektir: sunucu ne kadar kapalı kalır?

## 1. Başlangıç durumunu not edin

1. Uygulamada birkaç sayı not edin (aşağıdaki tabloya): Kişiler ekranındaki kişi sayısı, Stok'ta bir malzemenin miktarı, Üretim
   Emirleri'nde açık emir sayısı.
2. Sunucuyu durdurun (bekçi penceresinde Ctrl+C ya da pencereyi kapatın). Saati not edin: kesinti burada başlar.
   Sunucunun gerçekten kapandığını görün: bekçi penceresi kapanmış olmalı ve şu komut `TcpTestSucceeded : False` yazmalıdır
   (`True` ise sunucu hâlâ açıktır; Görev Yöneticisi'nde kalan `node` süreçlerine bakın):
   ```
   Test-NetConnection -ComputerName 127.0.0.1 -Port 4100 -InformationLevel Detailed
   ```
3. Yedek alın:
   ```
   npm.cmd run yedek
   ```
   Çıktıdaki dosya yolunu not edin (`Yedek alındı: ...`).

## 2. Veriyi bozun ve geri yükleyin

1. Sunucuyu açın (`npm.cmd run bekci`). Bir deneme kaydı ekleyin: örneğin yeni bir kişi "Tatbikat Deneme". Not ettiğiniz malzemeden
   stok çıkışı yapın. Bu, "yedekten sonra olan ve geri yüklemede kaybolacak" değişikliktir.
2. Sunucuyu durdurun ve 1. bölümdeki gibi kapandığını görün. `geri-yukle` "Sunucu açık" derse sunucu kapanmamıştır; kapatıp
   yeniden deneyin.
3. Geri yükleyin (komut veritabanı adını yazmanızı ister ve önce bugünkü hali ayrıca yedekler):
   ```
   npm.cmd run geri-yukle -- <1. bölümde not ettiğiniz yedek yolu>
   npm.cmd run goc
   ```
4. Sunucuyu açın. Saati not edin: kesinti burada biter. Açılış çıktısında derlemenin ne kadar sürdüğünü de not edin (`built in ...`
   satırları; derleme atlandıysa "güncel, derleme atlandı" yazar). Tatbikatta (Linux) derleme kesintiye yaklaşık 35 sn ekledi.
5. Bakın:
   - Not ettiğiniz üç sayı başlangıçla aynı mı?
   - "Tatbikat Deneme" kişisi yok mu, stok çıkışı geri alınmış mı?
   - Giriş yapılabiliyor mu, ana sayfa açılıyor mu?

## 3. Kodla birlikte geri dönüş (bozuk güncelleme)

Güncellemeden sonra uygulama açılmıyorsa ya da göç bozulduysa kod ve veri birlikte güncelleme öncesine döner. Yedek, döndüğünüz
kodla aynı anda alınmış olmalıdır: yeni şemalı yedek eski koda yüklenmez. Bu yüzden bu bölüm sıradaki gerçek güncellemeyle yapılır.

1. Güncellemeden önce, sunucu kapalıyken bugünkü sürümü ve yedeği not edin:
   ```
   git rev-parse --short HEAD
   npm.cmd run yedek
   ```
2. Güncellemeyi her zamanki gibi yapın (`kurulum/guncelleme.md`): `git pull`, `npm.cmd install`, `npm.cmd run goc`, sunucuyu açın,
   açıldığını görün.
3. Şimdi güncelleme bozuk çıkmış gibi geri dönün. Sunucuyu durdurun, saati not edin:
   ```
   git checkout <1. adımda not ettiğiniz sürüm>
   npm.cmd install
   npm.cmd run geri-yukle -- <1. adımdaki yedek>
   npm.cmd run goc
   ```
   Sunucuyu açın, saati not edin, giriş yapın ve 1. bölümdeki üç sayıya bakın.
4. Güncel sürüme yeniden geçin:
   ```
   git checkout main
   npm.cmd install
   npm.cmd run goc
   ```
   `git checkout` "your local changes would be overwritten" derse durun ve yardım isteyin; dosyaları silmeyin.

## 4. Sonucu yazın

| Ne | Beklenen | Görülen |
|---|---|---|
| Kişi sayısı | başlangıçla aynı | |
| Malzeme miktarı | başlangıçla aynı | |
| Açık emir sayısı | başlangıçla aynı | |
| Deneme kaydı | yok | |
| Sunucu durdurulunca 4100 kapandı mı | evet (`TcpTestSucceeded : False`) | |
| Kesinti süresi (2. bölüm) | | |
| Bunun derleme süresi | | |
| Kodla geri dönüş (3. bölüm) açıldı mı, süresi | evet | |
| Hata iletisi (varsa, aynen) | yok | |

Sonucu tarihiyle saklayın. Bir satır beklenenden farklıysa tatbikat başarısızdır: o yedeğe güvenilmez; çıktıyı ve hata iletisini
olduğu gibi iletin.

## Gerçek veri varken

- Tatbikatı mesai dışında yapın: sunucu 2. ve 3. bölümde kapalıdır.
- 2. bölümün 1. adımındaki deneme değişikliği gerçek veriye yazılır ve geri yüklemeyle silinir; yalnız deneme kaydı yapın, gerçek iş
  girmeyin. Tatbikat sırasında başka kimse uygulamayı kullanmasın: yedekten sonra girilen her şey kaybolur.
- Asıl veritabanına hiç dokunmadan yalnız yedeğin açıldığını görmek isterseniz `kurulum/yedek.md` "Deneme geri yüklemesi" yeterlidir;
  ama o, kesinti süresini ve kodla geri dönüşü ölçmez.
