-- 2114 (2114-1 a, 2114-2 teyit, 2114-3 a): kullanılmamış kart silinir; satırı iptal olarak kalır. Kartın kullanılıp kullanılmadığını
-- uygulama, kayıt noktasında bir silme denemesiyle yabancı anahtarlara sorar ve denemeden her durumda geri döner; bunun için
-- tetik, Logo kayıt numarası boş kartta silmeye izin verir. Logo'ya gönderilmiş kart silinmez (önce Logo'dan silinmeli, 2114b).
-- Yalnız tetik fonksiyonu değişir; var olan satırlara dokunulmaz.

CREATE OR REPLACE FUNCTION malzeme_katalog_karti_koru() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.logo_kayit_no IS NOT NULL THEN
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
