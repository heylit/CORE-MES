-- İdari İşler 7: demirbaş ve zimmet (170 a, 244 a). Yeni, boş tablolar. İK'daki zimmet kayıtları ayrı göçle kopyalanır.
-- Metin sütunlarında uzunluk sınırı uçtadır; tabloda yalnız boş olmama vardır, çünkü İK'dan gelen metinlerin sınırı yoktu.

CREATE TABLE idari_isler_demirbas (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT idari_isler_demirbas_pk PRIMARY KEY,
  tur text NOT NULL CONSTRAINT idari_isler_demirbas_tur
    CHECK (tur IN ('dizustu', 'masaustu', 'monitor', 'telefon', 'hat', 'arac', 'giris_karti', 'anahtar', 'kkd', 'diger')),
  marka_model text CONSTRAINT idari_isler_demirbas_marka_model CHECK (marka_model IS NULL OR btrim(marka_model) <> ''),
  seri_no text CONSTRAINT idari_isler_demirbas_seri_no CHECK (seri_no IS NULL OR btrim(seri_no) <> ''),
  deger numeric(14, 2) CONSTRAINT idari_isler_demirbas_deger CHECK (deger > 0),
  -- IDR-30: zimmetli yalnız açık zimmetle birlikte yazılır (servis aynı işlemde).
  durum text NOT NULL DEFAULT 'bosta' CONSTRAINT idari_isler_demirbas_durum CHECK (durum IN ('bosta', 'zimmetli', 'bakimda', 'kayip', 'hurda')),
  aciklama text CONSTRAINT idari_isler_demirbas_aciklama CHECK (aciklama IS NULL OR btrim(aciklama) <> ''),
  olusturan_kisi_id int NOT NULL CONSTRAINT idari_isler_demirbas_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CONSTRAINT idari_isler_demirbas_surum CHECK (surum > 0)
);
CREATE INDEX idari_isler_demirbas_seri_no ON idari_isler_demirbas (seri_no) WHERE seri_no IS NOT NULL;

CREATE TABLE idari_isler_zimmet (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT idari_isler_zimmet_pk PRIMARY KEY,
  demirbas_id int NOT NULL CONSTRAINT idari_isler_zimmet_demirbas REFERENCES idari_isler_demirbas (id),
  -- Kişinin sahibi kisiler. İK'dan taşınan ve kişiye bağlanmamış personelin kaydında kisi_id boştur, ad personel_adi'ndadır (244).
  kisi_id int CONSTRAINT idari_isler_zimmet_kisi REFERENCES kisi (id),
  personel_adi text CONSTRAINT idari_isler_zimmet_personel_adi CHECK (personel_adi IS NULL OR btrim(personel_adi) <> ''),
  verilis date,
  iade date,
  iade_durumu text CONSTRAINT idari_isler_zimmet_iade_durumu CHECK (iade_durumu IN ('saglam', 'hasarli', 'kayip')),
  iade_notu text CONSTRAINT idari_isler_zimmet_iade_notu CHECK (iade_notu IS NULL OR btrim(iade_notu) <> ''),
  aciklama text CONSTRAINT idari_isler_zimmet_aciklama CHECK (aciklama IS NULL OR btrim(aciklama) <> ''),
  veren_kisi_id int NOT NULL CONSTRAINT idari_isler_zimmet_veren REFERENCES kisi (id),
  kayit timestamptz NOT NULL DEFAULT now(),
  iade_alan_kisi_id int CONSTRAINT idari_isler_zimmet_iade_alan REFERENCES kisi (id),
  -- İK'daki kaydın kimliği; kopya göçü bununla aynı kaydı ikinci kez almaz.
  kaynak_ik_kimlik text CONSTRAINT idari_isler_zimmet_kaynak_tek UNIQUE,
  surum int NOT NULL DEFAULT 1 CONSTRAINT idari_isler_zimmet_surum CHECK (surum > 0),
  CONSTRAINT idari_isler_zimmet_sahibi CHECK (kisi_id IS NOT NULL OR personel_adi IS NOT NULL),
  CONSTRAINT idari_isler_zimmet_iade_sirasi CHECK (iade IS NULL OR verilis IS NULL OR iade >= verilis),
  -- Yeni kayıtta veriliş zorunlu, iade durumu ve iadeyi alan iadeyle birlikte yazılır; İK'dan gelen kayıtta bu bilgiler olmayabilir.
  CONSTRAINT idari_isler_zimmet_yeni_butun CHECK (
    kaynak_ik_kimlik IS NOT NULL OR (verilis IS NOT NULL AND (iade IS NULL) = (iade_durumu IS NULL) AND (iade IS NULL) = (iade_alan_kisi_id IS NULL))
  ),
  CONSTRAINT idari_isler_zimmet_iade_butun CHECK ((iade_durumu IS NULL OR iade IS NOT NULL) AND (iade_alan_kisi_id IS NULL OR iade IS NOT NULL))
);
-- IDR-30: bir demirbaş aynı anda tek kişidedir.
CREATE UNIQUE INDEX idari_isler_zimmet_acik_tek ON idari_isler_zimmet (demirbas_id) WHERE iade IS NULL;
CREATE INDEX idari_isler_zimmet_kisi_acik ON idari_isler_zimmet (kisi_id) WHERE iade IS NULL;
CREATE INDEX idari_isler_zimmet_demirbas ON idari_isler_zimmet (demirbas_id, id DESC);

