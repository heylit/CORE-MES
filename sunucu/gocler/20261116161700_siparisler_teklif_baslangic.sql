-- 3326: "seçilen günde başlat" yerleşiminde teklifin en erken başlangıç günü saklanır; yer tutan taslak başlangıç değişince yeniden denenir.
-- Boş olabilen sütun ve genişleyen kısıt, yalnız ekleme: eski satırlar yeni kısıtı zaten sağlar (yerlesim arkaya, geriye ya da null); veri dönüşmez.
ALTER TABLE siparisler_teklif_plan_taslagi ADD COLUMN baslangic date;
ALTER TABLE siparisler_teklif_plan_taslagi DROP CONSTRAINT siparisler_teklif_plan_taslagi_yerlesim;
ALTER TABLE siparisler_teklif_plan_taslagi ADD CONSTRAINT siparisler_teklif_plan_taslagi_yerlesim CHECK (
  yerlesim IN ('arkaya', 'geriye', 'baslat')
  AND (yerlesim <> 'geriye' OR istenen_termin IS NOT NULL)
  AND ((yerlesim = 'baslat') = (baslangic IS NOT NULL))
  AND (yerlesim IS NOT NULL OR baslangic IS NULL)
);
