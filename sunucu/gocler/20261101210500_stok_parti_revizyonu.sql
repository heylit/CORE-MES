-- Partinin parça revizyonu (1647; karar 1610 a): parti açıldığı anda yürürlükteki revizyon. Revizyonun sahibi değişiklik yönetimidir; burada
-- yalnız etiket durur (yabancı anahtar yok). Var olan partilerin revizyonu bilinmez, boş kalır; uydurulmaz.
ALTER TABLE stok_parti
  ADD COLUMN parca_revizyonu text CONSTRAINT stok_parti_parca_revizyonu_bicimi CHECK (
    parca_revizyonu IS NULL OR (btrim(parca_revizyonu) <> '' AND char_length(parca_revizyonu) <= 20)
  );
