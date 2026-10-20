-- Denetim B-008, B-009 (kullanıcı kararı FK1, FK3): çapraz kur (dağıtım ve dövizli mahsup) günün kurundan en çok finans ayarındaki
-- pay kadar sapar (varsayılan %20); mahsubun kuru saklanır. Günün kuru o tarih için girilmiş finans_kur, yoksa kaydın kendi kurudur.
-- Mahsup tablosu doluysa göç sayar, sayıyı yazıp durur, hiçbir şey değişmez.

LOCK TABLE finans_mahsup IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  sayi bigint;
BEGIN
  SELECT count(*) INTO sayi FROM finans_mahsup;
  IF sayi > 0 THEN
    RAISE EXCEPTION 'finans_mahsup: % kayıt var; mahsuba kur sütunu ekleniyor. Hiçbir şey değişmedi; kayıtları gözden geçirin, sonra göçü yeniden çalıştırın.', sayi;
  END IF;
END $$;

ALTER TABLE finans_ayar ADD COLUMN capraz_kur_payi numeric(5,2) NOT NULL DEFAULT 20
  CONSTRAINT finans_ayar_capraz_kur_payi CHECK (capraz_kur_payi > 0 AND capraz_kur_payi <= 100);

CREATE FUNCTION finans_referans_kur(p_para_birimi char(3), p_tarih date, p_yedek numeric) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_para_birimi = 'TRY' THEN 1::numeric
    ELSE coalesce((SELECT kur FROM finans_kur WHERE para_birimi = p_para_birimi AND tarih = p_tarih), p_yedek) END
$$;

-- Oran olarak (0,20); ayar satırı yoksa varsayılan.
CREATE FUNCTION finans_capraz_kur_payi() RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT capraz_kur_payi FROM finans_ayar WHERE id = 1), 20) / 100
$$;

-- 1 birim satış para birimi = ? birim alış para birimi; iki tutarın oranıdır, yalnız eklenir.
ALTER TABLE finans_mahsup ADD COLUMN capraz_kur numeric(18,8) GENERATED ALWAYS AS (round(alis_tutari / satis_tutari, 8)) STORED;

