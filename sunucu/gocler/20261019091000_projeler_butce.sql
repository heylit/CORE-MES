-- Proje bütçesi (198 a): maliyet sekmesindeki sapmanın hedefi. Boş olabilir; girilmezse hedef plan maliyetidir. Var olan projeler boş kalır.
ALTER TABLE projeler_proje
  ADD COLUMN butce_tutari numeric(18,2) CONSTRAINT projeler_proje_butce_tutar CHECK (butce_tutari >= 0),
  ADD COLUMN butce_para_birimi char(3) CONSTRAINT projeler_proje_butce_para_birimi CHECK (butce_para_birimi ~ '^[A-Z]{3}$'),
  -- Tutarsız para birimi ya da para birimsiz tutar karşılaştırılamaz (PRJ-09).
  ADD CONSTRAINT projeler_proje_butce_butun CHECK ((butce_tutari IS NULL) = (butce_para_birimi IS NULL));
