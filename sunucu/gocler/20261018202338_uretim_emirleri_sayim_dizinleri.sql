-- Kişi, iş emri ve makine kırılımı sayımı zaman aralığında okur; dizin yokken her okuma tabloyu baştan sona tarıyordu (yük testi 2026-10-18).
-- Göç kendi transaction'ında koşar (CONCURRENTLY olamaz); güncellemede sunucu kapalıdır, yazma beklemesi göç süresiyle sınırlı. Satır değişmez.
CREATE INDEX uretim_sayimi_kisi_zaman_idx ON uretim_sayimi (kisi_id, zaman);
CREATE INDEX uretim_sayimi_is_emri_zaman_idx ON uretim_sayimi (is_emri_id, zaman);
CREATE INDEX uretim_sayimi_zaman_idx ON uretim_sayimi (zaman);
