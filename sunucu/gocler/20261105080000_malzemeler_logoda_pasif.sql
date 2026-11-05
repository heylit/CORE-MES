-- 2114b (2114-2 teyit, ADR 0017 eki 8, 2114-7): Logo'ya gönderilmiş kart silinince Logo'da kullanım dışı bırakılır (Logo'dan silinmez).
-- İstek kartta beklerken kart pasiftir; Logo onaylayınca kart iptal olur (Arşiv), Logo alanları kalır (kart Logo'da durur). Logo reddederse
-- kart pasif kalır ve neden Logo gönderimi sayfasında görünür. Kartta yalnız boş olabilen sütunlar eklenir; logo_giden'e işlem türü
-- (gonder / pasif) eklenir. Var olan satırların değeri değişmez.
DO $$
DECLARE kart bigint; giden bigint;
BEGIN
  SELECT count(*) INTO kart FROM malzeme_katalog_karti;
  SELECT count(*) INTO giden FROM logo_giden;
  RAISE NOTICE 'malzeme_katalog_karti: % satır, logo_giden: % satır; göç boş sütun ve işlem türü ekler (var olan satırlar gonder), satır değiştirmez', kart, giden;
END $$;

ALTER TABLE malzeme_katalog_karti
  ADD COLUMN logo_pasif_durumu text CONSTRAINT malzeme_katalog_karti_logo_pasif_durumu CHECK (logo_pasif_durumu IN ('bekliyor', 'hata', 'reddedildi', 'tamam')),
  ADD COLUMN logo_pasif_hata text
    CONSTRAINT malzeme_katalog_karti_logo_pasif_hata_dolu CHECK (logo_pasif_hata IS NULL OR (btrim(logo_pasif_hata) <> '' AND length(logo_pasif_hata) <= 2000)),
  ADD COLUMN logo_pasif_zamani timestamptz,
  ADD COLUMN logo_pasif_kisi_id int REFERENCES kisi,
  -- İstek yalnız Logo kaydı olan kartta; durum, zaman ve isteyen birlikte; hata metni yalnız hata ve retteyken.
  ADD CONSTRAINT malzeme_katalog_karti_logo_pasif_butun CHECK (
    (logo_pasif_durumu IS NULL OR logo_kayit_no IS NOT NULL)
    AND (logo_pasif_durumu IS NULL) = (logo_pasif_zamani IS NULL)
    AND (logo_pasif_durumu IS NULL) = (logo_pasif_kisi_id IS NULL)
    AND (logo_pasif_hata IS NOT NULL) = (logo_pasif_durumu IS NOT DISTINCT FROM 'hata' OR logo_pasif_durumu IS NOT DISTINCT FROM 'reddedildi')
  );

CREATE INDEX malzeme_katalog_karti_logo_pasif_kuyrugu ON malzeme_katalog_karti (no) WHERE logo_pasif_durumu IN ('bekliyor', 'hata');

-- logo_giden'e işlem türü: gönderim ya da Logo'da pasife alma. Var olan satırlar "gonder" sayılır (sabit varsayılan; satır yeniden yazılmaz).
-- Aynı kartın gönderim ve pasife alma izi ayrı satırdır; pasife alma yalnız kart belgelerinde (malzeme, hizmet) olur.
ALTER TABLE logo_giden
  ADD COLUMN islem text NOT NULL DEFAULT 'gonder' CONSTRAINT logo_giden_islem CHECK (islem IN ('gonder', 'pasif')),
  ADD CONSTRAINT logo_giden_pasif_karti CHECK (islem = 'gonder' OR belge_turu IN ('malzeme', 'hizmet'));
ALTER TABLE logo_giden DROP CONSTRAINT logo_giden_pkey;
ALTER TABLE logo_giden ADD CONSTRAINT logo_giden_pkey PRIMARY KEY (belge_turu, belge_no, islem);

-- Tetik tek yerde gevşer: Logo'da pasife alma isteği bekleyen kartta kullanımı soran silme denemesi (uygulama her durumda geri alır).
-- Logo kaydı olan kart kalıcı silinmez; pasife alma onaylansa da kayıt numarası kalır.
CREATE OR REPLACE FUNCTION malzeme_katalog_karti_koru() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.logo_kayit_no IS NOT NULL AND OLD.logo_pasif_durumu IS DISTINCT FROM 'bekliyor' AND OLD.logo_pasif_durumu IS DISTINCT FROM 'hata' THEN
      RAISE EXCEPTION 'Logo''ya gönderilmiş malzeme kartı silinmez (kart %)', OLD.kimlik
        USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_silinmez';
    END IF;
    RETURN OLD;
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
