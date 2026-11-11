-- 3030 a: 3D Atolyesi'nde yeniden hesaplama CAM ve Kalite'de, boya ve maske kaydi yalniz CAM'da, Mudur yalniz okur.
-- 1706 a bu kadariyla gevser. Yalniz satir ekler; veri silmez, donusturmez. Yonetici Yetkiler ekranindan ayni satiri vermis
-- olabilir; o satir oldugu gibi kalir, goc durmaz.

INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, y.islem
  FROM (VALUES
    ('cam', 'geometri.hesapla'), ('cam', 'geometri.yuzey-yaz'),
    ('kalite', 'geometri.hesapla'),
    ('mudur', 'sayfa.geometri'), ('mudur', 'geometri.oku')
  ) AS y(rol, islem)
  JOIN rol r ON r.kod = y.rol
ON CONFLICT DO NOTHING;
