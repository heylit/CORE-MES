-- Tekrar korumalı komutun ilk cevabı: aynı kimlikle yinelenen istek komutu ikinci kez uygulamaz, bu cevabı alır.
-- Satır komutla aynı transaction'da yazılır; birincil anahtar aynı kimlikli eşzamanlı isteği ilki bitene dek bekletir.
CREATE TABLE istek_kimligi (
  kisi_id int NOT NULL REFERENCES kisi,
  istek_kimligi uuid NOT NULL,
  uc text NOT NULL,
  govde_ozeti text NOT NULL,
  cevap jsonb,
  durum_kodu int,
  olusma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT istek_kimligi_pkey PRIMARY KEY (kisi_id, istek_kimligi)
);
CREATE INDEX istek_kimligi_olusma ON istek_kimligi (olusma);
