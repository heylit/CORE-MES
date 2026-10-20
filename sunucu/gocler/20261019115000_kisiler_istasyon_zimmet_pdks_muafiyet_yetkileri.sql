-- Rol yetkileri (kullanıcı kararları 253 a, 256 a, 259 a, 263 a, 264 a; 19.10.2026).
-- 253, 263: vardiya sorumlusu ve bakım İstasyonlar sayfasını görür; makine durumunu bakım, vardiya sorumlusu ve müdür değiştirir.
-- İş merkezi ve istasyon tanımı istasyonlar.yaz'da kalır.
-- 256: demirbaş kaydı, zimmetleme ve iadeyi yalnız idari işler yazar; İK'nın eski zimmet yazma yetkisi kalkar, İK salt okur.
-- 259: PDKS dosyasını yalnız insan kaynakları aktarır. 264: hazırlık muafiyetini yalnız müdür verir.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('vardiya_sorumlusu', 'sayfa.istasyonlar'), ('vardiya_sorumlusu', 'istasyonlar.makine-durumu'),
    ('bakim', 'sayfa.istasyonlar'), ('bakim', 'istasyonlar.makine-durumu'),
    ('mudur', 'istasyonlar.makine-durumu'),
    ('idari_isler', 'idari-isler.zimmet-yaz'),
    ('insan_kaynaklari', 'nizamiye.pdks-aktar'),
    ('mudur', 'uretim-emirleri.hazirlik-muaf')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;

DELETE FROM rol_islemi WHERE islem = 'ik.zimmet-yaz';
