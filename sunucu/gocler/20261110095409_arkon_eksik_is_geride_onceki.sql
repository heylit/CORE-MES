-- 2769 (2756 b): eksik işe "sayımı geride kalan önceki adım" türü (AR-EK-8, konu iş emri, değer adet). Kısıt yalnız genişler; satırlar değişmez.
ALTER TABLE arkon_eksik_is_olayi DROP CONSTRAINT arkon_eksik_is_olayi_tur_degeri;
ALTER TABLE arkon_eksik_is_olayi ADD CONSTRAINT arkon_eksik_is_olayi_tur_degeri
  CHECK (tur IN ('plan-gerisi', 'kayitsiz-gun', 'yarim-is', 'plansiz-is', 'geciken-emir', 'bayat-plan', 'geride-onceki'));
