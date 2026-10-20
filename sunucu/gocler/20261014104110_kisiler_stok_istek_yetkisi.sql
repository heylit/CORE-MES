-- Malzeme · Teslim (kart #1208, kullanıcı kararı 2026-10-14 "bütün roller"): malzeme istemek, teslim göndermek ve kendine geleni
-- teslim almak bütün yerleşik rollere açılır. Yönetici rolü bütün işlemleri zaten taşır; depo işlemleri stok.transfer ile kalır.
DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'stok.istek';
  RAISE NOTICE 'rol_islemi: % stok.istek satiri var; goc yalniz satir ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = r.kod), 'stok.istek'
  FROM (VALUES ('mudur'), ('planlama_proje'), ('kalite'), ('cam'), ('bakim'), ('satin_alma'), ('depo'), ('sevkiyat'),
               ('insan_kaynaklari'), ('idari_isler'), ('muhasebe_finans'), ('operator')) AS r (kod);
