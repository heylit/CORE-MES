-- FIFO sıralama kuralı (kart #1186): plan ayarı ve senaryo ayarı kural kısıtları beşinci değeri kabul eder; satırlar değişmez.
ALTER TABLE plan_ayari DROP CONSTRAINT plan_ayari_kural;
ALTER TABLE plan_ayari ADD CONSTRAINT plan_ayari_kural CHECK (kural IN ('oncelik', 'edd', 'cr', 'spt', 'fifo'));
ALTER TABLE plan_senaryo_ayari DROP CONSTRAINT plan_senaryo_ayari_kural;
ALTER TABLE plan_senaryo_ayari ADD CONSTRAINT plan_senaryo_ayari_kural CHECK (kural IN ('oncelik', 'edd', 'cr', 'spt', 'fifo'));
