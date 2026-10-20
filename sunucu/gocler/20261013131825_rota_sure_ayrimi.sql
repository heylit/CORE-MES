-- Çevrim süresi işlem ve değişim olarak ayrılır (S1 a, 13.10.2026): iki sütun boş olabilir, birim süre çevrimin toplamı olarak kalır;
-- plan, iş emri kopyası ve emre kopyalama birim süreyi okumaya devam eder. Var olan satır değişmez: ayrılmamış adımda işlem çevrimdir,
-- değişim boştur (okumada). Gerçekleşen süreler revizyondan bağımsız ayrı defterde tutulur (ürün + OP numarası; yeni revizyon kaybetmez).
ALTER TABLE rota_adimi
  ADD COLUMN islem_suresi_dk numeric(10, 4) CONSTRAINT rota_adimi_islem_suresi CHECK (islem_suresi_dk > 0),
  ADD COLUMN degisim_suresi_dk numeric(10, 4) CONSTRAINT rota_adimi_degisim_suresi CHECK (degisim_suresi_dk >= 0),
  -- Değişim işlemsiz girilmez; işlem girilince birim süre işlem + değişimdir (değişim boşsa yalnız işlem).
  ADD CONSTRAINT rota_adimi_sure_ayrimi CHECK (
    (degisim_suresi_dk IS NULL OR islem_suresi_dk IS NOT NULL)
    AND (islem_suresi_dk IS NULL OR birim_sure_dk = islem_suresi_dk + coalesce(degisim_suresi_dk, 0))
  );

ALTER TABLE rota_aday_kaynagi
  ADD COLUMN islem_suresi_dk numeric(10, 4) CONSTRAINT rota_aday_kaynagi_islem_suresi CHECK (islem_suresi_dk > 0),
  ADD COLUMN degisim_suresi_dk numeric(10, 4) CONSTRAINT rota_aday_kaynagi_degisim_suresi CHECK (degisim_suresi_dk >= 0),
  ADD CONSTRAINT rota_aday_kaynagi_sure_ayrimi CHECK (
    (degisim_suresi_dk IS NULL OR islem_suresi_dk IS NOT NULL)
    AND (islem_suresi_dk IS NULL OR birim_sure_dk = islem_suresi_dk + coalesce(degisim_suresi_dk, 0))
  );

-- Gerçekleşen süre defteri: her yazma yeni satırdır, son satır geçerlidir; boş süre "teoriğe dön" demektir.
-- Kaynak: elle (planlamacı), terminal (iş emrinden ölçülen öneri), kabul (planlamacının kabul ettiği terminal değeri).
-- Plan yalnız elle ya da kabul satırını kullanır (S4 a); terminal satırı öneridir. Terminal ve kabul bağlamada yazılır (A7a).
CREATE TABLE rota_gerceklesen_sure (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id int NOT NULL,
  op_no int NOT NULL,
  -- Süre makineye özgü olabilir; boşsa operasyonun her kaynağı içindir.
  makine_id int CONSTRAINT rota_gerceklesen_sure_makine REFERENCES makine,
  tur text NOT NULL CONSTRAINT rota_gerceklesen_sure_tur CHECK (tur IN ('hazirlik', 'islem', 'degisim')),
  sure_dk numeric(10, 4) CONSTRAINT rota_gerceklesen_sure_eksi_degil CHECK (sure_dk >= 0),
  kaynak text NOT NULL CONSTRAINT rota_gerceklesen_sure_kaynak CHECK (kaynak IN ('elle', 'terminal', 'kabul')),
  is_emri_id int REFERENCES uretim_emirleri_is_emri,
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rota_gerceklesen_sure_op FOREIGN KEY (malzeme_id, op_no) REFERENCES rota_op_numarasi,
  CONSTRAINT rota_gerceklesen_sure_islem_pozitif CHECK (tur <> 'islem' OR sure_dk IS NULL OR sure_dk > 0),
  -- Terminal ve kabul satırı ölçüldüğü iş emrini taşır; elle satır taşımaz. Terminal satırı boş olmaz (ölçüm öneridir).
  CONSTRAINT rota_gerceklesen_sure_is_emri CHECK ((kaynak = 'elle') = (is_emri_id IS NULL)),
  CONSTRAINT rota_gerceklesen_sure_terminal_dolu CHECK (kaynak <> 'terminal' OR sure_dk IS NOT NULL)
);
CREATE INDEX rota_gerceklesen_sure_op_idx ON rota_gerceklesen_sure (malzeme_id, op_no, tur, id);
CREATE TRIGGER rota_gerceklesen_sure_degismez BEFORE UPDATE OR DELETE ON rota_gerceklesen_sure
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_gerceklesen_sure_bosaltilmaz BEFORE TRUNCATE ON rota_gerceklesen_sure
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
