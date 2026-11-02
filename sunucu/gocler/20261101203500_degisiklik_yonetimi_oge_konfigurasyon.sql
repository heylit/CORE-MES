-- Değişiklik emrinin etkilenen öğeleri ve parça başına konfigürasyon (baseline) (1642; kararlar 1607 a, 1608 a).
-- Öğe türden bağımsızdır: revizyonu sahibi modül tutar, burada yalnız kimliğiyle durur (yabancı anahtar yok; sahip modüller ayrı).
-- Yeni ve boş tablolar; dolu tabloya yalnız boş olabilen sütun eklenir. Kalemdeki eski çizim ve rota sütunlarındaki değerler öğe
-- satırına kopyalanır; sütunlar silinmez (silmek onaylı ayrı göç).

CREATE TABLE degisiklik_yonetimi_emir_ogesi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kalem_id int NOT NULL REFERENCES degisiklik_yonetimi_emir_kalemi,
  tur text NOT NULL CONSTRAINT degisiklik_yonetimi_emir_ogesi_tur_degeri CHECK (
    tur IN ('cizim', 'model-3b', 'rota', 'islem-sartnamesi', 'kontrol-plani', 'nc-programi', 'markalama-tanimi')
  ),
  -- Eski boşsa öğe konfigürasyona eklenir; yeni boşsa konfigürasyondan çıkar; ikisi birden boş olamaz.
  eski_revizyon_id int CONSTRAINT degisiklik_yonetimi_emir_ogesi_eski_pozitif CHECK (eski_revizyon_id > 0),
  yeni_revizyon_id int CONSTRAINT degisiklik_yonetimi_emir_ogesi_yeni_pozitif CHECK (yeni_revizyon_id > 0),
  CONSTRAINT degisiklik_yonetimi_emir_ogesi_dolu CHECK (eski_revizyon_id IS NOT NULL OR yeni_revizyon_id IS NOT NULL),
  CONSTRAINT degisiklik_yonetimi_emir_ogesi_degisir CHECK (eski_revizyon_id IS DISTINCT FROM yeni_revizyon_id)
);
CREATE UNIQUE INDEX degisiklik_yonetimi_emir_ogesi_eski_tek ON degisiklik_yonetimi_emir_ogesi (kalem_id, tur, eski_revizyon_id)
  WHERE eski_revizyon_id IS NOT NULL;
CREATE UNIQUE INDEX degisiklik_yonetimi_emir_ogesi_yeni_tek ON degisiklik_yonetimi_emir_ogesi (kalem_id, tur, yeni_revizyon_id)
  WHERE yeni_revizyon_id IS NOT NULL;

INSERT INTO degisiklik_yonetimi_emir_ogesi (kalem_id, tur, eski_revizyon_id, yeni_revizyon_id)
  SELECT id, 'cizim', eski_cizim_revizyonu_id, yeni_cizim_revizyonu_id FROM degisiklik_yonetimi_emir_kalemi
   WHERE (eski_cizim_revizyonu_id IS NOT NULL OR yeni_cizim_revizyonu_id IS NOT NULL)
     AND eski_cizim_revizyonu_id IS DISTINCT FROM yeni_cizim_revizyonu_id
  UNION ALL
  SELECT id, 'rota', eski_rota_revizyonu_id, yeni_rota_revizyonu_id FROM degisiklik_yonetimi_emir_kalemi
   WHERE (eski_rota_revizyonu_id IS NOT NULL OR yeni_rota_revizyonu_id IS NOT NULL)
     AND eski_rota_revizyonu_id IS DISTINCT FROM yeni_rota_revizyonu_id;

COMMENT ON COLUMN degisiklik_yonetimi_emir_kalemi.eski_cizim_revizyonu_id IS 'Kullanılmıyor: degisiklik_yonetimi_emir_ogesi (1642).';
COMMENT ON COLUMN degisiklik_yonetimi_emir_kalemi.yeni_cizim_revizyonu_id IS 'Kullanılmıyor: degisiklik_yonetimi_emir_ogesi (1642).';
COMMENT ON COLUMN degisiklik_yonetimi_emir_kalemi.eski_rota_revizyonu_id IS 'Kullanılmıyor: degisiklik_yonetimi_emir_ogesi (1642).';
COMMENT ON COLUMN degisiklik_yonetimi_emir_kalemi.yeni_rota_revizyonu_id IS 'Kullanılmıyor: degisiklik_yonetimi_emir_ogesi (1642).';

