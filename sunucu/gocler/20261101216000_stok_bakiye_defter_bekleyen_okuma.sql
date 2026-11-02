-- Yedek (pg_dump) uygulama kullanıcısıyla koşar ve her tabloyu okuyabilmek zorundadır; okuyamadığı tek tablo bütün yedeği
-- düşürür. Ara toplam tablosuna yalnız okuma verilir, yazma kapalı kalır: ara toplamı yalnız sahibin yetkisiyle çalışan tetik
-- yazar. Okuma korumayı gevşetmez: başka işlemlerin ara toplamı işlem bitmeden görünmez, işlem sonunda da silinir; uygulama
-- yalnız kendi işleminin ara toplamını görebilir.
-- Uygulama kullanıcısının adı göçte yazılmaz (TMIV2_PG_USER ortama göre değişir): bakiye tablosunu okuyabilen sahip dışı her
-- role verilir; bu, varsayılan yetkilerin tablo açılışında verdiği kümedir.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
           WHERE table_schema = current_schema() AND table_name = 'stok_bakiye' AND privilege_type = 'SELECT'
             AND grantee <> current_user LOOP
    EXECUTE format('GRANT SELECT ON stok_bakiye_defter_bekleyen TO %I', r.grantee);
  END LOOP;
END $$;
