-- Sipariş satırının parça revizyonu (1647; karar 1610 a): satır ilk yazıldığında kalemin malzemesinin yürürlükteki revizyonu. Revizyonun
-- sahibi değişiklik yönetimidir; burada yalnız etiket durur (yabancı anahtar yok). Var olan satırların revizyonu bilinmez, boş kalır.
ALTER TABLE satin_alma_siparis_satiri
  ADD COLUMN parca_revizyonu text CONSTRAINT satin_alma_siparis_satiri_parca_revizyonu_bicimi CHECK (
    parca_revizyonu IS NULL OR (btrim(parca_revizyonu) <> '' AND char_length(parca_revizyonu) <= 20)
  );
