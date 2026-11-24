-- Tezgah bağlantısı canlı görünüm (kart 3659-2): tezgâh türü, yönetici seçer; MTConnect türü vermez.
-- Yeni boş tablo; veri silmez. Tür yoksa ekran çizim yerine yalnız konum değerlerini gösterir.
CREATE TABLE tezgah_turu (
  cihaz_adi text PRIMARY KEY CONSTRAINT tezgah_turu_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  tur text NOT NULL CONSTRAINT tezgah_turu_tur CHECK (tur IN ('dikey-freze', 'torna', 'yatay-islem')),
  guncellendi timestamptz NOT NULL DEFAULT now()
);
