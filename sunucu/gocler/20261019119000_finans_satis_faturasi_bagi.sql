-- Satış faturası siparişe ve sevke bağlanır, iade faturası türü gelir (kullanıcı kararı 260 a, 19.10.2026; dolu tablo göçü onaylı).
-- Sütunlar boş olabilir; eski belgelerde boş kalır. İade faturası asıl faturanın ters yönünde ayrı belgedir (satış iadesi giderdir,
-- alış iadesi gelirdir); asıl faturaya iade_belge_id ile bağlıdır. Sevk bağı yalnız siparişle birlikte olur.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM finans_belge;
  RAISE NOTICE 'finans_belge: % satır; göç boş olabilen üç sütun ekler, tür ve kategori listesini genişletir', satir;
END $$;

ALTER TABLE finans_belge
  DROP CONSTRAINT finans_belge_tur,
  ADD CONSTRAINT finans_belge_tur CHECK (tur IN ('fatura', 'faturasiz', 'acilis', 'iade')),
  DROP CONSTRAINT finans_belge_kategori,
  ADD CONSTRAINT finans_belge_kategori CHECK (
    (yon = 'gelir' AND kategori IN ('urun_satisi', 'hizmet_geliri', 'diger_gelir', 'kur_farki_geliri', 'alis_iadesi'))
    OR (yon = 'gider' AND kategori IN ('mal_alimi', 'personel', 'sgk_stopaj', 'kira', 'enerji', 'lojistik', 'pazarlama', 'faiz', 'diger_gider', 'kdv_vergi',
      'kredi_anapara', 'kur_farki_gideri', 'satis_iadesi'))),
  ADD COLUMN siparis_id int CONSTRAINT finans_belge_satis_siparisi REFERENCES siparisler_siparis (id),
  ADD COLUMN sevkiyat_isi_id int CONSTRAINT finans_belge_sevk REFERENCES sevkiyat_isi (id),
  ADD COLUMN iade_belge_id int CONSTRAINT finans_belge_iade_edilen REFERENCES finans_belge (id),
  ADD CONSTRAINT finans_belge_iade CHECK ((tur = 'iade') = (iade_belge_id IS NOT NULL) AND (tur = 'iade') = (kategori IN ('satis_iadesi', 'alis_iadesi'))),
  ADD CONSTRAINT finans_belge_iade_kendisi CHECK (iade_belge_id IS NULL OR iade_belge_id <> id),
  ADD CONSTRAINT finans_belge_satis_bagi CHECK (siparis_id IS NULL OR (yon = 'gelir' AND tur = 'fatura') OR (yon = 'gider' AND tur = 'iade')),
  ADD CONSTRAINT finans_belge_sevk_siparisli CHECK (sevkiyat_isi_id IS NULL OR siparis_id IS NOT NULL);

CREATE INDEX finans_belge_satis_siparisi_dizini ON finans_belge (siparis_id) WHERE siparis_id IS NOT NULL;
CREATE INDEX finans_belge_sevk_dizini ON finans_belge (sevkiyat_isi_id) WHERE sevkiyat_isi_id IS NOT NULL;
CREATE INDEX finans_belge_iade_dizini ON finans_belge (iade_belge_id) WHERE iade_belge_id IS NOT NULL;
