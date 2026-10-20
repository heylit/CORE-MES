-- Finansın para kayıtları. Fatura Logo'da asıldır (K-1); burada takip ve analiz için tutulur. Para kuralları
-- (dağıtım, mahsup, çek, hesap) tetikleyicilerle de korunur: servis atlanırsa veritabanı reddeder.

-- ---------- Hesaplar (K-4) ----------
CREATE TABLE finans_hesap (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT finans_hesap_ad_bos CHECK (btrim(ad) <> '' AND length(ad) <= 100),
  tur text NOT NULL CONSTRAINT finans_hesap_tur CHECK (tur IN ('kasa', 'banka', 'kredi_karti')),
  para_birimi char(3) NOT NULL CONSTRAINT finans_hesap_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  acilis_bakiyesi numeric(18,2) NOT NULL DEFAULT 0,
  acilis_tarihi date NOT NULL,
  banka_adi text CONSTRAINT finans_hesap_banka_adi CHECK (length(banka_adi) <= 100),
  logo_kodu text CONSTRAINT finans_hesap_logo_kodu CHECK (length(logo_kodu) <= 40),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1)
);
CREATE UNIQUE INDEX finans_hesap_ad_tekil ON finans_hesap (lower(ad));

-- ---------- Kur tablosu (K-10): elle girilen günlük kur ----------
CREATE TABLE finans_kur (
  para_birimi char(3) NOT NULL CONSTRAINT finans_kur_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$' AND para_birimi <> 'TRY'),
  tarih date NOT NULL,
  kur numeric(18,6) NOT NULL CONSTRAINT finans_kur_pozitif CHECK (kur > 0),
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  CONSTRAINT finans_kur_tekil PRIMARY KEY (para_birimi, tarih)
);

-- ---------- KDV oranları (D-5): aralık kısıtı burada, geçerli oranlar tabloda ----------
CREATE TABLE finans_kdv_orani (
  oran numeric(5,2) NOT NULL CONSTRAINT finans_kdv_orani_aralik CHECK (oran >= 0 AND oran <= 100),
  gecerlilik_baslangic date NOT NULL,
  gecerlilik_bitis date CONSTRAINT finans_kdv_orani_bitis CHECK (gecerlilik_bitis > gecerlilik_baslangic),
  olusturan_id int REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  CONSTRAINT finans_kdv_orani_tekil PRIMARY KEY (oran, gecerlilik_baslangic)
);
-- Yürürlükteki oranlar sistem sabitidir (10.07.2023'ten beri 0, 1, 10, 20); eskileri kullanıcı Ayarlar'dan ekler.
INSERT INTO finans_kdv_orani (oran, gecerlilik_baslangic) VALUES (0, '2023-07-10'), (1, '2023-07-10'), (10, '2023-07-10'), (20, '2023-07-10');

-- ---------- Düzenli ödemeler ----------
CREATE TABLE finans_duzenli_odeme (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT finans_duzenli_odeme_ad_bos CHECK (btrim(ad) <> '' AND length(ad) <= 100),
  kategori text NOT NULL CONSTRAINT finans_duzenli_odeme_kategori CHECK (kategori IN ('mal_alimi', 'personel', 'sgk_stopaj', 'kira', 'enerji', 'lojistik', 'pazarlama', 'faiz', 'diger_gider', 'kdv_vergi', 'kredi_anapara')),
  firma_id int REFERENCES finans_firma (id),
  hesap_id int REFERENCES finans_hesap (id),
  para_birimi char(3) NOT NULL DEFAULT 'TRY' CHECK (para_birimi ~ '^[A-Z]{3}$'),
  tutar numeric(18,2) NOT NULL CONSTRAINT finans_duzenli_odeme_tutar CHECK (tutar > 0),
  kdv_orani numeric(5,2) NOT NULL DEFAULT 0 CHECK (kdv_orani >= 0 AND kdv_orani <= 100),
  ayin_gunu int NOT NULL CONSTRAINT finans_duzenli_odeme_gun CHECK (ayin_gunu BETWEEN 1 AND 31),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1)
);

