-- Stok Merkezi ilk sürüm: depo, raf, konum, parti, bakiye, hareket defteri, mal kabul belgesi, Logo alanları, malzeme stok ayarı.
-- Malzeme bağı katalog kartının değişmez sayı kimliğidir: malzeme_katalog_karti (no), integer (K5).

CREATE TABLE stok_depo (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL CONSTRAINT stok_depo_kod_bicimi CHECK (kod ~ '^[A-Z0-9]{1,10}$'),
  ad text NOT NULL CONSTRAINT stok_depo_ad_bicimi CHECK (btrim(ad) <> '' AND length(ad) <= 60),
  logo_ambar_no int CONSTRAINT stok_depo_logo_ambar_eksi_degil CHECK (logo_ambar_no >= 0),
  aktif boolean NOT NULL DEFAULT true,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_depo_kod_tek UNIQUE (kod),
  CONSTRAINT stok_depo_logo_ambar_tek UNIQUE (logo_ambar_no)
);

CREATE TABLE stok_raf (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  depo_id int NOT NULL REFERENCES stok_depo,
  kod text NOT NULL CONSTRAINT stok_raf_kod_bicimi CHECK (kod ~ '^[A-Z0-9]{1,3}$'),
  tur text NOT NULL CONSTRAINT stok_raf_tur_degeri CHECK (tur IN ('palet', 'celik', 'konsol', 'zemin')),
  numaralama text NOT NULL CONSTRAINT stok_raf_numaralama_degeri CHECK (numaralama IN ('sirali', 'tek', 'cift')),
  ilk_bolme int NOT NULL DEFAULT 1 CONSTRAINT stok_raf_ilk_bolme_pozitif CHECK (ilk_bolme > 0),
  bolme_sayisi int NOT NULL CONSTRAINT stok_raf_bolme_araligi CHECK (bolme_sayisi BETWEEN 1 AND 80),
  kat_sayisi int NOT NULL CONSTRAINT stok_raf_kat_araligi CHECK (kat_sayisi BETWEEN 1 AND 10),
  bolme_genislik_m numeric(5,2) NOT NULL,
  derinlik_m numeric(5,2) NOT NULL,
  kat_araligi_m numeric(5,2) NOT NULL,
  x_m numeric(7,2) NOT NULL DEFAULT 0,
  z_m numeric(7,2) NOT NULL DEFAULT 0,
  aci smallint NOT NULL DEFAULT 0 CONSTRAINT stok_raf_aci_degeri CHECK (aci IN (0, 90, 180, 270)),
  on_yuz_ters boolean NOT NULL DEFAULT false,
  aktif boolean NOT NULL DEFAULT true,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_raf_olcu_pozitif CHECK (bolme_genislik_m > 0 AND derinlik_m > 0 AND kat_araligi_m > 0),
  CONSTRAINT stok_raf_zemin_tek_kat CHECK (tur <> 'zemin' OR kat_sayisi = 1)
);

-- Raf gözleri raf açılınca ve düzenlenince satır olarak açılır; daralan rafın gözü silinmez, pasife alınır
-- (geçmiş hareketler gözü gösterir). Kod gözün adresidir; raf kodu değişince kod yenilenir, kimlik aynı kalır.
CREATE TABLE stok_konum (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  depo_id int NOT NULL REFERENCES stok_depo,
  kod text NOT NULL CONSTRAINT stok_konum_kod_bicimi CHECK (kod ~ '^[A-Z0-9-]{2,20}$'),
  tur text NOT NULL CONSTRAINT stok_konum_tur_degeri CHECK (tur IN ('raf_gozu', 'kabul', 'uretim_cikisi', 'depo_zemini')),
  raf_id int REFERENCES stok_raf,
  bolme_no int,
  kat_no int,
  ad text CONSTRAINT stok_konum_ad_bicimi CHECK (ad IS NULL OR (btrim(ad) <> '' AND length(ad) <= 60)),
  son_sayim timestamptz,
  aktif boolean NOT NULL DEFAULT true,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_konum_kod_tek UNIQUE (kod),
  CONSTRAINT stok_konum_kimlik_aktif UNIQUE (id, aktif),
  CONSTRAINT stok_konum_raf_sayilari_pozitif CHECK (bolme_no > 0 AND kat_no > 0),
  CONSTRAINT stok_konum_tur_alanlari CHECK (
    (tur = 'raf_gozu') = (raf_id IS NOT NULL AND bolme_no IS NOT NULL AND kat_no IS NOT NULL)
    AND (tur = 'raf_gozu' OR (raf_id IS NULL AND bolme_no IS NULL AND kat_no IS NULL))
  ),
  CONSTRAINT stok_konum_raf_gozu_tek UNIQUE (raf_id, bolme_no, kat_no)
);
CREATE INDEX stok_konum_tur_kod_idx ON stok_konum (tur, kod);

