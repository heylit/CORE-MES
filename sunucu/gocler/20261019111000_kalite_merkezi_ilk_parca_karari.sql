-- İlk parça (FAI) kararı (229 a, denetim #12): kararı Kalite Merkezi verir ve burada tutar; Arkon'un kapısı emrin son kararını
-- buradan okur. Sayımın sağlama ya da redde geçişi üretim emrindedir; burada yalnız kim, ne zaman, hangi kararı verdi tutulur.
CREATE TABLE kalite_merkezi_ilk_parca_karari (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL REFERENCES uretim_emri (id),
  karar text NOT NULL CONSTRAINT kalite_merkezi_ilk_parca_karari_karar CHECK (karar IN ('onay', 'ret')),
  adet int NOT NULL CONSTRAINT kalite_merkezi_ilk_parca_karari_adet CHECK (adet >= 0),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kalite_merkezi_ilk_parca_karari_emir ON kalite_merkezi_ilk_parca_karari (uretim_emri_id, zaman DESC, id DESC);

CREATE TRIGGER kalite_merkezi_ilk_parca_karari_degismez BEFORE UPDATE OR DELETE ON kalite_merkezi_ilk_parca_karari
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalite_merkezi_ilk_parca_karari_bosaltilmaz BEFORE TRUNCATE ON kalite_merkezi_ilk_parca_karari
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
