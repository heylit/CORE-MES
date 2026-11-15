-- 3269 a, 3269-1 b: proje görev şablonu, role ya da kişiye atama, kontrol eden ve görev olay defteri. Yalnız ekleme: var olan
-- görev satırına değer yazılmaz; yeni sütunlar boş olabilir, durum listesi "kontrolde" ile genişler (Risk 3269 K5).

CREATE TABLE projeler_gorev_sablonu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT projeler_gorev_sablonu_ad_bicim CHECK (btrim(ad) = ad AND length(ad) BETWEEN 1 AND 120),
  varsayilan boolean NOT NULL DEFAULT false,
  etkin boolean NOT NULL DEFAULT true,
  olusturan_id int NOT NULL CONSTRAINT projeler_gorev_sablonu_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int CONSTRAINT projeler_gorev_sablonu_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT projeler_gorev_sablonu_surum_pozitif CHECK (surum >= 1),
  CONSTRAINT projeler_gorev_sablonu_varsayilan_etkin CHECK (NOT varsayilan OR etkin)
);
CREATE UNIQUE INDEX projeler_gorev_sablonu_ad_tekil ON projeler_gorev_sablonu (lower(ad));
-- Proje açılışında kendiliğinden uygulanan şablon en çok birdir.
CREATE UNIQUE INDEX projeler_gorev_sablonu_tek_varsayilan ON projeler_gorev_sablonu ((true)) WHERE varsayilan;

-- Şablon kalemi. Başlangıç proje başından ileri ya da terminden geri gün sayısıdır. Yapan ve kontrol eden rol ya da kişidir,
-- ikisi birden değil. Hazırlık maddesine bağlı kalem (3269-B) üretim emri açılınca emir başına görev doğurur; bu göçte yalnız saklanır.
-- Kalemler şablon kaydedilince yeniden yazılır: projeye uygulanan hâl projeler_proje_sablonu'nda donar, açık projeler değişmez.
CREATE TABLE projeler_gorev_sablon_kalemi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sablon_id int NOT NULL CONSTRAINT projeler_gorev_sablon_kalemi_sablon REFERENCES projeler_gorev_sablonu (id),
  sira int NOT NULL CONSTRAINT projeler_gorev_sablon_kalemi_sira CHECK (sira BETWEEN 0 AND 10000),
  ad text NOT NULL CONSTRAINT projeler_gorev_sablon_kalemi_ad_bicim CHECK (btrim(ad) = ad AND length(ad) BETWEEN 1 AND 200),
  aciklama text CONSTRAINT projeler_gorev_sablon_kalemi_aciklama_bicim CHECK (btrim(aciklama) = aciklama AND length(aciklama) BETWEEN 1 AND 1000),
  asama text CONSTRAINT projeler_gorev_sablon_kalemi_asama_bicim CHECK (btrim(asama) = asama AND length(asama) BETWEEN 1 AND 80),
  dayanak text NOT NULL CONSTRAINT projeler_gorev_sablon_kalemi_dayanak CHECK (dayanak IN ('baslangic', 'termin')),
  gun int NOT NULL CONSTRAINT projeler_gorev_sablon_kalemi_gun CHECK (gun BETWEEN -365 AND 365),
  sure_gun int NOT NULL CONSTRAINT projeler_gorev_sablon_kalemi_sure CHECK (sure_gun BETWEEN 1 AND 365),
  yapan_rol_id int CONSTRAINT projeler_gorev_sablon_kalemi_yapan_rol REFERENCES rol (id),
  yapan_kisi_id int CONSTRAINT projeler_gorev_sablon_kalemi_yapan_kisi REFERENCES kisi (id),
  kontrol_rol_id int CONSTRAINT projeler_gorev_sablon_kalemi_kontrol_rol REFERENCES rol (id),
  kontrol_kisi_id int CONSTRAINT projeler_gorev_sablon_kalemi_kontrol_kisi REFERENCES kisi (id),
  yedek_kontrol_rol_id int CONSTRAINT projeler_gorev_sablon_kalemi_yedek_rol REFERENCES rol (id),
  yedek_kontrol_kisi_id int CONSTRAINT projeler_gorev_sablon_kalemi_yedek_kisi REFERENCES kisi (id),
  onceki_kalem_id int,
  hazirlik_maddesi text CONSTRAINT projeler_gorev_sablon_kalemi_madde_bicim CHECK (hazirlik_maddesi ~ '^[a-z][a-z-]{0,39}$'),
  kontrol_kosulu text NOT NULL DEFAULT 'her-zaman' CONSTRAINT projeler_gorev_sablon_kalemi_kosul CHECK (kontrol_kosulu IN ('her-zaman', 'yeni-revize')),
  CONSTRAINT projeler_gorev_sablon_kalemi_cift UNIQUE (id, sablon_id),
  CONSTRAINT projeler_gorev_sablon_kalemi_onceki FOREIGN KEY (onceki_kalem_id, sablon_id) REFERENCES projeler_gorev_sablon_kalemi (id, sablon_id),
  CONSTRAINT projeler_gorev_sablon_kalemi_onceki_kendisi_degil CHECK (onceki_kalem_id IS NULL OR onceki_kalem_id <> id),
  CONSTRAINT projeler_gorev_sablon_kalemi_tek_yapan CHECK (yapan_rol_id IS NULL OR yapan_kisi_id IS NULL),
  CONSTRAINT projeler_gorev_sablon_kalemi_tek_kontrol CHECK (kontrol_rol_id IS NULL OR kontrol_kisi_id IS NULL),
  CONSTRAINT projeler_gorev_sablon_kalemi_tek_yedek CHECK (yedek_kontrol_rol_id IS NULL OR yedek_kontrol_kisi_id IS NULL),
  CONSTRAINT projeler_gorev_sablon_kalemi_yedek_kontrollu CHECK (
    (yedek_kontrol_rol_id IS NULL AND yedek_kontrol_kisi_id IS NULL) OR kontrol_rol_id IS NOT NULL OR kontrol_kisi_id IS NOT NULL)
);
CREATE INDEX projeler_gorev_sablon_kalemi_sablon_idx ON projeler_gorev_sablon_kalemi (sablon_id, sira, id);

