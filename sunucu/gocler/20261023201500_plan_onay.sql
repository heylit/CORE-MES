-- Plan onay adımı (hedef 23.10.2026; 146, 147 a, 148 a): canlı plana tek kapı. Taslak (senaryo) onaya gönderilir; onaylayan canlıya alır ya
-- da gerekçeyle geri gönderir. onayda senaryo açık sayılır (kapanma yok) ama sunucu ona plan yazmaz; kapanmış senaryo yalnız canlıya alınan
-- ve vazgeçilendir. Dolu tabloya sütun eklenmez: durum listesi ve kapanış kısıtı genişler, onay ve taslak bedel kayıtları yeni tablolardadır.

ALTER TABLE plan_senaryosu
  DROP CONSTRAINT plan_senaryosu_durum,
  ADD CONSTRAINT plan_senaryosu_durum CHECK (durum IN ('acik', 'onayda', 'canliya_alindi', 'vazgecildi')),
  DROP CONSTRAINT plan_senaryosu_kapanis,
  ADD CONSTRAINT plan_senaryosu_kapanis CHECK ((durum IN ('acik', 'onayda')) = (kapanma IS NULL) AND (kapanma IS NULL) = (kapatan_kisi_id IS NULL));

-- 148 a: bedel ayarı ve sipariş çarpanı da taslağın defterine yazılır.
ALTER TABLE plan_senaryo_degisikligi
  DROP CONSTRAINT plan_senaryo_degisikligi_tur,
  ADD CONSTRAINT plan_senaryo_degisikligi_tur CHECK (tur IN (
    'oner', 'yerlestir', 'tasi', 'kaldir', 'kilitle', 'kilidi_ac', 'sirala', 'dondur', 'dondurmayi_kaldir', 'elle_sira_sil', 'ayar',
    'oncelik', 'teslim', 'acil_emir', 'makine_ariza', 'gun_kapat', 'bedel_ayari', 'siparis_carpani'));

-- Kapanmış senaryo yalnız canlıya alınan ve vazgeçilendir. onayda senaryonun satırları canlıya alma sırasında yazılabilir (sunucu motoru
-- kuyrukları yeniden dizer); onaydayken plan yazmasını servis reddeder.
CREATE OR REPLACE FUNCTION plan_senaryo_kapali_mi(senaryo int) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT durum IN ('canliya_alindi', 'vazgecildi') FROM plan_senaryosu WHERE id = senaryo), false)
$$;

CREATE OR REPLACE FUNCTION plan_senaryosu_korunur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.durum IN ('canliya_alindi', 'vazgecildi') AND (TG_OP = 'DELETE'
      OR to_jsonb(NEW) - 'ad' - 'aciklama' - 'surum' <> to_jsonb(OLD) - 'ad' - 'aciklama' - 'surum') THEN
    RAISE EXCEPTION 'Kapanmış senaryo değişmez (plan_senaryosu %)', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- Onay geçişlerinin kaydı: gönderme, onaydan çekme, geri gönderme (neden zorunlu) ve canlıya alma. Yalnız eklenir; senaryonun son gönderme
-- ve son geri gönderme bilgisi buradan okunur. dort_gozsuz: dört göz kapalıyken gönderen kendi taslağını canlıya aldı.
CREATE TABLE plan_senaryo_onay_kaydi (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT plan_senaryo_onay_kaydi_tekil PRIMARY KEY,
  senaryo_id int NOT NULL CONSTRAINT plan_senaryo_onay_kaydi_senaryo REFERENCES plan_senaryosu (id),
  islem text NOT NULL CONSTRAINT plan_senaryo_onay_kaydi_islem CHECK (islem IN ('onaya_gonder', 'onaydan_cek', 'geri_gonder', 'canliya_al')),
  kisi_id int NOT NULL CONSTRAINT plan_senaryo_onay_kaydi_kisi REFERENCES kisi (id),
  metin text CONSTRAINT plan_senaryo_onay_kaydi_metin CHECK (metin IS NULL OR char_length(metin) BETWEEN 1 AND 500),
  dort_gozsuz boolean NOT NULL DEFAULT false,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_senaryo_onay_kaydi_neden CHECK (islem <> 'geri_gonder' OR metin IS NOT NULL),
  CONSTRAINT plan_senaryo_onay_kaydi_dort_goz CHECK (islem = 'canliya_al' OR NOT dort_gozsuz)
);
CREATE INDEX plan_senaryo_onay_kaydi_senaryo_idx ON plan_senaryo_onay_kaydi (senaryo_id, id);

