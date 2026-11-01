-- 1476 (1481 a, 1476 teyit): çok katmanlı reçetenin patlamış rotası, donmuş anlık görüntü. Kök ürünün rotası, bileşenlerinden
-- yürürlükte rotası olanların rotalarıyla yinelemeli açılır; bütün katmanların adımları tek düz tabloda saklanır. Patlatma değişmez:
-- alt parçanın revizyonu sonra değişirse eski patlatmayla açılmış emir etkilenmez, aynı revizyonlarla yeniden patlatma aynı satırı kullanır.
-- Sahibi rota: reçete (rota_bileseni) ve emre kopya burada; Reçete ve Rota ekranı rota üzerinden okur. Yeni iki tablo boştur.
CREATE TABLE rota_patlatma (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kok_malzeme_id int NOT NULL CONSTRAINT rota_patlatma_kok_malzeme REFERENCES malzeme_katalog_karti (no),
  kok_rota_revizyonu_id int NOT NULL CONSTRAINT rota_patlatma_kok_revizyon REFERENCES rota_revizyonu,
  -- Kullanılan bütün revizyonların sıralı listesi (malzeme:revizyon); aynı girdinin ikinci patlatması bu satırı bulur.
  ozet text NOT NULL CONSTRAINT rota_patlatma_ozet_bos_degil CHECK (btrim(ozet) <> ''),
  kisi_id int NOT NULL CONSTRAINT rota_patlatma_kisi REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rota_patlatma_ozet_tekil UNIQUE (kok_rota_revizyonu_id, ozet)
);

-- Her satır bir adım. Sıra alt katman adımlarını üst katmandan önce verir. Düğüm yolu: "0" kök, "0.2" kökün 2. ürün bileşeni.
-- Ham malzeme satırı tutulmaz: ihtiyaç rota_adimi_id'nin bileşenlerinden birim çarpanıyla okunur (kopya yok).
CREATE TABLE rota_patlamis_rota (
  patlatma_id int NOT NULL CONSTRAINT rota_patlamis_rota_patlatma REFERENCES rota_patlatma,
  sira int NOT NULL CONSTRAINT rota_patlamis_rota_sira_pozitif CHECK (sira > 0),
  dugum text NOT NULL CONSTRAINT rota_patlamis_rota_dugum_bicimi CHECK (dugum ~ '^0(\.[1-9][0-9]*)*$' AND char_length(dugum) <= 40),
  katman int NOT NULL CONSTRAINT rota_patlamis_rota_katman CHECK (katman BETWEEN 0 AND 10),
  malzeme_id int NOT NULL CONSTRAINT rota_patlamis_rota_malzeme REFERENCES malzeme_katalog_karti (no),
  rota_revizyonu_id int NOT NULL CONSTRAINT rota_patlamis_rota_revizyon REFERENCES rota_revizyonu,
  rota_adimi_id int NOT NULL CONSTRAINT rota_patlamis_rota_adim REFERENCES rota_adimi,
  kaynak_op_no int NOT NULL CONSTRAINT rota_patlamis_rota_op_pozitif CHECK (kaynak_op_no > 0),
  -- Kök ürünün 1 adedi için bu düğümden kaç adet (yol boyunca bileşen miktarlarının çarpımı); kökte 1.
  birim_carpani numeric(14,4) NOT NULL CONSTRAINT rota_patlamis_rota_carpan_pozitif CHECK (birim_carpani > 0),
  -- Düğümün çıktısını tüketen üst adım; kökte boş.
  tuketen_dugum text,
  tuketen_op_no int CONSTRAINT rota_patlamis_rota_tuketen_op_pozitif CHECK (tuketen_op_no > 0),
  PRIMARY KEY (patlatma_id, sira),
  CONSTRAINT rota_patlamis_rota_adim_tekil UNIQUE (patlatma_id, dugum, kaynak_op_no),
  CONSTRAINT rota_patlamis_rota_tuketen CHECK ((katman = 0) = (tuketen_dugum IS NULL) AND (tuketen_dugum IS NULL) = (tuketen_op_no IS NULL))
);
CREATE INDEX rota_patlamis_rota_adim_fk_idx ON rota_patlamis_rota (rota_adimi_id);
CREATE INDEX rota_patlamis_rota_revizyon_fk_idx ON rota_patlamis_rota (rota_revizyonu_id);
CREATE INDEX rota_patlamis_rota_malzeme_fk_idx ON rota_patlamis_rota (malzeme_id);
CREATE INDEX rota_patlatma_kisi_fk_idx ON rota_patlatma (kisi_id);
CREATE INDEX rota_patlatma_kok_malzeme_fk_idx ON rota_patlatma (kok_malzeme_id);

CREATE TRIGGER rota_patlatma_degismez BEFORE UPDATE OR DELETE ON rota_patlatma FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_patlatma_bosaltilmaz BEFORE TRUNCATE ON rota_patlatma FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_patlamis_rota_degismez BEFORE UPDATE OR DELETE ON rota_patlamis_rota FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_patlamis_rota_bosaltilmaz BEFORE TRUNCATE ON rota_patlamis_rota FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
