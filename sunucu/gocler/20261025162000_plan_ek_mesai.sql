-- Ek mesai taslakta (507 2 a, 508 1 a): Reçete ve Rota çalışmasındaki ek vardiyalar (S.ekMesai) taslağa satır olarak geçer, plan haftalık
-- bütçeyle sonucunu verir. Satır makine, gün ve vardiyadır; saat yazıldığı andaki vardiya süresidir (eski motorun vardiya bitiş - başlangıç,
-- molalar düşülmez), vardiya sonradan değişse de bütçe sonucu yerinde kalır. senaryo_id boş satır canlınındır: taslak açılınca kopyalanır,
-- canlıya alınca taslağınkiyle değişir. Kapanmış taslağın satırları değişmez (plan_senaryo_satiri_korunur).
-- Dolu plan_ayari'ya yalnız boş olabilen sütun eklenir; var olan satır değişmez. Boş sınır eski motorun varsayılanıdır (haftada 8 saat).
ALTER TABLE plan_ayari
  ADD COLUMN ek_mesai_hafta_saat numeric(5, 1) CONSTRAINT plan_ayari_ek_mesai_hafta_saat CHECK (ek_mesai_hafta_saat BETWEEN 0 AND 168);

CREATE TABLE plan_senaryo_ek_mesai (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT plan_senaryo_ek_mesai_tekil PRIMARY KEY,
  senaryo_id int CONSTRAINT plan_senaryo_ek_mesai_senaryo REFERENCES plan_senaryosu (id),
  makine_id int NOT NULL CONSTRAINT plan_senaryo_ek_mesai_makine REFERENCES makine (id),
  gun date NOT NULL,
  vardiya_id int NOT NULL CONSTRAINT plan_senaryo_ek_mesai_vardiya REFERENCES vardiya (id),
  saat numeric(4, 2) NOT NULL CONSTRAINT plan_senaryo_ek_mesai_saat CHECK (saat > 0 AND saat <= 24)
);
CREATE UNIQUE INDEX plan_senaryo_ek_mesai_taslakta_tek ON plan_senaryo_ek_mesai (senaryo_id, makine_id, gun, vardiya_id) WHERE senaryo_id IS NOT NULL;
CREATE UNIQUE INDEX plan_senaryo_ek_mesai_canlida_tek ON plan_senaryo_ek_mesai (makine_id, gun, vardiya_id) WHERE senaryo_id IS NULL;

CREATE TRIGGER plan_senaryo_ek_mesai_korunur BEFORE INSERT OR UPDATE OR DELETE ON plan_senaryo_ek_mesai
  FOR EACH ROW EXECUTE FUNCTION plan_senaryo_satiri_korunur();
CREATE TRIGGER plan_senaryo_ek_mesai_bosaltilmaz BEFORE TRUNCATE ON plan_senaryo_ek_mesai
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
