-- 3337-3 a: refakat kartı belirli bir parça adedi için açılır; adet açılışta bir kez yazılır, değişmez. Eski kartta boş (eski sınır hesabı).
ALTER TABLE stok_refakat_partisi ADD COLUMN adet int CONSTRAINT stok_refakat_partisi_adet_pozitif CHECK (adet IS NULL OR adet > 0);
-- Yazılmış adet değişmez: kartın toplamı sabittir, dağılım sayımdan gelir.
CREATE FUNCTION stok_refakat_partisi_adet_sabit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.adet IS NOT NULL AND NEW.adet IS DISTINCT FROM OLD.adet THEN
    RAISE EXCEPTION 'stok_refakat_partisi adedi değişmez' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stok_refakat_partisi_adet_sabit BEFORE UPDATE OF adet ON stok_refakat_partisi
  FOR EACH ROW EXECUTE FUNCTION stok_refakat_partisi_adet_sabit();
