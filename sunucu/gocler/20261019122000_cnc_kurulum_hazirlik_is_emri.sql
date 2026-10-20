-- CNC hazırlığı iş emri (operasyon) başınadır (kullanıcı kararı 266 a): emrin OP10'unun hazırlığı OP20'yi hazır göstermez.
-- Onay anında kurulumda seçili iş emri yazılır; emir_id üst emir olarak kalır. Bu göçten önceki satırlarda iş emri yoktur:
-- hiçbir operasyonu hazır saymaz, yeniden onay gerekir. Aşama 2'de yabancı anahtarla bağlanır.
ALTER TABLE cnc_kurulum_hazirlik_olayi ADD COLUMN is_emri_id int;

CREATE INDEX cnc_kurulum_hazirlik_olayi_is_emri_idx ON cnc_kurulum_hazirlik_olayi (is_emri_id, id) WHERE is_emri_id IS NOT NULL;
