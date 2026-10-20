-- İdari İşler filo ve yemek yetkileri (kullanıcı kararları 234 a, 246 a, 247 a; 19.10.2026). Araç görev talebini her çalışan
-- kendi adına açar (arac-talebi-ac, yönetici olmayan bütün roller); günün yemek sayısını bildirmek (yemek-yaz) ile araç kartı,
-- görev onayı ve km (filo-yaz) yalnız idari işlerindir. Müdür 216 a ile okur, yazmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'idari-isler.arac-talebi-ac'
  FROM rol r
 WHERE NOT r.yonetici
ON CONFLICT (rol_id, islem) DO NOTHING;

INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('idari_isler', 'idari-isler.yemek-yaz'), ('idari_isler', 'idari-isler.filo-yaz')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