-- Parti yalnız eklenir. Üretim partisi üretim emridir; satın alma partisi tedarikçi parti no ya da döküm no taşır.
CREATE TABLE stok_parti (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id integer NOT NULL CONSTRAINT stok_parti_malzeme_var REFERENCES malzeme_katalog_karti (no),
  tedarikci_parti_no text CONSTRAINT stok_parti_no_bicimi CHECK (btrim(tedarikci_parti_no) <> '' AND length(tedarikci_parti_no) <= 40),
  dokum_no text CONSTRAINT stok_parti_dokum_bicimi CHECK (btrim(dokum_no) <> '' AND length(dokum_no) <= 40),
  sertifika_no text CONSTRAINT stok_parti_sertifika_bicimi CHECK (btrim(sertifika_no) <> '' AND length(sertifika_no) <= 40),
  uretim_emri_id int, -- Aşama 2: yabancı anahtar ayrı göçle (STK6 b; emir modeli değişiyor)
  kayit_zamani timestamptz NOT NULL DEFAULT now(),
  acan_kisi_id int NOT NULL REFERENCES kisi,
  CONSTRAINT stok_parti_kimlik_malzeme UNIQUE (id, malzeme_id),
  CONSTRAINT stok_parti_tanimli CHECK (uretim_emri_id IS NOT NULL OR tedarikci_parti_no IS NOT NULL OR dokum_no IS NOT NULL),
  CONSTRAINT stok_parti_kaynak_tek CHECK (uretim_emri_id IS NULL OR (tedarikci_parti_no IS NULL AND dokum_no IS NULL)),
  CONSTRAINT stok_parti_tek UNIQUE NULLS NOT DISTINCT (malzeme_id, tedarikci_parti_no, dokum_no, uretim_emri_id)
);
CREATE UNIQUE INDEX stok_parti_emir_tek ON stok_parti (malzeme_id, uretim_emri_id) WHERE uretim_emri_id IS NOT NULL;
CREATE INDEX stok_parti_kayit_idx ON stok_parti (kayit_zamani, id);
CREATE INDEX stok_parti_malzeme_idx ON stok_parti (malzeme_id, id);
CREATE TRIGGER stok_parti_degismez BEFORE UPDATE OR DELETE ON stok_parti FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_parti_bosaltilmaz BEFORE TRUNCATE ON stok_parti FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Bakiye (malzeme, konum, parti) ekseninde tek satırdır; eksi bakiye onaylı düşümle olur (K: negatif onaya bağlı).
-- konum_aktif sabit true: bileşik yabancı anahtar, bakiyesi olan konumun pasife alınmasını eşzamanlı yazmada da durdurur.
CREATE TABLE stok_bakiye (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id integer NOT NULL CONSTRAINT stok_bakiye_malzeme_var REFERENCES malzeme_katalog_karti (no),
  konum_id int NOT NULL,
  konum_aktif boolean NOT NULL DEFAULT true CONSTRAINT stok_bakiye_konum_aktif_sabit CHECK (konum_aktif),
  parti_id bigint,
  miktar numeric(14,3) NOT NULL CONSTRAINT stok_bakiye_sifir_degil CHECK (miktar <> 0),
  ilk_giris timestamptz NOT NULL,
  ambalaj_tur text CONSTRAINT stok_bakiye_ambalaj_turu CHECK (ambalaj_tur IN ('kasa', 'koli', 'palet', 'bidon', 'makara')),
  ambalaj_olcu text CONSTRAINT stok_bakiye_ambalaj_olcusu CHECK (ambalaj_olcu ~ '^[a-z0-9]{1,8}$'),
  ambalaj_uzunluk_cm numeric(6,1),
  ambalaj_genislik_cm numeric(6,1),
  ambalaj_yukseklik_cm numeric(6,1),
  ambalaj_adet int CONSTRAINT stok_bakiye_ambalaj_adedi CHECK (ambalaj_adet > 0),
  CONSTRAINT stok_bakiye_aktif_konumda FOREIGN KEY (konum_id, konum_aktif) REFERENCES stok_konum (id, aktif) ON UPDATE RESTRICT,
  CONSTRAINT stok_bakiye_parti_malzemesi FOREIGN KEY (parti_id, malzeme_id) REFERENCES stok_parti (id, malzeme_id),
  CONSTRAINT stok_bakiye_ambalaj_tutarli CHECK ((ambalaj_tur IS NULL) = (ambalaj_olcu IS NULL)),
  CONSTRAINT stok_bakiye_ozel_olcu CHECK (
    (ambalaj_olcu IS NOT DISTINCT FROM 'ozel')
    = COALESCE(ambalaj_uzunluk_cm > 0 AND ambalaj_genislik_cm > 0 AND ambalaj_yukseklik_cm > 0, false)
    AND (ambalaj_olcu IS NOT DISTINCT FROM 'ozel' OR (ambalaj_uzunluk_cm IS NULL AND ambalaj_genislik_cm IS NULL AND ambalaj_yukseklik_cm IS NULL))
  ),
  CONSTRAINT stok_bakiye_tek UNIQUE NULLS NOT DISTINCT (malzeme_id, konum_id, parti_id)
);
CREATE INDEX stok_bakiye_konum_idx ON stok_bakiye (konum_id);
CREATE INDEX stok_bakiye_parti_idx ON stok_bakiye (parti_id) WHERE parti_id IS NOT NULL;

