-- 934, 936 a: projenin ilk plan maliyeti fotoğrafı. Elle alınır; yenileme gerekçe ister ve yeni satırdır, eskisi geçmişte kalır.
-- Güncel taban projenin en büyük sıralı satırıdır. Sıra tekilliği eşzamanlı iki alışı da ayırır (ikincisi çakışma alır).
CREATE TABLE proje_maliyet_taban (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proje_id int NOT NULL CONSTRAINT proje_maliyet_taban_proje REFERENCES projeler_proje (id),
  sira int NOT NULL CONSTRAINT proje_maliyet_taban_sira_pozitif CHECK (sira >= 1),
  -- TRY, KDV hariç; toplamlara girmeyen kalem varsa toplam o kalemler dışında alınmıştır (eksik_kalemler).
  plan numeric(18,2) CONSTRAINT proje_maliyet_taban_plan_negatif_degil CHECK (plan >= 0),
  -- Kalem -> plan tutarı; null bilinmiyor demektir.
  kalemler jsonb NOT NULL CONSTRAINT proje_maliyet_taban_kalemler_nesne CHECK (jsonb_typeof(kalemler) = 'object'),
  eksik_kalemler jsonb NOT NULL CONSTRAINT proje_maliyet_taban_eksik_dizi CHECK (jsonb_typeof(eksik_kalemler) = 'array'),
  is_emri_sayisi int NOT NULL CONSTRAINT proje_maliyet_taban_is_emri_pozitif CHECK (is_emri_sayisi >= 1),
  gerekce text CONSTRAINT proje_maliyet_taban_gerekce_bicim CHECK (btrim(gerekce) = gerekce AND length(gerekce) BETWEEN 1 AND 500),
  kisi_id int NOT NULL CONSTRAINT proje_maliyet_taban_kisi REFERENCES kisi (id),
  an timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proje_maliyet_taban_sira_tekil UNIQUE (proje_id, sira),
  -- İlk taban gerekçesiz, her yenileme gerekçeli.
  CONSTRAINT proje_maliyet_taban_yenileme_gerekceli CHECK ((sira = 1) = (gerekce IS NULL))
);
CREATE TRIGGER proje_maliyet_taban_degismez BEFORE UPDATE OR DELETE ON proje_maliyet_taban
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER proje_maliyet_taban_bosaltilmaz BEFORE TRUNCATE ON proje_maliyet_taban
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- 911 b, 940 c: üretim dışı masraf belgesinin projeye (isteğe bağlı görevine) bağı. Belge finanstadır ve değişmez; bağ burada durur,
-- finans projelere bağımlı olmaz (ADR 0006). Bir belge tek projeye bağlanır. Görev aynı projenin görevi olmalıdır.
CREATE TABLE proje_maliyet_masraf (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proje_id int NOT NULL CONSTRAINT proje_maliyet_masraf_proje REFERENCES projeler_proje (id),
  finans_belge_id int NOT NULL CONSTRAINT proje_maliyet_masraf_belge REFERENCES finans_belge (id),
  gorev_id int,
  kisi_id int NOT NULL CONSTRAINT proje_maliyet_masraf_kisi REFERENCES kisi (id),
  an timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proje_maliyet_masraf_belge_tekil UNIQUE (finans_belge_id),
  CONSTRAINT proje_maliyet_masraf_gorev FOREIGN KEY (gorev_id, proje_id) REFERENCES projeler_gorev (id, proje_id)
);
CREATE INDEX proje_maliyet_masraf_proje_idx ON proje_maliyet_masraf (proje_id, id);
CREATE INDEX proje_maliyet_masraf_gorev_idx ON proje_maliyet_masraf (gorev_id, proje_id) WHERE gorev_id IS NOT NULL;
