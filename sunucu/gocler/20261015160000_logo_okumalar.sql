-- Logo'dan okunan veriler (mal kabul satırı, cari, ambar, fatura) yalnız saklanır; malzeme fişi giden kutusu logo_giden'in aynısıdır (dolu tabloya dokunmadan).
-- Hepsi yeni, boş tablo; hiçbiri başka modülün tablosuna bağlanmaz (bağlama sonra, ayrı göçle).

-- Satın alma irsaliyesi satırı (STLINE); tekil anahtar Logo satır kaydıdır. Alanlar esnek ayıklanır (cevap biçimi doğrulanmadı), tam satır ham tutulur.
CREATE TABLE logo_mal_kabul_satiri (
  logical_ref bigint PRIMARY KEY CONSTRAINT logo_mal_kabul_satiri_ref CHECK (logical_ref > 0),
  siparis_satir_ref bigint,
  siparis_fis_ref bigint,
  fis_no text CONSTRAINT logo_mal_kabul_satiri_fis_no CHECK (fis_no IS NULL OR (btrim(fis_no) <> '' AND length(fis_no) <= 64)),
  malzeme_kodu text CONSTRAINT logo_mal_kabul_satiri_malzeme CHECK (malzeme_kodu IS NULL OR (btrim(malzeme_kodu) <> '' AND length(malzeme_kodu) <= 64)),
  miktar numeric,
  birim text CONSTRAINT logo_mal_kabul_satiri_birim CHECK (birim IS NULL OR (btrim(birim) <> '' AND length(birim) <= 40)),
  ham jsonb NOT NULL,
  okuma_zamani timestamptz NOT NULL DEFAULT now()
);

-- "since" imleci (tek satır): son okunan satır kaydı; geriye gitmez.
CREATE TABLE logo_mal_kabul_imleci (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT logo_mal_kabul_imleci_tek CHECK (tek),
  son_ref bigint NOT NULL CONSTRAINT logo_mal_kabul_imleci_ref CHECK (son_ref >= 0),
  son_okuma timestamptz NOT NULL
);

CREATE TABLE logo_cari (
  kod text PRIMARY KEY CONSTRAINT logo_cari_kod CHECK (btrim(kod) <> '' AND length(kod) <= 64),
  ad text CONSTRAINT logo_cari_ad CHECK (ad IS NULL OR (btrim(ad) <> '' AND length(ad) <= 200)),
  son_okuma timestamptz NOT NULL
);

CREATE TABLE logo_ambar (
  kod text PRIMARY KEY CONSTRAINT logo_ambar_kod CHECK (btrim(kod) <> '' AND length(kod) <= 64),
  ad text CONSTRAINT logo_ambar_ad CHECK (ad IS NULL OR (btrim(ad) <> '' AND length(ad) <= 200)),
  son_okuma timestamptz NOT NULL
);

-- Liste başına son başarılı okuma ve kayıt sayısı.
CREATE TABLE logo_liste_okuma (
  liste text PRIMARY KEY CONSTRAINT logo_liste_okuma_liste CHECK (liste IN ('cari', 'ambar')),
  son_okuma timestamptz NOT NULL,
  sayi int NOT NULL CONSTRAINT logo_liste_okuma_sayi CHECK (sayi >= 0)
);

-- Logo'ya gitmiş satın alma siparişinin numarası (logo_giden yalnız sipariş kimliğini tutar); fatura okuması numarayla gider.
CREATE TABLE logo_siparis_no (
  belge_no int PRIMARY KEY CONSTRAINT logo_siparis_no_belge CHECK (belge_no > 0),
  siparis_no text NOT NULL CONSTRAINT logo_siparis_no_no CHECK (btrim(siparis_no) <> '' AND length(siparis_no) <= 64),
  olusma timestamptz NOT NULL DEFAULT now()
);

-- Sipariş faturası; anahtar faturanın Logo kaydıdır, yoksa satırın özeti.
CREATE TABLE logo_fatura (
  siparis_no text NOT NULL CONSTRAINT logo_fatura_siparis CHECK (btrim(siparis_no) <> '' AND length(siparis_no) <= 64),
  anahtar text NOT NULL CONSTRAINT logo_fatura_anahtar CHECK (btrim(anahtar) <> '' AND length(anahtar) <= 128),
  fatura_no text CONSTRAINT logo_fatura_no CHECK (fatura_no IS NULL OR (btrim(fatura_no) <> '' AND length(fatura_no) <= 64)),
  ham jsonb NOT NULL,
  okuma_zamani timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (siparis_no, anahtar)
);

-- Siparişin faturalarının son okunması: sırayla ve eskiden yeniye okunur.
CREATE TABLE logo_fatura_okuma (
  siparis_no text PRIMARY KEY CONSTRAINT logo_fatura_okuma_siparis CHECK (btrim(siparis_no) <> '' AND length(siparis_no) <= 64),
  son_okuma timestamptz NOT NULL,
  sayi int NOT NULL CONSTRAINT logo_fatura_okuma_sayi CHECK (sayi >= 0)
);

-- Malzeme fişi (sarf, üretimden giriş) giden kutusu: logo_giden ile aynı sütun ve kural, yalnız belge türü farklı.
CREATE TABLE logo_malzeme_fisi_giden (
  belge_turu text NOT NULL CONSTRAINT logo_malzeme_fisi_giden_belge_turu CHECK (belge_turu IN ('sarf-fisi', 'uretim-girisi')),
  belge_no int NOT NULL CONSTRAINT logo_malzeme_fisi_giden_belge_no CHECK (belge_no > 0),
  niyet_zamani timestamptz,
  deneme_sayisi int NOT NULL DEFAULT 0 CONSTRAINT logo_malzeme_fisi_giden_deneme_sayisi CHECK (deneme_sayisi >= 0),
  ardisik_hata int NOT NULL DEFAULT 0 CONSTRAINT logo_malzeme_fisi_giden_ardisik_hata CHECK (ardisik_hata >= 0),
  son_deneme timestamptz,
  son_sonuc text CONSTRAINT logo_malzeme_fisi_giden_son_sonuc CHECK (son_sonuc IN ('gonderildi', 'zaten-vardi', 'reddedildi', 'yetkisiz', 'ulasilamadi', 'belirsiz', 'yazilamadi')),
  son_hata text CONSTRAINT logo_malzeme_fisi_giden_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  sonraki_deneme timestamptz,
  logo_kayit_no text CONSTRAINT logo_malzeme_fisi_giden_logo_kayit_no CHECK (logo_kayit_no IS NULL OR (btrim(logo_kayit_no) <> '' AND length(logo_kayit_no) <= 64)),
  olusma timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (belge_turu, belge_no),
  CONSTRAINT logo_malzeme_fisi_giden_butun CHECK (
    (son_sonuc IS NULL) = (son_deneme IS NULL)
    AND (logo_kayit_no IS NOT NULL) = (son_sonuc IS NOT DISTINCT FROM 'gonderildi' OR son_sonuc IS NOT DISTINCT FROM 'zaten-vardi')
    AND (son_hata IS NOT NULL) = (son_sonuc IS NOT NULL AND son_sonuc NOT IN ('gonderildi', 'zaten-vardi'))
    AND (son_sonuc NOT IN ('gonderildi', 'zaten-vardi') OR son_sonuc IS NULL OR niyet_zamani IS NULL)
  )
);
