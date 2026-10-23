-- Ortak yetki matrisi (kullanıcı kararı 195 a, 23.10.2026; 353 a ve 65 a ile çelişme onaylı; sayım düzeltmesi 185 a;
-- sevkiyatın firma okuması 201 a).
-- Yalnız ekler, hiçbir rolden işlem almaz; Arkon rolleri değişmez. Yönetici rolü bütün işlemleri zaten taşır.
-- Sayım düzeltmesi müdüre verilmez: 185 a yalnız yönetici ve vardiya sorumlusunu sayar, `arkon.amir` müdürde de olduğu için ayrı işlemdir.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    -- Planlama motoru, atölyesi ve öteki planlama sayfaları; maliyet sayfaları ayrıca `finans.maliyet-oku` ister.
    ('mudur', 'recete-rota.planlama-oku'),
    ('planlama_proje', 'recete-rota.planlama-oku'),
    ('mudur', 'sayfa.uretim-terminali'),
    -- Firma seçicisi ve tedarikçi; finans rakamı görünmez.
    ('kalite', 'musteri-tedarikci.oku'),
    ('sevkiyat', 'musteri-tedarikci.oku'),
    -- Faturayı siparişle ve proje maliyetiyle karşılaştırma.
    ('muhasebe_finans', 'siparisler.fiyat-oku'),
    ('muhasebe_finans', 'sayfa.projeler'),
    ('vardiya_sorumlusu', 'sayfa.vardiya'),
    ('vardiya_sorumlusu', 'vardiya.yaz'),
    ('vardiya_sorumlusu', 'uretim-emirleri.sayim-duzelt')
  ) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
