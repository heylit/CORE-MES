-- 3672: kapatılan dönemde finans kaydı eklenmez, değişmez, iptal edilmez; dönemi yalnız yönetici gerekçeyle açar.
-- Kilit ve açma ayrı satırlardır (yalnız ekleme): dönemin durumu son satırdır, geçmiş denetim izidir.
CREATE TABLE finans_donem_kilidi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  donem char(7) NOT NULL CONSTRAINT finans_donem_kilidi_donem CHECK (donem ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  islem text NOT NULL CONSTRAINT finans_donem_kilidi_islem CHECK (islem IN ('kilitle', 'ac')),
  neden text CONSTRAINT finans_donem_kilidi_neden CHECK (length(neden) BETWEEN 3 AND 300),
  kisi_id int NOT NULL REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finans_donem_kilidi_neden_gerekli CHECK (islem <> 'ac' OR neden IS NOT NULL)
);
CREATE INDEX finans_donem_kilidi_donem ON finans_donem_kilidi (donem, id DESC);
CREATE TRIGGER finans_donem_kilidi_yalniz_ekleme BEFORE UPDATE OR DELETE ON finans_donem_kilidi FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();

CREATE FUNCTION finans_donem_kilitli(p_tarih date) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT islem = 'kilitle' FROM finans_donem_kilidi WHERE donem = to_char(p_tarih, 'YYYY-MM') ORDER BY id DESC LIMIT 1), false)
$$;

-- Tarihi kilitli dönemde olan satır eklenmez; var olan satır, eski ya da yeni tarihi kilitli dönemdeyse değişmez.
-- Tarih sütununun adı tetikleyici bağımsız değişkenidir.
CREATE FUNCTION finans_donem_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE yeni date := (to_jsonb(NEW) ->> TG_ARGV[0])::date; eski date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    eski := (to_jsonb(OLD) ->> TG_ARGV[0])::date;
    IF finans_donem_kilitli(eski) OR finans_donem_kilitli(yeni) THEN
      RAISE EXCEPTION 'Kilitli dönemde kayıt eklenmez, değişmez, iptal edilmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_donem_kilitli';
    END IF;
  ELSIF finans_donem_kilitli(yeni) THEN
    RAISE EXCEPTION 'Kilitli dönemde kayıt eklenmez, değişmez, iptal edilmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_donem_kilitli';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_odeme_donem BEFORE INSERT OR UPDATE ON finans_odeme FOR EACH ROW EXECUTE FUNCTION finans_donem_denetle('tarih');
CREATE TRIGGER finans_dagilim_donem BEFORE INSERT OR UPDATE ON finans_odeme_dagilimi FOR EACH ROW EXECUTE FUNCTION finans_donem_denetle('tarih');
CREATE TRIGGER finans_mahsup_donem BEFORE INSERT OR UPDATE ON finans_mahsup FOR EACH ROW EXECUTE FUNCTION finans_donem_denetle('tarih');
CREATE TRIGGER finans_virman_donem BEFORE INSERT OR UPDATE ON finans_virman FOR EACH ROW EXECUTE FUNCTION finans_donem_denetle('tarih');
CREATE TRIGGER finans_esitleme_donem BEFORE INSERT ON finans_bakiye_esitleme FOR EACH ROW EXECUTE FUNCTION finans_donem_denetle('tarih');

