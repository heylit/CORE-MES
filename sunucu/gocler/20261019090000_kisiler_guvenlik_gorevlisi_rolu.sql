-- Güvenlik görevlisi rolü açılır (kullanıcı kararları 19.10.2026: 165 a, 182 a). Kapıdaki görevli idari işlerin stok, İK ve
-- mesaj dışı yetkilerini görmez; her çalışanın ortak işlemlerini (izin talebi, bordroyu gördüm, mesaj) alır, stok isteği almaz.
-- Nizamiye işlemleri henüz kayıtlı değildir; Nizamiye modülüyle ayrı göçte bu role ve idari işler ile müdüre verilir.

-- Aynı kodla elle açılmış rol varsa tekil kısıta takılır ve göç durur: rol sahiplenilmez.
INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES ('guvenlik_gorevlisi', 'Güvenlik Görevlisi', true, false);

INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'guvenlik_gorevlisi'), m.islem
  FROM (VALUES
    ('sayfa.ik-islemlerim'), ('ik.izin-talep'), ('ik.bordro-gordum'),
    ('sayfa.mesaj'), ('mesaj.oku'), ('mesaj.yaz')
  ) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
