-- 3301: satış taslağının termin yerleşimi saklanır; yer tutan taslak yalnız istenen termin ya da yerleşim değişince yeniden denenir.
-- Boş olabilen sütun, yalnız ekleme: eski taslaklarda null kalır ve istenen terminden çıkar (boş: arkaya, dolu: geriye); veri dönüşmez.
ALTER TABLE siparisler_teklif_plan_taslagi ADD COLUMN yerlesim text
  CONSTRAINT siparisler_teklif_plan_taslagi_yerlesim CHECK (yerlesim IN ('arkaya', 'geriye') AND (yerlesim = 'arkaya' OR istenen_termin IS NOT NULL));
