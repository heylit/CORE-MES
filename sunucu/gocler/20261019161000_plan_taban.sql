-- 33 a (kullanıcı kararı, 2026-10-21; 25 b ve 394 a): taban plan, adımın ilk canlıya alınan yeridir ve hiç değişmez. Canlıya alma
-- aynı işlemde yazar; adımın satırı varsa yenisi yazılmaz. Reçete ve Rota plan ile gerçekleşeni bu tablodan (plan disari.ts) okur.
-- İş emrine yabancı anahtar yok: emir silinse de taban kalır (zincirleme silme yalnız eklenen tabloya çarpardı).
CREATE TABLE plan_taban (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_emri_id int NOT NULL CONSTRAINT plan_taban_is_emri_tek UNIQUE,
  uretim_emri_id int NOT NULL,
  makine_id int,
  kisi_id int,
  baslangic timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  plan_surumu int NOT NULL,
  senaryo_id int NOT NULL CONSTRAINT plan_taban_senaryo REFERENCES plan_senaryosu,
  yazan_kisi_id int NOT NULL CONSTRAINT plan_taban_yazan REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_taban_tek_kaynak CHECK ((makine_id IS NULL) <> (kisi_id IS NULL)),
  CONSTRAINT plan_taban_sure CHECK (bitis >= baslangic)
);
CREATE INDEX plan_taban_uretim_emri_idx ON plan_taban (uretim_emri_id, is_emri_id);

CREATE TRIGGER plan_taban_degismez BEFORE UPDATE OR DELETE ON plan_taban
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_taban_bosaltilmaz BEFORE TRUNCATE ON plan_taban
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
