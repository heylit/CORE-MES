-- Hazır rota şablonları (3273 a): şablon açıklama, öneri sözcükleri ve kullanımdan kaldırma taşır; şablondan açılan revizyon şablonunu bilir.
-- Yalnız ekleme: var olan satırların değeri değişmez (kaynak_sablon_id boş kalır, geriye dönük doldurulmaz).
ALTER TABLE rota_sablonu
  ADD COLUMN aciklama text CONSTRAINT rota_sablonu_aciklama_dolu CHECK (aciklama IS NULL OR btrim(aciklama) <> ''),
  ADD COLUMN oneri_sozcukleri text[] NOT NULL DEFAULT '{}'
    CONSTRAINT rota_sablonu_oneri_sozcukleri_siniri CHECK (cardinality(oneri_sozcukleri) <= 20),
  ADD COLUMN aktif boolean NOT NULL DEFAULT true,
  -- Varsayılan şablon kullanımdan kaldırılamaz (Risk K2).
  ADD CONSTRAINT rota_sablonu_varsayilan_aktif CHECK (NOT varsayilan OR aktif);

-- Kullanılmış şablon silinmez: bağ ON DELETE NO ACTION (Risk K1). Bağı yalnız taslak açma yazar (K3).
ALTER TABLE rota_revizyonu
  ADD COLUMN kaynak_sablon_id int CONSTRAINT rota_revizyonu_kaynak_sablon_bagi REFERENCES rota_sablonu (id);

CREATE INDEX rota_revizyonu_kaynak_sablon ON rota_revizyonu (kaynak_sablon_id) WHERE kaynak_sablon_id IS NOT NULL;
