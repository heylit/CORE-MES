-- 3611: hazırlık görevi (emir, madde) başına tek görev olur; iş emirleri görevin adımıdır. Bağ yalnız eklenen sütundur: var olan görev ve
-- adım satırına dokunulmaz, eski biçim (iş emri başına görev) okunmaya devam eder. İş emri Üretim Emirleri'nindir: yabancı anahtar yok.
ALTER TABLE projeler_gorev_adimi
  ADD COLUMN hazirlik_is_emri_id int;

-- Görevde aynı iş emri için tek hazırlık adımı olur: iş emri sonradan eklenince ya da döngü tekrar koşunca adım çoğalmaz.
CREATE UNIQUE INDEX projeler_gorev_adimi_is_emri_tekil ON projeler_gorev_adimi (gorev_id, hazirlik_is_emri_id)
  WHERE hazirlik_is_emri_id IS NOT NULL;
