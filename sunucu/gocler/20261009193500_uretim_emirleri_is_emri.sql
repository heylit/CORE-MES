-- Üretim emri üst kayıt olur, rotanın her adımı bir iş emridir (K1, kart #262). Eski (adımsız) emirler arşive alınır:
-- bu göç veri taşır ve geri alınamaz (onaylı karar "eski emirler"): bütün eski emirler arşive kopyalanır, planlı ve başlamış
-- olanlar iptal edilir (başlama, bitiş, sağlam adet ve istasyon arşivde kalır), bitmiş emirler bitti kalır. Arşiv salt okunur.

CREATE TABLE uretim_emirleri_arsiv (
  emir_id int PRIMARY KEY REFERENCES uretim_emri,
  eski_durum text NOT NULL,
  parca_no text NOT NULL,
  parca_ad text NOT NULL,
  istasyon_id int NOT NULL REFERENCES istasyon,
  baslama timestamptz,
  bitis timestamptz,
  saglam_adet int,
  arsivleme timestamptz NOT NULL DEFAULT now()
);

INSERT INTO uretim_emirleri_arsiv (emir_id, eski_durum, parca_no, parca_ad, istasyon_id, baslama, bitis, saglam_adet)
SELECT id, durum, parca_no, parca_ad, istasyon_id, baslama, bitis, saglam_adet FROM uretim_emri;

DO $$
BEGIN
  IF (SELECT count(*) FROM uretim_emirleri_arsiv) <> (SELECT count(*) FROM uretim_emri) THEN
    RAISE EXCEPTION 'Arşiv kopyası eski emir sayısını tutmuyor; göç durdu, hiçbir şey değişmedi.';
  END IF;
END $$;

CREATE TRIGGER uretim_emirleri_arsiv_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_arsiv
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_arsiv_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_arsiv
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

ALTER TABLE uretim_emri ADD COLUMN arsiv boolean NOT NULL DEFAULT false;
UPDATE uretim_emri SET arsiv = true;
UPDATE uretim_emri SET durum = 'iptal', iptal = now(), baslama = NULL, saglam_adet = NULL WHERE durum IN ('planli', 'basladi');

-- Taslak emir planlanmamış öneridir ("Plana al" serbest yapar, S1); alanları planlı emirle aynıdır.
ALTER TABLE uretim_emri
  DROP CONSTRAINT uretim_emri_durum_degeri,
  ADD CONSTRAINT uretim_emri_durum_degeri CHECK (durum IN ('taslak', 'planli', 'basladi', 'bitti', 'iptal')),
  DROP CONSTRAINT uretim_emri_durum_alanlari,
  ADD CONSTRAINT uretim_emri_durum_alanlari CHECK (
    CASE durum
      WHEN 'taslak' THEN baslama IS NULL AND bitis IS NULL AND iptal IS NULL AND saglam_adet IS NULL
      WHEN 'planli' THEN baslama IS NULL AND bitis IS NULL AND iptal IS NULL AND saglam_adet IS NULL
      WHEN 'basladi' THEN baslama IS NOT NULL AND bitis IS NULL AND iptal IS NULL AND saglam_adet IS NULL
      WHEN 'bitti' THEN baslama IS NOT NULL AND bitis IS NOT NULL AND iptal IS NULL AND saglam_adet IS NOT NULL
      ELSE baslama IS NULL AND bitis IS NULL AND iptal IS NOT NULL AND saglam_adet IS NULL
    END
  ),
  -- Ürün malzeme kartının sayı kimliğidir (sabit kimlik). Kaynak rota revizyonu rotanın kaydıdır; yabancı anahtarı bağlamada gelir.
  ADD COLUMN malzeme_no int CONSTRAINT uretim_emri_malzeme REFERENCES malzeme_katalog_karti (no),
  ADD COLUMN kaynak_rota_revizyonu_id int,
  ADD COLUMN oncelik smallint NOT NULL DEFAULT 3 CONSTRAINT uretim_emri_oncelik_degeri CHECK (oncelik BETWEEN 1 AND 4),
  ADD COLUMN baslangic date,
  ADD COLUMN teslim date,
  ADD COLUMN aciklama text CONSTRAINT uretim_emri_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 300)),
  ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT uretim_emri_surum_pozitif CHECK (surum > 0),
  -- İş emirli emirde istasyon sıradaki iş emrinin kaynağından türer; kaynak atanmamışsa ya da adım fasonsa boştur.
  ALTER COLUMN istasyon_id DROP NOT NULL,
  ADD CONSTRAINT uretim_emri_adimsiz_istasyonlu CHECK (malzeme_no IS NOT NULL OR istasyon_id IS NOT NULL),
  ADD CONSTRAINT uretim_emri_rotali CHECK ((malzeme_no IS NULL) = (kaynak_rota_revizyonu_id IS NULL)),
  ADD CONSTRAINT uretim_emri_teslim_sirasi CHECK (teslim IS NULL OR baslangic IS NULL OR teslim >= baslangic),
  ADD CONSTRAINT uretim_emri_basladi_istasyonlu CHECK (durum <> 'basladi' OR istasyon_id IS NOT NULL),
  ADD CONSTRAINT uretim_emri_arsiv_adimsiz CHECK (NOT arsiv OR malzeme_no IS NULL);
