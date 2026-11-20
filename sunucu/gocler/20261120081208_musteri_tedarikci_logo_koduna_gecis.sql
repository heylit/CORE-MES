-- 3473 a (kullanıcı 20.11): Logo'ya zaten bağlı olup kodu Logo cari kodundan farklı firmanın kodu Logo cari kodu olur; eski kod
-- geçmişe yazılır (bırakan boş: göç). Logo cari kodu başka bir firmanın bugünkü koduysa (değiş tokuş dahil) o firma değişmez,
-- NOTICE'te numarasıyla görünür; elle çözülür. Kod kilidi tetiği bu göçte kapanır ve açılır; değişiklik defteri tetiği açık kalır.
-- Koşul her deyimde aynıdır (göç kullanıcısı geçici tablo ya da işlev açamaz): fark var ve hedef kod başka firmada yok.
DO $$ BEGIN
  RAISE NOTICE 'Logo''ya bağlı firma: %, kodu Logo cari koduna geçen: %, kodu başka firmada olduğu için geçmeyen: % (firma no: %)',
    (SELECT count(*) FROM musteri_tedarikci_firma WHERE logo_kayit_no IS NOT NULL),
    (SELECT count(*) FROM musteri_tedarikci_firma f WHERE f.logo_kayit_no IS NOT NULL AND f.logo_cari_kodu IS NOT NULL AND f.kod IS DISTINCT FROM f.logo_cari_kodu AND NOT EXISTS (SELECT 1 FROM musteri_tedarikci_firma o WHERE upper(o.kod) = upper(f.logo_cari_kodu) AND o.id <> f.id)),
    (SELECT count(*) FROM musteri_tedarikci_firma f WHERE f.logo_kayit_no IS NOT NULL AND f.logo_cari_kodu IS NOT NULL AND f.kod IS DISTINCT FROM f.logo_cari_kodu AND NOT NOT EXISTS (SELECT 1 FROM musteri_tedarikci_firma o WHERE upper(o.kod) = upper(f.logo_cari_kodu) AND o.id <> f.id)),
    coalesce((SELECT string_agg(f.id::text, ', ' ORDER BY f.id) FROM musteri_tedarikci_firma f WHERE f.logo_kayit_no IS NOT NULL AND f.logo_cari_kodu IS NOT NULL AND f.kod IS DISTINCT FROM f.logo_cari_kodu AND NOT NOT EXISTS (SELECT 1 FROM musteri_tedarikci_firma o WHERE upper(o.kod) = upper(f.logo_cari_kodu) AND o.id <> f.id)), '-');
END $$;

INSERT INTO musteri_tedarikci_kod_gecmisi (firma_id, kod, birakan_id)
  SELECT f.id, f.kod, NULL FROM musteri_tedarikci_firma f
   WHERE f.logo_kayit_no IS NOT NULL AND f.logo_cari_kodu IS NOT NULL AND f.kod IS DISTINCT FROM f.logo_cari_kodu AND f.kod IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM musteri_tedarikci_firma o WHERE upper(o.kod) = upper(f.logo_cari_kodu) AND o.id <> f.id);
ALTER TABLE musteri_tedarikci_firma DISABLE TRIGGER musteri_tedarikci_firma_degismezler;
UPDATE musteri_tedarikci_firma f SET kod = f.logo_cari_kodu, guncelleme = now(), surum = f.surum + 1
 WHERE f.logo_kayit_no IS NOT NULL AND f.logo_cari_kodu IS NOT NULL AND f.kod IS DISTINCT FROM f.logo_cari_kodu
   AND NOT EXISTS (SELECT 1 FROM musteri_tedarikci_firma o WHERE upper(o.kod) = upper(f.logo_cari_kodu) AND o.id <> f.id);
ALTER TABLE musteri_tedarikci_firma ENABLE TRIGGER musteri_tedarikci_firma_degismezler;