-- Hareket defteri yalnız eklenir; düzeltme ters harekettir. Yön konumlardan okunur, miktar hep artıdır.
CREATE TABLE stok_hareketi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zaman timestamptz NOT NULL DEFAULT now(),
  tur text NOT NULL CONSTRAINT stok_hareketi_tur_degeri CHECK (tur IN ('giris', 'cikis', 'transfer', 'sayim_fazla', 'sayim_eksik', 'geri_alma')),
  malzeme_id integer NOT NULL CONSTRAINT stok_hareketi_malzeme_var REFERENCES malzeme_katalog_karti (no),
  parti_id bigint,
  parti_secimi text,
  kaynak_konum_id int REFERENCES stok_konum,
  hedef_konum_id int REFERENCES stok_konum,
  miktar numeric(14,3) NOT NULL CONSTRAINT stok_hareketi_miktar_pozitif CHECK (miktar > 0),
  onayli_eksi boolean NOT NULL DEFAULT false,
  eksi_onay_kaynagi text,
  giris_kaynagi text,
  cikis_nedeni text,
  uretim_emri_id int, -- Aşama 2: yabancı anahtar ayrı göçle (STK6 b)
  geri_alinan_id bigint REFERENCES stok_hareketi,
  kisi_id int NOT NULL REFERENCES kisi,
  aciklama text CONSTRAINT stok_hareketi_aciklama_bicimi CHECK (btrim(aciklama) <> '' AND length(aciklama) <= 200),
  CONSTRAINT stok_hareketi_parti_malzemesi FOREIGN KEY (parti_id, malzeme_id) REFERENCES stok_parti (id, malzeme_id),
  CONSTRAINT stok_hareketi_parti_secimi CHECK (
    (parti_id IS NULL) = (parti_secimi IS NULL) AND (parti_secimi IS NULL OR parti_secimi IN ('kisi', 'tek_parti', 'en_eski', 'giris'))
  ),
  CONSTRAINT stok_hareketi_yon CHECK (
    CASE tur
      WHEN 'giris' THEN kaynak_konum_id IS NULL AND hedef_konum_id IS NOT NULL
      WHEN 'sayim_fazla' THEN kaynak_konum_id IS NULL AND hedef_konum_id IS NOT NULL
      WHEN 'cikis' THEN kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NULL
      WHEN 'sayim_eksik' THEN kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NULL
      WHEN 'transfer' THEN kaynak_konum_id IS NOT NULL AND hedef_konum_id IS NOT NULL AND kaynak_konum_id <> hedef_konum_id
      ELSE geri_alinan_id IS NOT NULL AND (kaynak_konum_id IS NOT NULL OR hedef_konum_id IS NOT NULL)
    END
  ),
  CONSTRAINT stok_hareketi_geri_alma_bagli CHECK ((tur = 'geri_alma') = (geri_alinan_id IS NOT NULL)),
  CONSTRAINT stok_hareketi_tek_geri_alma UNIQUE (geri_alinan_id),
  CONSTRAINT stok_hareketi_eksi_yalniz_dusumde CHECK (NOT onayli_eksi OR tur IN ('cikis', 'transfer', 'geri_alma')),
  CONSTRAINT stok_hareketi_eksi_onay_kaynagi CHECK (onayli_eksi = (eksi_onay_kaynagi IS NOT NULL) AND (eksi_onay_kaynagi IS NULL OR eksi_onay_kaynagi = 'kisi')),
  CONSTRAINT stok_hareketi_giris_kaynagi CHECK ((tur = 'giris') = (giris_kaynagi IS NOT NULL) AND (giris_kaynagi IS NULL OR giris_kaynagi IN ('mal_kabul', 'uretim'))),
  CONSTRAINT stok_hareketi_cikis_nedeni CHECK (
    (tur = 'cikis') = (cikis_nedeni IS NOT NULL) AND (cikis_nedeni IS NULL OR cikis_nedeni IN ('uretime_sarf', 'sevk', 'fire', 'numune', 'diger'))
  ),
  CONSTRAINT stok_hareketi_sarf_emirli CHECK (cikis_nedeni IS DISTINCT FROM 'uretime_sarf' OR uretim_emri_id IS NOT NULL),
  CONSTRAINT stok_hareketi_uretim_girisi_emirli CHECK (giris_kaynagi IS DISTINCT FROM 'uretim' OR uretim_emri_id IS NOT NULL),
  CONSTRAINT stok_hareketi_emir_yalniz_uretimde CHECK (
    uretim_emri_id IS NULL OR cikis_nedeni = 'uretime_sarf' OR giris_kaynagi = 'uretim' OR tur = 'geri_alma'
  )
);
CREATE INDEX stok_hareketi_zaman_idx ON stok_hareketi (zaman, id);
CREATE INDEX stok_hareketi_malzeme_idx ON stok_hareketi (malzeme_id, id);
CREATE INDEX stok_hareketi_parti_idx ON stok_hareketi (parti_id, id);
CREATE INDEX stok_hareketi_kaynak_idx ON stok_hareketi (kaynak_konum_id, id);
CREATE INDEX stok_hareketi_hedef_idx ON stok_hareketi (hedef_konum_id, id);
CREATE INDEX stok_hareketi_emir_idx ON stok_hareketi (uretim_emri_id, id) WHERE uretim_emri_id IS NOT NULL;
CREATE TRIGGER stok_hareketi_degismez BEFORE UPDATE OR DELETE ON stok_hareketi FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_hareketi_bosaltilmaz BEFORE TRUNCATE ON stok_hareketi FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Logo gönderim alanları (K8): defter yalnız eklendiği için hareket başına bir yan satır; yazan Logo bağlantı işidir.
CREATE TABLE stok_hareketi_logo (
  hareket_id bigint PRIMARY KEY REFERENCES stok_hareketi,
  logo_kayit_no bigint CONSTRAINT stok_hareketi_logo_kayit_no_pozitif CHECK (logo_kayit_no > 0),
  logo_gonderim_durumu text CONSTRAINT stok_hareketi_logo_durum_degeri CHECK (logo_gonderim_durumu IN ('bekliyor', 'gonderildi', 'hata')),
  logo_iletisi text CONSTRAINT stok_hareketi_logo_ileti_bicimi CHECK (btrim(logo_iletisi) <> '' AND length(logo_iletisi) <= 500),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stok_hareketi_logo_gonderildi_nolu CHECK (logo_gonderim_durumu IS DISTINCT FROM 'gonderildi' OR logo_kayit_no IS NOT NULL)
);
CREATE INDEX stok_hareketi_logo_durum_idx ON stok_hareketi_logo (logo_gonderim_durumu, hareket_id)
  WHERE logo_gonderim_durumu IS DISTINCT FROM 'gonderildi';