CREATE INDEX uretim_emri_malzeme_idx ON uretim_emri (malzeme_no);

-- İş emri: rota adımının emre kopyası. Kaynak bir makine, bir kişi ya da fason firmadır (K3, fason rota adımıdır); boşsa atanmamıştır.
-- İstasyon kaynaktan türer (makinenin istasyonu, kişinin ağırlıklı istasyonu); terminal o istasyonda görür.
CREATE TABLE uretim_emirleri_is_emri (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL REFERENCES uretim_emri,
  sira int NOT NULL CONSTRAINT uretim_emirleri_is_emri_sira_pozitif CHECK (sira > 0),
  op_no int NOT NULL CONSTRAINT uretim_emirleri_is_emri_op_pozitif CHECK (op_no > 0),
  operasyon_tipi_id int NOT NULL REFERENCES istasyonlar_operasyon_tipi,
  ad text NOT NULL CONSTRAINT uretim_emirleri_is_emri_ad_bicimi CHECK (btrim(ad) <> '' AND char_length(ad) <= 80),
  makine_id int REFERENCES makine,
  kisi_id int REFERENCES kisi,
  fason_firma_id int REFERENCES finans_firma (id),
  istasyon_id int REFERENCES istasyon,
  ayar_suresi_dk numeric(8, 2) CONSTRAINT uretim_emirleri_is_emri_ayar_suresi CHECK (ayar_suresi_dk >= 0),
  birim_sure_dk numeric(10, 4) CONSTRAINT uretim_emirleri_is_emri_birim_sure CHECK (birim_sure_dk > 0),
  termin_gun int CONSTRAINT uretim_emirleri_is_emri_termin_gun CHECK (termin_gun BETWEEN 1 AND 365),
  bagimlilik text NOT NULL DEFAULT 'bekleyen' CONSTRAINT uretim_emirleri_is_emri_bagimlilik CHECK (bagimlilik IN ('bagimsiz', 'bekleyen', 'akisli')),
  devir_adedi int,
  fire_payi_yuzde numeric(5, 2) NOT NULL DEFAULT 0 CONSTRAINT uretim_emirleri_is_emri_fire_payi CHECK (fire_payi_yuzde >= 0 AND fire_payi_yuzde <= 95),
  makine_kullanimi text NOT NULL DEFAULT 'tek' CONSTRAINT uretim_emirleri_is_emri_makine_kullanimi CHECK (makine_kullanimi IN ('tek', 'paralel')),
  en_kucuk_parca int,
  yeniden_ayar boolean NOT NULL DEFAULT true,
  -- Emir açılırken sabitlenen talimat sürümü; sonraki talimat sürümü bu iş emrini değiştirmez.
  talimat_surumu int CONSTRAINT uretim_emirleri_is_emri_talimat_surumu CHECK (talimat_surumu > 0),
  durum text NOT NULL DEFAULT 'bekliyor' CONSTRAINT uretim_emirleri_is_emri_durum CHECK (durum IN ('bekliyor', 'calisiyor', 'tamam')),
  baslama timestamptz,
  bitis timestamptz,
  saglam_adet int CONSTRAINT uretim_emirleri_is_emri_saglam CHECK (saglam_adet >= 0),
  surum int NOT NULL DEFAULT 1 CONSTRAINT uretim_emirleri_is_emri_surum_pozitif CHECK (surum > 0),
  CONSTRAINT uretim_emirleri_is_emri_op_tekil UNIQUE (uretim_emri_id, op_no),
  CONSTRAINT uretim_emirleri_is_emri_sira_tekil UNIQUE (uretim_emri_id, sira) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT uretim_emirleri_is_emri_tek_kaynak CHECK (num_nonnulls(makine_id, kisi_id, fason_firma_id) <= 1),
  CONSTRAINT uretim_emirleri_is_emri_termin_fasonda CHECK (termin_gun IS NULL OR fason_firma_id IS NOT NULL),
  CONSTRAINT uretim_emirleri_is_emri_fason_suresiz CHECK (fason_firma_id IS NULL OR (ayar_suresi_dk IS NULL AND birim_sure_dk IS NULL)),
  CONSTRAINT uretim_emirleri_is_emri_fason_istasyonsuz CHECK (fason_firma_id IS NULL OR istasyon_id IS NULL),
  CONSTRAINT uretim_emirleri_is_emri_devir_tutarli CHECK ((bagimlilik = 'akisli') = (devir_adedi IS NOT NULL) AND (devir_adedi IS NULL OR devir_adedi > 0)),
  CONSTRAINT uretim_emirleri_is_emri_parca_tutarli CHECK ((makine_kullanimi = 'paralel' OR en_kucuk_parca IS NULL) AND (en_kucuk_parca IS NULL OR en_kucuk_parca > 0)),
  CONSTRAINT uretim_emirleri_is_emri_durum_alanlari CHECK (CASE durum
    WHEN 'bekliyor' THEN baslama IS NULL AND bitis IS NULL AND saglam_adet IS NULL
    WHEN 'calisiyor' THEN baslama IS NOT NULL AND bitis IS NULL AND saglam_adet IS NULL
    ELSE baslama IS NOT NULL AND bitis IS NOT NULL AND saglam_adet IS NOT NULL END)
);
CREATE INDEX uretim_emirleri_is_emri_emir_idx ON uretim_emirleri_is_emri (uretim_emri_id, sira);
CREATE INDEX uretim_emirleri_is_emri_istasyon_idx ON uretim_emirleri_is_emri (istasyon_id) WHERE durum <> 'tamam';

