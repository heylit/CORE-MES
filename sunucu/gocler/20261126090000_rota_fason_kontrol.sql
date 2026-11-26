-- 3708: fason adımının arkasındaki kontrol türü rota adımında seçilir; var olan satırlar 'gkk' kalır (bugünkü davranış), hiçbir satır yeniden yazılmaz.
ALTER TABLE rota_adimi
  ADD COLUMN kontrol_turu text NOT NULL DEFAULT 'gkk' CONSTRAINT rota_adimi_kontrol_turu CHECK (kontrol_turu IN ('gkk', 'kaynakta', 'kontrolsuz')),
  -- Kaynağında muayene süresi (saat); boşsa "süre yok" uyarısı rotada görünür, sıfır uydurulmaz.
  ADD COLUMN muayene_suresi_saat numeric(6, 2) CONSTRAINT rota_adimi_muayene_suresi CHECK (muayene_suresi_saat > 0),
  ADD CONSTRAINT rota_adimi_kontrol_fasonda CHECK (kontrol_turu = 'gkk' OR fason_firma_id IS NOT NULL OR fason_firmasiz),
  ADD CONSTRAINT rota_adimi_muayene_suresi_kaynakta CHECK (muayene_suresi_saat IS NULL OR kontrol_turu = 'kaynakta');
