-- Logo geçişi "Kullanılanlar" süzgeci (kart 3079 a): kart başına son hareket tarihi ve açık sipariş işareti. Yeni, boş tablo ve yalnız
-- logo modülünündür; malzemeler logo/disari.ts ile okur. Var olan satır yazılmaz, silinmez.
CREATE TABLE logo_malzeme_kullanimi (
  malzeme_kodu text PRIMARY KEY CONSTRAINT logo_malzeme_kullanimi_kod CHECK (btrim(malzeme_kodu) <> '' AND length(malzeme_kodu) <= 64),
  -- Logo'nun çalışılan dönemindeki son malzeme hareketi; hareketsiz kartta NULL.
  son_hareket date,
  acik_siparis boolean NOT NULL,
  son_okuma timestamptz NOT NULL
);

-- Sayfalı okuma imlecine üçüncü akış; kısıt yalnız genişler, var olan değerler geçerli kalır.
ALTER TABLE logo_okuma_imleci DROP CONSTRAINT logo_okuma_imleci_akis;
ALTER TABLE logo_okuma_imleci ADD CONSTRAINT logo_okuma_imleci_akis CHECK (akis IN ('malzeme-karti', 'stok', 'kullanim'));
