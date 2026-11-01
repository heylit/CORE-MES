# Veritabanı yedeği (kart #1205)

Sunucu her gece veritabanının tam kopyasını `pg_dump` ile bir dosyaya alır. Bir güncelleme ya da göç ters giderse, ya da disk
bozulursa son yedek geri yüklenir; kayıp en çok bir günle sınırlı kalır.

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
elde ve doğru olduğunu gösterir. `<yedek>`, `npm.cmd run yedek-coz -- <şifreli yedek> <yedek>` ile açılmış düz kopyadır; sonda silinir.

```
psql -U postgres -d postgres -c "CREATE DATABASE tmiv2_deneme OWNER tmiv2_goc"
psql -1 -U postgres -d tmiv2_deneme -f araclar/vt/kurulum.sql
pg_restore -U tmiv2_goc -d tmiv2_deneme --no-owner --single-transaction --exit-on-error <yedek>
psql -U tmiv2_uygulama -d tmiv2_deneme -c "SELECT count(*) FROM kisi"
psql -U postgres -d postgres -c "DROP DATABASE tmiv2_deneme"
del <yedek>
```

Bu adımlar geliştirme ortamında PostgreSQL 16 ile denendi (2026-10-14): uygulamanın aldığı yedek boş veritabanına yüklendi, kişi,
malzeme ve göç kaydı sayıları kaynakla aynı çıktı, `npm run goc` "Uygulanacak göç yok" dedi ve göç kaydı yazma hakkını geri aldı,
sunucu geri yüklenen veritabanıyla açıldı. Windows sunucuda ve PostgreSQL 18'de denenmedi.

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

- Yedek veritabanının o anki tutarlı kopyasıdır. Yüklenen dosyalar (çizim, belge, sertifika) veritabanında durduğu için yedeğe
  girer (ADR 0009). Talimat medyası girmez; ayrı aynalanır (yukarıda). Diskteki güncelleme paketleri (`TMIV2_GUNCELLEME_DIZINI`), harita paketi ve `.env` girmez.
- Bir gece yedeği iki saati aşarsa pg_dump durdurulur ve hata olarak görünür.
- Sunucu kapanırken süren yedek yarım kalır; `.yarim` dosyası bir gün sonra silinir, yedek sonraki turda yeniden alınır.
