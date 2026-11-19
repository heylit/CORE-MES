-- 3429-3 G: sipariş kaleminin termini emrin tesliminden farklı olunca çıkan önerinin kararı (uygula ya da yoksay). Yeni tablo; var olan
-- tablo ve satır değişmez. Karar o termin ve kararın verildiği teslim içindir: ikisinden biri değişirse öneri yeniden çıkar; aynı çifte
-- ikinci karar yazılmaz.
CREATE TABLE uretim_emri_termin_karari (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL CONSTRAINT uretim_emri_termin_karari_emir REFERENCES uretim_emri (id) ON DELETE CASCADE,
  termin date NOT NULL,
  karar text NOT NULL CONSTRAINT uretim_emri_termin_karari_deger CHECK (karar IN ('uygula', 'yoksay')),
  eski_teslim date,
  kisi_id int NOT NULL CONSTRAINT uretim_emri_termin_karari_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uretim_emri_termin_karari_tek ON uretim_emri_termin_karari (uretim_emri_id, termin, eski_teslim) NULLS NOT DISTINCT;
