-- Fazla mesai planı (kart #1324): bir günde vardiya dışı çalışma; istasyon ya da iş merkezi takvimine eklenir, kişi takvimine yalnız listedeki kişiye.
-- Yeni boş tablolar; var olan tabloya dokunulmaz. İptal edilen kayıt silinmez, takvime girmez.
CREATE TABLE vardiya_fazla_mesai (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT vardiya_fazla_mesai_pk PRIMARY KEY,
  tarih date NOT NULL,
  -- Bitiş başlangıçtan önceyse çalışma gece yarısını geçer ve tarihin ertesi gününe uzanır (vardiya gibi).
  baslangic time NOT NULL,
  bitis time NOT NULL,
  kapsam text NOT NULL CONSTRAINT vardiya_fazla_mesai_kapsam_degeri CHECK (kapsam IN ('is-merkezi', 'istasyon')),
  is_merkezi_id int CONSTRAINT vardiya_fazla_mesai_is_merkezi_fk REFERENCES is_merkezi,
  istasyon_id int CONSTRAINT vardiya_fazla_mesai_istasyon_fk REFERENCES istasyon,
  aciklama text CONSTRAINT vardiya_fazla_mesai_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 300)),
  iptal boolean NOT NULL DEFAULT false,
  surum integer NOT NULL DEFAULT 1,
  yazan_id int NOT NULL CONSTRAINT vardiya_fazla_mesai_yazan_fk REFERENCES kisi,
  yazildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vardiya_fazla_mesai_sure_var CHECK (bitis <> baslangic),
  CONSTRAINT vardiya_fazla_mesai_hedef CHECK (
    (kapsam = 'is-merkezi' AND is_merkezi_id IS NOT NULL AND istasyon_id IS NULL)
    OR (kapsam = 'istasyon' AND istasyon_id IS NOT NULL AND is_merkezi_id IS NULL))
);
CREATE INDEX vardiya_fazla_mesai_tarih_idx ON vardiya_fazla_mesai (tarih, id);
CREATE INDEX vardiya_fazla_mesai_is_merkezi_idx ON vardiya_fazla_mesai (is_merkezi_id);
CREATE INDEX vardiya_fazla_mesai_istasyon_idx ON vardiya_fazla_mesai (istasyon_id);

CREATE TABLE vardiya_fazla_mesai_kisi (
  fazla_mesai_id int NOT NULL CONSTRAINT vardiya_fazla_mesai_kisi_mesai_fk REFERENCES vardiya_fazla_mesai ON DELETE CASCADE,
  kisi_id int NOT NULL CONSTRAINT vardiya_fazla_mesai_kisi_kisi_fk REFERENCES kisi,
  CONSTRAINT vardiya_fazla_mesai_kisi_pk PRIMARY KEY (fazla_mesai_id, kisi_id)
);
CREATE INDEX vardiya_fazla_mesai_kisi_kisi_idx ON vardiya_fazla_mesai_kisi (kisi_id);