CREATE OR REPLACE FUNCTION finans_dagilim_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b record; o record; dagitilan numeric; referans numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.iptal_zamani IS NOT NULL OR NEW.iptal_zamani IS NULL
       OR (NEW.odeme_id, NEW.belge_id, NEW.belge_tutari, NEW.odeme_tutari, NEW.capraz_kur, NEW.tarih, NEW.olusturan_id)
          IS DISTINCT FROM (OLD.odeme_id, OLD.belge_id, OLD.belge_tutari, OLD.odeme_tutari, OLD.capraz_kur, OLD.tarih, OLD.olusturan_id) THEN
      RAISE EXCEPTION 'Dağıtım değiştirilmez, yalnız iptal edilir.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_dagilim_degismez';
    END IF;
    RETURN NEW;
  END IF;
  SELECT yon, firma_id, para_birimi, kur, toplam, durum INTO b FROM finans_belge WHERE id = NEW.belge_id FOR UPDATE;
  SELECT yon, firma_id, para_birimi, kur, tutar, iptal_zamani INTO o FROM finans_odeme WHERE id = NEW.odeme_id FOR UPDATE;
  IF b.durum = 'iptal' OR o.iptal_zamani IS NOT NULL THEN
    RAISE EXCEPTION 'İptal edilmiş belgeye ya da ödemeyle dağıtım yapılamaz.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_dagilim_iptal_kayit';
  END IF;
  IF b.yon <> o.yon OR b.firma_id IS DISTINCT FROM o.firma_id THEN
    RAISE EXCEPTION 'Ödeme yalnız aynı firmanın aynı yöndeki belgesine dağıtılır.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_dagilim_firma_yon';
  END IF;
  IF b.para_birimi = o.para_birimi AND (NEW.belge_tutari <> NEW.odeme_tutari OR NEW.capraz_kur <> 1) THEN
    RAISE EXCEPTION 'Aynı para biriminde kapanan ve ödenen tutar eşittir.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_dagilim_ayni_para';
  END IF;
  IF b.para_birimi <> o.para_birimi THEN
    IF NEW.odeme_tutari <> round(NEW.belge_tutari * NEW.capraz_kur, 2) THEN
      RAISE EXCEPTION 'Ödenen tutar kapanan tutar x kur ile tutmuyor.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_dagilim_capraz_tutar';
    END IF;
    referans := finans_referans_kur(b.para_birimi, NEW.tarih, b.kur) / finans_referans_kur(o.para_birimi, NEW.tarih, o.kur);
    IF referans IS NULL OR referans <= 0 THEN
      RAISE EXCEPTION 'Çapraz kur denetlenemedi: o günün kurunu girin.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_dagilim_capraz_kur_yok';
    END IF;
    IF NEW.capraz_kur < referans * (1 - finans_capraz_kur_payi()) OR NEW.capraz_kur > referans * (1 + finans_capraz_kur_payi()) THEN
      RAISE EXCEPTION 'Çapraz kur günün kurundan çok sapıyor.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_dagilim_capraz_kur_sinir';
    END IF;
  END IF;
  IF finans_belge_kapanan(NEW.belge_id) + NEW.belge_tutari > b.toplam THEN
    RAISE EXCEPTION 'Dağıtım belgenin kalan tutarını aşıyor.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_dagilim_belge_asim';
  END IF;
  SELECT coalesce(sum(odeme_tutari), 0) INTO dagitilan FROM finans_odeme_dagilimi WHERE odeme_id = NEW.odeme_id AND iptal_zamani IS NULL;
  IF dagitilan + NEW.odeme_tutari > o.tutar THEN
    RAISE EXCEPTION 'Dağıtım ödemenin dağıtılmamış kalanını aşıyor.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_dagilim_odeme_asim';
  END IF;
  -- Kur farkı yalnız bilgidir (K-11): ödenenin TL karşılığı - kapananın belge kuruyla TL karşılığı.
  NEW.kur_farki_tl := round(NEW.odeme_tutari * o.kur, 2) - round(NEW.belge_tutari * b.kur, 2);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION finans_mahsup_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record; a record; referans numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.iptal_zamani IS NOT NULL OR NEW.iptal_zamani IS NULL
       OR (NEW.firma_id, NEW.satis_belge_id, NEW.alis_belge_id, NEW.satis_tutari, NEW.alis_tutari, NEW.tarih)
          IS DISTINCT FROM (OLD.firma_id, OLD.satis_belge_id, OLD.alis_belge_id, OLD.satis_tutari, OLD.alis_tutari, OLD.tarih) THEN
      RAISE EXCEPTION 'Mahsup değiştirilmez, yalnız iptal edilir.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_degismez';
    END IF;
    RETURN NEW;
  END IF;
  SELECT yon, firma_id, para_birimi, kur, toplam, durum INTO s FROM finans_belge WHERE id = NEW.satis_belge_id FOR UPDATE;
  SELECT yon, firma_id, para_birimi, kur, toplam, durum INTO a FROM finans_belge WHERE id = NEW.alis_belge_id FOR UPDATE;
  IF s.yon <> 'gelir' OR a.yon <> 'gider' OR s.firma_id IS DISTINCT FROM NEW.firma_id OR a.firma_id IS DISTINCT FROM NEW.firma_id THEN
    RAISE EXCEPTION 'Mahsup aynı firmanın bir satış ve bir alış belgesi arasında yapılır.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_firma_yon';
  END IF;
  IF s.durum = 'iptal' OR a.durum = 'iptal' THEN
    RAISE EXCEPTION 'İptal edilmiş belgeyle mahsup yapılamaz.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_iptal_kayit';
  END IF;
  IF s.para_birimi = a.para_birimi AND NEW.satis_tutari <> NEW.alis_tutari THEN
    RAISE EXCEPTION 'Aynı para biriminde iki taraf eşit kapanır.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_ayni_para';
  END IF;
  -- Üretilen capraz_kur sütunu BEFORE tetikleyicide henüz hesaplanmamıştır; oran tutarlardan alınır.
  IF s.para_birimi <> a.para_birimi THEN
    referans := finans_referans_kur(s.para_birimi, NEW.tarih, s.kur) / finans_referans_kur(a.para_birimi, NEW.tarih, a.kur);
    IF referans IS NULL OR referans <= 0 THEN
      RAISE EXCEPTION 'Mahsup kuru denetlenemedi: o günün kurunu girin.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_capraz_kur_yok';
    END IF;
    IF NEW.alis_tutari / NEW.satis_tutari < referans * (1 - finans_capraz_kur_payi())
       OR NEW.alis_tutari / NEW.satis_tutari > referans * (1 + finans_capraz_kur_payi()) THEN
      RAISE EXCEPTION 'Mahsubun iki tutarı arasındaki kur günün kurundan çok sapıyor.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_capraz_kur_sinir';
    END IF;
  END IF;
  IF finans_belge_kapanan(NEW.satis_belge_id) + NEW.satis_tutari > s.toplam OR finans_belge_kapanan(NEW.alis_belge_id) + NEW.alis_tutari > a.toplam THEN
    RAISE EXCEPTION 'Mahsup belgenin kalan tutarını aşıyor.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_asim';
  END IF;
  RETURN NEW;
END $$;
