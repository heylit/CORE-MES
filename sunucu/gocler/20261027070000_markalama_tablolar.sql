-- Markalama (kart 806; 1a-5a): rota adımının markalama tanımı, sunucunun verdiği tekil seri no ve markalanan birimin durum defteri.
-- Yalnız yeni, boş tablolar açılır. Malzeme, op no, üretim emri, istasyon, hurda nedeni ve model belgesi sayı kimliğiyle tutulur;
-- yabancı anahtarları Aşama 2'de ayrı göçle gelir (UYUM-BORCU).

-- Tanım rota adımına (malzeme + op no) bağlıdır; op no rota revizyonları arasında sabittir (rota_op_numarasi).
CREATE TABLE markalama_tanimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id int NOT NULL CONSTRAINT markalama_tanimi_malzeme_pozitif CHECK (malzeme_id > 0),
  op_no int NOT NULL CONSTRAINT markalama_tanimi_op_pozitif CHECK (op_no > 0),
  seri_sablonu text NOT NULL CONSTRAINT markalama_tanimi_sablon_bicimi CHECK (btrim(seri_sablonu) <> '' AND char_length(seri_sablonu) <= 60),
  sayac_kapsami text NOT NULL DEFAULT 'malzeme' CONSTRAINT markalama_tanimi_kapsam_degeri CHECK (sayac_kapsami IN ('malzeme', 'emir', 'yil')),
  baslangic_sirasi int NOT NULL DEFAULT 1 CONSTRAINT markalama_tanimi_baslangic CHECK (baslangic_sirasi BETWEEN 1 AND 99999999),
  dogrulama boolean NOT NULL DEFAULT true,
  -- Yerin işaretlendiği 3B model: Çizim Merkezi belgesi ve revizyon harfi. Model değişince tanım yeniden kontrol ister.
  model_belge_id int CONSTRAINT markalama_tanimi_model_pozitif CHECK (model_belge_id > 0),
  model_revizyon text CONSTRAINT markalama_tanimi_model_revizyon CHECK (char_length(model_revizyon) <= 10),
  surum int NOT NULL DEFAULT 1,
  degistiren_kisi_id int NOT NULL REFERENCES kisi,
  degisme_zamani timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT markalama_tanimi_adim_tekil UNIQUE (malzeme_id, op_no),
  CONSTRAINT markalama_tanimi_model_butun CHECK ((model_belge_id IS NULL) = (model_revizyon IS NULL))
);

-- Tanımın markaları, vuruş sırasıyla. Yer model koordinatıdır (mm); boşsa yer henüz işaretlenmemiştir.
CREATE TABLE markalama_alani (
  tanim_id int NOT NULL REFERENCES markalama_tanimi ON DELETE CASCADE,
  sira smallint NOT NULL CONSTRAINT markalama_alani_sira CHECK (sira BETWEEN 1 AND 20),
  ad text NOT NULL CONSTRAINT markalama_alani_ad_bicimi CHECK (btrim(ad) <> '' AND char_length(ad) <= 60),
  icerik text NOT NULL CONSTRAINT markalama_alani_icerik_degeri CHECK (icerik IN ('seri', 'sabit')),
  sabit_metin text CONSTRAINT markalama_alani_sabit_bicimi CHECK (btrim(sabit_metin) <> '' AND char_length(sabit_metin) <= 40),
  kod_turu text NOT NULL DEFAULT 'yok' CONSTRAINT markalama_alani_kod_degeri CHECK (kod_turu IN ('yok', 'qr', 'datamatrix')),
  yontem text NOT NULL CONSTRAINT markalama_alani_yontem_degeri
    CHECK (yontem IN ('lazer', 'nokta_vurus', 'murekkep', 'elektrokimyasal', 'etiket')),
  yazi_yuksekligi_mm numeric(5, 2) CONSTRAINT markalama_alani_yazi CHECK (yazi_yuksekligi_mm > 0 AND yazi_yuksekligi_mm <= 100),
  program text CONSTRAINT markalama_alani_program CHECK (btrim(program) <> '' AND char_length(program) <= 40),
  yuzey text CONSTRAINT markalama_alani_yuzey CHECK (btrim(yuzey) <> '' AND char_length(yuzey) <= 120),
  merkez_x numeric(10, 3),
  merkez_y numeric(10, 3),
  merkez_z numeric(10, 3),
  normal_x numeric(8, 5),
  normal_y numeric(8, 5),
  normal_z numeric(8, 5),
  en_mm numeric(8, 2) CONSTRAINT markalama_alani_en CHECK (en_mm > 0),
  boy_mm numeric(8, 2) CONSTRAINT markalama_alani_boy CHECK (boy_mm > 0),
  aci_derece numeric(6, 2) CONSTRAINT markalama_alani_aci CHECK (aci_derece > -360 AND aci_derece < 360),
  PRIMARY KEY (tanim_id, sira),
  CONSTRAINT markalama_alani_sabit_icerik CHECK ((icerik = 'sabit') = (sabit_metin IS NOT NULL)),
  CONSTRAINT markalama_alani_yer_butun CHECK (
    num_nulls(merkez_x, merkez_y, merkez_z, normal_x, normal_y, normal_z, en_mm, boy_mm, aci_derece) IN (0, 9))
);

