-- Kişiye rolünün üstüne ek işlem (kart #1233): yönetici, rolde olmayan sayfa ve işlemi tek kişiye verir; rolden işlem geri alınmaz.
-- Yeni ve boş tablo; var olan tabloya dokunulmaz.
CREATE TABLE kisi_islemi (
  kisi_id int NOT NULL CONSTRAINT kisi_islemi_kisi_fk REFERENCES kisi ON DELETE CASCADE,
  islem text NOT NULL CONSTRAINT kisi_islemi_bicim CHECK (islem ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$'),
  veren_id int NOT NULL CONSTRAINT kisi_islemi_veren_fk REFERENCES kisi,
  verildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kisi_islemi_pk PRIMARY KEY (kisi_id, islem)
);