-- Belge: sistemin yazdığı alanlar (durum açık/kapandı geçişi, sürüm, güncelleme izi, satın alma bağı) kilitli dönemde de yazılır;
-- yeni ödemeyle eski belgenin kapanması dönemi bozmaz. Üretilen sütunlar BEFORE tetikleyicide henüz hesaplanmadığı için kıyaslanmaz (kaynakları kıyaslanır). Başka her değişiklik, iptal dahil, kilide takılır.
CREATE FUNCTION finans_belge_donem_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sistem text[] := ARRAY['durum', 'surum', 'guncelleyen_id', 'guncelleme', 'satin_alma_talep_id', 'satin_alma_teklif_id',
                         'kdv_tutari', 'tevkifat_tutari', 'toplam', 'toplam_tl'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (finans_donem_kilitli(OLD.belge_tarihi) OR finans_donem_kilitli(NEW.belge_tarihi)) THEN RETURN NEW; END IF;
    IF (to_jsonb(NEW) - sistem) = (to_jsonb(OLD) - sistem) AND OLD.durum IN ('acik', 'kapandi') AND NEW.durum IN ('acik', 'kapandi') THEN RETURN NEW; END IF;
  ELSIF NOT finans_donem_kilitli(NEW.belge_tarihi) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Kilitli dönemde kayıt eklenmez, değişmez, iptal edilmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_donem_kilitli';
END $$;
CREATE TRIGGER finans_belge_donem BEFORE INSERT OR UPDATE ON finans_belge FOR EACH ROW EXECUTE FUNCTION finans_belge_donem_denetle();

-- Çek: sonuçlanmış çek sonuç tarihinin, sonuçsuz çek düzenleme tarihinin dönemine bağlıdır; açık dönemde sonuçlanan eski çek yazılır.
CREATE FUNCTION finans_cek_donem_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF finans_donem_kilitli(NEW.duzenleme_tarihi) THEN
      RAISE EXCEPTION 'Kilitli dönemde kayıt eklenmez, değişmez, iptal edilmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_donem_kilitli';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.sonuc_tarihi IS NOT NULL AND finans_donem_kilitli(OLD.sonuc_tarihi))
     OR (NEW.sonuc_tarihi IS NOT NULL AND finans_donem_kilitli(NEW.sonuc_tarihi))
     OR (OLD.sonuc_tarihi IS NULL AND NEW.sonuc_tarihi IS NULL AND finans_donem_kilitli(OLD.duzenleme_tarihi)
         AND ((NEW.banka, NEW.seri_no, NEW.vade, NEW.tutar, NEW.kur, NEW.firma_id, NEW.duzenleme_tarihi)
              IS DISTINCT FROM (OLD.banka, OLD.seri_no, OLD.vade, OLD.tutar, OLD.kur, OLD.firma_id, OLD.duzenleme_tarihi)
              OR (NEW.durum = 'iptal' AND OLD.durum <> 'iptal'))) THEN
    RAISE EXCEPTION 'Kilitli dönemde kayıt eklenmez, değişmez, iptal edilmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_donem_kilitli';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_cek_donem BEFORE INSERT OR UPDATE ON finans_cek FOR EACH ROW EXECUTE FUNCTION finans_cek_donem_denetle();

-- Kapanmış ya da kısmen kapanmış belgenin kategorisi ve belge no'su da değişmez (açıklama ve vade serbest kalır).
CREATE FUNCTION finans_belge_kategori_kilidi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.kategori, NEW.belge_no) IS DISTINCT FROM (OLD.kategori, OLD.belge_no) AND finans_belge_kapanan(OLD.id) > 0 THEN
    RAISE EXCEPTION 'Kapanmış ya da kısmen kapanmış belgenin kategorisi ve belge no''su değişmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_belge_kapali_kategori';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_belge_kategori_kilidi BEFORE UPDATE ON finans_belge FOR EACH ROW EXECUTE FUNCTION finans_belge_kategori_kilidi();

-- Kullanıcı kararı (3672-N1, "hepsi kilitlensin"): sabit kıymet, tedarikçi alacağı, vergi beyanı, faiz ve bütçe de kapanmış ayda değişmez.
-- "Bu tarihten itibaren geçerli" kayıtlar (faiz, bütçe, sabit kıymet amortismanı) kilitli aya kadar uzanır: başlangıcı kilitli bir ayda ya da
-- ondan önce olan kayıt, kilitli ayın rakamlarını geriye dönük oynatacağı için eklenmez ve değişmez.
CREATE FUNCTION finans_donem_sonrasi_kilitli(p_tarih date) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM (SELECT DISTINCT ON (donem) donem, islem FROM finans_donem_kilidi ORDER BY donem, id DESC) son
     WHERE son.islem = 'kilitle' AND son.donem >= to_char(p_tarih, 'YYYY-MM'))
$$;

CREATE FUNCTION finans_donem_baslangic_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE yeni date; eski date;
BEGIN
  IF TG_OP <> 'DELETE' THEN yeni := (to_jsonb(NEW) ->> TG_ARGV[0])::date; END IF;
  IF TG_OP <> 'INSERT' THEN eski := (to_jsonb(OLD) ->> TG_ARGV[0])::date; END IF;
  IF (yeni IS NOT NULL AND finans_donem_sonrasi_kilitli(yeni)) OR (eski IS NOT NULL AND finans_donem_sonrasi_kilitli(eski)) THEN
    RAISE EXCEPTION 'Kilitli dönemde kayıt eklenmez, değişmez, iptal edilmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_donem_kilitli';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER finans_faiz_donem BEFORE INSERT ON finans_faiz FOR EACH ROW EXECUTE FUNCTION finans_donem_baslangic_denetle('gecerlilik_baslangic');
