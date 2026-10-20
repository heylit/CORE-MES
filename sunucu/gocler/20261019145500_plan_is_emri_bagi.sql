-- 279 a: canlı plan satırı iş emrine bağlanır; iş emri silinince (rotasız emirde başlamamış adım, rota yenilemede çıkan adım) plan
-- satırı da silinir. Önce iş emri olmayan artık satırlar temizlenir; plan bunları okurken zaten atlıyordu.
DELETE FROM plan_yerlesim_parcasi p WHERE NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.id = p.is_emri_id);
DELETE FROM plan_yerlesimi p WHERE NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.id = p.is_emri_id);
-- Senaryoda eksi kimlik deneme emridir (iş emri değil); bağ kurulamaz, yalnız artık gerçek iş emri satırları temizlenir.
DELETE FROM plan_senaryo_yerlesim_parcasi p WHERE p.is_emri_id > 0 AND NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.id = p.is_emri_id);
DELETE FROM plan_senaryo_yerlesimi p WHERE p.is_emri_id > 0 AND NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.id = p.is_emri_id);
ALTER TABLE plan_yerlesimi
  ADD CONSTRAINT plan_yerlesimi_is_emri FOREIGN KEY (is_emri_id) REFERENCES uretim_emirleri_is_emri (id) ON DELETE CASCADE;
ALTER TABLE plan_yerlesim_parcasi
  ADD CONSTRAINT plan_yerlesim_parcasi_is_emri FOREIGN KEY (is_emri_id) REFERENCES uretim_emirleri_is_emri (id) ON DELETE CASCADE;