-- Mal kabul belgesi değişmez. Düzeltme yeni belgedir: eski belgenin hareketleri aynı işlemde ters çevrilir.
-- Belge no kimlikten türer (üretim emri kalıbı): altı haneyi aşan kimlik kesilmeden yazılır.
CREATE TABLE stok_mal_kabul (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text GENERATED ALWAYS AS ('MK-' || CASE WHEN id < 1000000 THEN lpad(id::text, 6, '0') ELSE id::text END) STORED,
  tur text NOT NULL CONSTRAINT stok_mal_kabul_tur_degeri CHECK (tur IN ('satin_alma', 'iade', 'diger')),
  irsaliye_no text CONSTRAINT stok_mal_kabul_irsaliye_bicimi CHECK (btrim(irsaliye_no) <> '' AND length(irsaliye_no) <= 30),
  duzeltilen_id int REFERENCES stok_mal_kabul,
  zaman timestamptz NOT NULL DEFAULT now(),
  kisi_id int NOT NULL REFERENCES kisi,
  CONSTRAINT stok_mal_kabul_no_tek UNIQUE (no),
  CONSTRAINT stok_mal_kabul_tek_duzeltme UNIQUE (duzeltilen_id),
  CONSTRAINT stok_mal_kabul_kendini_duzeltmez CHECK (duzeltilen_id IS DISTINCT FROM id)
);
CREATE INDEX stok_mal_kabul_zaman_idx ON stok_mal_kabul (zaman, id);
CREATE TRIGGER stok_mal_kabul_degismez BEFORE UPDATE OR DELETE ON stok_mal_kabul FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_mal_kabul_bosaltilmaz BEFORE TRUNCATE ON stok_mal_kabul FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Satırın yalnız Logo alanları değişir (eşleme işi); gerisi tetikleyiciyle korunur. Sipariş satırı bağı satın alma
-- modülü gelince yeni göçle eklenir (yalnız yabancı anahtar).
CREATE TABLE stok_mal_kabul_satiri (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mal_kabul_id int NOT NULL REFERENCES stok_mal_kabul,
  sira smallint NOT NULL CONSTRAINT stok_mal_kabul_satiri_sira_pozitif CHECK (sira > 0),
  malzeme_id integer NOT NULL CONSTRAINT stok_mal_kabul_satiri_malzeme_var REFERENCES malzeme_katalog_karti (no),
  sayilan_miktar numeric(14,3) NOT NULL CONSTRAINT stok_mal_kabul_satiri_miktar_pozitif CHECK (sayilan_miktar > 0),
  parti_id bigint,
  konum_id int NOT NULL REFERENCES stok_konum,
  hareket_id bigint NOT NULL REFERENCES stok_hareketi,
  logo_irsaliye_satir_no bigint CONSTRAINT stok_mal_kabul_satiri_logo_no_pozitif CHECK (logo_irsaliye_satir_no > 0),
  logo_irsaliye_miktari numeric(14,3),
  logo_durumu text NOT NULL DEFAULT 'irsaliye_bekleniyor'
    CONSTRAINT stok_mal_kabul_satiri_logo_durumu CHECK (logo_durumu IN ('irsaliye_bekleniyor', 'eslesti', 'fark_var')),
  CONSTRAINT stok_mal_kabul_satiri_sira_tek UNIQUE (mal_kabul_id, sira),
  CONSTRAINT stok_mal_kabul_satiri_hareket_tek UNIQUE (hareket_id),
  CONSTRAINT stok_mal_kabul_satiri_parti_malzemesi FOREIGN KEY (parti_id, malzeme_id) REFERENCES stok_parti (id, malzeme_id),
  CONSTRAINT stok_mal_kabul_satiri_logo_tutarli CHECK (
    (logo_durumu = 'irsaliye_bekleniyor') = (logo_irsaliye_satir_no IS NULL)
    AND (logo_durumu = 'irsaliye_bekleniyor') = (logo_irsaliye_miktari IS NULL)
    AND (logo_durumu <> 'eslesti' OR logo_irsaliye_miktari = sayilan_miktar)
    AND (logo_durumu <> 'fark_var' OR logo_irsaliye_miktari <> sayilan_miktar)
  )
);
CREATE INDEX stok_mal_kabul_satiri_logo_idx ON stok_mal_kabul_satiri (logo_durumu, id) WHERE logo_durumu <> 'eslesti';

