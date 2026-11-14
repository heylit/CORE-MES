-- Talimat şablonu operasyon tipine bağlanır (3249 b): emre kendiliğinden gelen şablon, rota adımının tipi tutuyor ve adımın kendi
-- talimatı yoksa emir açılırken o adımın hazırlık listesine kopyalanır. Tip başına en çok bir şablon kendiliğinden gelir.
-- Var olan şablonlar tipsiz ve kapalı kalır.
ALTER TABLE rota_talimat_sablonu
  ADD COLUMN operasyon_tipi_id int CONSTRAINT rota_talimat_sablonu_operasyon_tipi_bagi REFERENCES istasyonlar_operasyon_tipi (id),
  ADD COLUMN emre_gelir boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT rota_talimat_sablonu_emre_gelir_tipli CHECK (NOT emre_gelir OR operasyon_tipi_id IS NOT NULL);
CREATE UNIQUE INDEX rota_talimat_sablonu_emre_gelir_tekil ON rota_talimat_sablonu (operasyon_tipi_id) WHERE emre_gelir;
CREATE INDEX rota_talimat_sablonu_operasyon_tipi_fk_idx ON rota_talimat_sablonu (operasyon_tipi_id) WHERE operasyon_tipi_id IS NOT NULL;
