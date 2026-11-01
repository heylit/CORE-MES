# Veritabanı bakımı: autovacuum ve aylık kontrol (kart 1762)

PostgreSQL güncellenen ya da silinen satırın eski kopyasını hemen atmaz; bu "ölü satırları" arka planda **autovacuum** temizler
ve aynı iş sorgu planı için istatistikleri (ANALYZE) tazeler. Autovacuum geride kalırsa tablolar şişer ve sorgular yavaşlar;
istatistik eskirse PostgreSQL yanlış plan seçer.

- TMI autovacuum'u ayarlamaz; PostgreSQL varsayılanlarıyla çalışır. Bu belge onun açık olduğunu ve yetiştiğini denetlemek içindir.
- İş kaydı tablolarında saklama süresi yoktur (soru 1764 a: hepsi kalsın, üç ay ölçülsün). Denetim, Arkon, stok hareketi ve sayım
  tabloları yalnız büyür; bu yüzden aylık kontrol ilk üç ay her ay yapılır ve sonuçlar yazılır.
- Bu belgedeki hiçbir adım veri silmez ya da değiştirmez.

Kim yapar: bilgi işlem ya da PostgreSQL'i kuran kişi. Sorgular SQL Shell (psql) ile TMI veritabanında (`tmiv2`) çalıştırılır.
Her sorgunun başında hangi kullanıcıyla bağlanılacağı yazar:

- `tmiv2_goc`: `.env`'deki `TMIV2_PG_GOC_USER`. Tabloların sahibidir; ayarları okur, tablo ayarını değiştirebilir.
- `postgres`: süper kullanıcı. Yalnız başka oturumları görmek ve PostgreSQL ayarını yeniden okutmak için gerekir.

## 1. Autovacuum açık mı (kurulumda bir kez)

`tmiv2_goc` ile:

```sql
SELECT name, setting FROM pg_settings
WHERE name IN ('autovacuum', 'track_counts', 'log_autovacuum_min_duration',
               'autovacuum_vacuum_scale_factor', 'autovacuum_vacuum_insert_scale_factor',
               'autovacuum_analyze_scale_factor', 'autovacuum_max_workers')
ORDER BY name;
```

- `autovacuum` ve `track_counts` ikisi de `on` olmalı. `track_counts` kapalıysa autovacuum açık görünse de çalışmaz.
- Biri `off` ise `postgresql.conf`'ta (ör. `C:\Program Files\PostgreSQL\<sürüm>\data\postgresql.conf`) o satırı bulun, `on` yapın ya da
  satırı silin ve aşağıdaki "Ayarı yeniden okutmak" adımını yapın.
- Öteki değerler bilgi içindir; varsayılanlar: `autovacuum_vacuum_scale_factor` 0.2, `autovacuum_vacuum_insert_scale_factor` 0.2,
  `autovacuum_analyze_scale_factor` 0.1, `autovacuum_max_workers` 3.

## 2. Autovacuum'u günlüğe yazdırmak (kurulumda bir kez)

PostgreSQL 16'nın varsayılanı yalnız 10 dakikadan uzun süren autovacuum'u günlüğe yazar; bu sunucuda neredeyse hiçbiri görünmez.
`postgresql.conf`'un sonuna şu satırı ekleyin:

```
log_autovacuum_min_duration = 1000
```

Bir saniyeden uzun süren her autovacuum ve autoanalyze PostgreSQL günlüğüne tablo adı, süre ve temizlenen satır sayısıyla düşer.
Değer milisaniyedir; günlük çok kalabalıklaşırsa 5000 yapın.

**Ayarı yeniden okutmak:** `postgres` ile `SELECT pg_reload_conf();` (sonuç `t`). Servisi yeniden başlatmak gerekmez; bu iki ayar
yeniden okumayla geçer. Ya da `services.msc`'de `postgresql-x64-<sürüm>` servisini yeniden başlatın (TMI'yi önce kapatın).
Geçtiğini görmek için `tmiv2_goc` ile `SHOW log_autovacuum_min_duration;` sonucu `1s` olmalı.