-- Aday kaynak: işi yapabilecek öteki makine ya da kişi (planın seçenekleri); boş süre iş emrinin süresini alır.
CREATE TABLE uretim_emirleri_is_emri_adayi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri ON DELETE CASCADE,
  makine_id int REFERENCES makine,
  kisi_id int REFERENCES kisi,
  ayar_suresi_dk numeric(8, 2) CONSTRAINT uretim_emirleri_is_emri_adayi_ayar CHECK (ayar_suresi_dk >= 0),
  birim_sure_dk numeric(10, 4) CONSTRAINT uretim_emirleri_is_emri_adayi_birim CHECK (birim_sure_dk > 0),
  CONSTRAINT uretim_emirleri_is_emri_adayi_tek_kaynak CHECK ((makine_id IS NULL) <> (kisi_id IS NULL)),
  CONSTRAINT uretim_emirleri_is_emri_adayi_makine_tekil UNIQUE (is_emri_id, makine_id),
  CONSTRAINT uretim_emirleri_is_emri_adayi_kisi_tekil UNIQUE (is_emri_id, kisi_id)
);

-- Malzeme ihtiyacı: bir adet ürün için, tükendiği iş emrinde (rota bileşeninin kopyası).
CREATE TABLE uretim_emirleri_is_emri_bileseni (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri ON DELETE CASCADE,
  malzeme_no int NOT NULL REFERENCES malzeme_katalog_karti (no),
  miktar numeric(14, 4) NOT NULL CONSTRAINT uretim_emirleri_is_emri_bileseni_miktar CHECK (miktar > 0),
  fire_yuzde numeric(5, 2) NOT NULL DEFAULT 0 CONSTRAINT uretim_emirleri_is_emri_bileseni_fire CHECK (fire_yuzde >= 0 AND fire_yuzde <= 100),
  CONSTRAINT uretim_emirleri_is_emri_bileseni_tekil UNIQUE (is_emri_id, malzeme_no)
);

-- Fason iş emrinin gidiş ve dönüşleri (kullanıcı kararı c): her gidiş ve dönüş ayrı satırdır (kısmi gönderim, birden çok
-- parti). Gidişte adet gönderilen, dönüşte sağlam ve hurda dönen adettir. Yalnız eklenir; stok hareketi bu satırın kimliğine bağlanır.
CREATE TABLE uretim_emirleri_fason_hareketi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri,
  yon text NOT NULL CONSTRAINT uretim_emirleri_fason_hareketi_yon CHECK (yon IN ('gidis', 'donus')),
  adet int NOT NULL CONSTRAINT uretim_emirleri_fason_hareketi_adet CHECK (adet >= 0),
  hurda_adet int CONSTRAINT uretim_emirleri_fason_hareketi_hurda CHECK (hurda_adet >= 0),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uretim_emirleri_fason_hareketi_hurda_donuste CHECK ((yon = 'donus') = (hurda_adet IS NOT NULL)),
  CONSTRAINT uretim_emirleri_fason_hareketi_bos_degil CHECK (adet + COALESCE(hurda_adet, 0) > 0)
);
CREATE INDEX uretim_emirleri_fason_hareketi_is_emri_idx ON uretim_emirleri_fason_hareketi (is_emri_id, id);
CREATE TRIGGER uretim_emirleri_fason_hareketi_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_fason_hareketi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_fason_hareketi_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_fason_hareketi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Defterler hangi iş emrine yazıldığını taşır (iş emirsiz emirde boş): sayaç ve çalışma hâli iş emri başına türer.
ALTER TABLE uretim_kaydi ADD COLUMN is_emri_id int REFERENCES uretim_emirleri_is_emri;
ALTER TABLE uretim_sayimi ADD COLUMN is_emri_id int REFERENCES uretim_emirleri_is_emri;
ALTER TABLE uretim_olayi ADD COLUMN is_emri_id int REFERENCES uretim_emirleri_is_emri;

-- Talimat kontrol listesi iş emrinindir (UE1): talimatın emir anındaki metni o iş emrinin maddeleri olur.
-- İş emirsiz emirde liste emrindir (is_emri_id boş). Sıra her listede (emir, iş emri) tekildir.
ALTER TABLE emir_adimi
  ADD COLUMN is_emri_id int REFERENCES uretim_emirleri_is_emri,
  DROP CONSTRAINT emir_adimi_sira_benzersiz,
  ADD CONSTRAINT emir_adimi_sira_benzersiz UNIQUE NULLS NOT DISTINCT (emir_id, is_emri_id, sira);
