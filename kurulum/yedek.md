# Veritabanı yedeği (kart #1205)

Sunucu her gece veritabanının tam kopyasını `pg_dump` ile bir dosyaya alır. Bir güncelleme ya da göç ters giderse, ya da disk
bozulursa son yedek geri yüklenir; yalnız gece yedeğiyle kayıp en çok bir gündür. Gün içi kaybı dakikalara indirmek için
PostgreSQL'in WAL arşivi ve haftalık taban yedek ikinci diske alınır (aşağıda "Gün içi kayıp: WAL arşivi ve taban yedek").

## Nasıl çalışır

- Gece yedeği sunucu sürecinde zamanlanmış iştir (ADR 0010, iş adı `ayarlar-gece-yedegi`); ayrı servis, cron ya da Windows görev
  zamanlayıcısı kurulmaz. İş on dakikada bir bakar: tesis saatiyle 02:00 geçmişse ve günün gece yedeği yoksa alır. Sunucu o saatte
  kapalıysa açıldıktan sonraki ilk turda (en geç on dakika) alır.
- Dosya adı: `<veritabanı>-<UTC zaman>-<gece|elle>.dump`, örnek `tmiv2-20261013T230000Z-gece.dump`. İçerik pg_dump'ın özel biçimidir
  (`--format=custom`, sıkıştırılmış) ve AES-256-GCM ile şifrelidir (kullanıcı kararı 145 a): yedekte çizimler, sertifikalar ve parola
  özetleri vardır. pg_dump çıktısı şifrelenerek diske yazılır; düz yedek diske hiç düşmez. Dosya `TMIV2Y1` ile başlar; `pg_restore`
  onu doğrudan açamaz, önce `npm run yedek-coz` ya da `npm run geri-yukle` anahtarla açar. Şifreleme öncesinden kalan düz yedek
  (`PGDMP` ile başlar) olduğu gibi geri yüklenir.
- Anahtar yalnız `.env`'deki `TMIV2_YEDEK_ANAHTARI`'ndadır (32 bayt, base64); yedek klasörüne ve veritabanına yazılmaz. Anahtar yoksa
  ya da biçimi bozuksa yedek alınmaz: ekranda "Yedek kapalı" ve nedeni, gece işi bekler. Anahtar kaybolursa o anahtarla alınmış
  yedekler AÇILMAZ; bilgi işlem anahtarı sunucudan ayrı saklar.
- Saklama: 14 günden eski yedek silinir; en yeni 3 yedek yaşına bakılmadan kalır (yedek alınamayan günlerde son iyi kopyalar silinmesin).
  Klasördeki başka dosyalara dokunulmaz.
- Yedek yazılırken `.yarim` ekiyle durur, bitince adına taşınır; listede ve indirmede yalnız tamamlanmış yedek görünür.
  Yarıda kalan (sunucu kapandı) `.yarim` dosyası bir gün sonra silinir.
- Durum: Sistem durumu ekranında (sağlık ayrıntısı) işin son turu; Sistem Ayarları > Yedekler sekmesinde yedek listesi, son hata,
  "Şimdi yedek al" ve her yedeğin "İndir" bağlantısı. Sekme ve uçlar yalnız bayraklı yöneticidedir (`ayarlar.yedek-indir`
  hiçbir role verilmez): yedek bütün veriyi taşır (ücret, finans, parola özetleri).
- Yedek klasörü Sistem Ayarları > Yedekler'den seçilebilir (yalnız bayraklı yönetici). Seçilen klasör mutlak yol olmalı, sunucuda
  var olmalı ve sunucu servis hesabı oraya yazabilmeli; kaydederken denenir. Seçim `TMIV2_YEDEK_DIZINI`'nin önüne geçer; "Sunucu ayarına
  dön" seçimi kaldırır. Her değişiklik eski ve yeni klasörle denetim kaydına düşer. Klasör değişince eski klasördeki yedekler taşınmaz;
  listede yalnız yeni klasördekiler görünür.
- Güncelleme paketi kanalı açıksa (`TMIV2_GUNCELLEME_DIZINI`) seçim o klasördeki `yedek-dizini.json` dosyasına da yazılır; güncelleyici
  güncelleme öncesi yedeği buraya alır. Dosya silinirse gece işi on dakika içinde yeniden yazar.
- Elle yedek ve her indirme iz bırakır: elle yedek komutu denetim kaydına düşer. İndirme iki adımdır (kullanıcı kararı 145 a):
  "İndir" önce izin komutu gönderir, komut kişi ve yedek adıyla denetim kaydına düşer (Denetim ekranında `/yedekler/:ad/indirme-izni`);
  tarayıcı dosyayı o izinle bir dakika içinde bir kez indirir. İzinsiz, süresi geçmiş ya da başka yedeğin izniyle indirme reddedilir.
  İndirme ayrıca sunucu günlüğüne kişisiyle yazılır. İndirilen dosya da şifrelidir.

## Kurulum (sunucuda bir kez)

1. Yedek klasörü açın. Veritabanıyla AYNI DİSKTE OLMASIN: disk bozulursa yedek de gider. İkinci disk ya da ağ paylaşımı seçin.
   Klasörü yalnız sunucu servisinin hesabı okuyup yazabilsin (yedek bütün veriyi taşır).
