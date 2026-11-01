# Sunucunun kendiliğinden açılması ve çökünce yeniden başlaması

Sunucu bugün `npm.cmd run baslat` ile açılan konsol penceresinde koşar: pencere kapanınca, oturum kapanınca ya da süreç çökünce
uygulama kapalı kalır. İki parça bunu kapatır; ikisi de Windows yönetici yetkisi istemez.

## 1. Bekçi: çökünce yeniden başlatır

```
npm.cmd run bekci
```

Bekçi `npm run baslat`'ın koştuğu `araclar/baslat.ts`'i (güncelleyici ve sunucu) npm'siz, doğrudan açar ve izler. Sunucu kapanırsa
(çöküş, bellek hatası, Görev Yöneticisi'nden sonlandırma) bekler ve yeniden açar. Art arda çöküşte bekleme 5 sn'den başlar, her
seferinde iki katına çıkar, 60 sn'de durur; sunucu 10 dakika ayakta kalınca yeniden 5 sn'ye döner.

- Durdurmak: bekçi penceresinde Ctrl+C ya da pencereyi kapatın. Sunucu da kapanır, yeniden açılmaz.
- Günlük: depo klasörünün yanındaki `TMIV2-GUNLUK\bekci.log` (ör. depo `C:\Users\<ad>\Desktop\TMICOREV2` ise
  `C:\Users\<ad>\Desktop\TMIV2-GUNLUK\bekci.log`). Sunucunun ekrana yazdığı her şey ve bekçinin "kapandı, yeniden açılacak" satırları
  buraya da yazılır. Dosya 10 MB'ı geçince `bekci.log.1` adını alır, yenisi başlar.
- Güncelleme (`kurulum/guncelleme.md`) bekçiyle de aynıdır: elle güncellemede önce bekçi penceresini kapatın, sonra `git pull` ve
  öteki adımlar, en son yeniden `npm.cmd run bekci`. Ekrandan paketle güncellemede bekçiye dokunmayın: güncelleyici işaretini
  dakikada bir yeniler, bekçi o sürede sunucuyu kapatmaz; işaret 5 dakika yenilenmezse güncelleyici ölmüş sayılır ve yarım kalan
  uygulamayı yeniden açılan güncelleyici kapatır (kurulum/guncelleme.md "Uygulama yarıda kesilirse").

## 2. Otomatik başlatma: oturum açılınca bekçiyi açar

Depo klasöründe bir kez:

```
npm.cmd run otomatik-baslat -- kur
```

Bu komut kullanıcının Başlangıç klasörüne (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`) `TMIV2-sunucu.cmd` koyar.
Kullanıcı Windows'a giriş yapınca bekçi küçültülmüş pencerede açılır, o da sunucuyu açar.

- Durum: `npm.cmd run otomatik-baslat -- durum`. Kaldırma: `npm.cmd run otomatik-baslat -- kaldir`.
- Depo klasörü taşınırsa ya da Node yeniden kurulursa komutu yeniden koşun: betik iki yolu da tam adıyla tutar.
- Klasör adında `"` ya da `%` varsa betik yazılmaz (Windows komut satırı bu işaretleri yanlış okur).

## Sınır: oturum açılmadan başlamaz

Başlangıç klasörü yalnız o kullanıcı giriş yapınca çalışır. Bilgisayar açılıp kimse giriş yapmazsa ya da kullanıcı oturumu kapatırsa
sunucu kapalıdır. Önerilen düzen: sunucu bilgisayarında bu kullanıcıyla otomatik giriş açık, ekran kilitli; "Oturumu kapat" değil
"Kilitle" kullanılır. Windows güncellemesinden sonraki yeniden başlatmada oturum yeniden açılınca sunucu da açılır.

Oturum açılmadan, bilgisayar açılınca başlayan gerçek Windows servisi:
- yönetici yetkisi ister (servisi kaydetmek, `sc.exe create`, yalnız yönetici yapabilir);
- Node'u servis olarak koşturacak bir sarmalayıcı ister (Node kendisi Windows servis programı değildir). Böyle bir araç depoda
  yoktur; eklemek yeni paket ya da dış araç demektir ve onay ister.
Bu yol seçilirse bilgi işlemin yönetici hesabıyla bir kez kurması gerekir. Paketsiz yol Görev Zamanlayıcıdır (3. bölüm); o da
kurulana kadar yukarıdaki iki parça kullanılır.

## 3. Görev Zamanlayıcı: oturum açılmadan başlatır (bilgi işlem kurar)

Paket gerekmez; Windows'un kendi Görev Zamanlayıcısı bekçiyi bilgisayar açılınca, kimse giriş yapmadan başlatır. Görevi kaydetmek
yönetici yetkisi ister; bilgi işlem bir kez kurar. Bu belgedeki Windows adımları burada denenmedi (doğrulanmadı); ilk kurulumda
aşağıdaki "Deneme" bölümüyle sınanır.

Önce:
- Başlangıç klasöründeki betik kaldırılır, yoksa oturum açılınca ikinci bekçi aynı portu almaya çalışır: `npm.cmd run otomatik-baslat -- kaldir`.
- Görevin çalışacağı hesap seçilir. Önerilen: yalnız bu iş için yerel bir hesap; depo klasörünü okur, depo klasörünün yanındaki
  `TMIV2-GUNLUK` ve yedek klasörüne yazar. Hesaba "Toplu iş olarak oturum aç" hakkı verilir (Yerel Güvenlik İlkesi, Kullanıcı Hakları Ataması).
- PostgreSQL'in kendi Windows servisi "Otomatik" başlar durumda olmalı; bekçi veritabanı açılmadan sunucuyu başlatırsa sunucu
  çöker ve bekçi yeniden dener.

Görev (Görev Zamanlayıcı, "Görev Oluştur"):
- Genel: ad `TMIV2 Bekci`; "Kullanıcı oturum açmış olsun ya da olmasın çalıştır"; kullanıcı yukarıdaki hesap; "En yüksek ayrıcalıklarla çalıştır" işaretlenmez.
- Tetikleyiciler: "Başlangıçta", 1 dakika gecikme (ağ ve veritabanı açılsın diye).
- Eylemler: "Program başlat"; program `node.exe`'nin tam yolu (örnek `C:\Program Files\nodejs\node.exe`); bağımsız değişken
  `araclar\bekci.ts`; başlangıç klasörü depo klasörü. Bekçi depoyu kendi dosya yolundan bulur ve `.env`'i oradan okur.
- Koşullar: "Yalnız bilgisayar AC gücündeyse başlat" kaldırılır.
- Ayarlar: "Görev başarısız olursa yeniden başlat" her 1 dakikada, 3 kez; "Görev şundan uzun çalışırsa durdur" kaldırılır;
  "Görev zaten çalışıyorsa: Yeni örnek başlatma".

Aynı görev komut satırıyla (yönetici komut isteminde; parola komut satırına yazılmaz, `/RP *` sorar):

```
schtasks /Create /TN "TMIV2 Bekci" /SC ONSTART /DELAY 0001:00 /RU <hesap> /RP * ^
  /TR "\"C:\Program Files\nodejs\node.exe\" \"<depo klasoru>\araclar\bekci.ts\""
```

`schtasks` başlangıç klasörünü, yeniden başlatma ve süre ayarlarını vermez; görev oluşunca bu ayarlar yukarıdaki gibi arayüzden düzeltilir.

Deneme:
1. Bilgisayar yeniden başlatılır, kimse giriş yapmaz; başka bir cihazdan sunucu adresi açılır.
2. `TMIV2-GUNLUK\bekci.log` dosyasında başlangıç satırı görülür.
3. Görev Zamanlayıcı'da görevin "Son çalışma sonucu" `0x41301` (çalışıyor) gösterir.
4. Sistem Ayarları > Güncelleme > "Sunucu açılışı" kartı "Kurulu" gösterir. Sunucu görevi kendi hesabıyla
   `schtasks /Query /TN "TMIV2 Bekci" /XML` sorgusuyla yalnız okur (en çok 10 dakikada bir); "Kurulu değil" görünüyorsa görev adı
   farklıdır ya da sunucu hesabı görevi göremiyordur.

Durdurmak: Görev Zamanlayıcı'da görev "Sonlandır"; güncellemeden önce görev sonlandırılır, sonra `git pull`, `npm.cmd install`,
`npm.cmd run yedek`, `npm.cmd run goc` ve görev yeniden "Çalıştır".

## 4. Dış bekçi: sunucu düşünce olay günlüğüne yazar (kart 1665)

Bekçi sunucuyu yeniden açar ama kendisi, bilgisayar ya da vekil düşerse kimse haber almaz; uygulama içindeki uyarı da sunucuyla
birlikte susar. Dış bekçi Görev Zamanlayıcı'nın dakikada bir açtığı tek turluk araçtır: sağlık ucunu yoklar, arızayı Windows olay
günlüğüne yazar ve kapanır. Paket gerekmez. Bilgi işlemin izleme aracı bu olaylara bağlanır (e-posta uyarısı yoktur, 1061 a ve 1618 a).

Ne yoklar:
- Sunucu: `http://127.0.0.1:<TMIV2_PORT>/api/saglik`, her zaman.
- Vekil üzerinden sunucu: `.env`'de `TMIV2_DIS_BEKCI_VEKIL` doluysa (`https://<sunucu adı>`, yalnız şema, ad ve kapı; kurum içi ad
  ya da özel IP). Boşsa yalnız sunucu yoklanır. Vekilin kurum CA sertifikasına Node'un güvenmesi için görev `--use-system-ca`
  ile açılır (Windows sertifika deposu; doğrulanmadı, ilk kurulumda "Deneme" ile sınanır).

Olaylar (Uygulama günlüğü, kaynak `TMIV2`; kaynağın açılması `kurulum/gunluk.md`):
- 300, Hata: art arda 3 turda (yaklaşık 3 dk) cevap yok, beklenmeyen cevap ya da veritabanına ulaşılamıyor (503). Arıza sürdükçe
  saatte bir, nedeni değişince hemen yeniden yazılır. Kısa yeniden açılış (bekçi 5-60 sn) olay yazmaz.
- 301, Bilgi: arızadan sonra sunucu yeniden cevap veriyor; metinde arızanın süresi.
- Bilgisayar açıldıktan sonraki ilk 3 dakikada ve ekrandan güncelleme sürerken yoklama yapılmaz (sunucu bilerek kapalıdır).
- Son durum depo klasörünün yanındaki `TMIV2-GUNLUK\dis-bekci-durum.json`'dadır; silinirse sayım baştan başlar.

Görev (Görev Zamanlayıcı, "Görev Oluştur"; bekçi göreviyle aynı hesap, 3. bölüm):
- Genel: ad `TMIV2 Dis Bekci`; "Kullanıcı oturum açmış olsun ya da olmasın çalıştır"; "En yüksek ayrıcalıklarla çalıştır" işaretlenmez.
- Tetikleyiciler: "Başlangıçta"; "Görevi şu sıklıkla yinele" 1 dakika, "süresince" Süresiz.
- Eylemler: program `node.exe`'nin tam yolu; bağımsız değişken `--use-system-ca araclar\dis-bekci.ts`; başlangıç klasörü depo klasörü.
- Ayarlar: "Görev şundan uzun çalışırsa durdur" 1 dakika; "Görev zaten çalışıyorsa: Yeni örnek başlatma".

Son çalışma sonucu: `0` tur tamam (arıza varsa yazıldı), `1` ayar hatası (`TMIV2_PORT` ya da `TMIV2_DIS_BEKCI_VEKIL`), `2` olay
yazılamadı (kaynak açık değil ya da hesabın izni yok). `2`de aynı olay sonraki turda yeniden denenir.

Deneme: sunucu açıkken `npm.cmd run dis-bekci` hiçbir şey yazmadan `0` ile biter. Bekçi penceresini kapatın, 4 dakika bekleyin; Olay
Görüntüleyici > Windows Günlükleri > Uygulama'da kaynak `TMIV2`, kimlik 300 görünür. Bekçiyi açın; bir iki dakika içinde 301 görünür.

## Elektrik kesintisinden sonra

Bilgisayar yeniden açılınca sunucu kendiliğinden gelmez; şu sırayla bakın:

1. Görev Zamanlayıcı görevi (3. bölüm) kuruluysa bekçi oturum açılmadan başlar; görevin "Son çalışma sonucu"na bakın. Kurulu
   değilse sunucu kullanıcısıyla Windows oturumu açılmış mı? Açılmadıysa bekçi başlamaz (yukarıdaki sınır). Otomatik giriş kapalıysa
   oturumu elle açın; bekçi küçültülmüş pencerede açılır.
2. PostgreSQL servisi kendiliğinden açılıyor mu? PowerShell'de (yönetici gerekmez):
   ```
   Get-Service postgresql* | Select-Object Name, Status, StartType
   ```
   `Status` `Running`, `StartType` `Automatic` olmalı. `Manual` ise her kesintiden sonra elle açmak gerekir; bilgi işlem yönetici
   hesabıyla `Automatic` yapar. PostgreSQL geç açılırsa bekçi sunucuyu en çok 60 sn arayla yeniden dener; ayrıca bir şey yapılmaz.
3. Sunucu cevap veriyor mu?
   ```
   Invoke-RestMethod http://127.0.0.1:4100/api/saglik
   ```
   `durum : ok` görünmeli. Komut "503" hatası verirse sunucu açık ama veritabanına ulaşamıyor: 2. adıma dönün. "Bağlantı kurulamadı"
   derse sunucu açık değildir: bekçi günlüğünün (`TMIV2-GUNLUK\bekci.log`) son satırlarına bakın.
4. Bir cihazdan giriş yapıp ana sayfanın açıldığını görün.
