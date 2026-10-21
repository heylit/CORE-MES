-- 379 a (kullanıcı kararı, 2026-10-21): taslağın değişiklik defteri silinmez. Tek tek kaldırılan ya da "değişiklikleri at"la düşen kayıt
-- yerinde kalır; kimin ve ne zaman kaldırdığı işaretlenir. Defteri okuyanlar yalnız kaldırılmamış kayıtları görür.
-- Var olan satırlar kaldırılmamıştır: iki sütun boş kalır.
ALTER TABLE plan_senaryo_degisikligi
  ADD COLUMN kaldiran_kisi_id int REFERENCES kisi,
  ADD COLUMN kaldirma timestamptz,
  ADD CONSTRAINT plan_senaryo_degisikligi_kaldirma CHECK ((kaldiran_kisi_id IS NULL) = (kaldirma IS NULL));

-- Açık taslakta da silme yok; kaldırılmış kayıt geri alınmaz ve değişmez (286 b deneme verisi dışında). Kapanmış senaryonun kuralı
-- plan_senaryo_satiri_korunur'dadır.
CREATE FUNCTION plan_senaryo_degisikligi_silinmez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Defter kaydı silinmez, kaldırılmış diye işaretlenir (plan_senaryo_degisikligi %)', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.kaldirma IS NOT NULL AND to_jsonb(NEW) - 'veri' <> to_jsonb(OLD) - 'veri' THEN
    RAISE EXCEPTION 'Kaldırılmış defter kaydı değişmez (plan_senaryo_degisikligi %)', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER plan_senaryo_degisikligi_silinmez BEFORE UPDATE OR DELETE ON plan_senaryo_degisikligi
  FOR EACH ROW EXECUTE FUNCTION plan_senaryo_degisikligi_silinmez();