Günlüğün yeri: `postgres` ile `SHOW logging_collector;` ve `SHOW log_directory;`. `logging_collector` `on` ise dosyalar veri klasörü
altında o klasördedir (göreli yol veri klasörüne göredir). `off` ise PostgreSQL günlüğü dosyaya yazmıyordur; açmak servis yeniden
başlatmayı ister ve bu belgenin dışındadır.

## 3. Aylık kontrol listesi

Ayın ilk iş günü, mesai içinde (gece 02:00 yedeği sırasında değil). Her adımda "sorun" satırındaki durum varsa ne yapılacağı yazılıdır.

1. **Veritabanı boyutu ve donma yaşı** (`tmiv2_goc`):
   ```sql
   SELECT pg_size_pretty(pg_database_size(current_database())) AS vt_boyutu,
          age(datfrozenxid) AS xid_yasi
   FROM pg_database WHERE datname = current_database();
   ```
   - `vt_boyutu` deftere yazılır (madde 5).
   - Sorun: `xid_yasi` 150 milyonu geçtiyse. 200 milyonda PostgreSQL zorunlu donma taraması başlatır; bu kendiliğinden olur ama uzun
     sürer. 500 milyonu geçtiyse autovacuum yetişmiyordur: 3. maddedeki uzun transaction'a bakın, sonra 5. bölümdeki elle VACUUM.

2. **En büyük on tablo** (`tmiv2_goc`):
   ```sql
   SELECT relname AS tablo,
          pg_size_pretty(pg_total_relation_size(relid)) AS boyut,
          n_live_tup AS canli,
          n_dead_tup AS olu,
          round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS olu_yuzde,
          to_char(greatest(last_vacuum, last_autovacuum), 'YYYY-MM-DD HH24:MI') AS son_vacuum,
          to_char(greatest(last_analyze, last_autoanalyze), 'YYYY-MM-DD HH24:MI') AS son_analyze
   FROM pg_stat_user_tables
   ORDER BY pg_total_relation_size(relid) DESC
   LIMIT 10;
   ```
   - `canli` ve `olu` PostgreSQL'in tahminidir; sayım değildir.
   - Sorun: bir tabloda `olu_yuzde` 20'yi geçtiyse ve `son_vacuum` bir haftadan eskiyse autovacuum o tabloya yetişmiyor: 4. bölüm.
   - Sorun: bir milyon satırı geçmiş tabloda `son_analyze` boşsa ya da bir haftadan eskiyse istatistik eskidir: 4. bölüm; acil ise
     5. bölümdeki `VACUUM (ANALYZE)`.
   - `son_vacuum` boş olması tek başına sorun değildir: yalnız ekleme alan küçük tabloda autovacuum gerekmeyebilir.

3. **En eski açık transaction** (`postgres`; `tmiv2_goc` başka kullanıcıların oturumlarını göremez):
   ```sql
   SELECT pid, usename, state, now() - xact_start AS sure, left(query, 60) AS sorgu
   FROM pg_stat_activity
   WHERE xact_start IS NOT NULL AND pid <> pg_backend_pid()
   ORDER BY xact_start
   LIMIT 5;
   ```
   - Açık transaction'dan sonra ölen satırları autovacuum temizleyemez; uzun açık kalan tek oturum bütün veritabanını şişirir.
   - TMI kendi bağlantısında 30 saniye boş bekleyen transaction'ı kestirir (`TMIV2_PG_BOS_TX_SURE_MS`); uzun olan genelde açık
     unutulmuş bir psql penceresi ya da pgAdmin'dir. Gece yedeği (`pg_dump`) dökümü sürdükçe görünür, bu normaldir.
   - Sorun: `sure` bir saati geçen ve yedek olmayan oturum. O pencereyi kapatın; sahibi bilinmiyorsa `SELECT pg_cancel_backend(<pid>);`
     önce sorguyu durdurur, yetmezse `SELECT pg_terminate_backend(<pid>);` oturumu kapatır (açık transaction geri alınır).

4. **Yedek diski:** Sistem durumu ekranında (sağlık ayrıntısı) yedek diskinin boş yeri ve son gece yedeğinin durumu. Ayrıntı
   `kurulum/yedek.md`'dedir. Sorun: boş yer `az` görünüyorsa ya da son yedek bir günden eskiyse o belgedeki adımlar.

