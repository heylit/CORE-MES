-- Takım değişimini ve kullanım düzeltmesini operatör, vardiya sorumlusu, CAM, bakım ve müdür kaydeder (kullanıcı kararı 300 a,
-- 20.10.2026). Yönetici bayraklı rol bütün kayıtlı işlemleri kendiliğinden alır; hiçbir rolden işlem alınmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT id, 'cnc-kurulum.takim-degistir' FROM rol WHERE kod IN ('operator', 'vardiya_sorumlusu', 'cam', 'bakim', 'mudur')
ON CONFLICT (rol_id, islem) DO NOTHING;
