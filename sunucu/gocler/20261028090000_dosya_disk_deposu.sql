-- Talimat medyası diskte (kullanıcı kararları 1004 a, 1005 a, 1007 a; ADR 0009 eki). Künye veritabanında kalır; içerik
-- `depo = 'disk'` ise TMIV2_MEDYA_DIZINI altında özet adlı, değişmeyen dosyadır. Var olan satırlar veritabanında kalır, veri taşınmaz.
ALTER TABLE dosya ADD COLUMN depo text NOT NULL DEFAULT 'vt' CONSTRAINT dosya_depo_degeri CHECK (depo IN ('vt', 'disk'));
ALTER TABLE dosya DROP CONSTRAINT dosya_tur_degeri;
ALTER TABLE dosya ADD CONSTRAINT dosya_tur_degeri
  CHECK (tur IN ('pdf', 'png', 'jpeg', 'webp', 'step', 'stl', 'iges', 'glb', 'gltf', 'dxf', 'mp4', 'ikili'));
-- Diskteki dosyanın içeriği veritabanında durmaz.
CREATE INDEX dosya_disk_idx ON dosya (ozet) WHERE depo = 'disk';

-- Künyesi silinen diskteki dosya hemen silinmez (1005 a): en az 30 gün bekler, böylece eski veritabanı yedeği geri yüklenince
-- o yedekteki künyelerin dosyası bulunur. Aynı içerik bu sürede yeniden diske bağlanırsa satır silinir.
CREATE TABLE dosya_disk_silinecek (
  ozet text PRIMARY KEY CONSTRAINT dosya_disk_silinecek_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  zaman timestamptz NOT NULL DEFAULT now()
);
