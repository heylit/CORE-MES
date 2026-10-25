-- 512 2 a: taslağın ek vardiya yazması değişiklik defterine düşer ("Tüm değişiklikler", tek tek kaldırma). Dolu tablonun tür kısıtı
-- 'ek_mesai' ile genişler; var olan satırlar değişmez.
ALTER TABLE plan_senaryo_degisikligi
  DROP CONSTRAINT plan_senaryo_degisikligi_tur,
  ADD CONSTRAINT plan_senaryo_degisikligi_tur CHECK (tur IN (
    'oner', 'yerlestir', 'tasi', 'kaldir', 'kilitle', 'kilidi_ac', 'sirala', 'dondur', 'dondurmayi_kaldir', 'elle_sira_sil', 'ayar',
    'oncelik', 'teslim', 'acil_emir', 'makine_ariza', 'gun_kapat', 'bedel_ayari', 'siparis_carpani', 'ek_mesai'));