-- ---------- Belgeler ----------
CREATE TABLE finans_belge (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  yon text NOT NULL CONSTRAINT finans_belge_yon CHECK (yon IN ('gelir', 'gider')),
  tur text NOT NULL CONSTRAINT finans_belge_tur CHECK (tur IN ('fatura', 'faturasiz', 'acilis')),
  kategori text NOT NULL CONSTRAINT finans_belge_kategori CHECK (
    (yon = 'gelir' AND kategori IN ('urun_satisi', 'hizmet_geliri', 'diger_gelir', 'kur_farki_geliri'))
    OR (yon = 'gider' AND kategori IN ('mal_alimi', 'personel', 'sgk_stopaj', 'kira', 'enerji', 'lojistik', 'pazarlama', 'faiz', 'diger_gider', 'kdv_vergi', 'kredi_anapara', 'kur_farki_gideri'))),
  firma_id int REFERENCES finans_firma (id),
  belge_no text CONSTRAINT finans_belge_no CHECK (length(belge_no) BETWEEN 1 AND 16),
  aciklama text CONSTRAINT finans_belge_aciklama CHECK (length(aciklama) <= 500),
  belge_tarihi date NOT NULL,
  vade date NOT NULL,
  para_birimi char(3) NOT NULL CONSTRAINT finans_belge_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  kur numeric(18,6) NOT NULL CONSTRAINT finans_belge_kur CHECK (kur > 0 AND (para_birimi <> 'TRY' OR kur = 1)),
  tutar numeric(18,2) NOT NULL CONSTRAINT finans_belge_tutar CHECK (tutar > 0),
  kdv_orani numeric(5,2) NOT NULL CONSTRAINT finans_belge_kdv_orani CHECK (kdv_orani >= 0 AND kdv_orani <= 100),
  tevkifat_pay smallint,
  tevkifat_payda smallint,
  kdv_tutari numeric(18,2) GENERATED ALWAYS AS (round(tutar * kdv_orani / 100, 2)) STORED,
  tevkifat_tutari numeric(18,2) GENERATED ALWAYS AS (
    CASE WHEN tevkifat_pay IS NULL THEN 0 ELSE round(round(tutar * kdv_orani / 100, 2) * tevkifat_pay / tevkifat_payda, 2) END) STORED,
  toplam numeric(18,2) GENERATED ALWAYS AS (
    tutar + round(tutar * kdv_orani / 100, 2)
    - CASE WHEN tevkifat_pay IS NULL THEN 0 ELSE round(round(tutar * kdv_orani / 100, 2) * tevkifat_pay / tevkifat_payda, 2) END) STORED,
  toplam_tl numeric(18,2) GENERATED ALWAYS AS (round((
    tutar + round(tutar * kdv_orani / 100, 2)
    - CASE WHEN tevkifat_pay IS NULL THEN 0 ELSE round(round(tutar * kdv_orani / 100, 2) * tevkifat_pay / tevkifat_payda, 2) END) * kur, 2)) STORED,
  durum text NOT NULL DEFAULT 'acik' CONSTRAINT finans_belge_durum CHECK (durum IN ('acik', 'kapandi', 'iptal')),
  kaynak text NOT NULL DEFAULT 'elle' CONSTRAINT finans_belge_kaynak CHECK (kaynak IN ('elle', 'logo')),
  logo_kayit_no int CONSTRAINT finans_belge_logo_kayit_no CHECK (logo_kayit_no > 0),
  logo_esleme text CONSTRAINT finans_belge_logo_esleme CHECK (logo_esleme IN ('eslesmedi', 'eslesti', 'farkli')),
  logo_belge_turu text CHECK (length(logo_belge_turu) <= 40),
  duzenli_odeme_id int REFERENCES finans_duzenli_odeme (id),
  iptal_eden_id int REFERENCES kisi (id),
  iptal_zamani timestamptz,
  iptal_nedeni text CHECK (length(iptal_nedeni) <= 300),
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  CONSTRAINT finans_belge_firma_gerekli CHECK (firma_id IS NOT NULL OR tur = 'faturasiz'),
  CONSTRAINT finans_belge_faturasiz_kategori CHECK (tur <> 'faturasiz' OR kategori IN ('personel', 'sgk_stopaj', 'kdv_vergi', 'faiz', 'kredi_anapara')),
  CONSTRAINT finans_belge_faturasiz_elle CHECK (tur <> 'faturasiz' OR kaynak = 'elle'),
  CONSTRAINT finans_belge_tevkifat CHECK ((tevkifat_pay IS NULL) = (tevkifat_payda IS NULL)
    AND (tevkifat_pay IS NULL OR (tevkifat_payda BETWEEN 1 AND 100 AND tevkifat_pay BETWEEN 1 AND tevkifat_payda))),
  CONSTRAINT finans_belge_vade CHECK (vade >= belge_tarihi OR tur = 'acilis'),
  CONSTRAINT finans_belge_iptal CHECK ((durum = 'iptal') = (iptal_zamani IS NOT NULL) AND (iptal_zamani IS NULL) = (iptal_eden_id IS NULL))
);
CREATE UNIQUE INDEX finans_belge_logo_kayit_no_tekil ON finans_belge (logo_kayit_no) WHERE logo_kayit_no IS NOT NULL;
CREATE INDEX finans_belge_tarih_sirasi ON finans_belge (belge_tarihi, id);
CREATE INDEX finans_belge_vade_sirasi ON finans_belge (vade, id);
CREATE INDEX finans_belge_firma ON finans_belge (firma_id, id);