CREATE FUNCTION stok_mal_kabul_satiri_logo_disi_sabit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stok_mal_kabul_satiri silinmez' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.mal_kabul_id, NEW.sira, NEW.malzeme_id, NEW.sayilan_miktar, NEW.parti_id, NEW.konum_id, NEW.hareket_id)
     IS DISTINCT FROM (OLD.mal_kabul_id, OLD.sira, OLD.malzeme_id, OLD.sayilan_miktar, OLD.parti_id, OLD.konum_id, OLD.hareket_id) THEN
    RAISE EXCEPTION 'stok_mal_kabul_satiri yalnız Logo alanlarında değişir' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stok_mal_kabul_satiri_sabit BEFORE UPDATE OR DELETE ON stok_mal_kabul_satiri
  FOR EACH ROW EXECUTE FUNCTION stok_mal_kabul_satiri_logo_disi_sabit();

CREATE TABLE stok_malzeme_ayari (
  malzeme_id integer PRIMARY KEY CONSTRAINT stok_malzeme_ayari_malzeme_var REFERENCES malzeme_katalog_karti (no),
  kritik_seviye numeric(14,3) CONSTRAINT stok_malzeme_ayari_kritik_eksi_degil CHECK (kritik_seviye >= 0),
  varsayilan_ambalaj_tur text CONSTRAINT stok_malzeme_ayari_ambalaj_turu CHECK (varsayilan_ambalaj_tur IN ('kasa', 'koli', 'palet', 'bidon', 'makara')),
  varsayilan_ambalaj_olcu text,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_malzeme_ayari_ambalaj_tutarli CHECK ((varsayilan_ambalaj_tur IS NULL) = (varsayilan_ambalaj_olcu IS NULL))
);

