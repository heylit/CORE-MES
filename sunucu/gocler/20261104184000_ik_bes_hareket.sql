-- BES takibi (kart 1939): personelin Bireysel Emeklilik Sistemi'ne giriş ve çıkış hareketleri. Personelin bugünkü BES durumu
-- son geçerli hareketten çıkar; giriş ve çıkış tarihleri burada tutulur. Yeni boş tablo; var olan tabloya dokunulmaz.
-- Hareket silinmez, iptal edilir: iptal edilen hareket durumu hesaplamaya girmez ama izi kalır.
CREATE TABLE ik_bes_hareket (
  no int GENERATED ALWAYS AS IDENTITY CONSTRAINT ik_bes_hareket_pk PRIMARY KEY,
  personel_no int NOT NULL CONSTRAINT ik_bes_hareket_personel_fk REFERENCES ik_personel (no),
  tur text NOT NULL CONSTRAINT ik_bes_hareket_tur_secenek
    CHECK (tur IN ('otomatik_katilim', 'gonullu_katilim', 'cayma', 'ayrilma', 'isten_cikis')),
  tarih date NOT NULL,
  -- Katkı oranı yalnız girişte yazılır (yüzde; ör. 3,00).
  katki_orani numeric(5,2) CONSTRAINT ik_bes_hareket_oran_araligi CHECK (katki_orani IS NULL OR (katki_orani > 0 AND katki_orani <= 100)),
  emeklilik_sirketi text CONSTRAINT ik_bes_hareket_sirket_bicimi
    CHECK (emeklilik_sirketi IS NULL OR (btrim(emeklilik_sirketi) <> '' AND char_length(emeklilik_sirketi) <= 120)),
  aciklama text CONSTRAINT ik_bes_hareket_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 300)),
  -- 1940 a: hareket yazılırken personelin BES kesinti işareti (ik_personel.bes_katilim). Kişinin bütün hareketleri iptal edilince işaret
  -- ilk hareketin bu değerine döner; işaret null olabildiği için sütun da null olabilir.
  onceki_bes_katilim boolean,
  iptal boolean NOT NULL DEFAULT false,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_bes_hareket_surum_pozitif CHECK (surum > 0),
  yazan_kisi_id int NOT NULL CONSTRAINT ik_bes_hareket_yazan_fk REFERENCES kisi (id),
  yazildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_bes_hareket_oran_yalniz_giriste
    CHECK (tur IN ('otomatik_katilim', 'gonullu_katilim') OR (katki_orani IS NULL AND emeklilik_sirketi IS NULL))
);
-- Aynı gün aynı türde iki geçerli hareket olmaz (çift tık, iki sekme).
CREATE UNIQUE INDEX ik_bes_hareket_gunde_tek ON ik_bes_hareket (personel_no, tarih, tur) WHERE NOT iptal;
CREATE INDEX ik_bes_hareket_personel_idx ON ik_bes_hareket (personel_no, tarih, no);

CREATE FUNCTION ik_bes_hareket_koru() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'BES hareketi silinmez; iptal edilir' USING ERRCODE = 'check_violation', CONSTRAINT = 'ik_bes_hareket_silinmez';
  END IF;
  IF (NEW.personel_no, NEW.tur, NEW.tarih, NEW.onceki_bes_katilim) IS DISTINCT FROM (OLD.personel_no, OLD.tur, OLD.tarih, OLD.onceki_bes_katilim) THEN
    RAISE EXCEPTION 'BES hareketinin personeli, türü ve tarihi değişmez; iptal edip yenisini girin'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ik_bes_hareket_degismez';
  END IF;
  IF OLD.iptal AND NOT NEW.iptal THEN
    RAISE EXCEPTION 'İptal edilen BES hareketi geri açılmaz' USING ERRCODE = 'check_violation', CONSTRAINT = 'ik_bes_hareket_iptal_kesin';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ik_bes_hareket_koru BEFORE UPDATE OR DELETE ON ik_bes_hareket FOR EACH ROW EXECUTE FUNCTION ik_bes_hareket_koru();
CREATE TRIGGER ik_bes_hareket_bosaltilmaz BEFORE TRUNCATE ON ik_bes_hareket FOR EACH STATEMENT EXECUTE FUNCTION ik_bes_hareket_koru();
