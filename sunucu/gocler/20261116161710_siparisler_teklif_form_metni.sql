-- 3328: teklif formunun metni (başlık, giriş, şartlar, imzalar, alt bilgi) teklif başına şablondan ayrı saklanabilir; boşsa şablon basılır.
-- Boş olabilen sütun, yalnız ekleme: eski tekliflerde null kalır, veri dönüşmez.
ALTER TABLE siparisler_teklif ADD COLUMN form_metni jsonb
  CONSTRAINT siparisler_teklif_form_metni CHECK (form_metni IS NULL OR jsonb_typeof(form_metni) = 'object');
