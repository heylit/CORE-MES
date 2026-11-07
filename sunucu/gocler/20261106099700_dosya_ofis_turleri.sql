-- Ortak Dosyalar ofis belgesi, düz metin ve csv kabul eder (ADR 0030, 9; kart 2195). Yalnız izin verilen tür listesi büyür;
-- var olan satırlar değişmez.
ALTER TABLE dosya DROP CONSTRAINT dosya_tur_degeri;
ALTER TABLE dosya ADD CONSTRAINT dosya_tur_degeri
  CHECK (tur IN ('pdf', 'png', 'jpeg', 'webp', 'step', 'stl', 'iges', 'glb', 'gltf', 'dxf', 'mp4', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'ikili'));
