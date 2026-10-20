-- Salonlar fabrika bölümüdür ve tek fabrika planında durur: bölümün sol üst köşesinin fabrika planındaki yeri (metre)
-- ve bölümün o köşe çevresindeki dönüşü. Bölüm içindeki her şey bölümün kendi ekseninde kalır; fabrika noktası
-- [x, z] = [fabrika_x, fabrika_z] + döndür(fabrika_donus) * [bölüm x, bölüm z]. Var olan bölümler soldan sağa,
-- aralarında 5 m boşlukla dizilerek başlar (kod sırasıyla; yalnız yerleşim, veri girmez).

ALTER TABLE atolye_salon
  ADD COLUMN fabrika_x numeric(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN fabrika_z numeric(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN fabrika_donus numeric(4, 1) NOT NULL DEFAULT 0,
  ADD CONSTRAINT atolye_salon_fabrika_konumu CHECK (abs(fabrika_x) <= 99999 AND abs(fabrika_z) <= 99999),
  ADD CONSTRAINT atolye_salon_fabrika_donus CHECK (fabrika_donus >= 0 AND fabrika_donus < 360);

-- Sürüm tetikleyicisi her güncellemede sürümün birer artmasını ister: dizme sürümü artırır (kayıtla aynı kural).
UPDATE atolye_salon s
   SET fabrika_x = d.x, surum = s.surum + 1
  FROM (SELECT id, COALESCE(sum(genislik + 5) OVER (ORDER BY kod ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS x
          FROM atolye_salon) d
 WHERE d.id = s.id AND d.x <> 0;