-- ---------- Çek ve senet ----------
CREATE TABLE finans_cek (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  yon text NOT NULL CONSTRAINT finans_cek_yon CHECK (yon IN ('alinan', 'verilen')),
  tur text NOT NULL CONSTRAINT finans_cek_tur CHECK (tur IN ('cek', 'senet')),
  firma_id int NOT NULL REFERENCES finans_firma (id),
  banka text CHECK (length(banka) <= 100),
  seri_no text CHECK (length(seri_no) <= 40),
  duzenleme_tarihi date NOT NULL,
  vade date NOT NULL,
  para_birimi char(3) NOT NULL CONSTRAINT finans_cek_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  kur numeric(18,6) NOT NULL CONSTRAINT finans_cek_kur CHECK (kur > 0 AND (para_birimi <> 'TRY' OR kur = 1)),
  tutar numeric(18,2) NOT NULL CONSTRAINT finans_cek_tutar CHECK (tutar > 0),
  tutar_tl numeric(18,2) GENERATED ALWAYS AS (round(tutar * kur, 2)) STORED,
  durum text NOT NULL CONSTRAINT finans_cek_durum CHECK (
    (yon = 'alinan' AND durum IN ('portfoy', 'tahsilde', 'tahsil', 'ciro', 'karsiliksiz', 'iptal'))
    OR (yon = 'verilen' AND durum IN ('bekliyor', 'odendi', 'iptal'))),
  sonuc_tarihi date,
  sonuc_hesap_id int REFERENCES finans_hesap (id),
  kaynak text NOT NULL DEFAULT 'elle' CONSTRAINT finans_cek_kaynak CHECK (kaynak IN ('elle', 'logo')),
  logo_kayit_no int CHECK (logo_kayit_no > 0),
  logo_bordro_no text CHECK (length(logo_bordro_no) <= 40),
  logo_esleme text CHECK (logo_esleme IN ('eslesmedi', 'eslesti', 'farkli')),
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  CONSTRAINT finans_cek_sonuc_hesap CHECK ((durum IN ('tahsil', 'odendi')) = (sonuc_hesap_id IS NOT NULL)),
  CONSTRAINT finans_cek_sonuc_tarihi CHECK ((durum IN ('tahsil', 'odendi', 'karsiliksiz', 'ciro')) = (sonuc_tarihi IS NOT NULL))
);
CREATE UNIQUE INDEX finans_cek_logo_kayit_no_tekil ON finans_cek (logo_kayit_no) WHERE logo_kayit_no IS NOT NULL;
CREATE INDEX finans_cek_vade_sirasi ON finans_cek (vade, id);

-- ---------- Ödemeler (tahsilat ve ödeme) ----------
CREATE TABLE finans_odeme (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  yon text NOT NULL CONSTRAINT finans_odeme_yon CHECK (yon IN ('gelir', 'gider')),
  firma_id int REFERENCES finans_firma (id),
  tarih date NOT NULL,
  yontem text NOT NULL CONSTRAINT finans_odeme_yontem CHECK (yontem IN ('nakit', 'banka', 'kredi_karti', 'cek', 'senet', 'ciro')),
  hesap_id int REFERENCES finans_hesap (id),
  cek_id int REFERENCES finans_cek (id),
  para_birimi char(3) NOT NULL CONSTRAINT finans_odeme_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  kur numeric(18,6) NOT NULL CONSTRAINT finans_odeme_kur CHECK (kur > 0 AND (para_birimi <> 'TRY' OR kur = 1)),
  tutar numeric(18,2) NOT NULL CONSTRAINT finans_odeme_tutar CHECK (tutar > 0),
  tutar_tl numeric(18,2) GENERATED ALWAYS AS (round(tutar * kur, 2)) STORED,
  aciklama text CHECK (length(aciklama) <= 500),
  kaynak text NOT NULL DEFAULT 'elle' CONSTRAINT finans_odeme_kaynak CHECK (kaynak IN ('elle', 'logo')),
  logo_kayit_no int CHECK (logo_kayit_no > 0),
  logo_esleme text CHECK (logo_esleme IN ('eslesmedi', 'eslesti', 'farkli')),
  iptal_eden_id int REFERENCES kisi (id),
  iptal_zamani timestamptz,
  iptal_nedeni text CHECK (length(iptal_nedeni) <= 300),
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  CONSTRAINT finans_odeme_hesap CHECK ((yontem IN ('cek', 'senet', 'ciro')) = (hesap_id IS NULL)),
  CONSTRAINT finans_odeme_cek CHECK ((yontem IN ('cek', 'senet', 'ciro')) = (cek_id IS NOT NULL)),
  CONSTRAINT finans_odeme_ciro_gider CHECK (yontem <> 'ciro' OR yon = 'gider'),
  CONSTRAINT finans_odeme_iptal CHECK ((iptal_zamani IS NULL) = (iptal_eden_id IS NULL))
);
CREATE UNIQUE INDEX finans_odeme_logo_kayit_no_tekil ON finans_odeme (logo_kayit_no) WHERE logo_kayit_no IS NOT NULL;
-- Bir çekin en çok bir etkin alış/veriş ödemesi ve en çok bir etkin ciro ödemesi vardır (D-8, FNS-54).
CREATE UNIQUE INDEX finans_odeme_cek_tekil ON finans_odeme (cek_id) WHERE cek_id IS NOT NULL AND yontem IN ('cek', 'senet') AND iptal_zamani IS NULL;
CREATE UNIQUE INDEX finans_odeme_ciro_tekil ON finans_odeme (cek_id) WHERE yontem = 'ciro' AND iptal_zamani IS NULL;
CREATE INDEX finans_odeme_tarih_sirasi ON finans_odeme (tarih, id);
CREATE INDEX finans_odeme_hesap ON finans_odeme (hesap_id, tarih);

