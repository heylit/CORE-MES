-- Ortak terminal cihazının istasyon ve makine bağı (kart 3392, karar 3392 a madde 11): bağ cihazda saklanır, kim ne zaman hangi yere
-- bağladığı burada iz bırakır. Yeni boş tablo, yalnız eklenir; cihazın son bağı son satırıdır.
CREATE TABLE arkon_cihaz_bagi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Cihaz kimliği tarayıcının ürettiği rastgele UUID'dir; kişi ya da donanım bilgisi taşımaz.
  cihaz text NOT NULL CONSTRAINT arkon_cihaz_bagi_cihaz_bicimi CHECK (cihaz ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  istasyon_id int NOT NULL REFERENCES istasyon (id),
  -- Boş: makine sabit değil (her işte planın makinesi).
  makine_id int REFERENCES makine (id),
  kisi_id int NOT NULL REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arkon_cihaz_bagi_cihaz_idx ON arkon_cihaz_bagi (cihaz, id);
CREATE TRIGGER arkon_cihaz_bagi_degismez BEFORE UPDATE OR DELETE ON arkon_cihaz_bagi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER arkon_cihaz_bagi_bosaltilmaz BEFORE TRUNCATE ON arkon_cihaz_bagi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
