-- Rota şablonları (kart #698): adlı, düzenlenebilir, biri varsayılan. Bugünkü standart rota "Standart rota" adıyla varsayılan şablon olur;
-- rota_standart_adim tablosuna dokunulmaz (artık okunmaz, kaldırılması ayrı onaylı göçtür).
CREATE TABLE rota_sablonu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT rota_sablonu_ad_dolu CHECK (btrim(ad) <> ''),
  varsayilan boolean NOT NULL DEFAULT false,
  surum integer NOT NULL DEFAULT 1 CONSTRAINT rota_sablonu_surum_pozitif CHECK (surum > 0),
  CONSTRAINT rota_sablonu_ad_tekil UNIQUE (ad)
);
-- En çok bir varsayılan şablon.
CREATE UNIQUE INDEX rota_sablonu_tek_varsayilan ON rota_sablonu (varsayilan) WHERE varsayilan;

CREATE TABLE rota_sablon_adimi (
  sablon_id int NOT NULL CONSTRAINT rota_sablon_adimi_sablon_bagi REFERENCES rota_sablonu (id),
  sira int NOT NULL CONSTRAINT rota_sablon_adimi_sira_pozitif CHECK (sira > 0),
  operasyon_tipi_id int NOT NULL CONSTRAINT rota_sablon_adimi_operasyon_tipi_bagi REFERENCES istasyonlar_operasyon_tipi (id),
  ad text NOT NULL CONSTRAINT rota_sablon_adimi_ad_dolu CHECK (btrim(ad) <> ''),
  PRIMARY KEY (sablon_id, sira)
);

WITH s AS (
  INSERT INTO rota_sablonu (ad, varsayilan) SELECT 'Standart rota', true WHERE EXISTS (SELECT 1 FROM rota_standart_adim) RETURNING id
)
INSERT INTO rota_sablon_adimi (sablon_id, sira, operasyon_tipi_id, ad)
SELECT s.id, row_number() OVER (ORDER BY a.sira), a.operasyon_tipi_id, a.ad FROM s CROSS JOIN rota_standart_adim a;
