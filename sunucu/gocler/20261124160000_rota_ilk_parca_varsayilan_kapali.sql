-- Yeni rota adımı ilk parça onayı kapalı başlar (kart 3648; 744 a değişti). Yalnız varsayılan değişir: var olan adımların seçimi korunur.
ALTER TABLE rota_adimi ALTER COLUMN ilk_parca SET DEFAULT 'yok';
