-- 3669: onaya gönderme ve canlıya alma kaydı, o andaki çalışmanın kapalı kısıt listesini taşır. NULL: bilinmiyor (bu göçten önceki kayıt);
-- boş dizi: kapalı kısıt yok. Var olan satır değişmez, yeni sütun yalnız yeni kayıtta dolar.
ALTER TABLE plan_senaryo_onay_kaydi ADD COLUMN kapali_kisitlar text[];
