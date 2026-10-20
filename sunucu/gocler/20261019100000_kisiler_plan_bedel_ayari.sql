-- Plan öncelik ayarlarını (taban bedel, oranlar, eşikler) yalnız yönetici ve müdür değiştirir (kullanıcı kararı 210, 19.10.2026).
-- Yönetici bayraklı rol bütün kayıtlı işlemleri kendiliğinden alır; satır yalnız müdüre eklenir, hiçbir rolden işlem alınmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES ('mudur', 'plan.bedel-ayari')) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
