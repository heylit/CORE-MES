-- Rol x işlem tek tablosu (kullanıcı kararları 19.10.2026: 139 a, 160 a ve 186 a; tablo
-- inceleme/rol-matrisi/2026-10-19-rol-islem-tablosu.md). Yalnız ekler, hiçbir rolden işlem almaz; Arkon rolleri değişmez.
-- Şartlı kabul ve fason yazma işlemleri henüz kayıtlı değildir; modülleri gelince kendi göçleriyle girer.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    -- Kalite Merkezi: kalite yazar ve onaylar, müdür görür ve onaylar; geri yükleme yalnız yönetici.
    ('kalite', 'kalite-merkezi.yaz'),
    ('kalite', 'kalite-merkezi.onayla'),
    ('mudur', 'sayfa.kalite-merkezi'),
    ('mudur', 'kalite-merkezi.oku'),
    ('mudur', 'kalite-merkezi.onayla'),
    -- Duruş nedenleri listesi.
    ('mudur', 'sayfa.durus-nedenleri'),
    ('mudur', 'durus-nedenleri.yaz'),
    ('planlama_proje', 'sayfa.durus-nedenleri'),
    ('planlama_proje', 'durus-nedenleri.yaz'),
    -- Çizim Merkezi: müdür, kalite ve CAM görür; CAM yazar (CNC kurulumdan çizime aktarım da bununla açılır), kalite yayınlar.
    ('mudur', 'sayfa.cizimler'),
    ('mudur', 'cizimler.oku'),
    ('kalite', 'sayfa.cizimler'),
    ('kalite', 'cizimler.oku'),
    ('kalite', 'cizimler.yayinla'),
    ('cam', 'sayfa.cizimler'),
    ('cam', 'cizimler.oku'),
    ('cam', 'cizimler.yaz'),
    -- SmartES ekranları yalnız okunur; eşleme yazma yalnız yönetici.
    ('mudur', 'sayfa.smartes'),
    ('planlama_proje', 'sayfa.smartes'),
    -- Plan kilidi ve stüdyo planlama ile müdürde; müdür senaryoyu canlıya da alır.
    ('planlama_proje', 'plan.kilitle'),
    ('planlama_proje', 'plan.studyo'),
    ('mudur', 'plan.kilitle'),
    ('mudur', 'plan.studyo'),
    ('mudur', 'plan.canliya-al'),
    -- Rota talimatını işi tarif eden yazar.
    ('planlama_proje', 'rota.talimat-yaz'),
    ('cam', 'rota.talimat-yaz'),
    -- Siparişler: teklif için ayrı işlem yok; onay, kapatma ve iptal yalnız müdür. Satın alma almaz.
    ('mudur', 'siparisler.oku'),
    ('mudur', 'siparisler.yaz'),
    ('mudur', 'siparisler.onayla'),
    ('planlama_proje', 'siparisler.oku'),
    ('planlama_proje', 'siparisler.yaz'),
    ('muhasebe_finans', 'siparisler.oku'),
    ('muhasebe_finans', 'siparisler.yaz'),
    ('sevkiyat', 'siparisler.oku'),
    ('depo', 'siparisler.oku'),
    ('kalite', 'siparisler.oku'),
    -- Siparişi gören rol bağlı projeleri de görür (186 a); yalnız okuma, menüye Projeler eklenmez.
    ('muhasebe_finans', 'projeler.oku'),
    ('sevkiyat', 'projeler.oku')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