-- ---------- Dağıtım (ödeme -> belge), çapraz kur (K-9) ----------
CREATE TABLE finans_odeme_dagilimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  odeme_id int NOT NULL REFERENCES finans_odeme (id),
  belge_id int NOT NULL REFERENCES finans_belge (id),
  belge_tutari numeric(18,2) NOT NULL CONSTRAINT finans_dagilim_belge_tutari CHECK (belge_tutari > 0),
  odeme_tutari numeric(18,2) NOT NULL CONSTRAINT finans_dagilim_odeme_tutari CHECK (odeme_tutari > 0),
  capraz_kur numeric(18,8) NOT NULL CONSTRAINT finans_dagilim_capraz_kur CHECK (capraz_kur > 0),
  kur_farki_tl numeric(18,2) NOT NULL DEFAULT 0,
  tarih date NOT NULL,
  iptal_eden_id int REFERENCES kisi (id),
  iptal_zamani timestamptz,
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finans_dagilim_iptal CHECK ((iptal_zamani IS NULL) = (iptal_eden_id IS NULL))
);
CREATE INDEX finans_dagilim_belge ON finans_odeme_dagilimi (belge_id);
CREATE INDEX finans_dagilim_odeme ON finans_odeme_dagilimi (odeme_id);

-- ---------- Cari mahsup (K-12) ----------
CREATE TABLE finans_mahsup (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firma_id int NOT NULL REFERENCES finans_firma (id),
  satis_belge_id int NOT NULL REFERENCES finans_belge (id),
  alis_belge_id int NOT NULL REFERENCES finans_belge (id),
  satis_tutari numeric(18,2) NOT NULL CONSTRAINT finans_mahsup_satis_tutari CHECK (satis_tutari > 0),
  alis_tutari numeric(18,2) NOT NULL CONSTRAINT finans_mahsup_alis_tutari CHECK (alis_tutari > 0),
  tarih date NOT NULL,
  iptal_eden_id int REFERENCES kisi (id),
  iptal_zamani timestamptz,
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  CONSTRAINT finans_mahsup_iptal CHECK ((iptal_zamani IS NULL) = (iptal_eden_id IS NULL))
);
CREATE INDEX finans_mahsup_satis ON finans_mahsup (satis_belge_id);
CREATE INDEX finans_mahsup_alis ON finans_mahsup (alis_belge_id);

-- ---------- Virman (hesaplar arası) ----------
CREATE TABLE finans_virman (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kaynak_hesap_id int NOT NULL REFERENCES finans_hesap (id),
  hedef_hesap_id int NOT NULL REFERENCES finans_hesap (id),
  tarih date NOT NULL,
  tutar numeric(18,2) NOT NULL CONSTRAINT finans_virman_tutar CHECK (tutar > 0),
  aciklama text CHECK (length(aciklama) <= 300),
  iptal_eden_id int REFERENCES kisi (id),
  iptal_zamani timestamptz,
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  CONSTRAINT finans_virman_farkli_hesap CHECK (kaynak_hesap_id <> hedef_hesap_id),
  CONSTRAINT finans_virman_iptal CHECK ((iptal_zamani IS NULL) = (iptal_eden_id IS NULL))
);