CREATE TRIGGER finans_gunluk_faiz_donem BEFORE INSERT ON finans_gunluk_faiz FOR EACH ROW EXECUTE FUNCTION finans_donem_baslangic_denetle('gecerlilik_baslangic');
CREATE TRIGGER finans_oran_donem BEFORE INSERT ON finans_oran FOR EACH ROW EXECUTE FUNCTION finans_donem_baslangic_denetle('gecerlilik_baslangic');
CREATE TRIGGER finans_butce_donem BEFORE INSERT OR UPDATE OR DELETE ON finans_butce FOR EACH ROW EXECUTE FUNCTION finans_donem_baslangic_denetle('baslangic_ayi');

-- Vergi beyanı işareti son günün ayına bağlıdır.
CREATE FUNCTION finans_vergi_beyani_donem() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP <> 'DELETE' AND finans_donem_kilitli(NEW.son_gun)) OR (TG_OP <> 'INSERT' AND finans_donem_kilitli(OLD.son_gun)) THEN
    RAISE EXCEPTION 'Kilitli dönemde kayıt eklenmez, değişmez, iptal edilmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_donem_kilitli';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER finans_vergi_beyani_donem BEFORE INSERT OR UPDATE OR DELETE ON finans_vergi_beyani FOR EACH ROW EXECUTE FUNCTION finans_vergi_beyani_donem();

-- Tedarikçi alacağı açıldığı ayın (tesis saati) kilidine bağlıdır: tutar, firma, sipariş ve açılış zamanı kilitli ayda değişmez.
-- Durum geçişi (teyit, düşürme, kapatma) ve gerekçesi bugünün kaydıdır: açık ayda yazılır, kilitli ayın alacağına da uygulanır.
CREATE FUNCTION finans_tedarikci_alacagi_donem() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gecis text[] := ARRAY['durum', 'aciklama', 'durum_degistiren_id', 'durum_zamani', 'surum'];
BEGIN
  IF NOT finans_donem_kilitli((OLD.olusturma AT TIME ZONE 'Europe/Istanbul')::date) THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - gecis) = (to_jsonb(OLD) - gecis) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Kilitli dönemde kayıt eklenmez, değişmez, iptal edilmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_donem_kilitli';
END $$;
CREATE TRIGGER finans_tedarikci_alacagi_donem BEFORE UPDATE OR DELETE ON finans_tedarikci_alacagi FOR EACH ROW EXECUTE FUNCTION finans_tedarikci_alacagi_donem();

-- Sabit kıymet: kilitli ay alış ayında ya da sonrasındaysa amortisman o ayı kapsar; amortismanı etkileyen alanlar ve yeni kıymet kilide takılır.
-- Pasife alma (pasif_tarihi) pasif ayından itibaren etki eder. Ad, açıklama ve makine kodu serbest kalır.
CREATE FUNCTION finans_sabit_kiymet_donem() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kilitli boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    kilitli := finans_donem_sonrasi_kilitli(NEW.alis_tarihi);
  ELSE
    IF (NEW.para_birimi, NEW.bedel, NEW.kur, NEW.alis_tarihi, NEW.omur_ay, NEW.yontem, NEW.kalinti_degeri, NEW.devir_tarihi, NEW.devir_birikmis_tl)
       IS DISTINCT FROM (OLD.para_birimi, OLD.bedel, OLD.kur, OLD.alis_tarihi, OLD.omur_ay, OLD.yontem, OLD.kalinti_degeri, OLD.devir_tarihi, OLD.devir_birikmis_tl) THEN
      kilitli := finans_donem_sonrasi_kilitli(OLD.alis_tarihi) OR finans_donem_sonrasi_kilitli(NEW.alis_tarihi);
    END IF;
    IF NEW.pasif_tarihi IS DISTINCT FROM OLD.pasif_tarihi THEN
      kilitli := kilitli OR (OLD.pasif_tarihi IS NOT NULL AND finans_donem_sonrasi_kilitli(OLD.pasif_tarihi))
                        OR (NEW.pasif_tarihi IS NOT NULL AND finans_donem_sonrasi_kilitli(NEW.pasif_tarihi));
    END IF;
  END IF;
  IF kilitli THEN
    RAISE EXCEPTION 'Kilitli dönemde kayıt eklenmez, değişmez, iptal edilmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_donem_kilitli';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_sabit_kiymet_donem BEFORE INSERT OR UPDATE ON finans_sabit_kiymet FOR EACH ROW EXECUTE FUNCTION finans_sabit_kiymet_donem();
