-- ECR ve ECO numarası dört haneyi aşınca lpad sağdan keser: 10000. kayıt 'ECR-1000' alır ve 1000. kayıtla tekillikte çakışır,
-- kayıt açılamaz. Öteki numaralar gibi sınırı aşan kimlik olduğu gibi yazılır. Var olan numaralar değişmez: DROP EXPRESSION
-- hesaplanmış değeri satırda bırakır; numara bundan sonra tetikleyiciyle kimlikten kurulur ve elle değiştirilemez.
ALTER TABLE degisiklik_yonetimi_talep ALTER COLUMN no DROP EXPRESSION;
ALTER TABLE degisiklik_yonetimi_emir ALTER COLUMN no DROP EXPRESSION;

CREATE FUNCTION degisiklik_yonetimi_no_kur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.no := TG_ARGV[0] || CASE WHEN NEW.id < 10000 THEN lpad(NEW.id::text, 4, '0') ELSE NEW.id::text END;
  RETURN NEW;
END $$;

CREATE TRIGGER degisiklik_yonetimi_talep_no BEFORE INSERT OR UPDATE OF no ON degisiklik_yonetimi_talep
  FOR EACH ROW EXECUTE FUNCTION degisiklik_yonetimi_no_kur('ECR-');
CREATE TRIGGER degisiklik_yonetimi_emir_no BEFORE INSERT OR UPDATE OF no ON degisiklik_yonetimi_emir
  FOR EACH ROW EXECUTE FUNCTION degisiklik_yonetimi_no_kur('ECO-');

ALTER TABLE degisiklik_yonetimi_talep ALTER COLUMN no SET NOT NULL;
ALTER TABLE degisiklik_yonetimi_emir ALTER COLUMN no SET NOT NULL;
