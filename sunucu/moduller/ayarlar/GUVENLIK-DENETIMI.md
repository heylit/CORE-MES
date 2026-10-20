# Güvenlik denetimi: ayarlar (uç başına; Aşama 1 tur 2 durumu)

Zaman ve kişi sunucudan (`guncelleyen_kisi_id` komutu veren, `guncelleme` sunucu saati). Her değişiklik iki denetim kaydı bırakır:
uç katmanının komut kaydı ve modülün değişiklik kaydı (kim, hangi ayar, eski ve yeni değer). Veri kapsamı yok. Sürüm ve istek kimliği
yok (UYUM-BORCU 2; aynı değeri yeniden yazmak değişiklik sayılmaz, tekrar zararsızdır). Aynı anahtarı aynı anda değiştiren
komutlar danışma kilidiyle sıralanır (KD-016).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /ayarlar | `ayarlar.yaz` (karar #117) | yalnız yönetici; tanımsız satır listeye girmez; saklanan değer türe uymuyorsa o ayar `gecersiz`, değer null (varsayılana dönmez; liste düşmez, KD-015) | `yönetici ayarları okur ve değiştirir; ...`, `hiç yazılmamış ayar tanımın varsayılanını döner; okumak satır oluşturmaz` | `yönetici ayarları okur ve değiştirir; bayraksız hiçbir rol okuyamaz, değiştiremez; oturumsuz istek 401 alır`, `saklanan değer tanımın türüne uymuyorsa okuma varsayılana dönmez: ...` |
| POST /ayarlar/:anahtar/degistir | `ayarlar.yaz` | tanımsız anahtar 404; türe uymayan değer 400; 80 karakteri aşan anahtar aranmadan 400; geri alınan komut iz bırakmaz; aynı anahtara eşzamanlı komutlar sıralanır | `yazılan değer listeden ve dışa açık okumadan geri okunur; ...`, `her değişiklik denetim kaydına ...`, `değiştiren kişi komutu veren kişidir: ...`, `türe uymayan saklanan değer ekrandan onarılır: ...` | `tanımsız anahtar yazılamaz (404) ...`, `tanımın türüne uymayan değer 400 ile reddedilir ...`, `80 karakteri aşan anahtar aranmadan 400 ...`, `geri alınan komut iz bırakmaz: ...`, `KD-016: aynı ayarı aynı anda değiştiren ikinci komut birinciyi bekler; ...` |

Yetki dağılımını pimleyen test: `sayfa ve yazma işlemi yalnız yöneticinin oturumunda vardır; hiçbir role verilmemiştir`.
Tablo korumaları: `tablo: boş değer, biçimsiz anahtar ve var olmayan kişi reddedilir; değiştireni olan kişi silinemez`.

## Yalnız ekranda kalan kurallar

Yok.

## Güncelleme kanalı (kart #870)

Dosya `guncelleme.test.ts`. Kayıt zamanı ve yükleyen sunucudan. Yükleme kimliği UUID (yola başka şey girmez) ve onu açan kişiye aittir.
Disk işleri süreç içinde sıraya girer. Parça ucu denetime gövdesiz girer (boyut ve özet; test `parça içeriği denetim kaydına girmez; ...`). Sürüm denetimi yok: kayıt değişmez, aynı commit ikinci kez 409.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /guncelleme/paketler | `ayarlar.guncelleme-yukle` | kapalı kanalda boş liste ve nedeni; bozuk bildirim dosyası listeye girmez | `imzalı paket parça parça yüklenir, ...` | `yalnız yönetici okur ve yükler; ...`, `dizin ya da anahtar yoksa kanal kapalıdır: ...` |
| POST /guncelleme/yuklemeler/:kimlik/parca | `ayarlar.guncelleme-yukle` | kanal açık; paket en çok 200 MB; parça boyu sırasına uyar; başkasının yüklemesi 404; en çok 3 açık yükleme (429), bir günlük yarım yükleme atılır | `imzalı paket parça parça yüklenir, ...` | `yalnız yönetici okur ve yükler; ...`, `eksik parçayla bitirilemez; başkasının yüklemesine ...`, `aynı sürüm ikinci kez yüklenemez; boyu sırasına uymayan parça ve bozuk kimlik reddedilir`, `aynı anda en çok üç açık yükleme vardır; ...`, `dizin ya da anahtar yoksa ...` |
| POST /guncelleme/yuklemeler/:kimlik/bitir | `ayarlar.guncelleme-yukle` | bütün parçalar gelmiş; imza bildirim ayrıştırılmadan önce doğrulanır; yük boyu ve SHA-256 bildirimle aynı; reddedilen yükleme silinir; aynı commit 409 | `imzalı paket parça parça yüklenir, ...` | `başka anahtarla imzalı, değiştirilmiş ya da paket olmayan dosya reddedilir ve saklanmaz`, `eksik parçayla bitirilemez; ...`, `aynı sürüm ikinci kez yüklenemez; ...` |

Ekranda kalan: dosya boyu (0 ya da 200 MB üstü) gönderilmeden durur; sunucu yine denetler.
| POST /guncelleme/paketler/:commit/uygula | `ayarlar.guncelleme-yukle` | kanal açık; sunucu güncelleyiciyle açılmış (`guncelleyici.json`'daki süreç yaşıyor; yoksa ya da artık dosyaysa 422); paket yüklü (404); çalışan sürüm, uygulanmış göçü taşımayan ya da çalışandan eski paket 422 (AY-G1); bekleyen istek varken 409; commit 40 hane (yola başka şey girmez); isteyen ve zaman sunucudan; istek dosyası yalnız yoksa yazılır | `uygulama isteği yalnız güncelleyiciyle açılan sunucuda ...` (200) | aynı test: bayraksız 403, oturumsuz 401, güncelleyicisiz 422, ikinci istek 409; `çalışan sürüm, uygulanmış göçü taşımayan ...` (422, 404, 400) |
| POST /guncelleme/paketler/:commit/sil, POST /guncelleme/surumler/:commit/sil | `ayarlar.guncelleme-yukle` | commit 40 hane (yol güncelleme klasörünün dışına çıkamaz); çalışan sürüm klasörü, bekleyen ya da uygulanan sürüm 422; yoksa 404; uygulama isteğiyle aynı sırada yürür, silme anında istek yoksa güncelleyici o sürüme başlayamaz | `kurulu sürümler listelenir; ...` (200) | aynı test: bayraksız 403, oturumsuz 401, 422, 404, 400 |

Uygulamanın kendisi (yedek, kurulum, göç, geri dönüş) sunucuda değil güncelleyicidedir (kart #1210, ayrı PR). Sunucu yalnız istek
dosyasını yazar ve güncelleyicinin yazdığı çalışan sürüm ve sonuç dosyalarını okur; bozuk dosya yok sayılır (`güncelleyici dosyası yoksa ...`).

## Veritabanı yedeği (kart #1205)

Dosya `yedek.test.ts`. Yedek bütün veriyi taşır; üç uç da `ayarlar.yedek-indir` ister ve bu işlem hiçbir role verilmez. Kayıt yok,
sürüm yok. Yedek adı sözleşmede kalıpla denetlenir (`<veritabanı>-<UTC>-<gece|elle>.dump`); yola başka şey girmez, başka veritabanının
yedeği verilmez. Elle yedek komutu denetim kaydına tam girer (gövde boş); okuma ucu denetim kaydı yazmadığı için her indirme sunucu
günlüğüne kişisiyle yazılır. pg_dump parolası komut satırına girmez; sunucunun `TMIV2_` değişkenleri alt sürece geçmez. Aynı süreçte aynı anda tek yedek.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /yedekler | `ayarlar.yedek-indir` | kapalıyken boş liste ve nedeni; yalnız bu veritabanının tamamlanmış yedekleri | `liste yalnız bu veritabanının tamamlanmış yedeklerini ...` | `yalnız yönetici listeler, ...`, `klasör yoksa yedek kapalıdır: ...` |
| POST /yedekler/al | `ayarlar.yedek-indir` | klasör açık (422); süren yedek varken 409; yarım dosya bitince adına taşınır, hata olursa silinir | `elle yedek komutu denetime düşer ...`, `pg_dump parolayı komut satırında değil ...` | `yalnız yönetici listeler, ...`, `klasör yoksa ...`, `aynı anda ikinci yedek başlamaz (409); ...`, `pg_dump hata verirse yarım dosya silinir, ...` |
| POST /yedekler/dizin/degistir | `ayarlar.yedek-indir` | mutlak, var olan, yazılabilir klasör (400); genel ayar ucu bu anahtara yazamaz (404); değişiklik eski ve yeniyle denetime düşer | `seçilen klasör ortamın yerine geçer: ...`, `her değişiklik kişi, eski ve yeni klasörle ...` | `klasörü yalnız yönetici değiştirir; ...`, `göreli, olmayan, dosya olan ya da boş yol reddedilir ...` |
| GET /yedekler/:ad/indir | `ayarlar.yedek-indir` | ad kalıba uymazsa 400; başka veritabanının ya da olmayan yedek 404; klasör kapalıysa 422 | `indirme dosyanın kendisini ek olarak verir; ...` | aynı test (400, 404), `yalnız yönetici listeler, ...`, `klasör yoksa ...` |

Gece işi (uç değil): klasör yoksa bekler; günde bir yedek; saklama kuralı yalnız bu veritabanının adlandırılmış yedeklerine dokunur.
Testler: `gece işi günün yedeğini bir kez alır, ...`, `gece işi pg_dump sürerken transaction boşta kalmaz: ...`, saf kurallar `yedek kuralları (saf)`.

Güncelleyicinin dosyası (`yedek-dizini.json`) yalnız yol taşır; bozuk ya da göreli değer okunmaz, ortama düşülür
(`güncelleyicinin dosyası bozuksa ortam okunur; ...`). Yazma izni olmayan klasör testi yok: test kapsayıcısı root çalışır, izin denenemez.

Ekranda kalan: süren yedek varken düğme kapalıdır; sunucu yine 409 verir. Boş klasör gönderilmez; sunucu yine 400 verir.
