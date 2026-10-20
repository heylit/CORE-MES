-- Yönetici dışındaki kullanıcı PIN ile girer (kart #484, ADR 0012). Var olan satırlara dokunulmaz: PIN verilene dek kişi parolayla girer.
DO $$
DECLARE
  girisli bigint;
BEGIN
  SELECT count(*) INTO girisli FROM kisi WHERE kullanici_adi IS NOT NULL;
  RAISE NOTICE 'kisi: girişi olan % satır PIN''siz kalır; hiçbir değer değişmez', girisli;
END $$;

ALTER TABLE kisi
  ADD COLUMN pin_ozeti text,
  -- Yöneticinin verdiği geçici PIN ile oturum açılmaz; kişi önce kendi PIN'ini belirler.
  ADD COLUMN pin_belirlenecek boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT kisi_pin_giris_ister CHECK (pin_ozeti IS NULL OR kullanici_adi IS NOT NULL),
  ADD CONSTRAINT kisi_pin_belirlenecek_pin_ister CHECK (NOT pin_belirlenecek OR pin_ozeti IS NOT NULL);
