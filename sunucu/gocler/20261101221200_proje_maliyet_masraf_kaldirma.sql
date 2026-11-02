-- K18 a: masraf bağı kaldırılınca iz kalır. Bağ satırı silinir (belge başka projeye bağlanabilsin diye tekillik bağ tablosundadır);
-- silinen bağın içeriği, kaldıran kişi ve zamanla bu tabloya yazılır. Yalnız ekleme.
CREATE TABLE proje_maliyet_masraf_kaldirma (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bag_id int NOT NULL,
  proje_id int NOT NULL CONSTRAINT proje_maliyet_masraf_kaldirma_proje REFERENCES projeler_proje (id),
  finans_belge_id int NOT NULL CONSTRAINT proje_maliyet_masraf_kaldirma_belge REFERENCES finans_belge (id),
  -- Görev sonradan silinebilir; iz görev numarasını yalnız bilgi olarak taşır.
  gorev_id int,
  baglayan_id int NOT NULL CONSTRAINT proje_maliyet_masraf_kaldirma_baglayan REFERENCES kisi (id),
  baglama_an timestamptz NOT NULL,
  kaldiran_id int NOT NULL CONSTRAINT proje_maliyet_masraf_kaldirma_kaldiran REFERENCES kisi (id),
  an timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proje_maliyet_masraf_kaldirma_bag_tekil UNIQUE (bag_id)
);
CREATE INDEX proje_maliyet_masraf_kaldirma_proje_idx ON proje_maliyet_masraf_kaldirma (proje_id, id);

CREATE TRIGGER proje_maliyet_masraf_kaldirma_degismez BEFORE UPDATE OR DELETE ON proje_maliyet_masraf_kaldirma
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER proje_maliyet_masraf_kaldirma_bosaltilmaz BEFORE TRUNCATE ON proje_maliyet_masraf_kaldirma
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