-- Görev: yapan rol (kişi bugünkü sorumlu_kisi_id sütunudur), kontrol eden ve yedeği, aşama adı.
ALTER TABLE projeler_gorev
  ADD COLUMN asama text CONSTRAINT projeler_gorev_asama_bicim CHECK (btrim(asama) = asama AND length(asama) BETWEEN 1 AND 80),
  ADD COLUMN yapan_rol_id int CONSTRAINT projeler_gorev_yapan_rol REFERENCES rol (id),
  ADD COLUMN kontrol_rol_id int CONSTRAINT projeler_gorev_kontrol_rol REFERENCES rol (id),
  ADD COLUMN kontrol_kisi_id int CONSTRAINT projeler_gorev_kontrol_kisi REFERENCES kisi (id),
  ADD COLUMN yedek_kontrol_rol_id int CONSTRAINT projeler_gorev_yedek_rol REFERENCES rol (id),
  ADD COLUMN yedek_kontrol_kisi_id int CONSTRAINT projeler_gorev_yedek_kisi REFERENCES kisi (id),
  -- Kontrolden geçti: kontrollü görevin "bitti" hâli onaylandı demektir; kontrolsüz görevde hep false.
  ADD COLUMN onaylandi boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT projeler_gorev_tek_yapan CHECK (yapan_rol_id IS NULL OR sorumlu_kisi_id IS NULL),
  ADD CONSTRAINT projeler_gorev_tek_kontrol CHECK (kontrol_rol_id IS NULL OR kontrol_kisi_id IS NULL),
  ADD CONSTRAINT projeler_gorev_tek_yedek CHECK (yedek_kontrol_rol_id IS NULL OR yedek_kontrol_kisi_id IS NULL),
  ADD CONSTRAINT projeler_gorev_yedek_kontrollu CHECK (
    (yedek_kontrol_rol_id IS NULL AND yedek_kontrol_kisi_id IS NULL) OR kontrol_rol_id IS NOT NULL OR kontrol_kisi_id IS NOT NULL),
  ADD CONSTRAINT projeler_gorev_kontrolde_kontrollu CHECK (durum <> 'kontrolde' OR kontrol_rol_id IS NOT NULL OR kontrol_kisi_id IS NOT NULL),
  ADD CONSTRAINT projeler_gorev_onay_bitmis CHECK (NOT onaylandi OR durum = 'bitti');

