-- Fasona almada termin isteğe bağlıdır (kullanıcı kararı "İsteğe bağlı"): termini girilmemiş fason adımın süresi satın alma tahmininden ya da
-- varsayılandan gelir. Defter terminsiz fason değişimini de kaydeder; termin yalnız fason firmayla birlikte olabilir.
ALTER TABLE uretim_emirleri_uretim_yeri_degisimi
  DROP CONSTRAINT uretim_emirleri_uretim_yeri_degisimi_fason_terminli,
  ADD CONSTRAINT uretim_emirleri_uretim_yeri_degisimi_termin_fasonda CHECK (yeni_termin_gun IS NULL OR yeni_fason_firma_id IS NOT NULL);
