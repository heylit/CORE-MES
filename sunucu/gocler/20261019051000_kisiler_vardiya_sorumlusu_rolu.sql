-- Vardiya sorumlusu rolü açılır (kullanıcı kararı 19.10.2026, soru 112 b): operatörün yetkileri (Arkon rolü dışında) ile Etiket Merkezi'nde görme ve basma
-- (99, 123). Operatörün satırları kopyalanmaz, açık listeyle yazılır: operatöre elle verilmiş bir satır bu role geçmez.
-- Arkon'da vardiya amiridir (arkon.amir, 126 a): vardiya sorumlusu ile vardiya amiri aynı görevdir. Arkon rolü işlemden çıkar,
-- Arkon tarafında ayrı eşleme yoktur.

-- Aynı kodla elle açılmış rol varsa tekil kısıta takılır ve göç durur: rol sahiplenilmez.
INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES ('vardiya_sorumlusu', 'Vardiya Sorumlusu', true, false);

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'vardiya_sorumlusu'), m.islem
  FROM (VALUES
    ('sayfa.terminal'), ('sayfa.kuyruk'), ('sayfa.uretim-terminali'), ('terminal.uret'), ('arkon.amir'),
    ('sayfa.mesaj'), ('mesaj.oku'), ('mesaj.yaz'), ('stok.istek'),
    ('sayfa.ik-islemlerim'), ('ik.izin-talep'), ('ik.bordro-gordum'),
    ('sayfa.cnc-kurulum'), ('cnc-kurulum.oku'), ('cnc-kurulum.hazirlik-onayla'), ('uretim-emirleri.ara-istasyon'),
    ('sayfa.etiket-merkezi'), ('etiket-merkezi.oku'), ('etiket-merkezi.bas')
  ) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
