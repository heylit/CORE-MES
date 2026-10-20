-- Ekip (havuz) kaynaktır; kapasitesi yalnız üyelerinin toplamıdır, kendi mesaisi yoktur. Bir istasyona bağlanabilir (boş olabilir, IK5).
-- Ekip silinmez, pasife alınır; pasif ekip kapasite saymaz (IK7). Ekran düzenler: iki kişi aynı anda yazarsa sürüm ayırır.
CREATE TABLE ekip (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL UNIQUE CONSTRAINT ekip_kod_bicimi CHECK (kod ~ '^[A-Z0-9][A-Z0-9._-]{0,23}$'),
  ad text NOT NULL CONSTRAINT ekip_ad_dolu CHECK (btrim(ad) <> ''),
  istasyon_id int REFERENCES istasyon,
  aktif boolean NOT NULL DEFAULT true,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ekip_surum_pozitif CHECK (surum > 0)
);
CREATE INDEX ekip_istasyon_idx ON ekip (istasyon_id);

-- Üyelik de yüzdeli atamadır ve kişinin toplamına girer (IK6); biçimi istasyon_kisi ile aynıdır.
-- Kişinin aynı anda tek ekipte olması satırlar arası kuraldır; servis kişi kilidinde tutar. Üyelik iş merkezi kısıtını değiştirmez.
CREATE TABLE ekip_uye (
  ekip_id int NOT NULL REFERENCES ekip,
  kisi_id int NOT NULL REFERENCES kisi,
  baslangic date NOT NULL,
  yuzde numeric(5,2) CONSTRAINT ekip_uye_yuzde_araligi CHECK (yuzde > 0 AND yuzde <= 100),
  PRIMARY KEY (ekip_id, kisi_id, baslangic)
);
CREATE INDEX ekip_uye_kisi_idx ON ekip_uye (kisi_id);
