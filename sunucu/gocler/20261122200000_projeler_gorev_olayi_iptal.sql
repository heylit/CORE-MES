-- 3580: görev iptali gerekçeyle görev geçmişine yazılır (kim, ne zaman, neden). Yalnız CHECK genişler: veri silinmez ya da dönüşmez,
-- eski satırlar geçerli kalır. Geri alma: eski iki kısıtı yeniden koymak (önce 'iptal' olaylarını silmek gerekir).
ALTER TABLE projeler_gorev_olayi
  DROP CONSTRAINT projeler_gorev_olayi_olay,
  ADD CONSTRAINT projeler_gorev_olayi_olay CHECK (olay IN ('ustlen', 'basla', 'bitti', 'onay', 'geri', 'cevir', 'iptal')),
  DROP CONSTRAINT projeler_gorev_olayi_geri_gerekceli,
  ADD CONSTRAINT projeler_gorev_olayi_geri_gerekceli CHECK (olay NOT IN ('geri', 'cevir', 'iptal') OR gerekce IS NOT NULL);
