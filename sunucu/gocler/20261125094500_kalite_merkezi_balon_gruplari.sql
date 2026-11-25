-- Balon grupları ve operasyon ataması (3693): bir resmin balonları adlı gruplara ayrılır, operasyon kendi grubunu otomatik kullanır. Grup resim
-- (revizyon) başınadır; revizyon geçişinde kopyalanır. Operasyon bir gruba bağlanır, grup birden çok operasyonda kullanılabilir. Yalnız yeni
-- tablolar ve resme bir sürüm sütunu eklenir; var olan satır silinmez ya da dönüştürülmez.

ALTER TABLE kalite_merkezi_resim
  ADD COLUMN gruplar_surum int NOT NULL DEFAULT 1 CONSTRAINT kalite_merkezi_resim_gruplar_surum CHECK (gruplar_surum >= 1);

CREATE TABLE kalite_merkezi_balon_grubu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resim_id int NOT NULL CONSTRAINT kalite_merkezi_balon_grubu_resim REFERENCES kalite_merkezi_resim (id),
  ad text NOT NULL CONSTRAINT kalite_merkezi_balon_grubu_ad CHECK (btrim(ad) <> '' AND length(ad) <= 60),
  guncelleyen_id int NOT NULL REFERENCES kisi,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kalite_merkezi_balon_grubu_resim_tekil UNIQUE (id, resim_id)
);
CREATE UNIQUE INDEX kalite_merkezi_balon_grubu_ad_tekil ON kalite_merkezi_balon_grubu (resim_id, lower(ad));
CREATE INDEX kalite_merkezi_balon_grubu_guncelleyen_idx ON kalite_merkezi_balon_grubu (guncelleyen_id);

-- Üyelik: bir balon birden çok grupta olabilir. Kaldırılan (pasif) balonun üyeliği kalır, okumada görünmez.
CREATE TABLE kalite_merkezi_balon_grubu_uye (
  grup_id int NOT NULL CONSTRAINT kalite_merkezi_balon_grubu_uye_grup REFERENCES kalite_merkezi_balon_grubu (id) ON DELETE CASCADE,
  balon_id int NOT NULL CONSTRAINT kalite_merkezi_balon_grubu_uye_balon REFERENCES kalite_merkezi_balon (id),
  PRIMARY KEY (grup_id, balon_id)
);
CREATE INDEX kalite_merkezi_balon_grubu_uye_balon_idx ON kalite_merkezi_balon_grubu_uye (balon_id);

-- Atama: resimde bir operasyon en çok bir gruba bağlıdır; grup aynı resmin grubudur. Operasyon gizli kimliğiyle bağlanır (rota değişse kopmaz).
CREATE TABLE kalite_merkezi_balon_grubu_operasyon (
  resim_id int NOT NULL,
  operasyon_id int NOT NULL CONSTRAINT kalite_merkezi_balon_grubu_operasyon_op REFERENCES rota_op_numarasi (id),
  grup_id int NOT NULL,
  PRIMARY KEY (resim_id, operasyon_id),
  CONSTRAINT kalite_merkezi_balon_grubu_operasyon_grup FOREIGN KEY (grup_id, resim_id)
    REFERENCES kalite_merkezi_balon_grubu (id, resim_id) ON DELETE CASCADE
);
CREATE INDEX kalite_merkezi_balon_grubu_operasyon_grup_idx ON kalite_merkezi_balon_grubu_operasyon (grup_id, resim_id);
CREATE INDEX kalite_merkezi_balon_grubu_operasyon_op_idx ON kalite_merkezi_balon_grubu_operasyon (operasyon_id);
