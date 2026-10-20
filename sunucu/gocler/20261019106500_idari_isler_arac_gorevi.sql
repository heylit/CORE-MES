-- İdari İşler 5: araç görev talebi (247 a). Yeni, boş tablo. Her çalışan kendi adına açar; idari işler araç verip onaylar ya da
-- reddeder, çıkış ve dönüş km'sini yazar. Araç kartının km'si ve durumu görevle birlikte güncellenir.

CREATE TABLE idari_isler_arac_gorevi (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT idari_isler_arac_gorevi_pk PRIMARY KEY,
  talep_eden_kisi_id int NOT NULL CONSTRAINT idari_isler_arac_gorevi_talep_eden REFERENCES kisi (id),
  amac text NOT NULL CONSTRAINT idari_isler_arac_gorevi_amac CHECK (btrim(amac) <> '' AND length(amac) <= 200),
  varis text NOT NULL CONSTRAINT idari_isler_arac_gorevi_varis CHECK (btrim(varis) <> '' AND length(varis) <= 120),
  tarih date NOT NULL,
  donus_tarihi date NOT NULL,
  aciklama text CONSTRAINT idari_isler_arac_gorevi_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 500)),
  durum text NOT NULL DEFAULT 'bekliyor'
    CONSTRAINT idari_isler_arac_gorevi_durum CHECK (durum IN ('bekliyor', 'onaylandi', 'yolda', 'tamamlandi', 'reddedildi', 'geri_cekildi')),
  talep timestamptz NOT NULL DEFAULT now(),
  arac_id int CONSTRAINT idari_isler_arac_gorevi_arac REFERENCES idari_isler_arac (id),
  onaylayan_kisi_id int CONSTRAINT idari_isler_arac_gorevi_onaylayan REFERENCES kisi (id),
  onay timestamptz,
  red_nedeni text CONSTRAINT idari_isler_arac_gorevi_red_nedeni CHECK (red_nedeni IS NULL OR (btrim(red_nedeni) <> '' AND length(red_nedeni) <= 500)),
  cikis_km int CONSTRAINT idari_isler_arac_gorevi_cikis_km CHECK (cikis_km BETWEEN 0 AND 9999999),
  cikis timestamptz,
  donus_km int CONSTRAINT idari_isler_arac_gorevi_donus_km CHECK (donus_km BETWEEN 0 AND 9999999),
  donus timestamptz,
  kapatan_kisi_id int CONSTRAINT idari_isler_arac_gorevi_kapatan REFERENCES kisi (id),
  kapanma timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT idari_isler_arac_gorevi_surum CHECK (surum > 0),
  CONSTRAINT idari_isler_arac_gorevi_donus_tarihi CHECK (donus_tarihi >= tarih),
  -- IDR-23: onaylı, yoldaki ve biten görevin aracı ve onayı vardır; yoldaki ve biten görevin çıkış km'si, bitenin dönüş km'si vardır;
  -- reddin nedeni vardır; dönüş km'si çıkıştan küçük değildir.
  CONSTRAINT idari_isler_arac_gorevi_onay_butun CHECK (
    durum NOT IN ('onaylandi', 'yolda', 'tamamlandi') OR (arac_id IS NOT NULL AND onaylayan_kisi_id IS NOT NULL AND onay IS NOT NULL)
  ),
  CONSTRAINT idari_isler_arac_gorevi_cikis_butun CHECK (durum NOT IN ('yolda', 'tamamlandi') OR (cikis_km IS NOT NULL AND cikis IS NOT NULL)),
  CONSTRAINT idari_isler_arac_gorevi_donus_butun CHECK (durum <> 'tamamlandi' OR (donus_km IS NOT NULL AND donus IS NOT NULL)),
  CONSTRAINT idari_isler_arac_gorevi_km_sirasi CHECK (donus_km IS NULL OR cikis_km IS NULL OR donus_km >= cikis_km),
  CONSTRAINT idari_isler_arac_gorevi_red_butun CHECK (durum <> 'reddedildi' OR red_nedeni IS NOT NULL),
  CONSTRAINT idari_isler_arac_gorevi_kapanis_butun CHECK (
    (durum IN ('tamamlandi', 'reddedildi', 'geri_cekildi')) = (kapatan_kisi_id IS NOT NULL AND kapanma IS NOT NULL)
  )
);
-- Liste ve Taleplerim: açıklar ve kişinin talepleri en yeniden.
CREATE INDEX idari_isler_arac_gorevi_durum ON idari_isler_arac_gorevi (durum, tarih);
CREATE INDEX idari_isler_arac_gorevi_talep_eden ON idari_isler_arac_gorevi (talep_eden_kisi_id, id DESC);
-- Çakışma denetimi: aracın onaylı ve yoldaki görevleri.
CREATE INDEX idari_isler_arac_gorevi_arac ON idari_isler_arac_gorevi (arac_id, tarih) WHERE durum IN ('onaylandi', 'yolda');
