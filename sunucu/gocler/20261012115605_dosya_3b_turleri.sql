-- Çizim Merkezi atölyedeki 3B modelleri GLB ve glTF, iki boyutlu çizimleri DXF olarak saklar (kart #749): tür listesi yalnız genişler.
ALTER TABLE dosya DROP CONSTRAINT dosya_tur_degeri;
ALTER TABLE dosya ADD CONSTRAINT dosya_tur_degeri
  CHECK (tur IN ('pdf', 'png', 'jpeg', 'webp', 'step', 'stl', 'iges', 'glb', 'gltf', 'dxf'));
