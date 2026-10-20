-- Malzeme kartı Logo'ya gönderime hazır olsun (kart #232, kullanıcı onayı 08.10.2026): bağlantı modülü kuyruğu ve sonucu bu sütunlardan okur ve yazar.
-- Var olan satırlar değişmez: bugün aktif olan kartların durumu boş kalır (LG1 = a), Logo'da karşılığı olabilir, eşlenmesi bağlantı işindedir.

-- Stok kodu sınırı (Logo en çok 24 karakter alır). Aşan kart varsa göç hiçbir şeyi değiştirmeden durur ve sayıyı söyler (LG4 = a).
DO $$
DECLARE
  asan int;
BEGIN
  SELECT count(*) INTO asan FROM malzeme_katalog_karti WHERE length(stok_kodu) > 24;
  IF asan > 0 THEN
    RAISE EXCEPTION '% malzeme kartının stok kodu 24 karakteri aşıyor; Logo hazırlık göçü uygulanmadı (kart #232, kullanıcıya sorulur).', asan;
  END IF;
END $$;

ALTER TABLE malzeme_katalog_karti
  ADD CONSTRAINT malzeme_katalog_karti_stok_kodu_24 CHECK (length(stok_kodu) <= 24),
  -- Logo'ya giden tür ve birim karşılığı: sonuç gelince o anki karşılıktan yazılır, sonra değişmez.
  ADD COLUMN logo_kart_turu text CONSTRAINT malzeme_katalog_karti_logo_kart_turu_dolu CHECK (logo_kart_turu IS NULL OR btrim(logo_kart_turu) <> ''),
  ADD COLUMN logo_birim_seti text CONSTRAINT malzeme_katalog_karti_logo_birim_seti_dolu CHECK (logo_birim_seti IS NULL OR btrim(logo_birim_seti) <> ''),
  ADD COLUMN logo_kayit_no text CONSTRAINT malzeme_katalog_karti_logo_kayit_no_dolu CHECK (logo_kayit_no IS NULL OR (btrim(logo_kayit_no) <> '' AND length(logo_kayit_no) <= 64)),
  ADD COLUMN logo_gonderim_durumu text CONSTRAINT malzeme_katalog_karti_logo_durumu CHECK (logo_gonderim_durumu IN ('bekliyor', 'gonderildi', 'hata')),
  ADD COLUMN logo_gonderim_zamani timestamptz,
  ADD COLUMN logo_hata text CONSTRAINT malzeme_katalog_karti_logo_hata_dolu CHECK (logo_hata IS NULL OR btrim(logo_hata) <> ''),
  -- Kayıt numarası yalnız gönderilmiş kartta; gönderilmiş ve hatalı kartta zaman, hatalı kartta hata metni vardır.
  ADD CONSTRAINT malzeme_katalog_karti_logo_butun CHECK (
    (logo_kayit_no IS NOT NULL) = (logo_gonderim_durumu IS NOT DISTINCT FROM 'gonderildi')
    AND (logo_gonderim_zamani IS NOT NULL) = (logo_gonderim_durumu IN ('gonderildi', 'hata'))
    AND (logo_hata IS NOT NULL) = (logo_gonderim_durumu IS NOT DISTINCT FROM 'hata')
  );
CREATE UNIQUE INDEX malzeme_katalog_karti_logo_kayit_no_tek ON malzeme_katalog_karti (logo_kayit_no) WHERE logo_kayit_no IS NOT NULL;
-- Gönderim kuyruğu: bekleyen ve hatalı kartlar.
CREATE INDEX malzeme_katalog_karti_logo_kuyrugu ON malzeme_katalog_karti (no) WHERE logo_gonderim_durumu IN ('bekliyor', 'hata');

