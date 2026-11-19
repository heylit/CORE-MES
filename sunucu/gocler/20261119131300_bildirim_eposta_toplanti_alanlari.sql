-- 3448 (onay a; ADR 0015 md 6 eki): toplantı davetinin e-postası başlık, saat aralığı, yer ve düzenleyeni taşır. Yalnız boş olabilen
-- sütunlar eklenir; var olan kuyruk satırı değişmez. Alanları yalnız `toplantilar.` türleri doldurur (bildirim kurallar.ts).
ALTER TABLE bildirim_eposta_kuyrugu
  ADD COLUMN kayit_basligi text CONSTRAINT bildirim_eposta_kuyrugu_kayit_basligi_gecerli CHECK (kayit_basligi IS NULL OR length(kayit_basligi) <= 200),
  ADD COLUMN zaman_araligi text CONSTRAINT bildirim_eposta_kuyrugu_zaman_araligi_gecerli CHECK (zaman_araligi IS NULL OR length(zaman_araligi) <= 120),
  ADD COLUMN yer text CONSTRAINT bildirim_eposta_kuyrugu_yer_gecerli CHECK (yer IS NULL OR length(yer) <= 120),
  ADD COLUMN duzenleyen text CONSTRAINT bildirim_eposta_kuyrugu_duzenleyen_gecerli CHECK (duzenleyen IS NULL OR length(duzenleyen) <= 120);
