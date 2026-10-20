-- İdari İşler yetkileri (kullanıcı kararı 216 a, 19.10.2026). Bütün personel kendi tesis talebini açar ve izler; talepleri
-- ve periyodik kontrolleri idari işler ile müdür görür; talebi yönetmek ve kontrol ya da atık kaydı girmek idari işlerdedir.
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, m.islem
  FROM rol r CROSS JOIN (VALUES ('sayfa.idari-isler'), ('idari-isler.talep-ac')) AS m (islem)
 WHERE NOT r.yonetici
ON CONFLICT (rol_id, islem) DO NOTHING;

INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('idari_isler', 'idari-isler.oku'), ('idari_isler', 'idari-isler.talep-yonet'), ('idari_isler', 'idari-isler.kontrol-yaz'),
    ('mudur', 'idari-isler.oku')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