-- MKL-1: hiç aktif olmamış kart ilk kez aktif olduğu yazımda "bekliyor" olur (aynı işlem). Pasiften dönen ya da önceden aktif olmuş kart
-- bekliyor olmaz: Logo'da ikinci kart açılmasın. MKL-3: Logo kaydı olan kartın stok kodu, türü ve birimi değişmez.
-- MKL-5: gönderilmiş kart geri dönmez; durumu olan kart durumsuz kalmaz.
CREATE OR REPLACE FUNCTION malzeme_katalog_karti_koru() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Malzeme kataloğu kartı silinmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_silinmez';
  END IF;
  IF NEW.acan_kisi_id IS DISTINCT FROM OLD.acan_kisi_id THEN
    RAISE EXCEPTION 'Stok kodu, tür ve açan kişi değişmez (kart %)', OLD.kimlik USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_degismez';
  END IF;
  IF (OLD.onay_durumu <> 'taslak' OR OLD.aktif_oldu) AND (NEW.onek, NEW.sira_no, NEW.tur) IS DISTINCT FROM (OLD.onek, OLD.sira_no, OLD.tur) THEN
    RAISE EXCEPTION 'Stok kodu, tür ve açan kişi değişmez (kart %)', OLD.kimlik USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_degismez';
  END IF;
  IF OLD.logo_kayit_no IS NOT NULL AND (
       (NEW.onek, NEW.sira_no, NEW.tur) IS DISTINCT FROM (OLD.onek, OLD.sira_no, OLD.tur)
       OR NEW.kayit #>> '{com,birim}' IS DISTINCT FROM OLD.kayit #>> '{com,birim}') THEN
    RAISE EXCEPTION 'Logo kaydı olan kartın stok kodu, türü ve birimi değişmez (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_logo_kilidi';
  END IF;
  IF OLD.logo_gonderim_durumu = 'gonderildi' AND (NEW.logo_gonderim_durumu, NEW.logo_kayit_no, NEW.logo_kart_turu, NEW.logo_birim_seti, NEW.logo_gonderim_zamani)
       IS DISTINCT FROM (OLD.logo_gonderim_durumu, OLD.logo_kayit_no, OLD.logo_kart_turu, OLD.logo_birim_seti, OLD.logo_gonderim_zamani) THEN
    RAISE EXCEPTION 'Logo''ya gönderilmiş kartın gönderim kaydı değişmez (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_logo_gonderildi';
  END IF;
  IF OLD.logo_gonderim_durumu IS NOT NULL AND NEW.logo_gonderim_durumu IS NULL THEN
    RAISE EXCEPTION 'Logo gönderim durumu boşaltılmaz (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_logo_gonderildi';
  END IF;
  IF NOT OLD.aktif_oldu AND NEW.onay_durumu = 'aktif' AND NEW.logo_gonderim_durumu IS NULL THEN
    NEW.logo_gonderim_durumu := 'bekliyor';
  END IF;
  NEW.aktif_oldu := OLD.aktif_oldu OR NEW.onay_durumu IN ('aktif', 'pasif');
  RETURN NEW;
END $$;

-- Onay akışı kapalıyken kart doğrudan aktif açılır: ilk aktiflik eklemededir.
CREATE OR REPLACE FUNCTION malzeme_katalog_karti_aktif_isaret() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT NEW.aktif_oldu AND NEW.onay_durumu = 'aktif' AND NEW.logo_gonderim_durumu IS NULL THEN
    NEW.logo_gonderim_durumu := 'bekliyor';
  END IF;
  NEW.aktif_oldu := NEW.aktif_oldu OR NEW.onay_durumu IN ('aktif', 'pasif');
  RETURN NEW;
END $$;

-- TMI türü ve birimi karşılığında Logo kart türü ve birim seti. Değer konmaz: yönetici doldurur (Logo kılavuzu depoda yok).
CREATE TABLE malzeme_logo_karsiligi (
  cesit text NOT NULL CONSTRAINT malzeme_logo_karsiligi_cesit CHECK (cesit IN ('tur', 'birim')),
  tmi_degeri text NOT NULL CONSTRAINT malzeme_logo_karsiligi_tmi_dolu CHECK (btrim(tmi_degeri) <> '' AND length(tmi_degeri) <= 40),
  logo_degeri text CONSTRAINT malzeme_logo_karsiligi_logo_dolu CHECK (logo_degeri IS NULL OR (btrim(logo_degeri) <> '' AND length(logo_degeri) <= 40)),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cesit, tmi_degeri),
  CONSTRAINT malzeme_logo_karsiligi_tur CHECK (cesit <> 'tur' OR tmi_degeri IN ('hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas'))
);
