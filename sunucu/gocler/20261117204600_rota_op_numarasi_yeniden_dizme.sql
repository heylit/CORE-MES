-- 3250-2 (3250 b, 3251 b, 3252 b, 3250-1b-5 a): OP numarası revizyonda adımın sırasından verilir (10, 20, 30). Ürün düzeyinde kalıcı
-- olan numara değil operasyonun gizli kimliğidir (rota_op_numarasi.id). Defterin op_no'su ürün içinde tekil kalır ama ekranda görünmez:
-- ürün düzeyi tablolar (talimat, sahne, süre, numune planı, markalama) bu "kayıtlı numara" ile yazar; adımın numarası artık ondan ayrıdır.
-- VERİ DÖNÜŞTÜRÜR: yürürlükteki, taslak ve onay bekleyen revizyonların adım numaraları ve onlara numarayla bağlı revizyon düzeyi satırlar
-- (adım şartnamesi, reçete-rota adım bağı ve giren statüsü, statü kaynak adımı) aynı işlemde yeniden yazılır. Yürürlükten kalkmış ve iptal
-- revizyonlar, açılmış emirler ve ürün düzeyi tabloların op_no sütunu değişmez (onlar kimlikle okunur). Geri dönüş: göç öncesi tam yedek.
-- Tek dosyadır (Risk K3): göç aracı her dosyayı ayrı işlemde uygular, parçalı uygulanmasın.

-- Öncesi sayım ve durdurma koşulları (Risk K1, K2, K4, K5). Sonuçlar göç çıktısına NOTICE olarak düşer.
DO $$
DECLARE
  n_revizyon int; n_adim int; n_degisen int; n_emir_bos int; n_statu int; n_statu_yetim int; n_statu_bos int; n_giren int; n_bag int;
BEGIN
  SELECT count(*) INTO n_revizyon FROM rota_revizyonu WHERE durum IN ('yururlukte', 'taslak', 'onay_bekliyor');
  SELECT count(*), count(*) FILTER (WHERE a.op_no <> a.sira * 10) INTO n_adim, n_degisen
    FROM rota_adimi a JOIN rota_revizyonu r ON r.id = a.revizyon_id WHERE r.durum IN ('yururlukte', 'taslak', 'onay_bekliyor');
  -- K1: açık emrin rotadan gelen iş emrinde kimlik yoksa önce doldurulur; dolmayan kalırsa göç durur.
  EXECUTE 'ALTER TABLE uretim_emirleri_is_emri DISABLE TRIGGER uretim_emirleri_is_emri_degisiklik';
  UPDATE uretim_emirleri_is_emri i
     SET operasyon_id = uretim_emirleri_is_emri_operasyonu(i.uretim_emri_id, i.tur, i.op_no, i.dugum_malzeme_id, i.kaynak_op_no)
    FROM uretim_emri e
   WHERE e.id = i.uretim_emri_id AND e.durum IN ('taslak', 'planli', 'basladi') AND i.tur = 'rota' AND i.operasyon_id IS NULL;
  EXECUTE 'ALTER TABLE uretim_emirleri_is_emri ENABLE TRIGGER uretim_emirleri_is_emri_degisiklik';
  -- Rotasız emir (B13, kaynak revizyonu yok) operasyon kimliği taşımaz; sayılmaz.
  SELECT count(*) INTO n_emir_bos FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
   WHERE e.durum IN ('taslak', 'planli', 'basladi') AND e.kaynak_rota_revizyonu_id IS NOT NULL AND i.tur = 'rota' AND i.operasyon_id IS NULL;
  -- K2: statüler; '<malzeme>-o<op>' biçimli olup kimliği olmayan ya da revizyonsuz olanlar ayrıca sayılır.
  SELECT count(*), count(*) FILTER (WHERE s.kaynak_adim ~ '^[0-9]+-o[0-9]+$' AND s.operasyon_id IS NULL),
         count(*) FILTER (WHERE s.kaynak_adim ~ '^[0-9]+-o[0-9]+$' AND s.rota_revizyonu_id IS NULL)
    INTO n_statu, n_statu_bos, n_statu_yetim FROM recete_rota_statu s;
  SELECT count(*) INTO n_bag FROM recete_rota_adim_bagi;
  SELECT count(*) INTO n_giren FROM recete_rota_giren_statusu;
  RAISE NOTICE '3250-2 oncesi: revizyon %, adim %, numarasi degisecek adim %, acik emirde kimliksiz is emri %, statu % (kimliksiz %, revizyonsuz %), adim bagi %, giren statusu %',
    n_revizyon, n_adim, n_degisen, n_emir_bos, n_statu, n_statu_bos, n_statu_yetim, n_bag, n_giren;
  IF n_emir_bos > 0 THEN
    RAISE EXCEPTION '3250-2: acik emirde operasyon kimligi bulunamayan % is emri var; goc durdu (Risk K1)', n_emir_bos;
  END IF;
