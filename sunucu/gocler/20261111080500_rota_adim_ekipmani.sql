-- Adım ekipmanı (2893-4 a): rota adımında gereken aparat (malzeme kartı) ve ölçü aleti türü. Liste adımla birlikte yazılır ve silinir
-- (sorgular.ts icerikSil, adimYaz); içerik kilidi (yalnız taslak) adımın öteki alt tablolarıyla aynıdır. Ölçü aleti tür olarak
-- istenir: hangi aletin kullanılacağı kalibrasyondaki geçerli aletler arasından seçilir.
CREATE TABLE rota_adim_ekipmani (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adim_id int NOT NULL REFERENCES rota_adimi,
  sira int NOT NULL CONSTRAINT rota_adim_ekipmani_sira_pozitif CHECK (sira > 0),
  tur text NOT NULL CONSTRAINT rota_adim_ekipmani_tur CHECK (tur IN ('aparat', 'olcu_aleti')),
  malzeme_id int REFERENCES malzeme_katalog_karti (no),
  alet_turu_id int REFERENCES olcu_aleti_turu (id),
  aciklama text CONSTRAINT rota_adim_ekipmani_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 200)),
  CONSTRAINT rota_adim_ekipmani_tek_hedef CHECK (
    (tur = 'aparat' AND malzeme_id IS NOT NULL AND alet_turu_id IS NULL) OR (tur = 'olcu_aleti' AND alet_turu_id IS NOT NULL AND malzeme_id IS NULL)
  ),
  CONSTRAINT rota_adim_ekipmani_sira_tekil UNIQUE (adim_id, sira)
);
CREATE INDEX rota_adim_ekipmani_malzeme_fk_idx ON rota_adim_ekipmani (malzeme_id);
CREATE INDEX rota_adim_ekipmani_alet_turu_fk_idx ON rota_adim_ekipmani (alet_turu_id);
CREATE TRIGGER rota_adim_ekipmani_kilitli BEFORE INSERT OR UPDATE OR DELETE ON rota_adim_ekipmani
  FOR EACH ROW EXECUTE FUNCTION rota_icerik_kilitli();

-- İş emrinin ekipman kopyası: emir açılırken (ve rota uygulanınca) rota adımından, bölünen kol ve tekrar adımında kaynak iş emrinden
-- kopyalanır (şartname sabiti gibi). Satır güncellenmez; bekleyen iş emri silinince satırları da gider.
CREATE TABLE rota_is_emri_ekipmani (
  is_emri_id int NOT NULL CONSTRAINT rota_is_emri_ekipmani_is_emri_bagi REFERENCES uretim_emirleri_is_emri (id) ON DELETE CASCADE,
  sira int NOT NULL CONSTRAINT rota_is_emri_ekipmani_sira_pozitif CHECK (sira > 0),
  tur text NOT NULL CONSTRAINT rota_is_emri_ekipmani_tur CHECK (tur IN ('aparat', 'olcu_aleti')),
  malzeme_id int REFERENCES malzeme_katalog_karti (no),
  alet_turu_id int REFERENCES olcu_aleti_turu (id),
  aciklama text CONSTRAINT rota_is_emri_ekipmani_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 200)),
  kopyalanma timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (is_emri_id, sira),
  CONSTRAINT rota_is_emri_ekipmani_tek_hedef CHECK (
    (tur = 'aparat' AND malzeme_id IS NOT NULL AND alet_turu_id IS NULL) OR (tur = 'olcu_aleti' AND alet_turu_id IS NOT NULL AND malzeme_id IS NULL)
  )
);
CREATE INDEX rota_is_emri_ekipmani_malzeme_fk_idx ON rota_is_emri_ekipmani (malzeme_id);
CREATE INDEX rota_is_emri_ekipmani_alet_turu_fk_idx ON rota_is_emri_ekipmani (alet_turu_id);
CREATE TRIGGER rota_is_emri_ekipmani_degismez BEFORE UPDATE ON rota_is_emri_ekipmani
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