-- ---------- Bakiye eşitleme (yalnız ekleme) ----------
CREATE TABLE finans_bakiye_esitleme (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hesap_id int NOT NULL REFERENCES finans_hesap (id),
  tarih date NOT NULL,
  gercek_bakiye numeric(18,2) NOT NULL,
  fark numeric(18,2) NOT NULL,
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER finans_bakiye_esitleme_yalniz_ekleme BEFORE UPDATE OR DELETE ON finans_bakiye_esitleme FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();

-- ---------- Dönemli bütçe (D-6) ----------
CREATE TABLE finans_butce (
  kategori text NOT NULL CONSTRAINT finans_butce_kategori CHECK (kategori IN ('mal_alimi', 'personel', 'sgk_stopaj', 'kira', 'enerji', 'lojistik', 'pazarlama', 'faiz', 'diger_gider', 'kur_farki_gideri', 'satis_hedefi')),
  baslangic_ayi date NOT NULL CONSTRAINT finans_butce_ay_basi CHECK (extract(day FROM baslangic_ayi) = 1),
  aylik_tutar numeric(18,2) NOT NULL CONSTRAINT finans_butce_tutar CHECK (aylik_tutar >= 0),
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  CONSTRAINT finans_butce_tekil PRIMARY KEY (kategori, baslangic_ayi)
);

-- ---------- Modül ayarı (tek satır) ----------
CREATE TABLE finans_ayar (
  id int PRIMARY KEY CONSTRAINT finans_ayar_tek CHECK (id = 1),
  sirket_adi text NOT NULL DEFAULT 'Şirketim' CHECK (btrim(sirket_adi) <> '' AND length(sirket_adi) <= 200),
  sektor text NOT NULL DEFAULT 'genel' CONSTRAINT finans_ayar_sektor CHECK (sektor IN ('genel', 'uretim', 'ticaret', 'hizmet', 'insaat')),
  nakit_esigi numeric(18,2) NOT NULL DEFAULT 0 CHECK (nakit_esigi >= 0),
  beklenen_aylik_satis numeric(18,2) CHECK (beklenen_aylik_satis >= 0),
  beklenen_tahsil_gunu int CHECK (beklenen_tahsil_gunu BETWEEN 0 AND 365),
  risk_toleransi int NOT NULL DEFAULT 5 CHECK (risk_toleransi BETWEEN 1 AND 50),
  simulasyon_sayisi int NOT NULL DEFAULT 1000 CHECK (simulasyon_sayisi BETWEEN 200 AND 5000),
  cek_karsiliksiz_olasiligi numeric(5,2) NOT NULL DEFAULT 3 CHECK (cek_karsiliksiz_olasiligi BETWEEN 0 AND 50),
  batik_gunu int NOT NULL DEFAULT 180 CHECK (batik_gunu BETWEEN 30 AND 730),
  anomali_esigi numeric(4,2) NOT NULL DEFAULT 3.5 CHECK (anomali_esigi BETWEEN 2 AND 10),
  agirlik_likidite int NOT NULL DEFAULT 20 CHECK (agirlik_likidite BETWEEN 0 AND 100),
  agirlik_nakit int NOT NULL DEFAULT 25 CHECK (agirlik_nakit BETWEEN 0 AND 100),
  agirlik_karlilik int NOT NULL DEFAULT 20 CHECK (agirlik_karlilik BETWEEN 0 AND 100),
  agirlik_verimlilik int NOT NULL DEFAULT 15 CHECK (agirlik_verimlilik BETWEEN 0 AND 100),
  agirlik_borcluluk int NOT NULL DEFAULT 20 CHECK (agirlik_borcluluk BETWEEN 0 AND 100),
  bilanco_donen numeric(18,2), bilanco_stok numeric(18,2), bilanco_kvb numeric(18,2),
  bilanco_toplam_borc numeric(18,2), bilanco_ozkaynak numeric(18,2), bilanco_birikmis_kar numeric(18,2),
  kurulum_tamam boolean NOT NULL DEFAULT false,
  guncelleyen_id int REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1)
);
INSERT INTO finans_ayar (id) VALUES (1);