END $$;

-- Şema: adımın numarası defterdeki kayıtlı numara değildir (adımın operasyonu operasyon_id'dedir; yabancı anahtarı zaten vardır).
ALTER TABLE rota_adimi DROP CONSTRAINT rota_adimi_op_kayitli;

-- Adımın kimliğini kod verir (taslak kaydı numarayı sıradan yeniden verir): numara değişince kimlik yeniden çözülmez. Kimliği verilmeyen
-- doğrudan ekleme (eski yazan, test) defterdeki o numaranın operasyonunu alır.
DROP TRIGGER rota_adimi_operasyon ON rota_adimi;
CREATE FUNCTION rota_adimi_operasyon_defterden() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.operasyon_id IS NULL THEN
    NEW.operasyon_id := (SELECT o.id FROM rota_op_numarasi o WHERE o.malzeme_id = NEW.malzeme_id AND o.op_no = NEW.op_no ORDER BY o.id DESC LIMIT 1);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rota_adimi_operasyon BEFORE INSERT ON rota_adimi FOR EACH ROW EXECUTE FUNCTION rota_adimi_operasyon_defterden();

-- Ekrandaki numara (malzeme, OP) adımdan çözülür: yürürlükteki revizyon, yoksa iptal olmayan en yeni revizyon, o da yoksa numara defteri.
CREATE OR REPLACE FUNCTION rota_ekrandaki_operasyon(p_malzeme int, p_op int) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT a.operasyon_id FROM rota_adimi a JOIN rota_revizyonu r ON r.id = a.revizyon_id
      WHERE a.malzeme_id = p_malzeme AND a.op_no = p_op AND r.durum <> 'iptal'
      ORDER BY r.durum = 'yururlukte' DESC, r.id DESC LIMIT 1),
    (SELECT o.id FROM rota_op_numarasi o WHERE o.malzeme_id = p_malzeme AND o.op_no = p_op ORDER BY o.id LIMIT 1))
$$;
CREATE OR REPLACE FUNCTION rota_operasyon_kimligi_doldur() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  satir jsonb := to_jsonb(NEW);
BEGIN
  IF TG_OP = 'INSERT' AND satir ->> TG_ARGV[2] IS NOT NULL THEN
    RETURN NEW;
  END IF;
  NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[2], CASE WHEN TG_NARGS > 3 AND TG_ARGV[3] = 'ekran'
    THEN rota_ekrandaki_operasyon((satir ->> TG_ARGV[0])::int, (satir ->> TG_ARGV[1])::int)
    ELSE (SELECT o.id FROM rota_op_numarasi o WHERE o.malzeme_id = (satir ->> TG_ARGV[0])::int AND o.op_no = (satir ->> TG_ARGV[1])::int) END));
  RETURN NEW;
END $$;
-- Tetikleyicinin dördüncü değişkeni numaranın türüdür: yok = defterdeki kayıtlı numara (ürün düzeyi tablolar), 'ekran' = rotanın bugün
-- gösterdiği numara (başka ürünün adımına numarayla bağlanan giren statüsü).
DROP TRIGGER recete_rota_giren_statusu_giren_operasyon ON recete_rota_giren_statusu;
CREATE TRIGGER recete_rota_giren_statusu_giren_operasyon BEFORE INSERT OR UPDATE OF giren_malzeme_id, giren_op_no ON recete_rota_giren_statusu
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('giren_malzeme_id', 'giren_op_no', 'giren_operasyon_id', 'ekran');

