-- Kart #732, karar 743 a: imzasız ikili içerik (Arkon'un 3B ağ dizileri gibi) ortak depoya 'ikili' türüyle girer. Yalnız modülün
-- kendi yükleme şeridinden yazılır; kişinin yükleme ucu türü içerikten bulamazsa yine reddeder. Var olan satırlar değişmez.
ALTER TABLE dosya DROP CONSTRAINT dosya_tur_degeri;
ALTER TABLE dosya ADD CONSTRAINT dosya_tur_degeri
  CHECK (tur IN ('pdf', 'png', 'jpeg', 'webp', 'step', 'stl', 'iges', 'glb', 'gltf', 'dxf', 'ikili'));
