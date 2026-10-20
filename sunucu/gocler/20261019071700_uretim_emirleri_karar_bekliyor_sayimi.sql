-- İlk parça kararı beklenirken sayılan parça sağlama katılmaz (131 b); kalite kararıyla sağlama döner ya da redde kalır (135, 136 a).
ALTER TABLE uretim_sayimi DROP CONSTRAINT uretim_sayimi_tur_degeri;
ALTER TABLE uretim_sayimi ADD CONSTRAINT uretim_sayimi_tur_degeri CHECK (tur IN ('saglam', 'hurda', 'karar_bekliyor', 'red'));