2. Yedek anahtarını bilgi işlem üretir ve saklar. Depo klasöründe:
   ```
   npm.cmd run yedek-anahtari
   ```
   Komut `TMIV2_YEDEK_ANAHTARI=...` satırını yalnız ekrana yazar, hiçbir yere kaydetmez. Satırı sunucunun `.env`'ine ekleyin ve
   bilgi işlemde sunucudan ayrı (kilitli dolap ya da parola kasası) saklayın; yedek klasörüne koymayın. Anahtar değiştirilirse yeni
   yedekler yeni anahtarla alınır, eski yedekler yalnız eski anahtarla açılır: eski anahtarı da en eski yedek silinene kadar saklayın.
3. `.env` dosyasına ekleyin:
   ```
   TMIV2_YEDEK_DIZINI=D:\TMIV2-YEDEK
   TMIV2_YEDEK_ANAHTARI=<2. adımdaki değer>
   TMIV2_PG_DUMP=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe
   ```
   Klasör ekrandan da seçilebilir (yukarıda); `.env` değeri yalnız ekranda seçim yokken kullanılır.
   Talimat resim ve videoları için `TMIV2_MEDYA_DIZINI` de eklenir (`.env.ornek`; aşağıda "Talimat medyası aynası").
   `TMIV2_YEDEK_DIZINI` mutlak yol olmalı; yoksa ya da klasör yoksa yedek kapalıdır, sunucu yine açılır (ekranda "Yedek kapalı").
   pg_dump şu sırayla aranır; gece yedeği, `npm run yedek` ve güncelleyici aynı sırayı kullanır:
   1. `TMIV2_PG_DUMP` doluysa yalnız o tam yol.
   2. Windows'ta `C:\Program Files\PostgreSQL\<sürüm>\bin\pg_dump.exe` (birden çok sürüm varsa en yenisi; `Program Files (x86)`
      de bakılır).
   3. `PATH`'teki `pg_dump`.
   PostgreSQL başka bir klasöre kurulduysa ya da birden çok sürümden belirli biri istenirse tam yolu `TMIV2_PG_DUMP` ile verin.
   Hangi pg_dump'ın bulunduğunu görmek için PowerShell'de `Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe"`.
   pg_dump sürümü veritabanı sunucusununkinden eski olamaz (aynı PostgreSQL kurulumundaki pg_dump uygundur).
   pg_dump hiçbir yerde bulunamazsa yedek alınmaz; Sistem Ayarları > Yedekler'de kırmızı satırda ve sunucu günlüğünde
   "pg_dump bulunamadı" hatası görünür. Gece işi her on dakikada yeniden dener.
4. Sunucuyu yeniden başlatın. Sistem Ayarları > Yedekler'de "Yedek açık" görünmeli. "Şimdi yedek al" ile ilk yedeği alın; listede
   görünmezse kırmızı satırdaki hatayı okuyun (en sık: pg_dump bulunamadı, sürüm uyuşmazlığı, klasöre yazma izni).
   İsteğe bağlı: `TMIV2_PG_VERI_DIZINI=C:\Program Files\PostgreSQL\18\data` verilirse `/saglik/ayrinti` veritabanı diskinin boş yerini de gösterir (yedek diski her zaman; 5 GB ya da yüzde 10 altı `az`).
5. PostgreSQL kilit ayarı: geri yükleme tek transaction'dır ve şemadaki her nesneyi kilitler (499 göçlü şemada ~20 bin kilit;
   varsayılan ayarın sığası ~6400). `postgresql.conf`'a (ör. `C:\Program Files\PostgreSQL\18\data\postgresql.conf`) şu satırı
   yazın ve PostgreSQL servisini yeniden başlatın:
   ```
   max_locks_per_transaction = 512
   ```
   Değeri görmek için: `psql -U tmiv2_goc -d tmiv2 -c "SHOW max_locks_per_transaction"`. Ayar yetmezse `npm run geri-yukle` ve
   güncelleyici veritabanına dokunmadan durur ve gereken değeri yazar; güncelleyici bu durumda göçe hiç başlamaz.
6. Haftada bir en son yedeği "İndir" ile alıp sunucunun dışında güvenli bir yerde saklayın (dosya şifrelidir; anahtar ayrı durur).

pg_dump uygulama kullanıcısıyla (`TMIV2_PG_USER`) bağlanır; parola komut satırına girmez, alt sürecin ortamından verilir. Alt sürece
`TMIV2_` değişkenleri geçmez.

## Gün içi kayıp: WAL arşivi ve taban yedek (2276-1 a)

Gece yedeği günde bir alınır; disk sabah 11'de bozulursa o sabahki kayıtlar gider. PostgreSQL her değişikliği önce WAL dosyasına
yazar. Bu dosyalar dolunca (ya da en geç `archive_timeout` süresinde) ikinci diske kopyalanırsa, haftalık bir taban yedekle
birlikte veritabanı istenen dakikaya geri getirilir (zaman noktasına dönüş). Kayıp en çok `archive_timeout` kadardır (aşağıda 5 dakika).

Bu yol uygulamaya eklenmiş bir özellik değildir, PostgreSQL'in kendi ayarıdır: uygulama kodu, yeni paket ya da yeni servis yoktur.
Gece yedeği aynen sürer; iki yol birbirinin yerine geçmez. Gece yedeği şifreli, taşınabilir ve tek dosyadır; WAL arşivi aynı
makinede, aynı PostgreSQL sürümünde, dakika hassasiyetiyle geri dönmek içindir.

