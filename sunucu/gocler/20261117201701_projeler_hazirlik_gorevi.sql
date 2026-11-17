-- 3396 a: hazırlık görevi. Şablonun hazırlık kalemi, projeye bağlı üretim emri için emir ya da iş emri başına bir görev doğurur
-- (3269-B). Bağ yalnız eklenen sütunlardır; var olan görev değişmez. Emir ve iş emri Üretim Emirleri'nindir: yabancı anahtar yok
-- (Projeler alt kattadır, emir tablosunu tanımaz); bağın doğruluğunu görevi açan Üretim Emirleri sağlar.
ALTER TABLE projeler_gorev
  ADD COLUMN hazirlik_maddesi text CONSTRAINT projeler_gorev_hazirlik_madde_bicim CHECK (hazirlik_maddesi ~ '^[a-z][a-z-]{0,39}$'),
  ADD COLUMN hazirlik_emri_id int,
  ADD COLUMN hazirlik_is_emri_id int,
  ADD CONSTRAINT projeler_gorev_hazirlik_butun CHECK ((hazirlik_maddesi IS NULL) = (hazirlik_emri_id IS NULL)),
  ADD CONSTRAINT projeler_gorev_hazirlik_is_emri CHECK (hazirlik_is_emri_id IS NULL OR hazirlik_emri_id IS NOT NULL);

-- Aynı emir (ve iş emri) için aynı maddenin iptal edilmemiş tek görevi olur: şablon ikinci kez uygulanınca görev çoğalmaz.
CREATE UNIQUE INDEX projeler_gorev_hazirlik_tekil ON projeler_gorev (hazirlik_emri_id, COALESCE(hazirlik_is_emri_id, 0), hazirlik_maddesi)
  WHERE hazirlik_maddesi IS NOT NULL AND durum <> 'iptal';
