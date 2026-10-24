-- Yeni kartta seçilen ürünün rotasından kopya isteği (kart #500). Onaylı akışta kart kaydedilince kullanımda değildir ve rota
-- kurulamaz; istek burada bekler, kart kullanıma girince taslak açılır ve satır silinir. Kart başına en çok bir istek.
CREATE TABLE rota_kopya_istegi (
  hedef_malzeme_id int PRIMARY KEY CONSTRAINT rota_kopya_istegi_hedef_bagi REFERENCES malzeme_katalog_karti (no),
  kaynak_malzeme_id int NOT NULL CONSTRAINT rota_kopya_istegi_kaynak_bagi REFERENCES malzeme_katalog_karti (no),
  isteyen_kisi_id int NOT NULL CONSTRAINT rota_kopya_istegi_isteyen_bagi REFERENCES kisi,
  olusturma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rota_kopya_istegi_kendisi_degil CHECK (hedef_malzeme_id <> kaynak_malzeme_id)
);
