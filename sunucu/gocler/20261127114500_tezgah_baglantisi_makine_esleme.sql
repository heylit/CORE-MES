-- Tezgâh deneme sayfası (kart 3811): tezgâh cihazının CORE makinesine eşlemesi ve makine başına iki deneme ayarı
-- (çevrimde parça, duruş eşiği). Yalnız yönetici onayıyla yazılır; öneri ad benzerliğinden hesaplanır, tabloya yazılmaz.
-- Yeni boş tablo; veri silmez. Bir makineye en çok bir cihaz eşlenir.
CREATE TABLE tezgah_makine_esleme (
  cihaz_adi text PRIMARY KEY CONSTRAINT tezgah_makine_esleme_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  makine_id integer UNIQUE REFERENCES makine (id),
  cevrimde_parca integer NOT NULL DEFAULT 1 CONSTRAINT tezgah_makine_esleme_cevrimde_parca CHECK (cevrimde_parca BETWEEN 1 AND 1000),
  durus_esigi_dk integer NOT NULL DEFAULT 5 CONSTRAINT tezgah_makine_esleme_durus_esigi CHECK (durus_esigi_dk BETWEEN 1 AND 240),
  degistiren_kisi_id integer NOT NULL REFERENCES kisi (id),
  degisti timestamptz NOT NULL DEFAULT now()
);
