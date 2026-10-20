-- Siparişler sayfası menüde siparişi okuyabilen rollerde görünür (kullanıcı kararı 193 a, 19.10.2026): okuma yetkisiyle aynı roller.
-- Yalnız ekler, hiçbir rolden işlem almaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), 'sayfa.siparisler'
  FROM (VALUES ('mudur'), ('planlama_proje'), ('muhasebe_finans'), ('sevkiyat'), ('depo'), ('kalite')) AS m (kod)
ON CONFLICT (rol_id, islem) DO NOTHING;
