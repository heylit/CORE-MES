-- Sevkiyat rol x işlem satırları ve yerleşik Sevkiyat rolü (kullanıcı onayı, 11 Ekim, kart #598). Planlama iş ve plan
-- yazar; depo ve Sevkiyat rolü ayrıca onaylar ve nokta/araç tanımlar; Sevkiyat rolü depo ile eş olarak stok sayfasını da açar;
-- öbür roller okur. Yönetici her işlemi bayrakla taşır, satır yazılmaz.
-- Aynı kodla elle açılmış rol tekilliğe takılır ve göç durur: elle rolü sahiplenmez.
INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES ('sevkiyat', 'Sevkiyat', true, false);

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('planlama_proje', 'sayfa.sevkiyat'), ('planlama_proje', 'sevkiyat.oku'), ('planlama_proje', 'sevkiyat.is-yaz'),
    ('planlama_proje', 'sevkiyat.plan-yaz'),
    ('depo', 'sayfa.sevkiyat'), ('depo', 'sevkiyat.oku'), ('depo', 'sevkiyat.is-yaz'), ('depo', 'sevkiyat.plan-yaz'),
    ('depo', 'sevkiyat.onayla'), ('depo', 'sevkiyat.tanim-yaz'),
    ('sevkiyat', 'sayfa.stok'), ('sevkiyat', 'sayfa.sevkiyat'), ('sevkiyat', 'sevkiyat.oku'), ('sevkiyat', 'sevkiyat.is-yaz'),
    ('sevkiyat', 'sevkiyat.plan-yaz'), ('sevkiyat', 'sevkiyat.onayla'), ('sevkiyat', 'sevkiyat.tanim-yaz'),
    ('mudur', 'sayfa.sevkiyat'), ('mudur', 'sevkiyat.oku'),
    ('kalite', 'sayfa.sevkiyat'), ('kalite', 'sevkiyat.oku'),
    ('insan_kaynaklari', 'sayfa.sevkiyat'), ('insan_kaynaklari', 'sevkiyat.oku'),
    ('satin_alma', 'sayfa.sevkiyat'), ('satin_alma', 'sevkiyat.oku'),
    ('muhasebe_finans', 'sayfa.sevkiyat'), ('muhasebe_finans', 'sevkiyat.oku'),
    ('idari_isler', 'sayfa.sevkiyat'), ('idari_isler', 'sevkiyat.oku'),
    ('cam', 'sayfa.sevkiyat'), ('cam', 'sevkiyat.oku'),
    ('operator', 'sayfa.sevkiyat'), ('operator', 'sevkiyat.oku')
  ) AS m (kod, islem);