-- ---------- Danışman ve süreç ----------
CREATE TABLE finans_oneri_durumu (
  bulgu_kimligi text PRIMARY KEY CONSTRAINT finans_oneri_kimligi CHECK (bulgu_kimligi ~ '^[A-Za-z0-9._:-]{1,80}$'),
  durum text NOT NULL CONSTRAINT finans_oneri_durum CHECK (durum IN ('uygulaniyor', 'ertelendi', 'kapatildi')),
  ertele_bitis date,
  guncelleyen_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finans_oneri_ertele CHECK ((durum = 'ertelendi') = (ertele_bitis IS NOT NULL))
);
CREATE TABLE finans_kapanis (
  donem char(7) NOT NULL CONSTRAINT finans_kapanis_donem CHECK (donem ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  madde text NOT NULL CONSTRAINT finans_kapanis_madde CHECK (madde ~ '^[a-z_]{1,30}$'),
  isaretli boolean NOT NULL,
  guncelleyen_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (donem, madde)
);
-- Skor tarayıcıda hesaplanır (UYUM-BORCU); kayıt zamanı ve kişi sunucudan.
CREATE TABLE finans_skor (
  gun date PRIMARY KEY,
  skor int NOT NULL CONSTRAINT finans_skor_aralik CHECK (skor BETWEEN 0 AND 100),
  nakit numeric(18,2),
  guncelleyen_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- Tetikleyiciler
-- =====================================================================

-- Pasif firmaya yeni kayıt açılmaz (FNS-46). Firma satırı paylaşımlı kilitlenir: eşzamanlı "pasife al" (FNS-60)
-- ile yeni kayıt sırayla değerlendirilir; pasife alınan firmaya araya kayıt sızmaz.
CREATE FUNCTION finans_aktif_firma() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.firma_id IS NOT NULL THEN PERFORM 1 FROM finans_firma WHERE id = NEW.firma_id FOR SHARE; END IF;
  IF NEW.firma_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM finans_firma WHERE id = NEW.firma_id AND aktif) THEN
    RAISE EXCEPTION 'Pasif firmaya yeni kayıt açılamaz.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_pasif_firma';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_belge_aktif_firma BEFORE INSERT ON finans_belge FOR EACH ROW EXECUTE FUNCTION finans_aktif_firma();
CREATE TRIGGER finans_odeme_aktif_firma BEFORE INSERT ON finans_odeme FOR EACH ROW EXECUTE FUNCTION finans_aktif_firma();
CREATE TRIGGER finans_cek_aktif_firma BEFORE INSERT ON finans_cek FOR EACH ROW EXECUTE FUNCTION finans_aktif_firma();
CREATE TRIGGER finans_mahsup_aktif_firma BEFORE INSERT ON finans_mahsup FOR EACH ROW EXECUTE FUNCTION finans_aktif_firma();

-- Pasif hesaba hareket yazılmaz; ödemenin para birimi hesabınkiyle aynıdır (FNS-16, FNS-32).
CREATE FUNCTION finans_odeme_hesap_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h record;
BEGIN
  IF NEW.hesap_id IS NULL THEN RETURN NEW; END IF;
  SELECT tur, para_birimi, aktif INTO h FROM finans_hesap WHERE id = NEW.hesap_id;
  IF NOT h.aktif THEN
    RAISE EXCEPTION 'Pasif hesaba hareket yazılamaz.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_pasif_hesap';
  END IF;
  IF h.para_birimi <> NEW.para_birimi THEN
    RAISE EXCEPTION 'Ödemenin para birimi hesabın para birimiyle aynı olmalı.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_odeme_hesap_para_birimi';
  END IF;
  IF (NEW.yontem = 'nakit' AND h.tur <> 'kasa') OR (NEW.yontem = 'banka' AND h.tur <> 'banka') OR (NEW.yontem = 'kredi_karti' AND h.tur <> 'kredi_karti') THEN
    RAISE EXCEPTION 'Ödeme yöntemi hesap türüyle uyuşmuyor.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_odeme_hesap_turu';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_odeme_hesap_denetle BEFORE INSERT ON finans_odeme FOR EACH ROW EXECUTE FUNCTION finans_odeme_hesap_denetle();

-- Belgenin durumu sunucuda dağıtımlardan ve mahsuplardan hesaplanır (FNS-7, FNS-8).
CREATE FUNCTION finans_belge_kapanan(p_belge int) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT sum(belge_tutari) FROM finans_odeme_dagilimi WHERE belge_id = p_belge AND iptal_zamani IS NULL), 0)
       + coalesce((SELECT sum(satis_tutari) FROM finans_mahsup WHERE satis_belge_id = p_belge AND iptal_zamani IS NULL), 0)
       + coalesce((SELECT sum(alis_tutari) FROM finans_mahsup WHERE alis_belge_id = p_belge AND iptal_zamani IS NULL), 0)
$$;
CREATE FUNCTION finans_belge_durumu_yaz(p_belge int) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b record; yeni text;
BEGIN
  SELECT durum, toplam INTO b FROM finans_belge WHERE id = p_belge;
  IF b.durum = 'iptal' THEN RETURN; END IF;
  yeni := CASE WHEN finans_belge_kapanan(p_belge) >= b.toplam THEN 'kapandi' ELSE 'acik' END;
  IF yeni <> b.durum THEN
    UPDATE finans_belge SET durum = yeni, surum = surum + 1 WHERE id = p_belge;
  END IF;
END $$;

-- Dağıtım: iki taraf da denetlenir (K-9). Belge ve ödeme kilitlenir; eşzamanlı iki dağıtım sırayla değerlendirilir.
CREATE FUNCTION finans_dagilim_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b record; o record; dagitilan numeric;
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
CREATE TRIGGER finans_dagilim_denetle BEFORE INSERT OR UPDATE ON finans_odeme_dagilimi FOR EACH ROW EXECUTE FUNCTION finans_dagilim_denetle();
CREATE TRIGGER finans_dagilim_silinmez BEFORE DELETE ON finans_odeme_dagilimi FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE FUNCTION finans_dagilim_sonrasi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM finans_belge_durumu_yaz(NEW.belge_id);
  RETURN NULL;
END $$;
CREATE TRIGGER finans_dagilim_sonrasi AFTER INSERT OR UPDATE ON finans_odeme_dagilimi FOR EACH ROW EXECUTE FUNCTION finans_dagilim_sonrasi();

