-- Logo'dan malzeme kartı ve stok toplamı okuması, malzeme kodu eşlemesi (kart 2116; kararlar 2116-1 a, 2116-2 a, 2116-3 c).
-- Hepsi yeni, boş tablo ve yalnız logo modülünündür; başka modülün tablosuna bağlanmaz.

-- Logo malzeme kartlarının aynası: kartlar sayfa sayfa okunur, tam tur bitince turda görülmeyen kart silinir. TMI kartına işlenmez;
-- malzemeler "Logo'dan gelenler" listesini logo/disari.ts ile okur.
CREATE TABLE logo_malzeme_karti (
  logical_ref bigint PRIMARY KEY CONSTRAINT logo_malzeme_karti_ref CHECK (logical_ref > 0),
  kod text NOT NULL CONSTRAINT logo_malzeme_karti_kod CHECK (btrim(kod) <> '' AND length(kod) <= 64),
  ad text CONSTRAINT logo_malzeme_karti_ad CHECK (ad IS NULL OR (btrim(ad) <> '' AND length(ad) <= 200)),
  aciklama_2 text CONSTRAINT logo_malzeme_karti_aciklama_2 CHECK (aciklama_2 IS NULL OR (btrim(aciklama_2) <> '' AND length(aciklama_2) <= 200)),
  aciklama_3 text CONSTRAINT logo_malzeme_karti_aciklama_3 CHECK (aciklama_3 IS NULL OR (btrim(aciklama_3) <> '' AND length(aciklama_3) <= 200)),
  kart_turu int,
  birim_seti text CONSTRAINT logo_malzeme_karti_birim_seti CHECK (birim_seti IS NULL OR (btrim(birim_seti) <> '' AND length(birim_seti) <= 40)),
  aktif boolean NOT NULL,
  son_okuma timestamptz NOT NULL,
  CONSTRAINT logo_malzeme_karti_kod_tek UNIQUE (kod)
);

-- Logo stok toplamı: malzeme ve Logo ambarı başına eldeki miktar. Yalnız karşılaştırma ve açılış devri içindir; TMI stoku değildir (2116-1 a).
CREATE TABLE logo_stok_toplami (
  malzeme_kodu text NOT NULL CONSTRAINT logo_stok_toplami_kod CHECK (btrim(malzeme_kodu) <> '' AND length(malzeme_kodu) <= 64),
  ambar_no int NOT NULL CONSTRAINT logo_stok_toplami_ambar CHECK (ambar_no >= 0),
  miktar numeric NOT NULL,
  son_okuma timestamptz NOT NULL,
  PRIMARY KEY (malzeme_kodu, ambar_no)
);

-- Sayfalı okumanın imleci (akış başına tek satır): tur_basi tam turun başladığı an; tur bitince son_ref 0'a döner, son_tamam yazılır.
CREATE TABLE logo_okuma_imleci (
  akis text PRIMARY KEY CONSTRAINT logo_okuma_imleci_akis CHECK (akis IN ('malzeme-karti', 'stok')),
  son_ref bigint NOT NULL CONSTRAINT logo_okuma_imleci_ref CHECK (son_ref >= 0),
  tur_basi timestamptz NOT NULL,
  son_tamam timestamptz,
  sayi int NOT NULL DEFAULT 0 CONSTRAINT logo_okuma_imleci_sayi CHECK (sayi >= 0)
);

-- TMI stok kodu -> Logo malzeme kodu (2116-3 c): Logo kodu TMI biçimine uymayan kart TMI'de kendi koduyla açılır; Logo'ya giden her belge
-- malzemeyi bu eşlemeyle Logo koduna çevirir. Eşleme yalnız Logo'dan alınan kartta yazılır, değişmez.
CREATE TABLE logo_malzeme_eslemesi (
  stok_kodu text PRIMARY KEY CONSTRAINT logo_malzeme_eslemesi_stok_kodu CHECK (btrim(stok_kodu) <> '' AND length(stok_kodu) <= 64),
  logo_kodu text NOT NULL CONSTRAINT logo_malzeme_eslemesi_logo_kodu CHECK (btrim(logo_kodu) <> '' AND length(logo_kodu) <= 64),
  logo_kayit_no bigint NOT NULL CONSTRAINT logo_malzeme_eslemesi_ref CHECK (logo_kayit_no > 0),
  olusma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT logo_malzeme_eslemesi_farkli CHECK (stok_kodu <> logo_kodu),
  CONSTRAINT logo_malzeme_eslemesi_logo_kodu_tek UNIQUE (logo_kodu),
  CONSTRAINT logo_malzeme_eslemesi_ref_tek UNIQUE (logo_kayit_no)
);

CREATE FUNCTION logo_malzeme_eslemesi_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Logo malzeme eşlemesi değişmez ve silinmez (stok kodu %)', OLD.stok_kodu
    USING ERRCODE = 'check_violation', CONSTRAINT = 'logo_malzeme_eslemesi_degismez';
END $$;
CREATE TRIGGER logo_malzeme_eslemesi_degismez BEFORE UPDATE OR DELETE ON logo_malzeme_eslemesi
  FOR EACH ROW EXECUTE FUNCTION logo_malzeme_eslemesi_degismez();
