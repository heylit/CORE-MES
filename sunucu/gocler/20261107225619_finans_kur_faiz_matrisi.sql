-- Kart 2238, kur ve faiz matrisi. Dolu tablolara (finans_kur, finans_faiz, finans_gunluk_faiz) dokunulmaz; yalnız geçmiş olarak okunurlar.
-- 2238-1 c: alış ve satış kuru aynı gün birlikte girilir; muhasebe kaydı alış kuruyla, satın alma maliyeti satış kuruyla.
CREATE TABLE finans_kur_cifti (
  para_birimi char(3) NOT NULL CONSTRAINT finans_kur_cifti_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$' AND para_birimi <> 'TRY'),
  tarih date NOT NULL,
  alis numeric(18,6) NOT NULL CONSTRAINT finans_kur_cifti_alis CHECK (alis > 0),
  satis numeric(18,6) NOT NULL CONSTRAINT finans_kur_cifti_satis CHECK (satis > 0),
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  CONSTRAINT finans_kur_cifti_sira CHECK (satis >= alis),
  CONSTRAINT finans_kur_cifti_guncelleme_cifti CHECK ((guncelleyen_id IS NULL) = (guncelleme IS NULL)),
  CONSTRAINT finans_kur_cifti_tekil PRIMARY KEY (para_birimi, tarih)
);

-- 2238-2 a: faiz türü başına yıllık yüzde; yeni oran başlangıç gününden sonrasını etkiler, eskisi silinmez ve değişmez.
CREATE TABLE finans_oran (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT finans_oran_tur CHECK (tur IN ('kredi', 'mevduat', 'politika')),
  para_birimi char(3) NOT NULL CONSTRAINT finans_oran_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  gecerlilik_baslangic date NOT NULL,
  yillik_yuzde numeric(9,4) NOT NULL CONSTRAINT finans_oran_aralik CHECK (yillik_yuzde >= 0 AND yillik_yuzde <= 1000),
  "not" text CONSTRAINT finans_oran_not CHECK (char_length("not") <= 200),
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finans_oran_gecerli ON finans_oran (tur, para_birimi, gecerlilik_baslangic DESC, id DESC);
CREATE TRIGGER finans_oran_degismez BEFORE UPDATE OR DELETE ON finans_oran
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER finans_oran_bosaltilmaz BEFORE TRUNCATE ON finans_oran
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Çapraz kur denetiminin günün kuru artık o günün alış kurudur (muhasebe kuru); o gün girilmemişse kaydın kendi kuru (önceki gibi).
CREATE OR REPLACE FUNCTION finans_referans_kur(p_para_birimi char(3), p_tarih date, p_yedek numeric) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_para_birimi = 'TRY' THEN 1::numeric
    ELSE coalesce((SELECT alis FROM finans_kur_cifti WHERE para_birimi = p_para_birimi AND tarih = p_tarih), p_yedek) END
$$;