-- Tasarım sınıfında kalemin getirdiği parça revizyonu (tasarım otoritesinin revizyonu, 1608 a).
ALTER TABLE degisiklik_yonetimi_emir_kalemi
  ADD COLUMN yeni_parca_revizyonu text CONSTRAINT degisiklik_yonetimi_emir_kalemi_parca_rev_bicimi CHECK (
    yeni_parca_revizyonu IS NULL OR (btrim(yeni_parca_revizyonu) <> '' AND char_length(yeni_parca_revizyonu) <= 20)
  );

-- Konfigürasyon: parçanın yürürlükteki tanımı. Her yayın yeni satır yazar; en büyük sıra yürürlüktedir. Yalnız eklenir.
CREATE TABLE degisiklik_yonetimi_konfigurasyon (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id int NOT NULL CONSTRAINT degisiklik_yonetimi_konfigurasyon_malzeme REFERENCES malzeme_katalog_karti (no),
  sira int NOT NULL CONSTRAINT degisiklik_yonetimi_konfigurasyon_sira_pozitif CHECK (sira > 0),
  parca_revizyonu text CONSTRAINT degisiklik_yonetimi_konfigurasyon_parca_rev_bicimi CHECK (
    parca_revizyonu IS NULL OR (btrim(parca_revizyonu) <> '' AND char_length(parca_revizyonu) <= 20)
  ),
  proses_surumu int NOT NULL CONSTRAINT degisiklik_yonetimi_konfigurasyon_proses_pozitif CHECK (proses_surumu > 0),
  emir_id int NOT NULL REFERENCES degisiklik_yonetimi_emir,
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT degisiklik_yonetimi_konfigurasyon_sira_tek UNIQUE (malzeme_id, sira),
  CONSTRAINT degisiklik_yonetimi_konfigurasyon_emir_tek UNIQUE (emir_id, malzeme_id)
);
CREATE INDEX degisiklik_yonetimi_konfigurasyon_kisi_idx ON degisiklik_yonetimi_konfigurasyon (kisi_id);
CREATE TRIGGER degisiklik_yonetimi_konfigurasyon_yalniz_ekleme BEFORE UPDATE OR DELETE ON degisiklik_yonetimi_konfigurasyon
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER degisiklik_yonetimi_konfigurasyon_bosaltma_yok BEFORE TRUNCATE ON degisiklik_yonetimi_konfigurasyon
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

CREATE TABLE degisiklik_yonetimi_konfigurasyon_ogesi (
  konfigurasyon_id int NOT NULL REFERENCES degisiklik_yonetimi_konfigurasyon,
  tur text NOT NULL CONSTRAINT degisiklik_yonetimi_konfigurasyon_ogesi_tur_degeri CHECK (
    tur IN ('cizim', 'model-3b', 'rota', 'islem-sartnamesi', 'kontrol-plani', 'nc-programi', 'markalama-tanimi')
  ),
  revizyon_id int NOT NULL CONSTRAINT degisiklik_yonetimi_konfigurasyon_ogesi_rev_pozitif CHECK (revizyon_id > 0),
  PRIMARY KEY (konfigurasyon_id, tur, revizyon_id)
);
-- Parçanın tek rotası vardır.
CREATE UNIQUE INDEX degisiklik_yonetimi_konfigurasyon_ogesi_tek_rota ON degisiklik_yonetimi_konfigurasyon_ogesi (konfigurasyon_id)
  WHERE tur = 'rota';
CREATE TRIGGER degisiklik_yonetimi_konfigurasyon_ogesi_yalniz_ekleme BEFORE UPDATE OR DELETE ON degisiklik_yonetimi_konfigurasyon_ogesi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER degisiklik_yonetimi_konfigurasyon_ogesi_bosaltma_yok BEFORE TRUNCATE ON degisiklik_yonetimi_konfigurasyon_ogesi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
