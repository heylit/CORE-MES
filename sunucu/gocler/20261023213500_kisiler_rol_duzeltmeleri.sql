-- Rol düzeltmeleri (kullanıcı kararı 237, 23.10.2026; Portal erişimi 267 a, termin onayı 272 1a).
-- Portal'daki "Satış müdürü" onayı satışçıya geçer (237.1): satış Portal'ı açar ve satış bölümünü alır, sevkiyat satış bölümünü bırakır.
-- Sevkiyatın Portal sayfası ve okuma, yazma işlemi kalır; Portal'da bölümsüz rolle görünür.
-- Satış kendi siparişinin sevk ve proje durumunu sayfasız okur (237.2). Müdür rotadan emir açar (237.5): emir açıp iptal edebilen rol rotadan da kopyalar.
-- Termin onayı plancının `plan.yaz` işleminden ayrılır (237.3): müdürde `plan.yaz` yoktur. Ayrı işlemdir; teklifi plana deneyen `siparisler.termin-dene`
-- onayı kendiliğinden vermez. Müdür, planlama ve satış onaylar (272 1a).

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('satis', 'sayfa.portal'),
    ('satis', 'portal.oku'),
    ('satis', 'portal.yaz'),
    ('satis', 'portal.satis'),
    ('satis', 'projeler.oku'),
    ('satis', 'sevkiyat.oku'),
    ('mudur', 'rota.emre-kopyala'),
    ('mudur', 'siparisler.termin-onayla'),
    ('planlama_proje', 'siparisler.termin-onayla'),
    ('satis', 'siparisler.termin-onayla')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;

-- Yalnız rol satırı alınır; Yetkiler ekranından kişiye verilmiş ek işlem (`kisi_islemi`) değişmez.
DELETE FROM rol_islemi
 WHERE rol_id = (SELECT id FROM rol WHERE kod = 'sevkiyat') AND islem = 'portal.satis';
