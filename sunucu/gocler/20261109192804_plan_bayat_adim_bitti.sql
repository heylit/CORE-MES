-- B-2499-12: canlı planı eskiten olaylara adımın erken bitişi eklenir (adim-bitti; kaynak_id adımın iş emri). Yalnız kısıt genişler:
-- mevcut satırlar geçerli kalır, veri yeniden yazılmaz.
ALTER TABLE plan_bayat_olayi DROP CONSTRAINT plan_bayat_olayi_neden;
ALTER TABLE plan_bayat_olayi ADD CONSTRAINT plan_bayat_olayi_neden CHECK (neden IN ('emir-bitti', 'fason-donusu', 'rota-degisti', 'adim-bitti'));
