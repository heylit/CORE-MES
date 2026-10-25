# Yavaş sorguları ölçmek (pg_stat_statements, soru 63)

İki ölçü birlikte okunur:

- **Uç süresi:** Sunucu günlüğü her istekte bir satır yazar. "Uç süresi" satırında yol kalıbı, durum, süre (ms) ve sorgu sayısı bulunur.
  500 ms ve üstünü süren uç "Yavaş uç" uyarısıyla ayrı yazılır. Bunun için kurulum gerekmez.
- **En pahalı sorgular:** Veritabanının en çok süre harcadığı sorguları `npm.cmd run yavas-sorgular` listeler. Bunun için
  PostgreSQL'in kendi eklentisi `pg_stat_statements` açılır.
  - Eklenti PostgreSQL ile birlikte gelir; npm paketi değildir, internet istemez.
  - Sorgu metninde girilen değerler bulunmaz; PostgreSQL onların yerine `$1`, `$2` yazar.
  - Bilgi makineden dışarı çıkmaz.

Eklenti açık değilse uygulama aynı şekilde çalışır. Bu durumda araç yalnız eklentinin açık olmadığını söyler.

## Açmak (Windows, bir kez)

PostgreSQL'i yeniden başlatmak ve ilk SQL adımı yönetici hakkı ister. Bu adımları PostgreSQL'i kuran kişi ya da bilgi işlem yapar.

1. TMI sunucusunu kapatın: komut penceresinde Ctrl+C.
2. PostgreSQL ayar dosyasını Not Defteri'yle açın:
   - Dosya: `C:\Program Files\PostgreSQL\<sürüm>\data\postgresql.conf`. `<sürüm>` kurulu sürümün numarasıdır, örneğin 16.
   - Dosyanın sonuna şu üç satırı ekleyin:
     ```
     shared_preload_libraries = 'pg_stat_statements'
     pg_stat_statements.max = 5000
     pg_stat_statements.track = top
     ```
   - Dosyada `shared_preload_libraries` başka bir değerle zaten varsa yeni satır eklemeyin. Var olan satıra virgülle ekleyin:
     `'eski_deger,pg_stat_statements'`.
3. PostgreSQL servisini yeniden başlatın:
   - `services.msc` açın.
   - `postgresql-x64-<sürüm>` servisini bulun.
   - Servise sağ tıklayıp "Yeniden başlat"ı seçin.
4. Eklentiyi kurun:
   - SQL Shell (psql) ile `postgres` kullanıcısıyla TMI veritabanına (`tmiv2`) bağlanın.
   - Şu iki komutu çalıştırın:
     ```sql
     CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
     GRANT pg_read_all_stats TO tmiv2_goc;
     ```
   - İkinci satırdaki `tmiv2_goc`, `.env` dosyasındaki `TMIV2_PG_GOC_USER` değeridir. Bu yetki verilmezse araç sayıları gösterir
     ama sorgu metinlerini gizler.
5. TMI'yi yeniden açın: `npm.cmd run baslat`.

## Okumak

- `npm.cmd run yavas-sorgular` en pahalı 20 sorguyu toplam süreye göre listeler. Daha fazlası için sayı verilir:
  `npm.cmd run yavas-sorgular -- 50`.
- Sayılar PostgreSQL yeniden başlayana kadar birikir. Bir düzeltmenin etkisini görmek için düzeltmeden önceki ve sonraki
  listeyi karşılaştırın.
- Aynı yavaşlık hem günlükteki "Yavaş uç" satırında hem bu listede görünüyorsa, düzeltilecek yer o uç ve onun sorgusudur.

## Kapatmak

1. `postgresql.conf` içinde eklediğiniz satırları silin.
2. Servisi yeniden başlatın.
3. psql ile `DROP EXTENSION pg_stat_statements;` çalıştırın.
