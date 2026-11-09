-- 2452: iş merkezine bağlı olmayan kişilerin (ofis) mesaisi. Vardiya kendi haftalık günlerini taşır; kişinin vardiyası kişi atamasından,
-- yoksa departmanının varsayılanından, o da yoksa tesis varsayılanından gelir (2452-2 a). Üretim matrisi değişmez: iş merkezi olan kişi
-- matristen çalışır. Vardiya tanımı ve bu atamalar yeni `vardiya.tanim-yaz` işlemiyle de yazılır (2452-1 a); matris ve fazla mesai
-- `vardiya.yaz`'da kalır. Yalnız tablo ve satır eklenir; var olan satır değişmez.

-- Gün: 1 pazartesi ... 7 pazar (ISO). Satır varsa vardiya o gün açıktır (iş merkezi matrisi olmayan kişiler için).
CREATE TABLE vardiya_gunu (
  vardiya_id int NOT NULL CONSTRAINT vardiya_gunu_vardiya_fk REFERENCES vardiya ON DELETE CASCADE,
  gun smallint NOT NULL CONSTRAINT vardiya_gunu_gun CHECK (gun BETWEEN 1 AND 7),
  CONSTRAINT vardiya_gunu_pk PRIMARY KEY (vardiya_id, gun)
);

-- Departmanın varsayılan vardiyası. Departman İK'nındır (ik_departman.no); yabancı anahtar bağlama aşamasında ayrı göçle gelir.
CREATE TABLE vardiya_departman (
  departman_no int CONSTRAINT vardiya_departman_pk PRIMARY KEY,
  vardiya_id int NOT NULL CONSTRAINT vardiya_departman_vardiya_fk REFERENCES vardiya
);
CREATE INDEX vardiya_departman_vardiya_idx ON vardiya_departman (vardiya_id);

-- Tesis varsayılanı tek satırdır; satır yoksa varsayılan yoktur ve iş günü İK ayarıyla sayılır (2452-3 a).
CREATE TABLE vardiya_varsayilani (
  tek boolean NOT NULL DEFAULT true CONSTRAINT vardiya_varsayilani_pk PRIMARY KEY CONSTRAINT vardiya_varsayilani_tek CHECK (tek),
  vardiya_id int NOT NULL CONSTRAINT vardiya_varsayilani_vardiya_fk REFERENCES vardiya
);

CREATE TRIGGER vardiya_gunu_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya_gunu
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('vardiya_id,gun');
CREATE TRIGGER vardiya_departman_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya_departman
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('departman_no');
CREATE TRIGGER vardiya_varsayilani_degisiklik AFTER INSERT OR UPDATE OR DELETE ON vardiya_varsayilani
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('tek');

-- 2452-1 a: İK rolü ve bugün `vardiya.yaz` taşıyan her rol yeni işlemi alır; kimse yetki kaybetmez. Elle girilmiş satır korunur.
INSERT INTO rol_islemi (rol_id, islem)
SELECT id, 'vardiya.tanim-yaz' FROM rol WHERE kod = 'insan_kaynaklari'
UNION
SELECT rol_id, 'vardiya.tanim-yaz' FROM rol_islemi WHERE islem = 'vardiya.yaz'
ON CONFLICT DO NOTHING;