CREATE TRIGGER plan_senaryo_onay_kaydi_degismez BEFORE UPDATE OR DELETE ON plan_senaryo_onay_kaydi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_senaryo_onay_kaydi_bosaltilmaz BEFORE TRUNCATE ON plan_senaryo_onay_kaydi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- 148 a: bedel ayarı taslağa yazılır. Satır ilk bedel değişikliğinde canlının kopyası olarak açılır; satırı olmayan taslak canlı bedeli
-- kullanır. Canlıya alınınca plan_ayari'ya yazılır. Kısıtlar plan_ayari'nınkilerdir.
CREATE TABLE plan_senaryo_bedel_ayari (
  senaryo_id int CONSTRAINT plan_senaryo_bedel_ayari_tekil PRIMARY KEY CONSTRAINT plan_senaryo_bedel_ayari_senaryo REFERENCES plan_senaryosu (id),
  taban_bedel_saat numeric(10, 2) NOT NULL CONSTRAINT plan_senaryo_bedel_ayari_taban_bedel CHECK (taban_bedel_saat > 0),
  finansman_orani_gun numeric(6, 4) CONSTRAINT plan_senaryo_bedel_ayari_finansman CHECK (finansman_orani_gun BETWEEN 0 AND 5),
  kar_riski_orani_gun numeric(6, 4) NOT NULL CONSTRAINT plan_senaryo_bedel_ayari_kar_riski CHECK (kar_riski_orani_gun BETWEEN 0 AND 5),
  yuksek_esigi numeric(4, 2) NOT NULL CONSTRAINT plan_senaryo_bedel_ayari_yuksek_esigi CHECK (yuksek_esigi > 1),
  dusuk_esigi numeric(4, 2) NOT NULL CONSTRAINT plan_senaryo_bedel_ayari_dusuk_esigi CHECK (dusuk_esigi > 0 AND dusuk_esigi < 1),
  yuksek_carpani numeric(4, 2) NOT NULL CONSTRAINT plan_senaryo_bedel_ayari_yuksek_carpani CHECK (yuksek_carpani > 0 AND yuksek_carpani <= 5),
  normal_carpani numeric(4, 2) NOT NULL CONSTRAINT plan_senaryo_bedel_ayari_normal_carpani CHECK (normal_carpani > 0 AND normal_carpani <= 5),
  dusuk_carpani numeric(4, 2) NOT NULL CONSTRAINT plan_senaryo_bedel_ayari_dusuk_carpani CHECK (dusuk_carpani > 0 AND dusuk_carpani <= 5),
  sinif_a_carpani numeric(4, 2) NOT NULL CONSTRAINT plan_senaryo_bedel_ayari_sinif_a_carpani CHECK (sinif_a_carpani > 0 AND sinif_a_carpani <= 5),
  sinif_b_carpani numeric(4, 2) NOT NULL CONSTRAINT plan_senaryo_bedel_ayari_sinif_b_carpani CHECK (sinif_b_carpani > 0 AND sinif_b_carpani <= 5),
  sinif_c_carpani numeric(4, 2) NOT NULL CONSTRAINT plan_senaryo_bedel_ayari_sinif_c_carpani CHECK (sinif_c_carpani > 0 AND sinif_c_carpani <= 5)
);

-- 148 a: siparişin elle çarpanı taslağa yazılır; taslakta sipariş başına son çarpan geçerlidir. Canlıya alınınca plan_siparis_carpani'ya
-- yazanı ve gerekçesiyle eklenir.
CREATE TABLE plan_senaryo_siparis_carpani (
  senaryo_id int NOT NULL CONSTRAINT plan_senaryo_siparis_carpani_senaryo REFERENCES plan_senaryosu (id),
  siparis_id int NOT NULL CONSTRAINT plan_senaryo_siparis_carpani_siparis REFERENCES siparisler_siparis (id),
  carpan numeric(3, 2) NOT NULL CONSTRAINT plan_senaryo_siparis_carpani_aralik CHECK (carpan BETWEEN 0.5 AND 3),
  gerekce text NOT NULL CONSTRAINT plan_senaryo_siparis_carpani_gerekce CHECK (length(btrim(gerekce)) BETWEEN 1 AND 500),
  kisi_id int NOT NULL CONSTRAINT plan_senaryo_siparis_carpani_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_senaryo_siparis_carpani_tekil PRIMARY KEY (senaryo_id, siparis_id)
);

CREATE TRIGGER plan_senaryo_bedel_ayari_korunur BEFORE INSERT OR UPDATE OR DELETE ON plan_senaryo_bedel_ayari
  FOR EACH ROW EXECUTE FUNCTION plan_senaryo_satiri_korunur();
CREATE TRIGGER plan_senaryo_siparis_carpani_korunur BEFORE INSERT OR UPDATE OR DELETE ON plan_senaryo_siparis_carpani
  FOR EACH ROW EXECUTE FUNCTION plan_senaryo_satiri_korunur();
CREATE TRIGGER plan_senaryo_bedel_ayari_bosaltilmaz BEFORE TRUNCATE ON plan_senaryo_bedel_ayari
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_senaryo_siparis_carpani_bosaltilmaz BEFORE TRUNCATE ON plan_senaryo_siparis_carpani
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
