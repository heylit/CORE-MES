-- 2732: canlı planı eskiten olaylara emrin iptali ve arşive alınması eklenir (emir-iptal; kaynak yok). Yalnız kısıt genişler:
-- mevcut satırlar geçerli kalır, veri yeniden yazılmaz. DROP ve ADD göçün tek işlemindedir; arada kısıtsız an yoktur.
ALTER TABLE plan_bayat_olayi DROP CONSTRAINT plan_bayat_olayi_neden;
ALTER TABLE plan_bayat_olayi ADD CONSTRAINT plan_bayat_olayi_neden CHECK (neden IN ('emir-bitti', 'fason-donusu', 'rota-degisti', 'emir-iptal'));
