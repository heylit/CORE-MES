-- Rolden gelen işlem tek kişiden alınır (kart 3166): rol değişmez, kişinin yetkisi (rol işlemleri + ek işlemler) eksi bu satırlardır.
-- Yeni ve boş tablo; var olan tabloya dokunulmaz. Tablo düşürülürse kısıtlı kişiler rol yetkisine geri döner: düşürme ayrı karar ister.
CREATE TABLE kisi_islem_kisiti (
  kisi_id int NOT NULL CONSTRAINT kisi_islem_kisiti_kisi_fk REFERENCES kisi ON DELETE CASCADE,
  islem text NOT NULL CONSTRAINT kisi_islem_kisiti_bicim CHECK (islem ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$'),
  alan_id int NOT NULL CONSTRAINT kisi_islem_kisiti_alan_fk REFERENCES kisi,
  alindi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kisi_islem_kisiti_pk PRIMARY KEY (kisi_id, islem)
);