-- Mahsup: aynı firmanın açık satış ve alış belgesi; iki tarafın kalanı aşılmaz (K-12).
CREATE FUNCTION finans_mahsup_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record; a record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.iptal_zamani IS NOT NULL OR NEW.iptal_zamani IS NULL
       OR (NEW.firma_id, NEW.satis_belge_id, NEW.alis_belge_id, NEW.satis_tutari, NEW.alis_tutari, NEW.tarih)
          IS DISTINCT FROM (OLD.firma_id, OLD.satis_belge_id, OLD.alis_belge_id, OLD.satis_tutari, OLD.alis_tutari, OLD.tarih) THEN
      RAISE EXCEPTION 'Mahsup değiştirilmez, yalnız iptal edilir.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_degismez';
    END IF;
    RETURN NEW;
  END IF;
  SELECT yon, firma_id, para_birimi, toplam, durum INTO s FROM finans_belge WHERE id = NEW.satis_belge_id FOR UPDATE;
  SELECT yon, firma_id, para_birimi, toplam, durum INTO a FROM finans_belge WHERE id = NEW.alis_belge_id FOR UPDATE;
  IF s.yon <> 'gelir' OR a.yon <> 'gider' OR s.firma_id IS DISTINCT FROM NEW.firma_id OR a.firma_id IS DISTINCT FROM NEW.firma_id THEN
    RAISE EXCEPTION 'Mahsup aynı firmanın bir satış ve bir alış belgesi arasında yapılır.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_firma_yon';
  END IF;
  IF s.durum = 'iptal' OR a.durum = 'iptal' THEN
    RAISE EXCEPTION 'İptal edilmiş belgeyle mahsup yapılamaz.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_iptal_kayit';
  END IF;
  IF s.para_birimi = a.para_birimi AND NEW.satis_tutari <> NEW.alis_tutari THEN
    RAISE EXCEPTION 'Aynı para biriminde iki taraf eşit kapanır.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_ayni_para';
  END IF;
  IF finans_belge_kapanan(NEW.satis_belge_id) + NEW.satis_tutari > s.toplam OR finans_belge_kapanan(NEW.alis_belge_id) + NEW.alis_tutari > a.toplam THEN
    RAISE EXCEPTION 'Mahsup belgenin kalan tutarını aşıyor.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_mahsup_asim';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_mahsup_denetle BEFORE INSERT OR UPDATE ON finans_mahsup FOR EACH ROW EXECUTE FUNCTION finans_mahsup_denetle();
CREATE TRIGGER finans_mahsup_silinmez BEFORE DELETE ON finans_mahsup FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE FUNCTION finans_mahsup_sonrasi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM finans_belge_durumu_yaz(NEW.satis_belge_id);
  PERFORM finans_belge_durumu_yaz(NEW.alis_belge_id);
  RETURN NULL;
END $$;
CREATE TRIGGER finans_mahsup_sonrasi AFTER INSERT OR UPDATE ON finans_mahsup FOR EACH ROW EXECUTE FUNCTION finans_mahsup_sonrasi();

-- Belge, ödeme ve çek silinmez; iptal edilir (FNS-13).
CREATE TRIGGER finans_belge_silinmez BEFORE DELETE ON finans_belge FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER finans_odeme_silinmez BEFORE DELETE ON finans_odeme FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER finans_cek_silinmez BEFORE DELETE ON finans_cek FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER finans_virman_silinmez BEFORE DELETE ON finans_virman FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();

-- Kapanmış ya da kısmen kapanmış belgenin parasal alanları ve Logo'dan gelen ya da eşleşmiş belgenin alanları değişmez
-- (FNS-9, FNS-10). Durum ve sürüm sistemce yazılır; açıklama ve vade serbesttir.
CREATE FUNCTION finans_belge_kilidi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.yon, NEW.tur, NEW.olusturan_id, NEW.olusturma) IS DISTINCT FROM (OLD.yon, OLD.tur, OLD.olusturan_id, OLD.olusturma) THEN
    RAISE EXCEPTION 'Belgenin yönü, türü, açan kişisi ve açılış zamanı değişmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_belge_acilis_degismez';
  END IF;
  IF OLD.durum = 'iptal' AND (NEW.durum <> 'iptal' OR NEW.iptal_zamani IS DISTINCT FROM OLD.iptal_zamani) THEN
    RAISE EXCEPTION 'İptal edilmiş belge geri açılmaz.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_belge_iptal_kalici';
  END IF;
  IF (NEW.tutar, NEW.kdv_orani, NEW.tevkifat_pay, NEW.tevkifat_payda, NEW.para_birimi, NEW.kur, NEW.belge_tarihi, NEW.firma_id)
     IS DISTINCT FROM (OLD.tutar, OLD.kdv_orani, OLD.tevkifat_pay, OLD.tevkifat_payda, OLD.para_birimi, OLD.kur, OLD.belge_tarihi, OLD.firma_id) THEN
    IF finans_belge_kapanan(OLD.id) > 0 THEN
      RAISE EXCEPTION 'Kapanmış ya da kısmen kapanmış belgenin parasal alanları değişmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_belge_kapali_kilit';
    END IF;
    IF OLD.kaynak = 'logo' OR OLD.logo_esleme = 'eslesti' THEN
      RAISE EXCEPTION 'Logo''dan gelen ya da eşleşmiş belgenin alanları elle değişmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_belge_logo_kilit';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_belge_kilidi BEFORE UPDATE ON finans_belge FOR EACH ROW EXECUTE FUNCTION finans_belge_kilidi();