-- Revizyona bağlı reçete-rota satırında kimlik o revizyonun adımındandır; revizyonsuz eski satır ekrandaki adımdan.
CREATE FUNCTION recete_rota_revizyon_operasyonu(p_revizyon int, p_malzeme int, p_op int) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_revizyon IS NULL THEN rota_ekrandaki_operasyon(p_malzeme, p_op)
    ELSE (SELECT a.operasyon_id FROM rota_adimi a WHERE a.revizyon_id = p_revizyon AND a.op_no = p_op) END
$$;
CREATE FUNCTION recete_rota_satir_operasyonu() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.operasyon_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  NEW.operasyon_id := recete_rota_revizyon_operasyonu(NEW.rota_revizyonu_id, NEW.malzeme_id, NEW.op_no);
  RETURN NEW;
END $$;
DROP TRIGGER recete_rota_adim_bagi_operasyon ON recete_rota_adim_bagi;
DROP TRIGGER recete_rota_giren_statusu_operasyon ON recete_rota_giren_statusu;
CREATE TRIGGER recete_rota_adim_bagi_operasyon BEFORE INSERT OR UPDATE OF rota_revizyonu_id, malzeme_id, op_no ON recete_rota_adim_bagi
  FOR EACH ROW EXECUTE FUNCTION recete_rota_satir_operasyonu();
CREATE TRIGGER recete_rota_giren_statusu_operasyon BEFORE INSERT OR UPDATE OF rota_revizyonu_id, malzeme_id, op_no ON recete_rota_giren_statusu
  FOR EACH ROW EXECUTE FUNCTION recete_rota_satir_operasyonu();

CREATE OR REPLACE FUNCTION recete_rota_statu_operasyonu() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p text[] := regexp_match(NEW.kaynak_adim, '^([0-9]{1,9})-o([0-9]{1,9})$');
BEGIN
  NEW.operasyon_id := CASE WHEN p IS NULL THEN NULL
    ELSE recete_rota_revizyon_operasyonu(NEW.rota_revizyonu_id, p[1]::int, p[2]::int) END;
  RETURN NEW;
END $$;

-- Model yüzeyinin işlemi (geometri) ekrandaki numarayla yazılır: kimlik kartın ekrandaki adımından, kayıtlı numaradan değil.
CREATE OR REPLACE FUNCTION geometri_yuzey_islem_operasyonu(p_revizyon int, p_op int) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT rota_ekrandaki_operasyon(b.hedef_id, p_op)
    FROM belge_merkezi_revizyon r
    JOIN belge_merkezi_bag b ON b.belge_id = r.belge_id AND b.hedef_modul = 'malzemeler'
   WHERE r.id = p_revizyon
     AND (SELECT count(*) FROM belge_merkezi_bag x WHERE x.belge_id = r.belge_id AND x.hedef_modul = 'malzemeler') = 1
$$;

-- Veri: yeniden dizilecek adımlar (eski -> yeni = sıra * 10).
CREATE TABLE gecici_3250_op_esle AS
  SELECT a.revizyon_id, a.malzeme_id, a.op_no AS eski, a.sira * 10 AS yeni, a.operasyon_id, r.durum
    FROM rota_adimi a JOIN rota_revizyonu r ON r.id = a.revizyon_id
   WHERE r.durum IN ('yururlukte', 'taslak', 'onay_bekliyor') AND a.op_no <> a.sira * 10;
CREATE INDEX ON gecici_3250_op_esle (revizyon_id, eski);

-- Göç kayıtlı içeriği kendisi yazar: içerik kilidi ve değişiklik defteri bu işlem içinde kapatılıp açılır (defter numara değişimini
-- kişi değişikliği olarak yazmasın; göç kaydı göç tablosundadır).
ALTER TABLE rota_adimi DISABLE TRIGGER USER;
ALTER TABLE rota_adim_sartnamesi DISABLE TRIGGER USER;
ALTER TABLE recete_rota_adim_bagi DISABLE TRIGGER USER;
ALTER TABLE recete_rota_giren_statusu DISABLE TRIGGER USER;
ALTER TABLE recete_rota_statu DISABLE TRIGGER USER;

