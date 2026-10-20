-- İskonto sınırını aşan teklif sürümünü yalnız müdür onaylar (kullanıcı kararı 291 a, 20.10.2026). Yönetici bayraklı rol bütün kayıtlı
-- işlemleri kendiliğinden alır; hiçbir rolden işlem alınmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT id, 'siparisler.iskonto-onayla' FROM rol WHERE kod = 'mudur'
ON CONFLICT (rol_id, islem) DO NOTHING;
