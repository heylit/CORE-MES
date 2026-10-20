-- Reçete ve Rota Motoru prototipinin verisi: prototip durumunu (malzemeler, ürün ve rotalar, operasyonlar, kaynaklar, emirler,
-- plan ve atölye kayıtları) yerel depo anahtarlarında JSON olarak tutar; plan stüdyosu senaryoları ve ekran tercihleri ayrı
-- anahtarlardadır. Kayıt atölyede ortaktır: anahtar başına tek satır, sürüm denetimli (başkasının yazdığının üstüne yazılmaz).
-- Gövde TMI'de yorumlanmaz; jsonb olduğu için bağlamada (Aşama 2) SQL ile okunabilir. Kişi sütunu kisi tablosuna yabancı
-- anahtarla Aşama 2'de bağlanır.
CREATE SEQUENCE recete_rota_surum AS bigint;

CREATE TABLE recete_rota_kayit (
  anahtar text PRIMARY KEY,
  bicim text NOT NULL,
  deger jsonb NOT NULL,
  surum bigint NOT NULL,
  guncelleyen_kisi_id int NOT NULL,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recete_rota_kayit_anahtar_bicimi CHECK (anahtar ~ '^recete-rota-motoru-v1(:[A-Za-z0-9_.:-]{1,80})?$'),
  CONSTRAINT recete_rota_kayit_bicim CHECK (bicim IN ('json', 'metin')),
  -- metin biçimi düz metindir: JSON dizesi olarak saklanır.
  CONSTRAINT recete_rota_kayit_metin_dize CHECK (bicim <> 'metin' OR jsonb_typeof(deger) = 'string')
);
