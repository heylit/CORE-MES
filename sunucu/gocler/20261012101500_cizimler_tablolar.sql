-- Çizim ve Dosya Merkezi (kart #708): belge kartı, revizyonları ve başka modüllerin kayıtlarına bağı. İçerik `dosya`
-- tablolarında durur; revizyon dosyayı özetiyle anar, bağı `dosya_bagi` (modul 'cizimler', kayit belge kimliği) tutar.

CREATE TABLE cizimler_belge (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL,
  tur text NOT NULL,
  aciklama text,
  aktif boolean NOT NULL DEFAULT true,
  surum int NOT NULL DEFAULT 1,
  olusturan_id int NOT NULL REFERENCES kisi,
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cizimler_belge_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  CONSTRAINT cizimler_belge_tur_degeri CHECK (tur IN ('teknik-resim', '3b-model', 'makine', 'sertifika', 'kroki', 'diger')),
  CONSTRAINT cizimler_belge_aciklama_boyu CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 500)),
  CONSTRAINT cizimler_belge_surum_pozitif CHECK (surum >= 1)
);
CREATE INDEX cizimler_belge_liste_idx ON cizimler_belge (aktif, guncellendi, id);
CREATE INDEX cizimler_belge_ad_idx ON cizimler_belge (aktif, ad, id);
CREATE INDEX cizimler_belge_olusturan_idx ON cizimler_belge (olusturan_id);

-- Revizyon sırası belgede 1'den birer artar (harf A, B, ... sıradan türetilir). Yayındaki revizyon belgede en çok bir tanedir;
-- yeni revizyon yayınlanınca eskisi "eski" olur. Dosya türü dosyanın değişmez özelliğidir; liste için burada da durur.
CREATE TABLE cizimler_revizyon (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  belge_id int NOT NULL REFERENCES cizimler_belge,
  sira int NOT NULL,
  ozet text NOT NULL REFERENCES dosya,
  dosya_turu text NOT NULL,
  durum text NOT NULL DEFAULT 'taslak',
  "not" text,
  yukleyen_id int NOT NULL REFERENCES kisi,
  yuklendi timestamptz NOT NULL DEFAULT now(),
  yayinlayan_id int REFERENCES kisi,
  yayinlandi timestamptz,
  CONSTRAINT cizimler_revizyon_sira_pozitif CHECK (sira >= 1),
  CONSTRAINT cizimler_revizyon_durum_degeri CHECK (durum IN ('taslak', 'yayinda', 'eski')),
  CONSTRAINT cizimler_revizyon_dosya_turu CHECK (dosya_turu IN ('pdf', 'png', 'jpeg', 'webp', 'step', 'stl', 'iges')),
  CONSTRAINT cizimler_revizyon_not_boyu CHECK ("not" IS NULL OR (btrim("not") <> '' AND length("not") <= 300)),
  CONSTRAINT cizimler_revizyon_yayin_butun CHECK (
    (durum = 'taslak' AND yayinlayan_id IS NULL AND yayinlandi IS NULL)
    OR (durum <> 'taslak' AND yayinlayan_id IS NOT NULL AND yayinlandi IS NOT NULL)),
  CONSTRAINT cizimler_revizyon_sira_tekil UNIQUE (belge_id, sira),
  CONSTRAINT cizimler_revizyon_dosya_tekil UNIQUE (belge_id, ozet)
);
CREATE UNIQUE INDEX cizimler_revizyon_tek_yayinda ON cizimler_revizyon (belge_id) WHERE durum = 'yayinda';
CREATE INDEX cizimler_revizyon_ozet_idx ON cizimler_revizyon (ozet);
CREATE INDEX cizimler_revizyon_yukleyen_idx ON cizimler_revizyon (yukleyen_id);
CREATE INDEX cizimler_revizyon_yayinlayan_idx ON cizimler_revizyon (yayinlayan_id);

-- Revizyonun dosyası, sırası ve yükleyeni değişmez. Durum taslak ya da eskiden yayına, yayından eskiye geçer; taslağa dönmez.
-- Yalnız taslak silinir: yayınlanmış revizyon izlenebilirlik kaydıdır.
CREATE FUNCTION cizimler_revizyon_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.durum <> 'taslak' THEN
      RAISE EXCEPTION 'Yayınlanmış revizyon silinmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'cizimler_revizyon_silinmez';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.belge_id <> OLD.belge_id OR NEW.sira <> OLD.sira OR NEW.ozet <> OLD.ozet OR NEW.dosya_turu <> OLD.dosya_turu
      OR NEW."not" IS DISTINCT FROM OLD."not" OR NEW.yukleyen_id <> OLD.yukleyen_id OR NEW.yuklendi <> OLD.yuklendi THEN
    RAISE EXCEPTION 'Revizyonun dosyası değişmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'cizimler_revizyon_degismez';
  END IF;
  IF NOT ((OLD.durum = NEW.durum AND NEW.yayinlayan_id IS NOT DISTINCT FROM OLD.yayinlayan_id AND NEW.yayinlandi IS NOT DISTINCT FROM OLD.yayinlandi)
      OR (OLD.durum IN ('taslak', 'eski') AND NEW.durum = 'yayinda')
      OR (OLD.durum = 'yayinda' AND NEW.durum = 'eski' AND NEW.yayinlayan_id = OLD.yayinlayan_id AND NEW.yayinlandi = OLD.yayinlandi)) THEN
    RAISE EXCEPTION 'Revizyon durumu bu yöne geçmez (% -> %)', OLD.durum, NEW.durum
      USING ERRCODE = 'check_violation', CONSTRAINT = 'cizimler_revizyon_durum_sirasi';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cizimler_revizyon_degismez BEFORE UPDATE OR DELETE ON cizimler_revizyon
  FOR EACH ROW EXECUTE FUNCTION cizimler_revizyon_degismez();

-- Belgenin bağlandığı kayıt: sahibi modülün adı ve sayı kimliği (malzemede kart no). Yabancı anahtar bağlamada gelir.
CREATE TABLE cizimler_bag (
  belge_id int NOT NULL REFERENCES cizimler_belge,
  hedef_modul text NOT NULL,
  hedef_id int NOT NULL,
  ekleyen_id int NOT NULL REFERENCES kisi,
  eklendi timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (belge_id, hedef_modul, hedef_id),
  CONSTRAINT cizimler_bag_hedef_modul CHECK (hedef_modul IN ('malzemeler', 'istasyonlar', 'atolye', 'arkon', 'kalibrasyon', 'rota', 'uretim-emirleri')),
  CONSTRAINT cizimler_bag_hedef_id CHECK (hedef_id > 0)
);
CREATE INDEX cizimler_bag_hedef_idx ON cizimler_bag (hedef_modul, hedef_id);
CREATE INDEX cizimler_bag_ekleyen_idx ON cizimler_bag (ekleyen_id);
