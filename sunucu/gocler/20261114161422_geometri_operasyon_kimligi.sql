-- Yüzeyin bağlandığı rota adımı operasyonun gizli kimliğini de taşır (3250 b aşama 1); yalnız ekler. Model belgesi tek malzeme
-- kartına bağlıysa kimlik o kartın operasyonudur; birden çok karta ya da hiçbir karta bağlıysa eşleşme belirsizdir, kimlik boş
-- kalır ve sayılır (başka kartın operasyonuna sessizce bağlanmaz).
ALTER TABLE geometri_yuzey_islem ADD COLUMN operasyon_id int CONSTRAINT geometri_yuzey_islem_operasyon REFERENCES rota_op_numarasi (id);

CREATE FUNCTION geometri_yuzey_islem_operasyonu(p_revizyon int, p_op int) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT o.id
    FROM belge_merkezi_revizyon r
    JOIN belge_merkezi_bag b ON b.belge_id = r.belge_id AND b.hedef_modul = 'malzemeler'
    JOIN rota_op_numarasi o ON o.malzeme_id = b.hedef_id AND o.op_no = p_op
   WHERE r.id = p_revizyon
     AND (SELECT count(*) FROM belge_merkezi_bag x WHERE x.belge_id = r.belge_id AND x.hedef_modul = 'malzemeler') = 1
$$;
CREATE FUNCTION geometri_yuzey_islem_operasyon_doldur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.operasyon_id := CASE WHEN NEW.op_no IS NULL THEN NULL ELSE geometri_yuzey_islem_operasyonu(NEW.revizyon_id, NEW.op_no) END;
  RETURN NEW;
END $$;

UPDATE geometri_yuzey_islem g SET operasyon_id = geometri_yuzey_islem_operasyonu(g.revizyon_id, g.op_no) WHERE g.op_no IS NOT NULL;
CREATE INDEX geometri_yuzey_islem_operasyon_idx ON geometri_yuzey_islem (operasyon_id);
CREATE TRIGGER geometri_yuzey_islem_operasyon BEFORE INSERT OR UPDATE OF revizyon_id, op_no ON geometri_yuzey_islem
  FOR EACH ROW EXECUTE FUNCTION geometri_yuzey_islem_operasyon_doldur();
