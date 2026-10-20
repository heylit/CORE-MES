-- Elle sıra, verildiği andaki adımın rota istasyonunu saklar: rota değişip adımın istasyonu değişince elle sıra düşer ve planlamacı
-- uyarılır; aynı istasyonda yalnız makine değişince korunur (kullanıcı kararı 16.10.2026). Var olan satırlar boş kalır, elle sıraları düşmez.
ALTER TABLE plan_yerlesimi ADD COLUMN elle_istasyon_id int REFERENCES istasyon;
ALTER TABLE plan_senaryo_yerlesimi ADD COLUMN elle_istasyon_id int REFERENCES istasyon;
