-- Bölümün dış duvarındaki geçişler türüyle (kepenk, açık geçiş, kapı, yangın kapısı); ortak duvardaki geçiş iki bölümü bağlar.
-- Var olan giriş noktası rota başlangıcı olarak kalır; her bölümün girişi en yakın kenarda 4 m'lik kepenk olarak taşınır
-- (bugünkü 3B görünüm: kapı girişe en yakın duvarda, 4 m).
CREATE TABLE atolye_gecis (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id int NOT NULL REFERENCES atolye_salon,
  tur text NOT NULL,
  kenar text NOT NULL,
  ofset numeric(5, 2) NOT NULL,
  genislik numeric(4, 2) NOT NULL,
  CONSTRAINT atolye_gecis_turu CHECK (tur IN ('kepenk', 'acik', 'kapi', 'yangin_kapisi')),
  CONSTRAINT atolye_gecis_kenari CHECK (kenar IN ('on', 'arka', 'sol', 'sag')),
  CONSTRAINT atolye_gecis_ofseti CHECK (ofset BETWEEN -250 AND 250),
  CONSTRAINT atolye_gecis_genisligi CHECK (genislik BETWEEN 0.8 AND 20)
);
CREATE INDEX atolye_gecis_salon_idx ON atolye_gecis (salon_id);

INSERT INTO atolye_gecis (salon_id, tur, kenar, ofset, genislik)
SELECT s.id, 'kepenk', k.kenar, round(greatest(2 - k.boy / 2, least(k.boy / 2 - 2, k.konum - k.boy / 2)), 2), 4
  FROM atolye_salon s
 CROSS JOIN LATERAL (
   SELECT v.kenar, v.boy, v.konum
     FROM (VALUES (1, 'arka', s.giris_z, s.genislik, s.giris_x),
                  (2, 'sol', s.giris_x, s.derinlik, s.giris_z),
                  (3, 'on', s.derinlik - s.giris_z, s.genislik, s.giris_x),
                  (4, 'sag', s.genislik - s.giris_x, s.derinlik, s.giris_z)) AS v (sira, kenar, uzaklik, boy, konum)
    ORDER BY v.uzaklik, v.sira
    LIMIT 1
 ) k
 WHERE s.giris_x IS NOT NULL AND s.giris_z IS NOT NULL
 ORDER BY s.id;
