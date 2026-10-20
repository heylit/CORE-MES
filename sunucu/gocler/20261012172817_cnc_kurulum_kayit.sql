-- CNC Kurulum Motoru prototipinin verisi: prototip bütün durumunu (tezgâh, malzeme ve takım seçimleri, kütüphane, stok, takım
-- ömrü, hazırlık onayları, son NC programı) tek yerel depo anahtarında JSON olarak tutar. Kayıt atölyede ortaktır: anahtar
-- başına tek satır, sürüm denetimli (başkasının yazdığının üstüne yazılmaz). Gövde TMI'de yorumlanmaz; jsonb olduğu için
-- bağlamada (Aşama 2) SQL ile okunabilir. Kişi sütunu kisi tablosuna yabancı anahtarla Aşama 2'de bağlanır.
CREATE SEQUENCE cnc_kurulum_surum AS bigint;

CREATE TABLE cnc_kurulum_kayit (
  anahtar text PRIMARY KEY,
  bicim text NOT NULL,
  deger jsonb NOT NULL,
  surum bigint NOT NULL,
  guncelleyen_kisi_id int NOT NULL,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cnc_kurulum_kayit_anahtar_bicimi CHECK (anahtar ~ '^cnc-kurulum-motoru\.[A-Za-z0-9_.-]{1,80}$'),
  CONSTRAINT cnc_kurulum_kayit_bicim CHECK (bicim IN ('json', 'metin')),
  -- metin biçimi düz metindir: JSON dizesi olarak saklanır.
  CONSTRAINT cnc_kurulum_kayit_metin_dize CHECK (bicim <> 'metin' OR jsonb_typeof(deger) = 'string')
);
