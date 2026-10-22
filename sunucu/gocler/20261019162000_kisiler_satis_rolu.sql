-- Satış rolü açılır (kullanıcı kararı 65 a, 21.10.2026): satışçı teklifi plana dener, termini ve maliyet toplamını görür, kârı seçip fiyat verir.
-- Karar 180 değişir (kullanıcı onayı, 21.10.2026): fiyat ve kârı müdürden başka satış rolü de görür. Maliyet dökümü yalnız müdürdedir.
-- Satışçı firmayı seçer ve görür, yazmaz. Her yerleşik rolün ortak işlemleri (mesaj, malzeme isteği, İK talebi, tesis talebi) açık listeyle yazılır.

-- Aynı kodla elle açılmış rol varsa tekil kısıta takılır ve göç durur: rol sahiplenilmez.
INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES ('satis', 'Satış', true, false);

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'satis'), m.islem
  FROM (VALUES
    ('sayfa.siparisler'), ('siparisler.oku'), ('siparisler.yaz'), ('siparisler.fiyat-oku'), ('siparisler.termin-dene'),
    ('sayfa.musteri-tedarikci'), ('musteri-tedarikci.oku'),
    ('sayfa.mesaj'), ('mesaj.oku'), ('mesaj.yaz'), ('stok.istek'),
    ('sayfa.ik-islemlerim'), ('ik.izin-talep'), ('ik.bordro-gordum'),
    ('sayfa.idari-isler'), ('idari-isler.talep-ac'), ('idari-isler.arac-talebi-ac')
  ) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;

INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'mudur'), m.islem
  FROM (VALUES ('siparisler.termin-dene'), ('siparisler.maliyet-oku')) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
