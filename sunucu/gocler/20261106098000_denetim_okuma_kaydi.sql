-- 2158-4 a, 2158-8 a: sınırlı hesabın (denetçi, misafir) her okuması yol, kayıt ve zamanla buraya yazılır; iç hesabın okuması
-- yazılmaz. Denetim kaydından ayrıdır: o hiç silinmez, bu 2 yıl (730 gün) saklanır. Yeni ve boş tablo; var olan tabloya dokunulmaz.
-- Parametre ve sorgu yalnız tam sayı kimlik taşır; öteki değerler yazılmadan önce "[gizli]" olur (denetim kurallar.okumaIzi).
CREATE TABLE okuma_kaydi (
  id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT okuma_kaydi_pk PRIMARY KEY,
  zaman timestamptz NOT NULL DEFAULT now(),
  kisi_id int NOT NULL CONSTRAINT okuma_kaydi_kisi_fk REFERENCES kisi,
  modul text,
  yol text NOT NULL,
  parametre jsonb,
  sorgu jsonb
);
CREATE INDEX okuma_kaydi_zaman ON okuma_kaydi (zaman DESC);
CREATE INDEX okuma_kaydi_kisi ON okuma_kaydi (kisi_id, zaman DESC);

-- Kayıt değiştirilemez ve boşaltılamaz; yalnız saklama süresi dolan satır silinir (günlük iş). Süre veritabanında da durur:
-- uygulama bağlantısı yeni kaydı silemez.
CREATE FUNCTION okuma_kaydi_suresi_dolmadan_silinmez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.zaman >= now() - interval '730 days' THEN
    RAISE EXCEPTION 'okuma kaydı saklama süresi dolmadan silinemez (id %)', OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER okuma_kaydi_degismez BEFORE UPDATE ON okuma_kaydi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER okuma_kaydi_silinmez BEFORE DELETE ON okuma_kaydi
  FOR EACH ROW EXECUTE FUNCTION okuma_kaydi_suresi_dolmadan_silinmez();
CREATE TRIGGER okuma_kaydi_bosaltilmaz BEFORE TRUNCATE ON okuma_kaydi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
