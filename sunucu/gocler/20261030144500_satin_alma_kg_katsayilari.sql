-- 1352 a (kullanıcı teyidi 30.10.2026): kg fiyatı girişine endüstriyel işlem ve aracı maliyeti katsayısı. Çarpandır (1 etkisiz);
-- boşsa bilinmiyor sayılır, 1 sayılmaz. Etkin kg fiyatı = kg fiyatı x işlem x aracı, ikisi de yazılıysa. Maliyet ve stok değeri
-- hesapları bu göçle değişmez (bağlama ayrı kart). Eski satırlar boş kalır; sütun eklemek yalnız ekleme tetikleyicisini çalıştırmaz.
ALTER TABLE satin_alma_kg_fiyati
  ADD COLUMN islem_katsayisi numeric(10, 4) CONSTRAINT satin_alma_kg_fiyati_islem_katsayisi CHECK (islem_katsayisi > 0 AND islem_katsayisi <= 100),
  ADD COLUMN araci_katsayisi numeric(10, 4) CONSTRAINT satin_alma_kg_fiyati_araci_katsayisi CHECK (araci_katsayisi > 0 AND araci_katsayisi <= 100);
