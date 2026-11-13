-- 3173 (ADR 0013 eki): sayımın nereden geldiği görünür; SmartES kaynaklı satır SmartES onay kaydının kimliğiyle tür başına bir kez yazılır.
-- Yalnız ekler. Var olan satırların kaynağı bilinmediği için boş kalır (Risk S7: geçmiş "terminal" diye etiketlenmez); tablo yeniden yazılmaz.
ALTER TABLE uretim_sayimi
  ADD COLUMN kaynak text CONSTRAINT uretim_sayimi_kaynak_degeri CHECK (kaynak IN ('terminal', 'smartes')),
  ADD COLUMN kaynak_kimligi bigint CONSTRAINT uretim_sayimi_kaynak_kimligi_pozitif CHECK (kaynak_kimligi > 0),
  ADD CONSTRAINT uretim_sayimi_kaynak_kimlikli CHECK ((kaynak IS NOT DISTINCT FROM 'smartes') = (kaynak_kimligi IS NOT NULL));
CREATE UNIQUE INDEX uretim_sayimi_kaynak_tekil ON uretim_sayimi (kaynak_kimligi, tur) WHERE kaynak_kimligi IS NOT NULL;
