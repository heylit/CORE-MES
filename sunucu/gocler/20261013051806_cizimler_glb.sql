-- Çizim Merkezi 3B model belgesine GLB ve glTF alır (kart #921, CZ-03): revizyonun dosya türü listesi yalnız genişler, satır değişmez.
ALTER TABLE cizimler_revizyon DROP CONSTRAINT cizimler_revizyon_dosya_turu;
ALTER TABLE cizimler_revizyon ADD CONSTRAINT cizimler_revizyon_dosya_turu
  CHECK (dosya_turu IN ('pdf', 'png', 'jpeg', 'webp', 'step', 'stl', 'iges', 'glb', 'gltf'));
