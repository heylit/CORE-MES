-- Ana sayfanın şirket özeti bölümünü yalnız yönetici ve müdür görür (kullanıcı kararı 73 b, 22.10.2026); bölüm kartları ayrıca
-- kendi okuma işlemini ister. Yönetici bayraklı rol bütün kayıtlı işlemleri kendiliğinden alır; hiçbir rolden işlem alınmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT id, 'pano.sirket-ozeti' FROM rol WHERE kod = 'mudur'
ON CONFLICT (rol_id, islem) DO NOTHING;
