# Sunucuyu izlemek (kart 1668)

Bu belge izleme için canlı kurulumda bir kez yapılacakları toplar. Uygulamanın kendi parçaları kurulum istemez; bu belgedeki adımlar
PostgreSQL'in ve Windows'un kendi ayarlarıdır, paket ya da dış servis yoktur. Windows adımları burada denenmedi (doğrulanmadı); ilk
kurulumda her bölümün "Deneme" satırıyla sınanır.

## Neyi nerede görürsünüz

| Ne | Nerede | Belge |
|---|---|---|
| Sunucu açık mı, veritabanına ulaşıyor mu | `GET /api/saglik` (oturumsuz, yalnız `ok` / `hata`) | `kurulum/servis.md` |
| Çalışma süresi, iş durumları, disk, yedek yaşı, bellek, olay döngüsü | Sistem Durumu ekranı | - |
| Günlük, olay günlüğü, sertifika, son sunucu hataları | Güvenlik Merkezi > Durum | `kurulum/gunluk.md` |
| Uç süreleri ve "Yavaş uç" satırları | `TMIV2-GUNLUK\sunucu-*.log` | `kurulum/yavas-sorgular.md` |
| En pahalı sorgular | `npm.cmd run yavas-sorgular` | `kurulum/yavas-sorgular.md` |
| Sunucu düştü / düzeldi | Windows olay günlüğü, kaynak `TMIV2`, kimlik 300 / 301 | `kurulum/servis.md` 4. bölüm |
| Sunucu hatası, güvenlik alarmı | Windows olay günlüğü, kaynak `TMIV2`, kimlik 100 / 200 | `kurulum/gunluk.md` |
| Kapasite (çok kullanıcı) | `npm run yuk` (yalnız canlı olmayan ortamda) | `ekran-testleri/yuk/BENIOKU.md` |

Bilgi işlemin izleme aracı olay günlüğündeki 100, 200 ve 300'e bağlanır. E-posta uyarısı yoktur (1061 a, 1618 a).

## Canlı kurulum listesi

1. Olay kaynağı `TMIV2` açılır (`kurulum/gunluk.md` "Windows olay günlüğü").
2. Bekçi ve dış bekçi görevleri kurulur (`kurulum/servis.md` 3. ve 4. bölüm).
3. `pg_stat_statements` açılır (`kurulum/yavas-sorgular.md`).
4. Aşağıdaki PostgreSQL günlük ayarları yazılır.
5. Saat eşliği denetlenir.
6. Performans sayacı toplayıcısı kurulur.
7. IIS sertifikasının açık kısmı `TMIV2_IZLENEN_SERTIFIKA` ile verilir (`kurulum/gunluk.md` "Vekil sertifikası").

## PostgreSQL günlük ayarları

`postgresql.conf`'un sonuna (yolu `kurulum/yavas-sorgular.md` 2. adımda) eklenir, sonra PostgreSQL servisi yeniden başlatılır:

```
log_min_duration_statement = 250ms
log_lock_waits = on
log_autovacuum_min_duration = 1s
log_temp_files = 10MB
log_checkpoints = on
logging_collector = on
log_filename = 'postgresql-%a.log'
log_truncate_on_rotation = on
log_rotation_age = 1d
log_rotation_size = 0
```

- `log_min_duration_statement`: 250 ms'yi geçen tek sorgu PostgreSQL günlüğüne yazılır. Uygulamanın kendi ölçüsü uç başınadır (500 ms,
  "Yavaş uç"); bu satır hangi sorgunun yavaş olduğunu söyler. Günlük çok satır üretirse eşik yükseltilir. 250 bir başlangıç varsayımıdır.
- `log_lock_waits`: bir sorgu kilit için bir saniyeden uzun beklerse (`deadlock_timeout`) yazılır; eşzamanlı yazma takılmalarını gösterir.
- `log_autovacuum_min_duration`, `log_temp_files`, `log_checkpoints`: tablo temizliği gecikirse, sorgu belleğe sığmayıp diske taşarsa
  ve yazma yükü yükselirse iz bırakır.
- Son beş satır günlüğü haftanın günü adıyla yedi dosyada döndürür: disk dolmaz, bir haftalık geçmiş kalır.
- Sorgu metnindeki değerler günlüğe girebilir (pg_stat_statements'tan farklı olarak). Günlük klasörü yalnız PostgreSQL servis hesabı ve
  bilgi işlem tarafından okunur; dışarı verilmez.

Deneme: psql'de `SELECT pg_sleep(0.3);` çalıştırılır; PostgreSQL veri klasöründeki `log\postgresql-<gün>.log` dosyasında
`duration: 3xx ms` satırı görünür.

## Saat eşliği

Kayıtların sırası sunucunun saatine dayanır (`timestamptz`). Sunucu saati kayarsa terminal kayıtları ve vardiya hesabı yanlış sıraya girer.

- Yönetici komut isteminde: `w32tm /query /status`. "Kaynak" kurumun saat sunucusu ya da etki alanı denetleyicisi olmalı,
  "Son başarılı eşitleme" bir günden eski olmamalı. `Local CMOS Clock` görünüyorsa saat eşlenmiyordur; bilgi işlem kaynak tanımlar.
- Tablet ve telefonlarda "Otomatik tarih ve saat" açık olmalı. Uygulama zamanı sunucudan alır; cihaz saati yalnız ekranda görünen
  saati etkiler.

## Performans sayacı toplayıcısı

Uygulama işlemciyi, belleği ve diski kendi gözünden ölçer. Makinenin bütününü Windows'un kendi Performans İzleyicisi toplar; paket
gerekmez. Yönetici komut isteminde bir kez:

```
logman create counter TMIV2-Sayac -si 00:00:15 -f bincirc -max 500 -o "<klasor>\TMIV2-Sayac" ^
  -c "\Processor(_Total)\% Processor Time" "\Memory\Available MBytes" "\LogicalDisk(*)\% Free Space" ^
     "\LogicalDisk(*)\Avg. Disk sec/Transfer" "\Network Interface(*)\Bytes Total/sec" "\Process(node)\Private Bytes"
logman start TMIV2-Sayac
```

- `<klasor>` yedek klasörü dışında, veri diskinde bir klasördür. Dosya 500 MB'ta başa döner: yaklaşık birkaç haftalık geçmiş kalır
  (varsayım, sayaç sayısına göre değişir).
- Bilgisayar yeniden başlayınca toplayıcı kendiliğinden açılmaz; Görev Zamanlayıcı'da "Başlangıçta" tetikleyicisiyle `logman start TMIV2-Sayac`
  görevi eklenir.
- Okumak: Performans İzleyicisi > Veri Toplayıcı Kümeleri > Kullanıcı Tanımlı > TMIV2-Sayac > Raporlar.
- Anlık bakış için: `typeperf "\Processor(_Total)\% Processor Time" "\Memory\Available MBytes" -sc 5`.

Neye bakılır: işlemci uzun süre yüzde 80'in üstündeyse ve olay döngüsü gecikmesi (Sistem Durumu) yükseliyorsa yük kapasiteyi aşıyordur;
`Avg. Disk sec/Transfer` 0,02 sn'nin üstünde kalıyorsa veritabanı diski yavaştır; `Available MBytes` sürekli düşüyorsa bellek yetmiyordur.
Eşikler başlangıç varsayımıdır.

Deneme: `logman query TMIV2-Sayac` "Durum: Çalışıyor" gösterir; bir saat sonra raporda grafik görünür.
