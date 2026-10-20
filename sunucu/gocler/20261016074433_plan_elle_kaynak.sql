-- Makineyi planlamacı elle seçtiyse toptan hesap (Öner) işi o makinede tutar, yalnız saatini ayarlar (kullanıcı onayı 16.10.2026).
-- Var olan satırlar elle seçilmemiş sayılır.
ALTER TABLE plan_yerlesimi ADD COLUMN elle_kaynak boolean NOT NULL DEFAULT false;
ALTER TABLE plan_senaryo_yerlesimi ADD COLUMN elle_kaynak boolean NOT NULL DEFAULT false;
