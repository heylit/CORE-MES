-- 3349: canlı planı eskiten olaylara fason hizmet siparişinin firma tarihinin girilmesi ya da değişmesi eklenir (fason-termini; kaynak_id canlı
-- plan sürümü). Yalnız kısıt genişler: mevcut satırlar geçerli kalır, veri yeniden yazılmaz. Liste önceki değerleri korur.
ALTER TABLE plan_bayat_olayi DROP CONSTRAINT plan_bayat_olayi_neden;
ALTER TABLE plan_bayat_olayi ADD CONSTRAINT plan_bayat_olayi_neden CHECK (neden IN ('emir-bitti', 'fason-donusu', 'rota-degisti', 'adim-bitti', 'emir-iptal', 'satin-alma-termini', 'fason-termini'));
