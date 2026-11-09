-- 2428 p2: fason talep kalemi dış işlem emrine (DIE) bağlanır. Yalnız genişletme; var olan satır değişmez.
-- Sipariş satırına sütun eklenmez: satırın DIE'si kalem_id üzerinden kalemden okunur (tek kaynak).
-- Emre bağlı belge iş emriyle birlikte silinirse (taslak emir) kalem kalır, bağı boşalır; is_emri_id bağıyla aynı davranış.
ALTER TABLE satin_alma_talep_kalemi
  ADD COLUMN die_id int CONSTRAINT satin_alma_talep_kalemi_die REFERENCES uretim_emirleri_dis_islem_emri ON DELETE SET NULL;
CREATE INDEX satin_alma_talep_kalemi_die ON satin_alma_talep_kalemi (die_id) WHERE die_id IS NOT NULL;
