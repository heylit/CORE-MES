-- İK yeni personelin giriş hesabını açar (kullanıcı kararı 03.11.2026, 1925 a ve teyit). Hesaba verilecek rol sunucuda sınırlıdır:
-- tüm yetkileri veren rol ve rol yönetme, parola değiştirme ya da hesap açma işlemi taşıyan rol İK'ya kapalıdır.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'insan_kaynaklari'), 'ik.hesap-ac'
ON CONFLICT (rol_id, islem) DO NOTHING;
