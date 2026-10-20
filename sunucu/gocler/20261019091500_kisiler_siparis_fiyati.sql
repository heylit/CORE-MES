-- Sipariş ve teklif fiyatını, tutarı ve kârı yalnız yönetici ve müdür görür (kullanıcı kararı 180, 19.10.2026).
-- Yönetici bayraklı rol bütün kayıtlı işlemleri kendiliğinden alır; satır yalnız müdüre eklenir, hiçbir rolden işlem alınmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES ('mudur', 'siparisler.fiyat-oku')) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
