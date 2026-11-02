-- Türkçe sıralama (PLAN 4.3, kart 1775c). Veritabanı C.UTF-8 ile kurulur: ORDER BY kod sırasıyla dizer ('Ç' 'Z'den sonra,
-- 'İ' en sona). Harmanlama veritabanının dil ayarına bırakılmaz: ICU'nun Türkçe kuralı her kurulumda aynıdır. Sorgu
-- `ORDER BY ad COLLATE public.tr` yazar; istemcideki karşılığı paylasilan/siralama.ts. Satır ve sütun değişmez.
-- Harmanlama public şemasındadır ki her şema (test şemaları dahil) aynısını görsün; göç her test şemasında yeniden ve aynı
-- anda koşabilir, yarışı kaybeden koşu kazananın kurduğunu kullanır.
DO $goc$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collprovider = 'i') THEN
    RAISE EXCEPTION 'Bu PostgreSQL ICU desteği olmadan derlenmiş; Türkçe sıralama için ICU destekli kurulum gerekir';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_collation c JOIN pg_namespace n ON n.oid = c.collnamespace WHERE n.nspname = 'public' AND c.collname = 'tr') THEN
    BEGIN
      -- numeric: 'ORN-2' 'ORN-10'dan önce; istemcideki Intl.Collator('tr', { numeric: true }) ile aynı.
      CREATE COLLATION public.tr (provider = icu, locale = 'tr-TR-u-kn-true');
    EXCEPTION WHEN duplicate_object OR unique_violation THEN
      NULL;
    END;
  END IF;
END $goc$;
