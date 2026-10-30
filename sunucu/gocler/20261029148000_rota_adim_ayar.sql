-- Hazırlık süresi iki parçaya ayrılır: hazırlık ve (ayar işaretliyse) ayar. Toplamı ayar_suresi_dk'da kalır; plan,
-- iş emri ve öteki okuyanlar toplamı okumaya devam eder. Ayar işareti, planın ayarcı arayıp aramayacağını söyler.
ALTER TABLE rota_adimi
  ADD COLUMN hazirlik_dk numeric(8, 2) CONSTRAINT rota_adimi_hazirlik CHECK (hazirlik_dk >= 0),
  ADD COLUMN ayar boolean NOT NULL DEFAULT false,
  ADD COLUMN ayar_dk numeric(8, 2) CONSTRAINT rota_adimi_ayar_dk CHECK (ayar_dk >= 0);

-- Var olan adımda süre ayar süresine taşınır; onaylı revizyonlar da dolar. İçerik kilidi yalnız bu ilk dolum için,
-- göçün işlemi içinde kapatılıp açılır.
ALTER TABLE rota_adimi DISABLE TRIGGER rota_adimi_kilitli;
UPDATE rota_adimi
   SET ayar = coalesce(ayar_suresi_dk, 0) > 0,
       ayar_dk = CASE WHEN ayar_suresi_dk > 0 THEN ayar_suresi_dk END,
       hazirlik_dk = CASE WHEN ayar_suresi_dk > 0 THEN 0 ELSE ayar_suresi_dk END;
ALTER TABLE rota_adimi ENABLE TRIGGER rota_adimi_kilitli;

ALTER TABLE rota_adimi
  ADD CONSTRAINT rota_adimi_ayar_suresi_ayarda CHECK (ayar OR ayar_dk IS NULL),
  ADD CONSTRAINT rota_adimi_hazirlik_toplami CHECK (
    ayar_suresi_dk IS NOT DISTINCT FROM CASE WHEN hazirlik_dk IS NULL AND ayar_dk IS NULL THEN NULL ELSE coalesce(hazirlik_dk, 0) + coalesce(ayar_dk, 0) END);
