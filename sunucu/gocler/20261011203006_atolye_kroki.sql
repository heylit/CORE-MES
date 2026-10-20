-- Salonun krokisi (mimari plan PDF'i): düzenleyicide yerleşimin altında gerçek ölçüyle görünür. Dosya şirket verisidir,
-- veritabanında 512 KiB'lık parçalarla durur (modeldeki gibi); depoya girmez. Salon başına tek kroki; yenisi eskisinin
-- yerine geçer. Hizalama, PDF sayfasındaki noktayı (pdf.js görünümü, ölçek 1, sol üst köken, punto) salon metresine
-- çevirir: [x, z] = [hiza_x, hiza_z] + olcek * döndür(hiza_donus) * [u, v]. Hizalanmamış krokinin hizalaması boştur.

CREATE TABLE atolye_kroki (
  salon_id int PRIMARY KEY REFERENCES atolye_salon,
  ad text NOT NULL,
  boyut_bayt int NOT NULL,
  parca_sayisi int NOT NULL,
  -- Saklanan PDF'in SHA-256 özeti (küçük harf onaltılık); tamamlanırken veritabanı yeniden hesaplar.
  ozet text NOT NULL,
  sayfa int NOT NULL DEFAULT 1,
  olcek numeric(14, 10),
  hiza_donus numeric(5, 2),
  hiza_x numeric(9, 3),
  hiza_z numeric(9, 3),
  tamam boolean NOT NULL DEFAULT false,
  surum int NOT NULL DEFAULT 1,
  kaydeden_kisi_id int NOT NULL REFERENCES kisi,
  kaydedildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atolye_kroki_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  CONSTRAINT atolye_kroki_boyutu CHECK (boyut_bayt BETWEEN 20 AND 26214400),
  CONSTRAINT atolye_kroki_parca_sayisi CHECK (parca_sayisi = (boyut_bayt + 524287) / 524288),
  CONSTRAINT atolye_kroki_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  CONSTRAINT atolye_kroki_sayfa CHECK (sayfa BETWEEN 1 AND 9999),
  CONSTRAINT atolye_kroki_hizalama_butun CHECK (
    (olcek IS NULL AND hiza_donus IS NULL AND hiza_x IS NULL AND hiza_z IS NULL)
    OR (olcek IS NOT NULL AND hiza_donus IS NOT NULL AND hiza_x IS NOT NULL AND hiza_z IS NOT NULL)),
  CONSTRAINT atolye_kroki_olcek CHECK (olcek > 0 AND olcek <= 10),
  CONSTRAINT atolye_kroki_hiza_donus CHECK (hiza_donus >= 0 AND hiza_donus < 360),
  CONSTRAINT atolye_kroki_hiza_konum CHECK (abs(hiza_x) <= 100000 AND abs(hiza_z) <= 100000),
  -- Hizalama yalnız tamamlanmış krokiye yazılır.
  CONSTRAINT atolye_kroki_hizalama_tamam CHECK (olcek IS NULL OR tamam),
  CONSTRAINT atolye_kroki_surum_pozitif CHECK (surum >= 1)
);
CREATE INDEX atolye_kroki_kaydeden_idx ON atolye_kroki (kaydeden_kisi_id);

CREATE TABLE atolye_kroki_parca (
  salon_id int NOT NULL REFERENCES atolye_kroki ON DELETE CASCADE,
  sira int NOT NULL,
  veri bytea NOT NULL,
  PRIMARY KEY (salon_id, sira),
  CONSTRAINT atolye_kroki_parca_sirasi CHECK (sira >= 0),
  CONSTRAINT atolye_kroki_parca_boyu CHECK (octet_length(veri) BETWEEN 1 AND 524288)
);

-- Parça yalnız yüklemesi süren krokiye yazılır ya da ondan silinir; sıra parça sayısını aşmaz.
-- Kroki silinirken (cascade) kroki satırı artık yoktur: parça silinmesi geçer.
CREATE FUNCTION atolye_kroki_parca_yazimi() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  k atolye_kroki%ROWTYPE;
BEGIN
  SELECT * INTO k FROM atolye_kroki WHERE salon_id = COALESCE(NEW.salon_id, OLD.salon_id);
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Kroki bulunamadı' USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'atolye_kroki_parca_salon_id_fkey';
  END IF;
  IF k.tamam THEN
    RAISE EXCEPTION 'Tamamlanmış krokinin dosyası değişmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_kroki_degismez';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.sira >= k.parca_sayisi THEN
    RAISE EXCEPTION 'Parça sırası parça sayısını aşıyor (% >= %)', NEW.sira, k.parca_sayisi
      USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_kroki_parca_sirasi';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER atolye_kroki_parca_yazimi BEFORE INSERT OR UPDATE OR DELETE ON atolye_kroki_parca
  FOR EACH ROW EXECUTE FUNCTION atolye_kroki_parca_yazimi();

-- Tamamlama: bütün parçalar gelmiş, toplam boyut ve SHA-256 özeti tutuyor, dosya PDF ("%PDF-" ile başlar). Tamamlanmış
-- krokinin dosya alanları değişmez, tamam geri alınmaz; sürüm birer artar.
CREATE FUNCTION atolye_kroki_guncelleme() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  adet int;
  toplam bigint;
  dosya_ozeti text;
  bas bytea;
BEGIN
  IF NEW.surum <> OLD.surum + 1 THEN
    RAISE EXCEPTION 'Kroki sürümü birer artar (beklenen %, gelen %)', OLD.surum + 1, NEW.surum
      USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_kroki_surum_sirasi';
  END IF;
  IF OLD.tamam AND (NOT NEW.tamam OR NEW.boyut_bayt <> OLD.boyut_bayt OR NEW.parca_sayisi <> OLD.parca_sayisi OR NEW.ozet <> OLD.ozet) THEN
    RAISE EXCEPTION 'Tamamlanmış krokinin dosyası değişmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_kroki_degismez';
  END IF;
  IF NEW.tamam AND NOT OLD.tamam THEN
    SELECT count(*), COALESCE(sum(octet_length(veri)), 0) INTO adet, toplam FROM atolye_kroki_parca WHERE salon_id = NEW.salon_id;
    SELECT encode(sha256(string_agg(veri, ''::bytea ORDER BY sira)), 'hex') INTO dosya_ozeti
      FROM atolye_kroki_parca WHERE salon_id = NEW.salon_id;
    SELECT substring(veri FROM 1 FOR 5) INTO bas FROM atolye_kroki_parca WHERE salon_id = NEW.salon_id AND sira = 0;
    IF adet <> NEW.parca_sayisi OR toplam <> NEW.boyut_bayt OR dosya_ozeti IS DISTINCT FROM NEW.ozet
        OR bas IS DISTINCT FROM '\x255044462d'::bytea THEN
      RAISE EXCEPTION 'Kroki dosyası eksik ya da bozuk' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_kroki_dosyasi';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER atolye_kroki_guncelleme BEFORE UPDATE ON atolye_kroki FOR EACH ROW EXECUTE FUNCTION atolye_kroki_guncelleme();
