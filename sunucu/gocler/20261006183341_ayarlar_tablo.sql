-- Ayarın tanımı koddadır; burada yalnız değiştirilmiş değer durur. Satırı olmayan ayarda tanımın varsayılanı geçerlidir.
CREATE TABLE ayar (
  anahtar text PRIMARY KEY,
  deger jsonb NOT NULL,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ayar_anahtar_bicimi CHECK (anahtar ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$'),
  CONSTRAINT ayar_deger_dolu CHECK (jsonb_typeof(deger) <> 'null')
);