CREATE TABLE stok_malzeme_ambalaji (
  malzeme_id integer NOT NULL REFERENCES stok_malzeme_ayari,
  ambalaj_tur text NOT NULL CONSTRAINT stok_malzeme_ambalaji_tur CHECK (ambalaj_tur IN ('kasa', 'koli', 'palet', 'bidon', 'makara')),
  ambalaj_olcu text NOT NULL CONSTRAINT stok_malzeme_ambalaji_olcu_bicimi CHECK (ambalaj_olcu ~ '^[a-z0-9]{1,8}$'),
  ici_miktar numeric(14,3) NOT NULL CONSTRAINT stok_malzeme_ambalaji_ici_pozitif CHECK (ici_miktar > 0),
  PRIMARY KEY (malzeme_id, ambalaj_tur, ambalaj_olcu)
);

-- Sistem sabitleri (gerçek veri değil): ana depo, mal kabul alanı, üretim çıkış alanı.
INSERT INTO stok_depo (kod, ad) VALUES ('ANA', 'Ana depo');
INSERT INTO stok_konum (depo_id, kod, tur, ad)
  SELECT id, 'KABUL', 'kabul', 'Mal kabul alanı' FROM stok_depo WHERE kod = 'ANA'
  UNION ALL
  SELECT id, 'URETIM', 'uretim_cikisi', 'Üretim çıkış alanı' FROM stok_depo WHERE kod = 'ANA';
