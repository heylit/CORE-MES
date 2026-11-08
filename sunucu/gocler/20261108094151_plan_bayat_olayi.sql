-- 2319 (2311 S7, 2327-1 a): canlı planı eskiten saha olayları; yalnız işarettir, plan değişmez. rota-degisti: emrin adımı eklendi ya da değişti. Emir bitti ve fason dönüşü olay anında yazılır (dinleyici
-- komutla aynı işlemde); makine duruşu istasyonların makine durumundan okunur, burada tutulmaz. Kaynak kimlikleri sahibi modülün tablosuna
-- yabancı anahtarla bağlanmaz (etiket_merkezi_atlanan gibi): bitir ve fason dönüşü komutunun işleminde emir satırına kilit ve FK denetimi
-- eklenmesin, emir silinse de işaret satırı zarar vermez (son canlıya almadan eskisi okunmaz). Yalnız eklenir, silinmez; büyüme emir bitişi ve
-- fason dönüşü sayısı kadardır (olay başına bir satır). Dizinler: tekil (aynı olay iki kez yazılmaz, ON CONFLICT) ve zaman (okuma yalnız son
-- canlıya almadan sonrasını tarar).
CREATE TABLE plan_bayat_olayi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  neden text NOT NULL CONSTRAINT plan_bayat_olayi_neden CHECK (neden IN ('emir-bitti', 'fason-donusu', 'rota-degisti')),
  uretim_emri_id int NOT NULL CONSTRAINT plan_bayat_olayi_emir CHECK (uretim_emri_id > 0),
  -- Fason dönüşünde hareket kimliği; emir bittide null.
  kaynak_id int CONSTRAINT plan_bayat_olayi_kaynak CHECK (kaynak_id IS NULL OR kaynak_id > 0),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX plan_bayat_olayi_tekil ON plan_bayat_olayi (neden, uretim_emri_id, COALESCE(kaynak_id, 0));
CREATE INDEX plan_bayat_olayi_zaman ON plan_bayat_olayi (zaman);
