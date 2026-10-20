-- İK v3, bordro onayı (kullanıcı kararı 2-a, 12.10.2026): çalışan kendi kesinleşmiş bordrosunu "Gördüm, onaylıyorum" ile onaylar.
-- Yalnız ekleme defteridir; onay geri alınmaz. Onay bordronun o anki kesinleştirme sayısıyla (ik_bordro.surum; bordro yalnız
-- kesinleştirmede yazılır, her yazmada bir artar) tutulur: ay yeniden kesinleşince eski onay geçerli sayılmaz, çalışan yeniden onaylar.
CREATE TABLE ik_bordro_onayi (
  no bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bordro_no int NOT NULL REFERENCES ik_bordro (no),
  personel_no int NOT NULL REFERENCES ik_personel (no),
  kisi_id int NOT NULL REFERENCES kisi (id),
  kesinlestirme_sayisi int NOT NULL CONSTRAINT ik_bordro_onayi_sayi_pozitif CHECK (kesinlestirme_sayisi > 0),
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_bordro_onayi_tek UNIQUE (bordro_no, kesinlestirme_sayisi)
);
CREATE INDEX ik_bordro_onayi_personel ON ik_bordro_onayi (personel_no);
CREATE TRIGGER ik_bordro_onayi_yalniz_ekleme BEFORE UPDATE OR DELETE ON ik_bordro_onayi FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER ik_bordro_onayi_bosaltilmaz BEFORE TRUNCATE ON ik_bordro_onayi FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