5. **Deftere yazmak:** tarih, `vt_boyutu`, en büyük üç tablonun adı ve boyutu, sorun görüldüyse ne yapıldığı. Defter bilgi işlemin
   kendi kaydıdır; depoya girmez. Üç aylık ölçüm saklama kararı (soru 1764) için girdidir.

## 4. Büyük tablolarda tablo başı eşik (yalnız ölçüm gösterirse)

Autovacuum bir tabloyu, ölü satır ya da yeni eklenen satır sayısı tablonun belli bir oranını geçince ele alır. Varsayılan oran
yüzde 20'dir: 5 milyon satırlık tabloda bir milyon ölü satır birikmeden temizlik başlamaz; istatistik de yüzde 10 değişmeden
tazelenmez. Tablo büyüdükçe bekleme büyür. Bu yüzden büyük tablolara daha küçük oran verilir.

Ne zaman: tablo bir milyon satırı geçtiyse VE aylık kontrolün 2. maddesinde o tablo için sorun görüldüyse. Ölçüm göstermeden
yapılmaz; ayar bugün gerekmiyor olabilir.

Beklenen adaylar (kart 1754 analizinden; gerçek hacim ölçülmedi):

| Tablo | Nasıl büyür | Önerilen ayar |
|---|---|---|
| `denetim_kaydi`, `denetim_degisiklik`, `arkon_kayit`, `stok_hareketi`, `uretim_sayimi` | yalnız ekleme | `autovacuum_vacuum_insert_scale_factor = 0.02`, `autovacuum_analyze_scale_factor = 0.02` |
| `arkon_belge`, `stok_bakiye`, `uretim_emri`, `uretim_emirleri_is_emri`, `oturum` | sık güncelleme | `autovacuum_vacuum_scale_factor = 0.05`, `autovacuum_analyze_scale_factor = 0.05` |

Uygulamak (`tmiv2_goc`; tablonun sahibi odur, uygulama kullanıcısı bu komutu çalıştıramaz). Örnek tek tablo için:

```sql
ALTER TABLE denetim_kaydi SET (autovacuum_vacuum_insert_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
```

- Veriye dokunmaz; okuma ve yazmayı engellemez (yalnız o tabloda aynı anda çalışan VACUUM ya da göçü bekletir).
- Görmek: `SELECT relname, reloptions FROM pg_class WHERE reloptions IS NOT NULL AND relkind = 'r';`
- Geri almak: `ALTER TABLE denetim_kaydi RESET (autovacuum_vacuum_insert_scale_factor, autovacuum_analyze_scale_factor);`
- Ayar gece yedeğine girer ve geri yüklemeyle döner; ama yeni kurulumda yoktur. Kalıcı olacaksa koordinatöre bildirin: ayrı kartla
  göçe girer. Yaptığınız her ayarı deftere yazın.

## 5. Elle VACUUM (gerekirse)

`tmiv2_goc` ile, tek tablo için:

```sql
VACUUM (ANALYZE, VERBOSE) denetim_kaydi;
```

- Okuma ve yazmayı durdurmaz; TMI açıkken çalıştırılabilir, büyük tabloda dakikalar sürer.
- Sürüp sürmediğini görmek (`postgres`): `SELECT relid::regclass, phase, heap_blks_scanned, heap_blks_total FROM pg_stat_progress_vacuum;`
- `VACUUM FULL` çalıştırmayın: tabloyu iş bitene kadar tamamen kilitler, o tabloyu kullanan bütün ekranlar durur ve geçici olarak
  tablo boyutu kadar ek disk ister. Gerekirse planlı duruşla ve önce yedek alınarak, ayrı karar olarak yapılır.

## Bu belgede olmayanlar

- Geri yükleme için kilit ayarı (`max_locks_per_transaction`): `kurulum/yedek.md` Kurulum 5.
- Yavaş sorguları bulmak: `kurulum/yavas-sorgular.md`.
- Bu sayıların Sistem durumu ekranında görünmesi: kart 1761.
- Eski kayıtları silmek ya da arşivlemek: soru 1764 (şimdilik hepsi kalır). Büyük tabloları aylık bölmek: soru 1765.
