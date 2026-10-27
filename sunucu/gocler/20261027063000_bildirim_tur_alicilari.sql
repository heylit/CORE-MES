-- Bildirim alıcıları (760 c, 761 b): tür başına alıcı roller ve kişiler. Satır yoksa türün işlem kuralı geçer; tablolar boş açılır,
-- bugünkü alıcılar değişmez. Tür adı kısıtla sınanmaz: yeni tür göç istemesin, geçerlilik sunucuda sözleşmeden sınanır.
CREATE TABLE bildirim_tur_ayari (
  tur text PRIMARY KEY CONSTRAINT bildirim_tur_ayari_tur_gecerli CHECK (tur ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  surum int NOT NULL DEFAULT 1 CONSTRAINT bildirim_tur_ayari_surum_gecerli CHECK (surum >= 1),
  degistiren_kisi_id int CONSTRAINT bildirim_tur_ayari_degistiren_fk REFERENCES kisi,
  degistirildi timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bildirim_tur_rolu (
  tur text NOT NULL CONSTRAINT bildirim_tur_rolu_tur_fk REFERENCES bildirim_tur_ayari ON DELETE CASCADE,
  rol_id int NOT NULL CONSTRAINT bildirim_tur_rolu_rol_fk REFERENCES rol ON DELETE CASCADE,
  CONSTRAINT bildirim_tur_rolu_pk PRIMARY KEY (tur, rol_id)
);
CREATE INDEX bildirim_tur_rolu_rol ON bildirim_tur_rolu (rol_id);

CREATE TABLE bildirim_tur_kisisi (
  tur text NOT NULL CONSTRAINT bildirim_tur_kisisi_tur_fk REFERENCES bildirim_tur_ayari ON DELETE CASCADE,
  kisi_id int NOT NULL CONSTRAINT bildirim_tur_kisisi_kisi_fk REFERENCES kisi ON DELETE CASCADE,
  CONSTRAINT bildirim_tur_kisisi_pk PRIMARY KEY (tur, kisi_id)
);
CREATE INDEX bildirim_tur_kisisi_kisi ON bildirim_tur_kisisi (kisi_id);
