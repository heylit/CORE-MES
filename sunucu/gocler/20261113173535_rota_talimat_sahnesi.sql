-- Montaj talimatının 3B sahnesi (3209 a): yayınlanmış talimat sürümünün her adımında hangi parçanın hangi yönden girdiği.
-- Talimat taslağı ve yayın tablolarına dokunulmaz; sahne yayınlanmış sürüme ayrı tabloda bağlanır. Yalnız eklenir (Risk R1):
-- düzeltme aynı talimat sürümü için yeni sahne sürümüdür; emirde gösterilen sahne sonradan izlenebilir kalır.
-- model_revizyon_id Belge Merkezi'nin 3B model revizyonudur; başka modülün tablosu olduğu için yabancı anahtar Aşama 2'dedir.
-- adimlar dizisinin biçimini servis ve kurallar (RT-90..RT-94) denetler; tablo yalnız dizi olduğunu ve boyunu sınırlar.
CREATE TABLE rota_talimat_sahnesi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id int NOT NULL,
  op_no int NOT NULL,
  talimat_surum int NOT NULL CONSTRAINT rota_talimat_sahnesi_talimat_surum_pozitif CHECK (talimat_surum > 0),
  sahne_surum int NOT NULL CONSTRAINT rota_talimat_sahnesi_surum_pozitif CHECK (sahne_surum > 0),
  model_revizyon_id int NOT NULL CONSTRAINT rota_talimat_sahnesi_model_pozitif CHECK (model_revizyon_id > 0),
  adimlar jsonb NOT NULL CONSTRAINT rota_talimat_sahnesi_adimlar_dizi CHECK (jsonb_typeof(adimlar) = 'array' AND pg_column_size(adimlar) <= 262144),
  yazan_kisi_id int NOT NULL REFERENCES kisi,
  yazma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rota_talimat_sahnesi_op_kayitli FOREIGN KEY (malzeme_id, op_no) REFERENCES rota_op_numarasi,
  CONSTRAINT rota_talimat_sahnesi_surum_tekil UNIQUE (malzeme_id, op_no, talimat_surum, sahne_surum)
);
CREATE INDEX rota_talimat_sahnesi_yazan_fk_idx ON rota_talimat_sahnesi (yazan_kisi_id);
CREATE TRIGGER rota_talimat_sahnesi_degismez BEFORE UPDATE OR DELETE ON rota_talimat_sahnesi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_talimat_sahnesi_bosaltilmaz BEFORE TRUNCATE ON rota_talimat_sahnesi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
