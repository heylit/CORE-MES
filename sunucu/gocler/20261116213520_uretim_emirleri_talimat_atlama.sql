-- Zorunlu talimat eksikken "Yine de başlat / bitir" (3338-4 a, sapma kartı a): kim, hangi adımda, hangi eylemde, hangi maddeleri atladı.
-- Yalnız eklenen defterdir; Adım Durumu geçmişinde görünür. Madde adları yazıldığı anki adlardır (adım sonradan değişmez, yine de ad saklanır).
CREATE TABLE emir_adimi_talimat_atlama (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri,
  kisi_id int NOT NULL REFERENCES kisi,
  eylem text NOT NULL CONSTRAINT emir_adimi_talimat_atlama_eylem_degeri CHECK (eylem IN ('baslat', 'bitir')),
  maddeler text[] NOT NULL CONSTRAINT emir_adimi_talimat_atlama_maddeler_dolu CHECK (cardinality(maddeler) BETWEEN 1 AND 50),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX emir_adimi_talimat_atlama_is_emri_idx ON emir_adimi_talimat_atlama (is_emri_id, id);
CREATE INDEX emir_adimi_talimat_atlama_kisi_fk_idx ON emir_adimi_talimat_atlama (kisi_id);
CREATE TRIGGER emir_adimi_talimat_atlama_degismez BEFORE UPDATE OR DELETE ON emir_adimi_talimat_atlama
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER emir_adimi_talimat_atlama_bosaltilmaz BEFORE TRUNCATE ON emir_adimi_talimat_atlama
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
