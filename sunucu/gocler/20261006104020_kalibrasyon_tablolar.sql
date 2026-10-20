-- Ölçü aletleri, alet türleri ve kalibrasyon defteri. Son kalibrasyon ve vade saklanmaz: kayıtlardan türetilir.
CREATE TABLE olcu_aleti_turu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT olcu_aleti_turu_ad_dolu CHECK (btrim(ad) <> ''),
  aktif boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX olcu_aleti_turu_ad_tek ON olcu_aleti_turu (lower(ad));

INSERT INTO olcu_aleti_turu (ad) VALUES
  ('Mikrometre'), ('Kumpas'), ('Komparatör'), ('Tampon mastar'), ('Halka mastar'), ('Diş mastarı'),
  ('Radyus mastarı'), ('Yükseklik mihengiri'), ('İç çap mikrometresi'), ('CMM'), ('Tork anahtarı'),
  ('Kaplama kalınlık ölçer');

-- Kullanım dışı ile nedeni birlikte yazılır: neden olmadan kullanım dışı, kullanım dışı olmadan neden olmaz.
CREATE TABLE olcu_aleti (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text NOT NULL CONSTRAINT olcu_aleti_no_bicim CHECK (no = upper(btrim(no)) AND no <> ''),
  tur_id int NOT NULL REFERENCES olcu_aleti_turu,
  ad text,
  olcme_araligi text,
  yer text,
  periyot_gun int NOT NULL DEFAULT 365 CONSTRAINT olcu_aleti_periyot_pozitif CHECK (periyot_gun > 0),
  kullanim_disi boolean NOT NULL DEFAULT false,
  kullanim_disi_nedeni text,
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT olcu_aleti_no_tek UNIQUE (no),
  CONSTRAINT olcu_aleti_neden_butun CHECK (
    kullanim_disi = (kullanim_disi_nedeni IS NOT NULL) AND (kullanim_disi_nedeni IS NULL OR btrim(kullanim_disi_nedeni) <> '')
  )
);
CREATE INDEX olcu_aleti_tur ON olcu_aleti (tur_id);

-- Kayıtlı alet silinemez (RESTRICT); defter yalnız ekleme alır.
CREATE TABLE kalibrasyon_kaydi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alet_id int NOT NULL REFERENCES olcu_aleti ON DELETE RESTRICT,
  tarih date NOT NULL,
  kisi_id int NOT NULL REFERENCES kisi,
  sonuc text NOT NULL CONSTRAINT kalibrasyon_kaydi_sonuc CHECK (sonuc IN ('uygun', 'uygunsuz')),
  sertifika_no text,
  aciklama text,
  olusturuldu timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kalibrasyon_kaydi_alet ON kalibrasyon_kaydi (alet_id, tarih DESC, id DESC);

CREATE TRIGGER kalibrasyon_kaydi_degismez BEFORE UPDATE OR DELETE ON kalibrasyon_kaydi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalibrasyon_kaydi_bosaltilmaz BEFORE TRUNCATE ON kalibrasyon_kaydi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