Şifreleme (2283-1 a+e): WAL arşivi ve taban yedek PostgreSQL'in kendi biçimindedir; sunucunun ikinci diskinde şifresiz durur.
Korunması diskin BitLocker ile şifrelenmesi ve klasör izniyle sağlanır (Kurulum A1, A3). Sunucu dışına çıkan her kopya (haftalık dış
kopya) şifreli olmalıdır. Bu, gece yedeği için verilen 145 a kararını ("düz yedek diske hiç düşmez") WAL arşivi ve taban yedek için
daraltır: düz kopya yalnız sunucunun BitLocker'lı diskinde durabilir. Dışarı kopya yalnız aşağıdaki
"Şifreli dış kopya" komutuyla alınır; WAL arşivi ve taban yedek elle (Gezgin ile) dışarı kopyalanmaz.

Taban yedeği uygulamanın kendi zamanlanmış işi alır (2284-1 c, ADR 0005 eki, ADR 0010); bağlantı yalnız REPLICATION hakkı olan ayrı
`tmiv2_yedek` rolüyledir. Elle yol da bu rolle koşar; süper kullanıcı (`postgres`) taban yedek için kullanılmaz.

Açık:
- Sağlık ekranındaki "son arşivlenen WAL zamanı" satırı ayrı karttadır (2282b); gelene kadar durum psql ile okunur (Arşiv sağlığı).

### Kurulum (sunucuda bir kez)

A1. İkinci diskte iki klasör açın: `E:\TMIV2-WAL` (WAL arşivi) ve `E:\TMIV2-TABAN` (taban yedekler). Veritabanı diskinde OLMASIN:
    amaç o disk bozulunca veriyi kurtarmaktır. Gece yedeği klasörüyle aynı diskte olabilir, aynı klasörde olmasın.
    Bu disk BitLocker ile şifreli olmalıdır (2283-1 a+e); şifreli değilse WAL arşivi açılmaz.
A2. Yer: `archive_timeout = 300` ile PostgreSQL en geç 5 dakikada bir 16 MB'lık dosya arşivler. Uygulama boşta da her dakika ölçü
    yazdığı için (sağlık işi) dosyalar boş kalmaz: boşta bile günde yaklaşık 288 x 16 MB = 4,6 GB WAL çıkar (VARSAYIM: hesap;
    canlıda doğrulanır, aşağıda). Yük arttıkça dosyalar daha sık dolar. WAL, tutulan iki tabanın eskisinden başlar: taban 7 günde
    bir alındığı için en çok yaklaşık 15 günlük WAL durur (boşta 15 x 4,6 = yaklaşık 70 GB). Taban yedek veritabanı boyutu kadardır;
    iki tane tutulur, yenisi alınırken kısa süre üç tane olur. Gereken yer: 15 x günlük WAL + 3 x veritabanı boyutu; iş yüzde 80'de
    uyardığı için disk bunun en az 1,25 katı olmalı. Örnek: 10 GB'lık veritabanı ve boşta yük için (70 + 30) x 1,25 = 125 GB;
    ikinci disk en az 150 GB seçilsin (VARSAYIM: atölye yükü BİLMİYORUM).
    Doğrulama (canlının ilk günü): Arşiv sağlığı'ndaki sorguda `archived_count` değerini 24 saat arayla iki kez okuyun; fark x 16 MB
    günlük WAL'dır. Bu sayı 4,6 GB'tan çok büyükse yukarıdaki hesabı onunla yeniden yapın.
