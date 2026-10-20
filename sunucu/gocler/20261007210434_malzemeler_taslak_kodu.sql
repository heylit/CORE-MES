-- Hiç aktif olmamış taslak kartın türü ve stok kodu (önek, sıra) değişebilir; bir kez aktif olmuş ya da taslak dışındaki kartta kilit aynıdır. Açan kişi ve sayı kimliği hiçbir durumda değişmez.
-- `aktif_oldu`: kart bir kez aktif ya da pasif olduysa doğru; trigger onu yükseltir (ekleme ve güncellemede), geri düşürmez.
ALTER TABLE malzeme_katalog_karti ADD COLUMN aktif_oldu boolean NOT NULL DEFAULT false;

-- Var olan kartlar: aktif ya da pasif olanlar ve sunucunun bastığı onay ya da pasife alma damgası taşıyanlar "aktif olmuş" sayılır.
-- Hiç iz taşımayan taslak ve onaydaki kartlar aktif olmamış sayılır (iz bırakmadan aktif olmuş eski kart bilinemez).
UPDATE malzeme_katalog_karti SET aktif_oldu = true
 WHERE onay_durumu IN ('aktif', 'pasif') OR onaylama IS NOT NULL
    OR kayit #> '{onay,onay}' IS NOT NULL OR kayit #> '{onay,pasif}' IS NOT NULL;

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
  NEW.aktif_oldu := OLD.aktif_oldu OR NEW.onay_durumu IN ('aktif', 'pasif');
  RETURN NEW;
END $$;

-- Servis dışı INSERT ile aktif ya da pasif açılan kart da işaretlenir.
CREATE FUNCTION malzeme_katalog_karti_aktif_isaret() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.aktif_oldu := NEW.aktif_oldu OR NEW.onay_durumu IN ('aktif', 'pasif');
  RETURN NEW;
END $$;
CREATE TRIGGER malzeme_katalog_karti_aktif_isaret BEFORE INSERT ON malzeme_katalog_karti
  FOR EACH ROW EXECUTE FUNCTION malzeme_katalog_karti_aktif_isaret();
