-- Bakiye hareket defterine bağlanır (1692 b teyit). Bir işlemde stok_bakiye'deki her değişiklik, aynı işlemde yazılan stok_hareketi
-- etkisiyle anahtar başına (malzeme, konum, parti, statü, kalite) birebir karşılanmalıdır; karşılanmayan fark işlem sonunda reddedilir.
-- Tersi de geçerlidir: bakiyeye yansımayan hareket de reddedilir. Denetim fark üzerindendir, geçmiş bakiyenin defterle tutması
-- aranmaz; geçmişteki uyumsuzluk 1692 a'nın gece karşılaştırmasıyla görünür.
-- Tablo sahibi (göç kullanıcısı) muaftır: sahip tetiği zaten kapatabilir, muafiyet koruma eklemez ya da çıkarmaz; düzeltme göçleri
-- ve test fikstürleri sahiple yazar. Uygulama kullanıcısı muaf değildir.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM stok_bakiye;
  RAISE NOTICE 'stok_bakiye_defter_tetigi: % bakiye satiri; veri degismez, yalniz yeni yazimlar denetlenir.', n;
END $$;

-- İşlem içi ara toplam. İşlem sonunda denetlenen anahtar silinir; geri alınan işlemin satırları kendiliğinden geri alınır.
-- Uygulama kullanıcısı bu tabloya erişemez; tetik işlevleri sahibin yetkisiyle yazar.
CREATE TABLE stok_bakiye_defter_bekleyen (
  islem bigint NOT NULL,
  malzeme_id integer NOT NULL,
  konum_id int NOT NULL,
  parti_id bigint,
  statu_id int,
  kalite_durumu text NOT NULL,
  fark numeric NOT NULL,
  CONSTRAINT stok_bakiye_defter_bekleyen_tek UNIQUE NULLS NOT DISTINCT (islem, malzeme_id, konum_id, parti_id, statu_id, kalite_durumu)
);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
           WHERE table_schema = current_schema() AND table_name = 'stok_bakiye_defter_bekleyen' AND grantee <> current_user LOOP
    EXECUTE format('REVOKE ALL ON stok_bakiye_defter_bekleyen FROM %I', r.grantee);
  END LOOP;
END $$;

-- Tek işlev iki iş görür. "_topla" tetikleri her satırda ara toplama yazar: hareket defterin etkisini ekler, bakiye değişimini
-- çıkarır. "_esit" kısıt tetikleri işlem sonunda satırın anahtarlarını denetler: sıfırsa ara toplamı siler, değilse işlemi reddeder.
-- Sahibin yetkisiyle çalışır ki uygulama kullanıcısı ara toplamı göremesin, yazamasın; arama yolu kullanılmaz, şema tetiğin
-- tablosundan alınır. Sahip muaftır: sahibin yetkisiyle çalışan işlevde current_user değişir, session_user değişmez.
CREATE FUNCTION stok_bakiye_defter() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  y jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  e jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  anahtarlar jsonb := '[]';
  a jsonb;
  fark numeric;
BEGIN
  IF (SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID) = (SELECT r.oid FROM pg_roles r WHERE r.rolname = session_user) THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'stok_hareketi' THEN
    IF y->>'hedef_konum_id' IS NOT NULL THEN
      anahtarlar := anahtarlar || jsonb_build_array(jsonb_build_object('m', y->'malzeme_id', 'k', y->'hedef_konum_id', 'p', y->'parti_id',
        's', y->'hedef_statu_id', 'q', COALESCE(y->>'hedef_kalite_durumu', 'serbest'), 'f', (y->>'miktar')::numeric));
    END IF;
    IF y->>'kaynak_konum_id' IS NOT NULL THEN
      anahtarlar := anahtarlar || jsonb_build_array(jsonb_build_object('m', y->'malzeme_id', 'k', y->'kaynak_konum_id', 'p', y->'parti_id',
        's', y->'kaynak_statu_id', 'q', COALESCE(y->>'kaynak_kalite_durumu', 'serbest'), 'f', -(y->>'miktar')::numeric));
    END IF;
  ELSE
    IF y IS NOT NULL THEN
      anahtarlar := anahtarlar || jsonb_build_array(jsonb_build_object('m', y->'malzeme_id', 'k', y->'konum_id', 'p', y->'parti_id',
        's', y->'statu_id', 'q', y->>'kalite_durumu', 'f', -(y->>'miktar')::numeric));
    END IF;
    IF e IS NOT NULL THEN
      anahtarlar := anahtarlar || jsonb_build_array(jsonb_build_object('m', e->'malzeme_id', 'k', e->'konum_id', 'p', e->'parti_id',
        's', e->'statu_id', 'q', e->>'kalite_durumu', 'f', (e->>'miktar')::numeric));
    END IF;
  END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(anahtarlar) LOOP
    IF TG_NAME LIKE '%\_topla' THEN
      CONTINUE WHEN (a->>'f')::numeric = 0;
      EXECUTE format('INSERT INTO %I.stok_bakiye_defter_bekleyen AS b (islem, malzeme_id, konum_id, parti_id, statu_id, kalite_durumu, fark)
                      VALUES (txid_current(), $1, $2, $3, $4, $5, $6)
                      ON CONFLICT ON CONSTRAINT stok_bakiye_defter_bekleyen_tek DO UPDATE SET fark = b.fark + EXCLUDED.fark', TG_TABLE_SCHEMA)
        USING (a->>'m')::integer, (a->>'k')::int, (a->>'p')::bigint, (a->>'s')::int, a->>'q', (a->>'f')::numeric;
    ELSE
      fark := NULL;
      EXECUTE format('DELETE FROM %I.stok_bakiye_defter_bekleyen WHERE islem = txid_current() AND malzeme_id = $1 AND konum_id = $2
                        AND parti_id IS NOT DISTINCT FROM $3 AND statu_id IS NOT DISTINCT FROM $4 AND kalite_durumu = $5 RETURNING fark', TG_TABLE_SCHEMA)
        INTO fark USING (a->>'m')::integer, (a->>'k')::int, (a->>'p')::bigint, (a->>'s')::int, a->>'q';
      IF fark <> 0 THEN
        RAISE EXCEPTION 'Stok bakiyesi hareket defteriyle eşleşmiyor (malzeme %, konum %, parti %): bakiye, defterden % farklı değişti.',
          a->>'m', a->>'k', COALESCE(a->>'p', '-'), -fark
          USING ERRCODE = 'check_violation', CONSTRAINT = 'stok_bakiye_defter_esit';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER stok_bakiye_defter_topla AFTER INSERT OR UPDATE OF malzeme_id, konum_id, parti_id, statu_id, kalite_durumu, miktar OR DELETE ON stok_bakiye
  FOR EACH ROW EXECUTE FUNCTION stok_bakiye_defter();
CREATE TRIGGER stok_hareketi_defter_topla AFTER INSERT ON stok_hareketi
  FOR EACH ROW EXECUTE FUNCTION stok_bakiye_defter();
CREATE CONSTRAINT TRIGGER stok_bakiye_defter_esit AFTER INSERT OR UPDATE OF malzeme_id, konum_id, parti_id, statu_id, kalite_durumu, miktar OR DELETE ON stok_bakiye
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION stok_bakiye_defter();
CREATE CONSTRAINT TRIGGER stok_hareketi_defter_esit AFTER INSERT ON stok_hareketi
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION stok_bakiye_defter();
