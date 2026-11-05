-- 3D Atölyesi dosya sağlık raporu (kart 2143, 2140-1 a): revizyonun B-rep okumasında okuyucunun kendi onarımından sonra kalan açık kenar,
-- geçersiz yüz, en büyük kenar toleransı, çok kısa kenar ve dosyanın kendi uzunluk birimi. Yeni boş tablo. Revizyon kimliği geometri_analiz'deki
-- gibi yabancı anahtarsızdır (yön geometri -> cizimler). Satır analizle aynı işlemde yazılır; B-rep okunamadıysa satır yoktur (sıfır uydurulmaz).
CREATE TABLE geometri_saglik (
  revizyon_id int PRIMARY KEY,
  acik_kenar_sayisi int NOT NULL CONSTRAINT geometri_saglik_acik_kenar CHECK (acik_kenar_sayisi >= 0),
  acik_sinir_sayisi int NOT NULL CONSTRAINT geometri_saglik_acik_sinir CHECK (acik_sinir_sayisi >= 0),
  gecersiz_yuz_sayisi int NOT NULL CONSTRAINT geometri_saglik_gecersiz_yuz CHECK (gecersiz_yuz_sayisi >= 0),
  sekil_gecerli boolean NOT NULL,
  en_buyuk_tolerans_mm numeric(14, 7) NOT NULL CONSTRAINT geometri_saglik_tolerans CHECK (en_buyuk_tolerans_mm >= 0),
  kucuk_kenar_sayisi int NOT NULL CONSTRAINT geometri_saglik_kucuk_kenar CHECK (kucuk_kenar_sayisi >= 0),
  -- Dosyada yazan uzunluk birimi (ör. millimetre, INCH); okunamadıysa null.
  dosya_birimi text CONSTRAINT geometri_saglik_birim CHECK (dosya_birimi IS NULL OR (btrim(dosya_birimi) <> '' AND length(dosya_birimi) <= 40)),
  motor text NOT NULL CONSTRAINT geometri_saglik_motor CHECK (btrim(motor) <> ''),
  hesap_zamani timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geometri_saglik_gecersiz_sekil CHECK (gecersiz_yuz_sayisi = 0 OR NOT sekil_gecerli)
);