-- Seri sayacı malzeme başınadır (2a); kapsam anahtarı boş (malzeme), emir kimliği ya da yıldır. Sayaç yalnız artar.
CREATE TABLE markalama_sayaci (
  malzeme_id int NOT NULL,
  kapsam_anahtari text NOT NULL CONSTRAINT markalama_sayaci_anahtar CHECK (kapsam_anahtari ~ '^(|E[0-9]{1,10}|Y[0-9]{4})$'),
  son_sira int NOT NULL CONSTRAINT markalama_sayaci_sira_pozitif CHECK (son_sira > 0),
  PRIMARY KEY (malzeme_id, kapsam_anahtari)
);

-- Markalanan birim: seri no markalama anında doğar (3a) ve tekildir; hatalı markalanan numara yanar, yeniden verilmez.
CREATE TABLE markalama_birimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seri_no text NOT NULL CONSTRAINT markalama_birimi_seri_bicimi CHECK (btrim(seri_no) <> '' AND char_length(seri_no) <= 80),
  tanim_id int NOT NULL REFERENCES markalama_tanimi,
  malzeme_id int NOT NULL,
  uretim_emri_id int NOT NULL CONSTRAINT markalama_birimi_emir_pozitif CHECK (uretim_emri_id > 0),
  istasyon_id int CONSTRAINT markalama_birimi_istasyon_pozitif CHECK (istasyon_id > 0),
  sira int NOT NULL CONSTRAINT markalama_birimi_sira_pozitif CHECK (sira > 0),
  durum text NOT NULL CONSTRAINT markalama_birimi_durum_degeri CHECK (durum IN ('saglam', 'red', 'rework', 'hurda')),
  dogrulama_zamani timestamptz,
  surum int NOT NULL DEFAULT 1,
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT markalama_birimi_seri_tekil UNIQUE (seri_no)
);
CREATE INDEX markalama_birimi_emir ON markalama_birimi (uretim_emri_id, id);

-- Birimin durum defteri (4a): yalnız eklenir; birimin bugünkü durumu satırdadır, geçmişi buradadır.
CREATE TABLE markalama_birim_olayi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  birim_id int NOT NULL REFERENCES markalama_birimi,
  olay text NOT NULL CONSTRAINT markalama_birim_olayi_olay_degeri
    CHECK (olay IN ('markalandi', 'hatali_markalama', 'dogrulandi', 'red', 'rework', 'kabul', 'hurda')),
  hurda_nedeni_id int CONSTRAINT markalama_birim_olayi_neden_pozitif CHECK (hurda_nedeni_id > 0),
  aciklama text CONSTRAINT markalama_birim_olayi_aciklama CHECK (btrim(aciklama) <> '' AND char_length(aciklama) <= 300),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT markalama_birim_olayi_neden_hurdada CHECK (hurda_nedeni_id IS NULL OR olay = 'hurda')
);
CREATE INDEX markalama_birim_olayi_birim ON markalama_birim_olayi (birim_id, id);

CREATE TRIGGER markalama_birim_olayi_degismez BEFORE UPDATE OR DELETE ON markalama_birim_olayi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER markalama_birim_olayi_bosaltilmaz BEFORE TRUNCATE ON markalama_birim_olayi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