-- İK zimmet kopyası (244 a): her iptal edilmemiş İK kaydı bir demirbaş ve bir zimmet olur. Aynı kayıt iki kez alınmaz (kaynak_ik_kimlik);
-- bu yüzden kopya göçü ve İK'nın ik_zimmet'i kaldıran göçü (arada yazılanları almak için) aynı işlevi çağırır.
-- Personel kişiye bağlıysa zimmet o kişidedir; değilse kisi_id boş kalır, ad taşınır. İK'daki boş tür "diger", sıfır ya da eksi değer null olur.
-- Kopyalanan kayıt sayısını döner.
CREATE FUNCTION idari_isler_zimmet_ik_kopyala() RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  r record;
  yeni int;
  sayi int := 0;
BEGIN
  FOR r IN
    SELECT z.kimlik, z.tur, z.marka, z.seri_no, z.verilis, z.iade, z.deger, z.aciklama, z.olusturan_kisi_id, z.olusturma,
           p.kisi_id, btrim(p.ad || ' ' || p.soyad) AS personel_adi
      FROM ik_zimmet z
      JOIN ik_personel p ON p.no = z.personel_no
     WHERE NOT z.iptal
       AND NOT EXISTS (SELECT 1 FROM idari_isler_zimmet k WHERE k.kaynak_ik_kimlik = z.kimlik)
     ORDER BY z.no
  LOOP
    INSERT INTO idari_isler_demirbas (tur, marka_model, seri_no, deger, durum, olusturan_kisi_id, olusturma)
    VALUES (
      CASE r.tur
        WHEN 'Dizüstü bilgisayar' THEN 'dizustu' WHEN 'Masaüstü bilgisayar' THEN 'masaustu' WHEN 'Monitör' THEN 'monitor'
        WHEN 'Cep telefonu' THEN 'telefon' WHEN 'Hat / SIM' THEN 'hat' WHEN 'Araç' THEN 'arac' WHEN 'Giriş kartı' THEN 'giris_karti'
        WHEN 'Anahtar' THEN 'anahtar' WHEN 'İş kıyafeti / KKD' THEN 'kkd' ELSE 'diger'
      END,
      NULLIF(btrim(r.marka), ''), NULLIF(btrim(r.seri_no), ''), CASE WHEN r.deger > 0 THEN r.deger END,
      CASE WHEN r.iade IS NULL THEN 'zimmetli' ELSE 'bosta' END, r.olusturan_kisi_id, r.olusturma
    )
    RETURNING id INTO yeni;
    INSERT INTO idari_isler_zimmet (demirbas_id, kisi_id, personel_adi, verilis, iade, aciklama, veren_kisi_id, kayit, kaynak_ik_kimlik)
    VALUES (
      yeni, r.kisi_id, CASE WHEN r.kisi_id IS NULL THEN NULLIF(r.personel_adi, '') END, r.verilis, r.iade, NULLIF(btrim(r.aciklama), ''),
      r.olusturan_kisi_id, r.olusturma, r.kimlik
    );
    sayi := sayi + 1;
  END LOOP;
  RETURN sayi;
END $$;
