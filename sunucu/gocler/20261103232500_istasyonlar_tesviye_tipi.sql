-- 2012 a: tesviye kendi istasyon tipidir (el işi; terminal görünümü ayrı kartta). Yalnız CHECK genişler; var olan satırlar değişmez.
ALTER TABLE istasyon
  DROP CONSTRAINT istasyon_tip_degeri,
  ADD CONSTRAINT istasyon_tip_degeri CHECK (tip IN ('talasli', 'kalite', 'depo', 'markalama', 'boya', 'montaj', 'tesviye'));
