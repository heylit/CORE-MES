-- Hazırlık talimatının terminal izi (kart 2098d). İkisi de yeni boş tablodur ve yalnız eklenir.
-- Kanıt: adımı tamamlayan olayın yanında ölçülen değer, seçilen seçenek ya da çekilen fotoğrafın dosya özeti (v3 onayı:
-- zorunlu adım kanıtsız tamamlanmaz; sınır denetimi terminalde, sunucu yalnız kaydeder).
CREATE TABLE emir_adimi_kaniti (
  olay_id int PRIMARY KEY REFERENCES emir_adimi_olayi,
  olcum numeric(14, 4),
  secim text CONSTRAINT emir_adimi_kaniti_secim_bicimi CHECK (secim IS NULL OR (btrim(secim) <> '' AND length(secim) <= 60)),
  foto_ozet text CONSTRAINT emir_adimi_kaniti_foto_bicimi CHECK (foto_ozet IS NULL OR foto_ozet ~ '^[0-9a-f]{64}$'),
  CONSTRAINT emir_adimi_kaniti_bos_degil CHECK (olcum IS NOT NULL OR secim IS NOT NULL OR foto_ozet IS NOT NULL)
);
CREATE TRIGGER emir_adimi_kaniti_degismez BEFORE UPDATE OR DELETE ON emir_adimi_kaniti
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER emir_adimi_kaniti_bosaltilmaz BEFORE TRUNCATE ON emir_adimi_kaniti
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Adım notu (2098-9 a): "sonraki sefere not". Emir adımına değil ürün + OP + adım sırasına bağlıdır: emrin listesi rota
-- değişince yeniden yazılabilir (soru 76) ve not sonraki emirde aynı adımda okunur. Yalnız iş emirli (rotalı) emirde yazılır.
CREATE TABLE emir_adim_notu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_id int NOT NULL REFERENCES uretim_emri,
  malzeme_no int NOT NULL,
  op_no int NOT NULL CONSTRAINT emir_adim_notu_op_pozitif CHECK (op_no > 0),
  adim_sira int NOT NULL CONSTRAINT emir_adim_notu_sira_pozitif CHECK (adim_sira > 0),
  kisi_id int NOT NULL REFERENCES kisi,
  metin text NOT NULL CONSTRAINT emir_adim_notu_metin_bicimi CHECK (btrim(metin) <> '' AND length(metin) <= 300),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX emir_adim_notu_anahtar_idx ON emir_adim_notu (malzeme_no, op_no, adim_sira, id);
CREATE TRIGGER emir_adim_notu_degismez BEFORE UPDATE OR DELETE ON emir_adim_notu
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER emir_adim_notu_bosaltilmaz BEFORE TRUNCATE ON emir_adim_notu
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