-- Tekillik (revizyon_id, op_no) ertelenemez: önce geçici aralığa, sonra yeni numaraya.
UPDATE rota_adimi a SET op_no = a.op_no + 100000000 FROM gecici_3250_op_esle e WHERE e.revizyon_id = a.revizyon_id AND e.eski = a.op_no;
UPDATE rota_adimi a SET op_no = e.yeni FROM gecici_3250_op_esle e WHERE e.revizyon_id = a.revizyon_id AND a.op_no = e.eski + 100000000;

-- Aynı komutta silinip yeniden yazılan anahtar tekillikte çakışır: önce ayrı tabloya alınır.
CREATE TABLE gecici_3250_sartname AS
  SELECT x.revizyon_id, e.yeni, x.sira, x.sartname_id, x.degerler
    FROM rota_adim_sartnamesi x JOIN gecici_3250_op_esle e ON x.revizyon_id = e.revizyon_id AND x.op_no = e.eski;
DELETE FROM rota_adim_sartnamesi x USING gecici_3250_op_esle e WHERE x.revizyon_id = e.revizyon_id AND x.op_no = e.eski;
INSERT INTO rota_adim_sartnamesi (revizyon_id, op_no, sira, sartname_id, degerler)
  SELECT revizyon_id, yeni, sira, sartname_id, degerler FROM gecici_3250_sartname;
DROP TABLE gecici_3250_sartname;

UPDATE recete_rota_adim_bagi b SET op_no = b.op_no + 100000000 FROM gecici_3250_op_esle e WHERE e.revizyon_id = b.rota_revizyonu_id AND e.eski = b.op_no;
UPDATE recete_rota_adim_bagi b SET op_no = e.yeni FROM gecici_3250_op_esle e WHERE e.revizyon_id = b.rota_revizyonu_id AND b.op_no = e.eski + 100000000;
UPDATE recete_rota_giren_statusu g SET op_no = g.op_no + 100000000 FROM gecici_3250_op_esle e WHERE e.revizyon_id = g.rota_revizyonu_id AND e.eski = g.op_no;
UPDATE recete_rota_giren_statusu g SET op_no = e.yeni FROM gecici_3250_op_esle e WHERE e.revizyon_id = g.rota_revizyonu_id AND g.op_no = e.eski + 100000000;
-- Giren statüsünün giren_op_no'su başka ürünün operasyonudur: o operasyonun yürürlükteki (yoksa yeniden dizilen) numarası.
UPDATE recete_rota_giren_statusu g SET giren_op_no = y.yeni
  FROM (SELECT DISTINCT ON (operasyon_id) operasyon_id, yeni FROM gecici_3250_op_esle ORDER BY operasyon_id, durum = 'yururlukte' DESC, revizyon_id DESC) y
 WHERE g.giren_operasyon_id = y.operasyon_id AND g.giren_op_no IS DISTINCT FROM y.yeni;

-- Model yüzeyinin işlemi operasyonunun yürürlükteki (yoksa yeniden dizilen en yeni) numarasını alır; kimliği olmayan satır değişmez.
ALTER TABLE geometri_yuzey_islem DISABLE TRIGGER USER;
UPDATE geometri_yuzey_islem g SET op_no = y.yeni
  FROM (SELECT DISTINCT ON (operasyon_id) operasyon_id, yeni FROM gecici_3250_op_esle ORDER BY operasyon_id, durum = 'yururlukte' DESC, revizyon_id DESC) y
 WHERE g.operasyon_id = y.operasyon_id AND g.op_no IS DISTINCT FROM y.yeni;
ALTER TABLE geometri_yuzey_islem ENABLE TRIGGER USER;

