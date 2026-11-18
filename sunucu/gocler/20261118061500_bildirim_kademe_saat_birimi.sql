-- 3418 a: bekleme sayacında Gecikti sınırının birimi (gün ya da saat). Boş olabilir; boş satır gün sayılır, var olan satırlar değişmez.
ALTER TABLE bildirim_kademe_ayari ADD COLUMN k3_birim text CONSTRAINT bildirim_kademe_ayari_k3_birim CHECK (k3_birim IN ('gun', 'saat'));
