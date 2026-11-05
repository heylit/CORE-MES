-- Ortak Dosyalar sayfası bütün rollere açılır (kullanıcı kararı 2067-3 b); kişinin ne gördüğünü klasör düzeyi sunucuda süzer (ADR 0030).
-- Yönetici rolü sayfayı zaten bütün işlemlerle alır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'sayfa.ortak-dosyalar'
  FROM rol r
 WHERE NOT r.yonetici
ON CONFLICT (rol_id, islem) DO NOTHING;
