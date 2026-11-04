-- 2099-5 a (teyit, kart 2099): son kullanma tarihi geçmiş lotun çıkış onayı ve lotun SKT düzeltmesi ayrı işlemdir, yalnız müdürdedir.
-- Kişiye verilmiş ek işlemlere (kisi_islemi) dokunulmaz; yönetici bayraklı roldür, satır taşımaz.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'stok.skt-onayla')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
