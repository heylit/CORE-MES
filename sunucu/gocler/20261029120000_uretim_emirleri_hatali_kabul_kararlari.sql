-- 1211 (kullanıcı kararı 29.10.2026) ve 1213 a (dolu tabloda kısıt genişlemesi, teyit 29.10 15:21): hatalı parçanın kalite kararına
-- "kabul" ve "şartlı kabul" eklenir. İkisinde de parça olduğu gibi ana partiye katılır, rework ve tekrar adımları kalkar (bağlar boşalır,
-- hurda ve red gibi). Yalnız izin verilen değerler genişler; var olan satır, tetik ve bağlar değişmez.
ALTER TABLE uretim_emirleri_hatali_kaydi
  DROP CONSTRAINT uretim_emirleri_hatali_kaydi_karar_degeri,
  ADD CONSTRAINT uretim_emirleri_hatali_kaydi_karar_degeri CHECK (karar IN ('rework', 'hurda', 'red', 'kabul', 'sartli_kabul')),
  DROP CONSTRAINT uretim_emirleri_hatali_kaydi_rework_adimli,
  ADD CONSTRAINT uretim_emirleri_hatali_kaydi_rework_adimli CHECK (karar IN ('hurda', 'red', 'kabul', 'sartli_kabul') OR rework_is_emri_id IS NOT NULL);
