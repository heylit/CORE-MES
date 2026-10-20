-- Paket ve emir süzgeçli kayıt okumaları (ilk parça kapısı, kayıt listesi) türün bütün satırlarını taramasın; satır değişmez, kapsanan sayı bildirilir.
DO $$
DECLARE
  paketli bigint;
  emirli bigint;
BEGIN
  SELECT count(*) FILTER (WHERE paket_id IS NOT NULL), count(*) FILTER (WHERE emir_no IS NOT NULL) INTO paketli, emirli FROM arkon_kayit;
  RAISE NOTICE 'arkon_kayit: paketli % satır, emirli % satır dizine girer; hiçbir satır değişmez', paketli, emirli;
END $$;

CREATE INDEX arkon_kayit_paket_idx ON arkon_kayit (tur, paket_id, zaman) WHERE paket_id IS NOT NULL;
CREATE INDEX arkon_kayit_emir_idx ON arkon_kayit (tur, emir_no, zaman) WHERE emir_no IS NOT NULL;