-- Statü kaynak adımı '<malzeme>-o<op>' yeni numarayla (3250-1b-5 a); tekil dizinde çakışmasın diye önce geçici önekle.
CREATE TABLE gecici_3250_statu_esle AS
  SELECT s.id, s.kaynak_adim AS eski, (regexp_match(s.kaynak_adim, '^([0-9]+)-o'))[1] || '-o' || e.yeni AS yeni
    FROM recete_rota_statu s
    JOIN LATERAL (
      SELECT x.yeni FROM gecici_3250_op_esle x
       WHERE x.operasyon_id = s.operasyon_id AND (s.rota_revizyonu_id IS NULL OR x.revizyon_id = s.rota_revizyonu_id)
       ORDER BY x.durum = 'yururlukte' DESC, x.revizyon_id DESC LIMIT 1
    ) e ON true
   WHERE s.kaynak_adim ~ '^[0-9]+-o[0-9]+$' AND s.operasyon_id IS NOT NULL;
DO $$
DECLARE n_cakisma int;
BEGIN
  SELECT count(*) INTO n_cakisma FROM gecici_3250_statu_esle e JOIN recete_rota_statu s ON s.kaynak_adim = e.yeni
   WHERE s.id <> e.id AND NOT EXISTS (SELECT 1 FROM gecici_3250_statu_esle k WHERE k.id = s.id)
     AND coalesce(s.rota_revizyonu_id, 0) = coalesce((SELECT rota_revizyonu_id FROM recete_rota_statu WHERE id = e.id), 0);
  IF n_cakisma > 0 THEN
    RAISE EXCEPTION '3250-2: yeni kaynak adimi % statude baska statuyle cakisiyor; goc durdu (Risk K2)', n_cakisma;
  END IF;
END $$;
UPDATE recete_rota_statu s SET kaynak_adim = 'gecici-' || s.kaynak_adim FROM gecici_3250_statu_esle e WHERE e.id = s.id;
UPDATE recete_rota_statu s SET kaynak_adim = e.yeni FROM gecici_3250_statu_esle e WHERE e.id = s.id;

-- Ertelenmiş anahtar denetimleri (şartname -> adım) şimdi koşar; bekleyen olay varken tetikleyici açılamaz.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE rota_adimi ENABLE TRIGGER USER;
ALTER TABLE rota_adim_sartnamesi ENABLE TRIGGER USER;
ALTER TABLE recete_rota_adim_bagi ENABLE TRIGGER USER;
ALTER TABLE recete_rota_giren_statusu ENABLE TRIGGER USER;
ALTER TABLE recete_rota_statu ENABLE TRIGGER USER;

-- Sonrası denetim: her yeniden dizilen revizyonda numara sıranın onkatıdır; kimlikler ve satır sayıları değişmedi.
DO $$
DECLARE n_bozuk int; n_kimlik int; n_sartname_yetim int;
BEGIN
  SELECT count(*) INTO n_bozuk FROM rota_adimi a JOIN rota_revizyonu r ON r.id = a.revizyon_id
   WHERE r.durum IN ('yururlukte', 'taslak', 'onay_bekliyor') AND a.op_no <> a.sira * 10;
  SELECT count(*) INTO n_kimlik FROM gecici_3250_op_esle e
   WHERE NOT EXISTS (SELECT 1 FROM rota_adimi a WHERE a.revizyon_id = e.revizyon_id AND a.op_no = e.yeni AND a.operasyon_id = e.operasyon_id);
  SELECT count(*) INTO n_sartname_yetim FROM rota_adim_sartnamesi x
   WHERE NOT EXISTS (SELECT 1 FROM rota_adimi a WHERE a.revizyon_id = x.revizyon_id AND a.op_no = x.op_no);
  RAISE NOTICE '3250-2 sonrasi: yeniden dizilen adim %, sira disi numara %, kimligi kayan %, yetim sartname %',
    (SELECT count(*) FROM gecici_3250_op_esle), n_bozuk, n_kimlik, n_sartname_yetim;
  IF n_bozuk > 0 OR n_kimlik > 0 OR n_sartname_yetim > 0 THEN
    RAISE EXCEPTION '3250-2: sonrasi denetimi tutmadi; goc geri alindi';
  END IF;
END $$;

DROP TABLE gecici_3250_statu_esle;
DROP TABLE gecici_3250_op_esle;
