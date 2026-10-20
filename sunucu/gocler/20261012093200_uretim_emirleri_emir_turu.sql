-- Emir türü (kart #699): emrin ne için açıldığını söyleyen etiket. Dolu tabloya varsayılanlı sütun eklenir; var olan emirler 'seri' olur
-- (kullanıcı kararı "Eklensin, Seri", 2026-10-12). İş emri adım türü (uretim_emirleri_is_emri.tur) ayrı alandır.

DO $$
DECLARE emir bigint;
BEGIN
  SELECT count(*) INTO emir FROM uretim_emri;
  RAISE NOTICE 'uretim_emri: % satır; göç yalnız varsayılanlı sütun ekler', emir;
END $$;

ALTER TABLE uretim_emri
  ADD COLUMN emir_turu text NOT NULL DEFAULT 'seri' CONSTRAINT uretim_emri_emir_turu
    CHECK (emir_turu IN ('seri', 'fai', 'numune', 'prototip', 'stok', 'rework', 'bakim_deneme', 'fason'));
