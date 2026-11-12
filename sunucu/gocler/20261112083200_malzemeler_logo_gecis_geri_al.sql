-- 3068 a "Logo geçişi": toplu Bağla ve Al "Bu işlemi geri al" ile yalnız CORE'da geri döner; Logo'ya hiçbir şey gitmez.
-- İz tablosu işlemde dokunulan kartı ve bağlamadan önceki gönderim alanlarını tutar; kart silinirse izi de gider. Yeni, boş tablo.
-- Koruma tetiği tek yerde gevşer: uygulama geri aldığı kartın kimliğini transaction'a özgü ayara yazar; yalnız o kartta, Logo'da
-- pasife alma isteği yokken, Logo kaydı boşaltılır ya da alınan taslak silinir. Ayar yoksa tetik bugünkü gibidir. Var olan satır değişmez.

CREATE TABLE malzeme_logo_gecis_izi (
  islem uuid NOT NULL,
  kart_no int NOT NULL REFERENCES malzeme_katalog_karti (no) ON DELETE CASCADE,
  tur text NOT NULL CONSTRAINT malzeme_logo_gecis_izi_tur CHECK (tur IN ('al', 'bagla')),
  logo_kayit_no text NOT NULL CONSTRAINT malzeme_logo_gecis_izi_kayit CHECK (btrim(logo_kayit_no) <> ''),
  -- Kartın işlemden hemen sonraki sürümü: sonra değişen kart geri alınmaz.
  surum int NOT NULL,
  -- Bağlamada kartın önceki Logo gönderim alanları (durum, zaman, hata); almada yok.
  onceki jsonb CONSTRAINT malzeme_logo_gecis_izi_onceki CHECK ((tur = 'bagla') = (onceki IS NOT NULL)),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (islem, kart_no)
);
CREATE INDEX malzeme_logo_gecis_izi_kart ON malzeme_logo_gecis_izi (kart_no);

-- İşlev 20261105084000 sürümünün üzerine yazılır; yalnız geri alma kolu eklenir.
CREATE OR REPLACE FUNCTION malzeme_katalog_karti_koru() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  yeni_koda_gecis boolean;
  -- 3068 a: geri alma yalnız uygulamanın o an geri aldığı tek kart için açılır (transaction'a özgü ayar, kartın kimliğiyle).
  geri_al boolean := current_setting('tmiv2.logo_gecis_geri_al', true) IS NOT DISTINCT FROM OLD.kimlik;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.logo_kayit_no IS NOT NULL AND OLD.logo_pasif_durumu IS DISTINCT FROM 'bekliyor' AND OLD.logo_pasif_durumu IS DISTINCT FROM 'hata'
       AND NOT (geri_al AND OLD.logo_pasif_durumu IS NULL) THEN
      RAISE EXCEPTION 'Logo''ya gönderilmiş malzeme kartı silinmez (kart %)', OLD.kimlik
        USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_silinmez';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.acan_kisi_id IS DISTINCT FROM OLD.acan_kisi_id THEN
    RAISE EXCEPTION 'Stok kodu, tür ve açan kişi değişmez (kart %)', OLD.kimlik USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_degismez';
  END IF;
  yeni_koda_gecis := NEW.onek = OLD.onek AND NEW.tur = OLD.tur AND NEW.sira_no <> OLD.sira_no AND OLD.logo_kayit_no IS NULL
    AND NEW.onceki_kodlar = OLD.onceki_kodlar || OLD.stok_kodu;
  IF NEW.onceki_kodlar IS DISTINCT FROM OLD.onceki_kodlar AND NOT yeni_koda_gecis THEN
    RAISE EXCEPTION 'Önceki kodlar yalnız yeni koda geçişte eklenir (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_onceki_kodlar';
  END IF;
  IF (OLD.onay_durumu <> 'taslak' OR OLD.aktif_oldu) AND NOT yeni_koda_gecis
     AND (NEW.onek, NEW.sira_no, NEW.tur) IS DISTINCT FROM (OLD.onek, OLD.sira_no, OLD.tur) THEN
    RAISE EXCEPTION 'Stok kodu, tür ve açan kişi değişmez (kart %)', OLD.kimlik USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_degismez';
  END IF;
  IF OLD.logo_kayit_no IS NOT NULL AND (
       (NEW.onek, NEW.sira_no, NEW.tur) IS DISTINCT FROM (OLD.onek, OLD.sira_no, OLD.tur)
       OR NEW.kayit #>> '{com,birim}' IS DISTINCT FROM OLD.kayit #>> '{com,birim}') THEN
    RAISE EXCEPTION 'Logo kaydı olan kartın stok kodu, türü ve birimi değişmez (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_logo_kilidi';
  END IF;
  IF OLD.logo_gonderim_durumu = 'gonderildi' AND (NEW.logo_gonderim_durumu, NEW.logo_kayit_no, NEW.logo_kart_turu, NEW.logo_birim_seti, NEW.logo_gonderim_zamani)
       IS DISTINCT FROM (OLD.logo_gonderim_durumu, OLD.logo_kayit_no, OLD.logo_kart_turu, OLD.logo_birim_seti, OLD.logo_gonderim_zamani)
     AND NOT (geri_al AND NEW.logo_kayit_no IS NULL AND OLD.logo_pasif_durumu IS NULL) THEN
    RAISE EXCEPTION 'Logo''ya gönderilmiş kartın gönderim kaydı değişmez (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_logo_gonderildi';
  END IF;
  IF OLD.logo_gonderim_durumu IS NOT NULL AND NEW.logo_gonderim_durumu IS NULL AND NOT (geri_al AND NEW.logo_kayit_no IS NULL) THEN
    RAISE EXCEPTION 'Logo gönderim durumu boşaltılmaz (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_logo_gonderildi';
  END IF;
  IF NOT OLD.aktif_oldu AND NEW.onay_durumu = 'aktif' AND NEW.logo_gonderim_durumu IS NULL THEN
    NEW.logo_gonderim_durumu := 'bekliyor';
  END IF;
  NEW.aktif_oldu := OLD.aktif_oldu OR NEW.onay_durumu IN ('aktif', 'pasif');
  RETURN NEW;
END $$;