-- Sonuçlanmış çekin parasal alanları değişmez (FNS-28).
CREATE FUNCTION finans_cek_kilidi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.yon, NEW.olusturan_id, NEW.olusturma) IS DISTINCT FROM (OLD.yon, OLD.olusturan_id, OLD.olusturma) THEN
    RAISE EXCEPTION 'Çekin yönü, açan kişisi ve açılış zamanı değişmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_cek_acilis_degismez';
  END IF;
  IF OLD.durum NOT IN ('portfoy', 'bekliyor')
     AND (NEW.tutar, NEW.para_birimi, NEW.kur, NEW.vade, NEW.firma_id) IS DISTINCT FROM (OLD.tutar, OLD.para_birimi, OLD.kur, OLD.vade, OLD.firma_id) THEN
    RAISE EXCEPTION 'Sonuçlanmış ya da bankadaki çekin tutar, vade ve firma alanları değişmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_cek_kilit';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_cek_kilidi BEFORE UPDATE ON finans_cek FOR EACH ROW EXECUTE FUNCTION finans_cek_kilidi();

-- Çek sonucu ve virmanda hesap etkin olmalı ve para birimi tutmalı (FNS-23, FNS-30, FNS-32).
CREATE FUNCTION finans_cek_sonuc_hesabi() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h record;
BEGIN
  IF NEW.sonuc_hesap_id IS NULL OR NEW.sonuc_hesap_id IS NOT DISTINCT FROM OLD.sonuc_hesap_id THEN RETURN NEW; END IF;
  SELECT para_birimi, aktif, tur INTO h FROM finans_hesap WHERE id = NEW.sonuc_hesap_id;
  IF NOT h.aktif THEN RAISE EXCEPTION 'Pasif hesaba hareket yazılamaz.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_pasif_hesap'; END IF;
  IF h.para_birimi <> NEW.para_birimi OR h.tur <> 'banka' THEN
    RAISE EXCEPTION 'Çek yalnız aynı para birimindeki banka hesabına girer ya da oradan çıkar.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_cek_hesap_uyumu';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_cek_sonuc_hesabi BEFORE UPDATE ON finans_cek FOR EACH ROW EXECUTE FUNCTION finans_cek_sonuc_hesabi();

CREATE FUNCTION finans_virman_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k record; h record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.iptal_zamani IS NOT NULL OR NEW.iptal_zamani IS NULL
       OR (NEW.kaynak_hesap_id, NEW.hedef_hesap_id, NEW.tarih, NEW.tutar) IS DISTINCT FROM (OLD.kaynak_hesap_id, OLD.hedef_hesap_id, OLD.tarih, OLD.tutar) THEN
      RAISE EXCEPTION 'Virman değiştirilmez, yalnız iptal edilir.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_virman_degismez';
    END IF;
    RETURN NEW;
  END IF;
  SELECT para_birimi, aktif INTO k FROM finans_hesap WHERE id = NEW.kaynak_hesap_id;
  SELECT para_birimi, aktif INTO h FROM finans_hesap WHERE id = NEW.hedef_hesap_id;
  IF NOT k.aktif OR NOT h.aktif THEN RAISE EXCEPTION 'Pasif hesaba hareket yazılamaz.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_pasif_hesap'; END IF;
  IF k.para_birimi <> h.para_birimi THEN
    RAISE EXCEPTION 'Virman aynı para birimindeki hesaplar arasında yapılır.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_virman_para_birimi';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_virman_denetle BEFORE INSERT OR UPDATE ON finans_virman FOR EACH ROW EXECUTE FUNCTION finans_virman_denetle();

-- Hesap bakiyesi (FNS-29): açılış + ödemeler + sonuçlanan çekler + virmanlar + eşitlemeler, hesabın para biriminde.
CREATE FUNCTION finans_hesap_bakiyesi(p_hesap int) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT h.acilis_bakiyesi
    + coalesce((SELECT sum(CASE WHEN o.yon = 'gelir' THEN o.tutar ELSE -o.tutar END) FROM finans_odeme o WHERE o.hesap_id = h.id AND o.iptal_zamani IS NULL), 0)
    + coalesce((SELECT sum(CASE WHEN c.yon = 'alinan' THEN c.tutar ELSE -c.tutar END) FROM finans_cek c WHERE c.sonuc_hesap_id = h.id AND c.durum IN ('tahsil', 'odendi')), 0)
    + coalesce((SELECT sum(v.tutar) FROM finans_virman v WHERE v.hedef_hesap_id = h.id AND v.iptal_zamani IS NULL), 0)
    - coalesce((SELECT sum(v.tutar) FROM finans_virman v WHERE v.kaynak_hesap_id = h.id AND v.iptal_zamani IS NULL), 0)
    + coalesce((SELECT sum(e.fark) FROM finans_bakiye_esitleme e WHERE e.hesap_id = h.id), 0)
  FROM finans_hesap h WHERE h.id = p_hesap
$$;
