-- Operasyon tipi kataloğu (IS11): rota adımları ve istasyonlar aynı listeyi okusun. Boş başlar; başlangıç listesi kullanıcı onayıyla ayrı göçte gelir.
-- Kullanılan tip silinmez, pasife alınır (bağlayan modüller kendi yabancı anahtarlarını ekler).
CREATE TABLE istasyonlar_operasyon_tipi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL CONSTRAINT istasyonlar_operasyon_tipi_kod_benzersiz UNIQUE
    CONSTRAINT istasyonlar_operasyon_tipi_kod_bicimi CHECK (kod ~ '^[A-Z0-9][A-Z0-9._-]{0,23}$'),
  ad text NOT NULL CONSTRAINT istasyonlar_operasyon_tipi_ad_bos_degil CHECK (btrim(ad) <> ''),
  aktif boolean NOT NULL DEFAULT true
);
