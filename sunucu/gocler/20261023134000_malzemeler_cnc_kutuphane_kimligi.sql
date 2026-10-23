-- CNC takım stoğu stokta (153 a); prototipin takım kütüphanesi kimliği malzeme kartına bağlanır (163 b, yazılı göç onayı 23.10.2026).
-- CNC kurulumu stoğu bu bağla okur. Kart başına en çok bir kimlik, kimlik başına en çok bir kart; yalnız sarf ve demirbaş
-- (takım, tutucu, bağlama). Var olan kartlar boş kalır, veri taşınmaz (165 a).
ALTER TABLE malzeme_katalog_karti
  ADD COLUMN cnc_kutuphane_kimligi text
    CONSTRAINT malzeme_katalog_karti_cnc_kimligi_bicimi CHECK (cnc_kutuphane_kimligi IS NULL OR cnc_kutuphane_kimligi ~ '^[A-Za-z0-9_.-]{1,64}$')
    CONSTRAINT malzeme_katalog_karti_cnc_kimligi_turu CHECK (cnc_kutuphane_kimligi IS NULL OR tur IN ('sarf', 'demirbas'));

CREATE UNIQUE INDEX malzeme_katalog_karti_cnc_kimligi_tekil ON malzeme_katalog_karti (cnc_kutuphane_kimligi) WHERE cnc_kutuphane_kimligi IS NOT NULL;
