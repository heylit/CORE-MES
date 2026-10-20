-- Yayındaki STEP/IGES revizyonun tarayıcıda üretilen önizleme kareleri: kare dosyası `dosya`da durur, burası yalnız sırayı ve üreteni anar.
-- Yayınlanmış revizyon silinemediği için bağ ON DELETE istemez; revizyon silinirse önce kareler gitmelidir.
CREATE TABLE cizimler_onizleme (
  revizyon_id int NOT NULL CONSTRAINT cizimler_onizleme_revizyon_fk REFERENCES cizimler_revizyon,
  kare smallint NOT NULL CONSTRAINT cizimler_onizleme_kare_araligi CHECK (kare BETWEEN 0 AND 15),
  ozet text NOT NULL CONSTRAINT cizimler_onizleme_ozet_fk REFERENCES dosya,
  kisi_id int NOT NULL CONSTRAINT cizimler_onizleme_kisi_fk REFERENCES kisi,
  uretildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cizimler_onizleme_pkey PRIMARY KEY (revizyon_id, kare)
);
CREATE INDEX cizimler_onizleme_ozet_idx ON cizimler_onizleme (ozet);
CREATE INDEX cizimler_onizleme_kisi_idx ON cizimler_onizleme (kisi_id);