ALTER TABLE projeler_gorev DROP CONSTRAINT projeler_gorev_durum;
ALTER TABLE projeler_gorev ADD CONSTRAINT projeler_gorev_durum
  CHECK (durum IN ('yapilacak', 'suruyor', 'bekliyor', 'kontrolde', 'bitti', 'iptal'));

-- Görev olayları yalnız eklenir: üstlenme, başlama, bitirme, kontrole gönderme, onay ve gerekçeli geri gönderme. "Yapan ile kontrol
-- eden aynı kişi olamaz" kuralı son "bitti" olayının kişisine göre denetlenir (Risk 3269 K1).
CREATE TABLE projeler_gorev_olayi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gorev_id int NOT NULL CONSTRAINT projeler_gorev_olayi_gorev REFERENCES projeler_gorev (id),
  olay text NOT NULL CONSTRAINT projeler_gorev_olayi_olay CHECK (olay IN ('ustlen', 'basla', 'bitti', 'onay', 'geri')),
  kisi_id int NOT NULL CONSTRAINT projeler_gorev_olayi_kisi REFERENCES kisi (id),
  gerekce text CONSTRAINT projeler_gorev_olayi_gerekce_bicim CHECK (btrim(gerekce) = gerekce AND length(gerekce) BETWEEN 1 AND 500),
  an timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projeler_gorev_olayi_geri_gerekceli CHECK (olay <> 'geri' OR gerekce IS NOT NULL)
);
CREATE INDEX projeler_gorev_olayi_gorev_idx ON projeler_gorev_olayi (gorev_id, id);
CREATE TRIGGER projeler_gorev_olayi_degismez BEFORE UPDATE OR DELETE ON projeler_gorev_olayi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER projeler_gorev_olayi_bosaltilmaz BEFORE TRUNCATE ON projeler_gorev_olayi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Görevlerim okuması: kişiye, role ve kontrol edene göre açık görevler.
CREATE INDEX projeler_gorev_yapan_kisi_idx ON projeler_gorev (sorumlu_kisi_id) WHERE durum NOT IN ('bitti', 'iptal');
CREATE INDEX projeler_gorev_yapan_rol_idx ON projeler_gorev (yapan_rol_id) WHERE durum NOT IN ('bitti', 'iptal');
CREATE INDEX projeler_gorev_kontrolde_idx ON projeler_gorev (kontrol_kisi_id, kontrol_rol_id) WHERE durum = 'kontrolde';

-- Projeye uygulanan şablon, uygulandığı andaki kalemleriyle (yalnız eklenir). Hazırlık görevleri (3269-B) emir açılınca buradan doğar.
CREATE TABLE projeler_proje_sablonu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proje_id int NOT NULL CONSTRAINT projeler_proje_sablonu_proje REFERENCES projeler_proje (id),
  sablon_id int NOT NULL CONSTRAINT projeler_proje_sablonu_sablon REFERENCES projeler_gorev_sablonu (id),
  sablon_surum int NOT NULL CONSTRAINT projeler_proje_sablonu_surum CHECK (sablon_surum >= 1),
  kalemler jsonb NOT NULL CONSTRAINT projeler_proje_sablonu_kalemler CHECK (jsonb_typeof(kalemler) = 'array'),
  kisi_id int NOT NULL CONSTRAINT projeler_proje_sablonu_kisi REFERENCES kisi (id),
  an timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projeler_proje_sablonu_proje_idx ON projeler_proje_sablonu (proje_id, id);
CREATE TRIGGER projeler_proje_sablonu_degismez BEFORE UPDATE OR DELETE ON projeler_proje_sablonu
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER projeler_proje_sablonu_bosaltilmaz BEFORE TRUNCATE ON projeler_proje_sablonu
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
