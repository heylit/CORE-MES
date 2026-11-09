-- Süre ölçülmedi (kart 2567): biten iş emrinin terminal ölçümü yazılmadıysa eksik iş olayı açılır. Tür listesi genişler; nedenler
-- (ayar basılmadı, sayım yok, sağlam sayım yok, iş emirsiz emir, rotada olmayan adım) yeni sütundadır. Var olan satır değişmez: öteki türlerde nedenler boş
-- dizidir. 'geride-onceki' (2769) korunur.
ALTER TABLE arkon_eksik_is_olayi DROP CONSTRAINT arkon_eksik_is_olayi_tur_degeri;
ALTER TABLE arkon_eksik_is_olayi ADD CONSTRAINT arkon_eksik_is_olayi_tur_degeri
  CHECK (tur IN ('plan-gerisi', 'kayitsiz-gun', 'yarim-is', 'plansiz-is', 'geciken-emir', 'bayat-plan', 'geride-onceki', 'olcumsuz-is'));
ALTER TABLE arkon_eksik_is_olayi ADD COLUMN nedenler text[] NOT NULL DEFAULT '{}'
  CONSTRAINT arkon_eksik_is_olayi_neden_degeri CHECK (nedenler <@ ARRAY['ayar-yok', 'sayim-yok', 'saglam-yok', 'is-emirsiz', 'rotada-yok']::text[]);