A3. İzin (klasörler bütün veriyi şifresiz taşır; koruma BitLocker ve bu izindir, 2283-1 a+e). Başka hesap okumaz:
    - `E:\TMIV2-WAL`: PostgreSQL servis hesabı (servisler listesinde "Oturum Aç" sütunu) yazar; uygulamanın servis hesabı okur ve
      siler (eski WAL'ı taban yedek işi budar); yöneticiler.
    - `E:\TMIV2-TABAN`: uygulamanın servis hesabı yazar ve siler (taban yedek işi); yöneticiler.
A4. `postgresql.conf`'a (ör. `C:\Program Files\PostgreSQL\18\data\postgresql.conf`) şu satırları yazın:
    ```
    wal_level = replica
    archive_mode = on
    archive_command = 'copy "%p" "E:\\TMIV2-WAL\\%f"'
    archive_timeout = 300
    ```
    `wal_level = replica` varsayılandır; satır yalnız açık dursun diye yazılır. Ters bölüler ikilenir (PostgreSQL ayar dosyası
    kuralı). `archive_timeout` saniyedir: kayıp penceresini ve arşiv boyutunu birlikte belirler; 300 (5 dakika) bu belgenin
    seçimidir (kayıp penceresi ile arşiv boyutu arasında), küçültmek arşivi büyütür.
A5. PostgreSQL servisini yeniden başlatın (`archive_mode` yalnız yeniden başlatmayla açılır). Sonra Arşiv sağlığı'ndaki sorguyla
    ilk dosyanın arşive düştüğünü görün; birkaç dakika içinde `E:\TMIV2-WAL`'da 24 haneli adlı dosyalar belirmelidir.
A6. Taban yedek rolü `tmiv2_yedek`: veritabanı kurulum betiği açar (Kurulum, `araclar/vt/kurulum.sql`; eski kurulumda betiği bir
    kez daha koşun, yeniden koşulabilir). Rolün tablolarda ve veritabanına bağlanmada hakkı yoktur, yalnız replikasyon bağlantısı
    kurar. Parolayı vermek için `psql -U postgres -d postgres` ile açın ve `\password tmiv2_yedek` yazın (iki kez sorar, ekranda
    görünmez).
    `pg_hba.conf`'a (veri klasöründe) yalnız şu replikasyon satırını ekleyin, başka `replication` satırı varsa kaldırın, sonra
    PostgreSQL ayarlarını yeniden yükleyin (`psql -U postgres -c "SELECT pg_reload_conf()"`):
    ```
    host replication tmiv2_yedek 127.0.0.1/32 scram-sha-256
    ```
A7. Sunucunun `.env`'ine ekleyin ve sunucuyu yeniden başlatın:
    ```
    TMIV2_TABAN_DIZINI=E:\TMIV2-TABAN
    TMIV2_WAL_ARSIV_DIZINI=E:\TMIV2-WAL
    TMIV2_PG_YEDEK_USER=tmiv2_yedek
    TMIV2_PG_YEDEK_PASSWORD=<A6'daki parola>
    ```
    Dördü de doluysa iş ilk turda (en geç bir saat içinde) ilk taban yedeği alır; biri boşsa iş bekler ve sağlık ayrıntısında
    "Taban yedek kapalı" görünür; canlıda (`TMIV2_ORTAM=canli`) beklemez, hata verir ve uyarı olarak görünür (2294-1 b). `pg_basebackup` ve `pg_verifybackup` pg_dump'ın bulunduğu PostgreSQL `bin` klasöründen alınır
    (Kurulum 3). Taban yedek olmadan WAL arşivi tek başına işe yaramaz: ilk tabanın alındığını sağlık ayrıntısında görün.

Arşivleme durursa (disk dolu, klasör izni, ikinci disk takılı değil) PostgreSQL WAL dosyalarını silmez, veritabanı diskinde
biriktirir; uzun sürerse veritabanı diski dolar ve kayıt durur. Bu yüzden arşiv sağlığına haftada bir bakılır (aşağıda).

### Arşiv sağlığı

Uygulama kullanıcısıyla da okunur, süper kullanıcı gerekmez:
```
psql -U tmiv2_goc -d tmiv2 -c "SELECT archived_count, last_archived_wal, last_archived_time, failed_count, last_failed_wal, last_failed_time FROM pg_stat_archiver"
```
- `last_archived_time` son 10 dakika içinde olmalı (iş saatinde). Daha eskiyse ya da `last_failed_time` ondan yeniyse arşivleme
  takılmıştır: PostgreSQL günlüğünde (`data\log`) `archive command failed` satırı nedeni söyler.
- Aynı bilgi Ayarlar > Yedekler'de "Gün içi koruma" bölümündedir (2282b); arşiv takılırsa, canlıda (`TMIV2_ORTAM=canli`) arşiv
  kapalıysa da sağlık uyarısı çıkar.

### Haftalık taban yedek (uygulama işi)

İş `ayarlar-taban-yedegi` (ADR 0010, transaction dışı) saatte bir bakar; doğrulanmış son taban 7 günlük olunca yenisini alır.
Sunucu açıkken alınır, kesinti yoktur; sunucu o sırada kapalıysa açıldıktan sonraki ilk turda alır.
- `pg_basebackup -Fp -Xs --checkpoint=fast` `tmiv2_yedek` rolüyle `E:\TMIV2-TABAN\taban-<UTC zaman>.yarim` klasörüne yazar,
  `pg_verifybackup` denetler; geçerse klasör `taban-<UTC zaman>` adını ve `.dogrulandi` işaretini alır. Geçmezse klasör silinir.
  `-Fp` düz klasördür, geri yüklemede açma adımı gerekmez; `-Xs` yedeğin kendi WAL'ını da yanına koyar.
- Eskitme kendiliğindendir: doğrulanmış en yeni iki taban kalır; daha eskiler ve doğrulanmamışlar silinir, WAL arşivinden kalan iki
  tabanın eskisinden önceki dosyalar silinir (`.history` kalır). İkiden az doğrulanmış taban varken WAL silinmez.
- Yalnız `taban-<UTC zaman>` adlı klasörlere dokunulur; elle alınmış başka adlı klasörler kalır, onları yönetici siler.
- Uyarı: iş şu durumlarda hata verir; sağlık ayrıntısında iş hatası olarak görünür ve Windows olay günlüğüne (kaynak `TMIV2`,
  olay 100) yazılır: taban alınamadı ya da doğrulanamadı; doğrulanmış son taban 8 günden eski; WAL arşivi diski yüzde 80 ya da daha
  dolu. Nedeni sunucu günlüğündedir.

Elle taban yedek (iş açılmadan önce ya da tatbikatta; yine `tmiv2_yedek` ile, PowerShell'de):
```
$bin = "C:\Program Files\PostgreSQL\18\bin"
$hedef = "E:\TMIV2-TABAN\$(Get-Date -Format yyyyMMdd)"
& "$bin\pg_basebackup.exe" -h 127.0.0.1 -U tmiv2_yedek -D $hedef -Fp -Xs --checkpoint=fast -P
& "$bin\pg_verifybackup.exe" $hedef
```
`pg_verifybackup` "backup successfully verified" demeden yedek sayılmaz. Elle alınan klasör iş tarafından budanmaz; eskiyince elle
silinir. WAL arşivinden elle dosya silinmez: aradaki tek eksik dosya o noktadan sonraki bütün dakikaları kaybettirir.

### Şifreli dış kopya (döner çevrimdışı diskler; 2283-2 a)

Haftada bir, taban yedekten (ve eskitmeden) sonra: en yeni taban yedek, onun başlangıcından bugüne WAL ve talimat medyası şifreli
olarak dış diske yazılır; disk çıkarılıp sunucudan uzakta saklanır. En az iki disk dönüşümlü kullanılır: biri takılıyken öteki
dışarıdadır. Dosyalar gece yedeğiyle aynı anahtarla (`TMIV2_YEDEK_ANAHTARI`) ve aynı biçimde şifrelenir; anahtar diske yazılmaz.
Depo klasöründe, `.env`'de anahtar varken:
```
npm.cmd run yedek -- dis-kopya --wal E:\TMIV2-WAL --taban E:\TMIV2-TABAN --hedef F:\
npm.cmd run yedek -- medya --hedef F:\TMIV2-DIS-KOPYA
```
- Komutu WAL ve taban klasörlerini okuyabilen bir hesap çalıştırır (Kurulum A3: yönetici); uygulama servisi bu klasörleri okumaz.
- Diskte `F:\TMIV2-DIS-KOPYA\taban\<tarih>` (veri klasörünün her dosyası ayrı şifreli, klasör düzeni aynı) ve `...\wal` durur.
  Diskte zaten olan WAL yeniden yazılmaz. Yeni taban yedek tamamlanmadan diskteki eski takım silinmez; tamamlanınca eski taban ve
  artık gerekmeyen WAL silinir. Yarıda kalan çalıştırma (disk söküldü) bir sonraki çalıştırmada tamamlanır.
- Yalnız tamamlanmış taban yedek alınır (`backup_manifest` olan); süren `pg_basebackup` atlanır. WAL arşivinde taban yedeğin
  başlangıç dosyası yoksa komut yazmadan durur: arşiv ayarı bozuktur.
- Her çalıştırma iki kayıt bırakır: diskte `TMIV2-DIS-KOPYA\islem-kaydi.txt` ve sunucunun yedek klasöründe `dis-kopya.jsonl`
  (zaman, sonuç, taban adı, boyutlar; disk sökülünce sunucunun "son dış kopya" bilgisi buradan okunur).
- Disk dışarıdayken şifreli olduğu için ayrıca BitLocker gerekmez; diskin kendisi de BitLocker'lıysa zararı yoktur.

Dış diskten geri dönüş (sunucu diski de yedek diski de gittiyse): diski yeni makineye takın, aynı PostgreSQL ana sürümü kurulu ve
`.env`'de aynı anahtar varken
```
npm.cmd run yedek-coz -- dis-kopya --kaynak F:\ --hedef D:\GERI-DONUS
npm.cmd run geri-yukle-medya -- --kaynak F:\TMIV2-DIS-KOPYA
```
Komut `D:\GERI-DONUS\veri` (taban yedek, düz) ve `D:\GERI-DONUS\wal` klasörlerini yazar; hedef boş olmalıdır. Anahtar uymazsa ya
da bir dosya bozuksa hangi dosya olduğunu söyleyip durur. Sonra "Zaman noktasına dönüş" adımları uygulanır; farkları: 3. adımda
taban yedek yerine `D:\GERI-DONUS\veri` kopyalanır, 5. adımda `restore_command` içinde `E:\\TMIV2-WAL` yerine
`D:\\GERI-DONUS\\wal` yazılır. Düz klasörler bütün veriyi şifresiz taşır; iş bitince silin.

Linux'ta PostgreSQL 16 ile denendi (2026-11-08, boş deneme kümesi): `pg_basebackup -Fp -Xs` ve `pg_verifybackup`, dış kopya
(969 dosya, hepsi şifreli; düz içerik diske düşmedi), açma, açılan klasörden hedef zamana dönüş; hedeften önceki kayıt geldi, sonraki
gelmedi. Windows'ta denenmedi.

### Zaman noktasına dönüş (süper kullanıcıyla, elle)

Ne zaman: veritabanı diski bozuldu (arşivin sonuna kadar), ya da yanlış bir toplu silme/güncelleme oldu (o andan hemen önceye).
Yanlış tek kayıt için kullanılmaz: bütün küme o dakikaya döner, o dakikadan sonraki her kayıt (başka ekranlardaki doğru işler de)
gider. Kümedeki bütün veritabanları (`tmiv2`, varsa `tmiv2_deneme`) birlikte döner. Aynı PostgreSQL ana sürümü gerekir.

1. Uygulama sunucusunu, sonra PostgreSQL servisini durdurun.
2. Bozuk veri klasörünü silmeyin, adını değiştirin: `data` -> `data_bozuk_20261108`. Disk sağlamsa (yanlış silme durumu) onun
   `pg_wal` klasöründeki henüz arşivlenmemiş son dosyalar da işe yarar; aşağıda 4. adım.
3. Hedef tarihten ÖNCE alınmış en yeni taban yedeği (`E:\TMIV2-TABAN\<tarih>`) eski `data` yoluna kopyalayın. Klasör izinlerini
   PostgreSQL servis hesabına verin (bozuk klasördekiyle aynı); izin yoksa servis açılmaz.
4. Yalnız disk sağlamsa: `data_bozuk_...\pg_wal` içindeki 24 haneli adlı dosyalardan `E:\TMIV2-WAL`'da olmayanları yeni
   `data\pg_wal`'a kopyalayın (son birkaç dakika). Disk bozuksa bu adım atlanır; kayıp en çok `archive_timeout` kadardır.
5. Yeni `data\postgresql.conf`'un sonuna ekleyin:
   ```
   restore_command = 'copy "E:\\TMIV2-WAL\\%f" "%p"'
   recovery_target_time = '2026-11-08 14:29:00+03'
   recovery_target_action = 'promote'
   ```
   Arşivin sonuna kadar dönmek için (disk bozuldu) `recovery_target_time` satırı yazılmaz. Saat dilimi (`+03`) yazılmalıdır.
   Sonra `data` içinde boş bir `recovery.signal` dosyası açın (PowerShell: `New-Item data\recovery.signal`).
6. PostgreSQL servisini başlatın. Günlükte (`data\log`) "recovery stopping before ..." ve "archive recovery complete" satırları
   görülmeli; `recovery.signal` kendiliğinden silinir. Günlükte "recovery ended before configured recovery target was reached"
   varsa hedef zaman arşivdeki son kayıttan sonradır: servis açılmaz, hedefi geri çekip 3. adımdan yeniden başlayın.
7. 5. adımda eklenen üç satırı silin. Hemen yeni bir taban yedek alın: geri dönüşten sonra PostgreSQL yeni bir zaman çizgisi
   (`00000002.history`) açar, eski taban yedek bu çizginin devamını taşımaz.
8. Uygulama sunucusunu başlatın, birkaç ekranı açıp verinin o dakikaya döndüğünü görün. Kod değişmediği için `npm run goc` gerekmez.
   Her şey yerindeyse `data_bozuk_...` klasörü sonra elle silinir.

Bu yol Linux'ta PostgreSQL 16 ile denendi (2026-11-08, boş deneme kümesi, `cp` ile): arşiv açıldı, taban yedek alındı, hedef
zamana dönüldü; hedeften önceki kayıt geldi, sonraki gelmedi. Uygulama kullanıcısı `pg_stat_archiver`'ı okudu. `pg_archivecleanup -n`
doğru dosyayı listeledi. Windows'ta ve PostgreSQL 18'de denenmedi; `copy` komutu, `pg_hba.conf` satırı ve klasör izinleri canlıdan
önceki Windows tatbikatında doğrulanır (ayrı adım). Tatbikatta `archive_command` (`copy`) iki durumda bilerek denenir: arşivde aynı
adlı dosya varken (komut sorup beklememeli, sonucu PostgreSQL günlüğünde görülmeli) ve kopya yarıda kesilince (disk çıkarıldı;
sonraki deneme dosyayı tam yazmalı). Sonuca göre komut ya da bu belge değişir.

## Komut satırından yedek (sunucu ve yönetici ekranı gerekmez)

Göç taşıyan bir `git pull` öncesi sunucuyu durdurup depo klasöründe:

```
npm.cmd run yedek
```

Yedek `TMIV2_YEDEK_DIZINI`'ne, o yoksa depo klasörünün yanındaki `TMIV2-YEDEK` klasörüne yazılır (deponun içine girmez). Windows
yönetici yetkisi ve PostgreSQL süper kullanıcısı gerekmez. pg_dump gece yedeğiyle aynı sırayla aranır (yukarıda, Kurulum 3).
Yedek gece yedeği gibi şifrelidir; `TMIV2_YEDEK_ANAHTARI` yoksa komut yedek almadan durur.
Saklama kuralı bu klasöre uygulanmaz; eski dosyaları elle silin.

Geri dönmek için sunucuyu durdurun, kodu eski haline alın (ör. `git checkout yedek/gecis-oncesi-2026-10-15`), sonra:

```
npm.cmd run geri-yukle -- ..\TMIV2-YEDEK\<yedek>.dump
npm.cmd run goc
```

Komut veritabanı adını yazmanızı ister, önce bugünkü hali ayrıca yedekler, sonra şifreli yedeği `TMIV2_YEDEK_ANAHTARI` ile geçici
dosyaya açar ve göç kullanıcısıyla tek transaction'da şemayı boşaltıp yedeği yükler; hata olursa hiçbir şey değişmez, geçici dosyalar
her durumda silinir. Başlamadan önce PostgreSQL kilit tablosunun yetip yetmeyeceğine bakar (Kurulum 5); yetmezse onay ve ön yedek
istemeden "kilit tablosu yetmiyor" der, önerdiği `max_locks_per_transaction` değerini yazar ve hiçbir şeye dokunmaz. Anahtar uymazsa "Yedek açılamadı: anahtar uymuyor ya da dosya bozuk" der ve veritabanına dokunmaz. Başka
makineye taşınan yedek için o makinenin `.env`'ine aynı anahtar yazılır. `npm run goc` göç kaydının yazma hakkını uygulamadan yeniden alır.
Linux'ta PostgreSQL 16 ile denendi (2026-10-15): yedek, veri bozma, geri yükleme; tablo sayısı ve tablo başına satır sayıları
yedek anıyla aynı çıktı. Şifreli yedekle Linux'ta PostgreSQL 16 üzerinde yeniden denendi (2026-10-19): `npm run yedek`, `npm run
geri-yukle`, rol tablosu geri geldi; yanlış anahtarda hata verdi, geçici dosya kalmadı. Windows'ta denenmedi.

## Geri yükleme (süper kullanıcıyla, elle)

Geri yükleme veritabanını değiştirir; yöneticinin elle yaptığı iştir, uygulamada düğmesi yoktur. Bozuk veritabanı silinmez, adı
değiştirilip kenara konur. Komutlar PostgreSQL `bin` klasöründen (ya da `PATH`'ten) koşulur; `<yedek>` geri yüklenecek dosyanın
anahtarla açılmış düz kopyasıdır. Önce depo klasöründe açın (`.env`'de `TMIV2_YEDEK_ANAHTARI` olmalı):
```
npm.cmd run yedek-coz -- <şifreli yedek> <yedek>
```
Düz kopya bütün veriyi şifresiz taşır: yedek klasörüne koymayın, iş bitince silin.

1. Sunucuyu durdurun (servis ya da `npm run sunucu` penceresi). Geri yüklenecek dosyayı yedek klasöründen başka bir yere kopyalayın:
   saklama kuralı eski dosyayı silebilir.
2. Süper kullanıcıyla bozuk veritabanını kenara alın ve boşunu açın:
   ```
   psql -U postgres -d postgres -c "ALTER DATABASE tmiv2 RENAME TO tmiv2_bozuk_20261014"
   psql -U postgres -d postgres -c "CREATE DATABASE tmiv2 OWNER tmiv2_goc"
   psql -1 -U postgres -d tmiv2 -f araclar/vt/kurulum.sql
   ```
   Son satır "Kurulum tamam: tmiv2" olmalı. Roller ve parolaları kümede durur; yeniden verilmez.
3. Yedeği tabloların sahibi (göç kullanıcısı) olarak yükleyin; hata olursa hiçbir şey yazılmaz:
   ```
   pg_restore -U tmiv2_goc -d tmiv2 --no-owner --single-transaction --exit-on-error <yedek>
   ```
4. Göç koşusunu çalıştırın: yedek koddan eskiyse eksik göçler uygulanır; göç kaydının yazma hakkı da yeniden geri alınır.
   ```
   npm run goc
   ```
5. Sunucuyu başlatın, birkaç ekranı açıp verinin yedek anına döndüğünü görün. Her şey yerindeyse kenara alınan
   `tmiv2_bozuk_...` veritabanı sonra elle silinebilir.

## Deneme geri yüklemesi (ayda bir önerilir)

Kesinti süresini ve kodla birlikte geri dönüşü de ölçen tam tatbikat: `kurulum/geri-donus-tatbikati.md`.

Yedeğin gerçekten açıldığını görmek için asıl veritabanına dokunmadan ayrı bir veritabanına yüklenir. Bu deneme anahtarın da
elde ve doğru olduğunu gösterir. Sonuç yedek klasöründeki `geri-yukleme-denemesi.jsonl` dosyasına bir satır olarak yazılır;
Sistem durumu "Son geri yükleme denemesi" satırında gösterir. Hiç deneme yoksa, son deneme başarısızsa ya da 35 günden eskiyse
Sistem durumunda yedek uyarısı çıkar.

Bir kez (deneme veritabanını açmak; PostgreSQL süper kullanıcısı gerekir, uygulama ve göç kullanıcısında veritabanı açma yetkisi yoktur):

```
psql -U postgres -d postgres -c "CREATE DATABASE tmiv2_deneme OWNER tmiv2_goc"
psql -1 -U postgres -d tmiv2_deneme -f araclar/vt/kurulum.sql
```

ve `.env` dosyasına `TMIV2_PG_DENEME_DATABASE=tmiv2_deneme` satırı. Bu ad asıl (`TMIV2_PG_DATABASE`) ve test
(`TMIV2_PG_TEST_DATABASE`) veritabanından farklı olmalıdır; aynıysa araç hiçbir şeye dokunmadan durur. Deneme, deneme
veritabanının içeriğini her seferinde siler ve yedekle değiştirir.

Her ay:

```
npm.cmd run geri-yukle-deneme -- <şifreli yedek>
```

Sunucu açıkken de çalışır; asıl veritabanı değişmez. Araç yedeği yükler, kişi ve göç kaydı sayılarını yazar; göç kaydı yoksa
deneme başarısız sayılır. Kayıt satırı yedeğin adını, süreyi ve sayıları taşır; kişi verisi taşımaz.

Bu komut geliştirme ortamında PostgreSQL 16 ile denendi (2026-11-01). Windows sunucuda ve PostgreSQL 18'de denenmedi.

## Talimat medyası aynası (1004 a, 1005 a)

Talimat resimleri ve videoları ADR 0009'un istisnasıdır: veritabanında değil, `TMIV2_MEDYA_DIZINI` klasöründe durur; veritabanında
yalnız künyesi (özet, ad, boyut, tür) vardır. Bu yüzden gece pg_dump yedeğine girmez; ayrı ve artımlı aynalanır.

- Medya dosyasının adı içeriğinin sha256 özetidir (`<ab>\<cd>\<özet>`, uzantısız); dosya bir kez yazılır, değişmez.
- Ayna, yedek klasörünün `medya` alt klasörüdür, aynı `<ab>\<cd>\<özet>` düzeniyle. Her dosya veritabanı yedeğiyle aynı anahtar
  (`TMIV2_YEDEK_ANAHTARI`) ve aynı biçimde (`TMIV2Y1`, AES-256-GCM) şifrelidir; anahtarsız açılmaz.
- Ne zaman: aynı gece işinde, gece veritabanı yedeği bittikten sonra, her gece yedeğinin ardından bir kez. Sıra bilerek budur:
  dump'taki her künyenin dosyası o anda medya klasöründedir ve aynaya girer. Son ayna zamanı `medya\.son-ayna` dosyasındadır.
- Yalnız aynada olmayan özetler kopyalanır; ad özet olduğu için karşılaştırma yalnız "bu ad var mı" sorusudur. Günlük iş o gün
  eklenen dosyalar kadar sürer. Ayna günlük tam kopya tutmaz: her özet bir kez durur. Yer: medya boyutu kadar, artı son 30 günde
  silinenler.
- Kopyalanırken her dosyanın özeti yeniden hesaplanır; adıyla tutmayan (diskte bozulmuş) dosya aynaya alınmaz, sunucu günlüğüne hata
  olarak düşer ve sonraki gece yeniden denenir. Yarıda kalan kopya `.yarim` ekiyle durur, bir gün sonra silinir.
- Kaynaktan silinen medya aynada `.silindi` ekiyle 30 gün daha durur, sonra silinir (1005 a): 14 günlük veritabanı yedeklerinin en
  eskisi geri yüklenince künyelerinin dosyası bulunsun. Kaynağa geri gelen dosya işaretten çıkar, yeniden kopyalanmaz.
- Yer denetimi: kopyalanacak dosyaların toplamı artı 1 GB boş yer yoksa o tur hiçbir dosya kopyalanmaz, hata günlüğe düşer; medya
  diski doldurup veritabanı yedeğini düşürmesin.
- `TMIV2_MEDYA_DIZINI` boşsa ayna koşmaz (talimat medyası yok). Yedek klasörü ya da anahtar yoksa veritabanı yedeği gibi ayna da bekler.
- Medya klasörü, yedek klasörü ve veritabanı ayrı disklerde olmalıdır (Kurulum 1 ile aynı gerekçe).
- Saklayıcının geçici dosyaları (nokta ile başlar) ve kalıba uymayan dosyalar aynaya girmez.

Komut satırından (1008 a; yalnız sunucu bilgisayarında, depo klasöründe; `.env`'de `TMIV2_MEDYA_DIZINI` ve `TMIV2_YEDEK_ANAHTARI` olmalı,
anahtarsız komut çalışmaz):

```
npm.cmd run yedek -- medya
npm.cmd run yedek -- medya --hedef E:\TMIV2-DIS-KOPYA
npm.cmd run geri-yukle-medya
npm.cmd run geri-yukle-medya -- --kaynak E:\TMIV2-DIS-KOPYA
```

- `yedek -- medya` aynayı hemen günceller; `--hedef` ile ikinci bir diske (haftalık dış kopya) aynı biçimde, şifreli ve yalnız yeni
  dosyaları yazar. Tarayıcıdan "İndir" medya için uygun değildir (boyut); dış kopya bu komutla alınır.
- `geri-yukle-medya` aynadaki (30 günlük silinenler dahil) her özetten medya klasöründe olmayanı açar, özetini doğrular ve yazar;
  var olan dosyaya dokunmaz. Anahtar uymazsa ya da dosya bozuksa o dosyayı yazmaz, adını söyler ve hata koduyla biter.
  `--kaynak` verilmezse yedek klasörü (`TMIV2_YEDEK_DIZINI`) kullanılır.
- `npm run geri-yukle` veritabanını geri yükledikten sonra `TMIV2_MEDYA_DIZINI` tanımlıysa medyayı da aynı yolla geri yazar: önce
  veritabanı, sonra eksik dosyalar.
- Her komut çalıştırması aynanın yanındaki `medya\islem-kaydi.txt` dosyasına bir satır bırakır (zaman, Windows kullanıcısı, komut,
  sonuç sayıları); sunucu kapalıyken veritabanı denetim kaydı yazılamadığı için.
- Linux'ta denendi (2026-10-28, sentetik dosyalarla): ayna, ikinci çalıştırmada kopya yok, dış hedef, medya silinip geri yükleme,
  yanlış anahtarda hiçbir dosya yazılmadı. Windows'ta denenmedi.

## Sınırlar

- Gece yedeği veritabanının o anki tutarlı kopyasıdır; gün içi değişiklikler yalnız WAL arşivindedir (yukarıda). Yüklenen dosyalar (çizim, belge, sertifika) veritabanında durduğu için yedeğe
  girer (ADR 0009). Talimat medyası girmez; ayrı aynalanır (yukarıda). Diskteki güncelleme paketleri (`TMIV2_GUNCELLEME_DIZINI`), harita paketi ve `.env` girmez.
- Bir gece yedeği iki saati aşarsa pg_dump durdurulur ve hata olarak görünür.
- Sunucu kapanırken süren yedek yarım kalır; `.yarim` dosyası bir gün sonra silinir, yedek sonraki turda yeniden alınır.
