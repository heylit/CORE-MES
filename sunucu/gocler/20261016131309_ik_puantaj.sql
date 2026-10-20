-- Puantaj (kart #1571): personelin günlük giriş ve çıkış saati; kişi sayfası ve toplu puantaj matrisi aynı satırı okur ve yazar.
-- Yeni boş tablo; var olan tabloya dokunulmaz. Günde tek satır (ilk giriş, son çıkış). Çıkış girişten önceyse çalışma ertesi güne uzanır.
CREATE TABLE ik_puantaj (
  no int GENERATED ALWAYS AS IDENTITY CONSTRAINT ik_puantaj_pk PRIMARY KEY,
  personel_no int NOT NULL CONSTRAINT ik_puantaj_personel_fk REFERENCES ik_personel (no),
  tarih date NOT NULL,
  durum text NOT NULL CONSTRAINT ik_puantaj_durum_secenek
    CHECK (durum IN ('calisti', 'izinli', 'raporlu', 'devamsiz', 'hafta_tatili', 'resmi_tatil')),
  giris time,
  cikis time,
  aciklama text CONSTRAINT ik_puantaj_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 300)),
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_puantaj_surum_pozitif CHECK (surum > 0),
  yazan_kisi_id int NOT NULL CONSTRAINT ik_puantaj_yazan_fk REFERENCES kisi (id),
  yazildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_puantaj_gunde_tek UNIQUE (personel_no, tarih),
  CONSTRAINT ik_puantaj_saat_dakika CHECK (date_trunc('minute', giris) = giris AND date_trunc('minute', cikis) = cikis),
  -- Çalışılan günde giriş saati vardır; öteki durumlarda saat yazılmaz.
  CONSTRAINT ik_puantaj_calisti_girisli CHECK (durum <> 'calisti' OR giris IS NOT NULL),
  CONSTRAINT ik_puantaj_saatsiz_durum CHECK (durum = 'calisti' OR (giris IS NULL AND cikis IS NULL)),
  CONSTRAINT ik_puantaj_sure_var CHECK (cikis IS NULL OR cikis <> giris)
);
CREATE INDEX ik_puantaj_tarih_idx ON ik_puantaj (tarih, no);
