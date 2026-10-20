-- Birim maliyeti planlama görmez; müdür ve muhasebe/finans görmeye devam eder (kullanıcı kararı 200 a, 19.10.2026).
-- Reçete ve Rota ile OEE ekranı açılır, yalnız maliyet alanları boş gelir; finans.oku ve başka işlem değişmez.
DELETE FROM rol_islemi
 WHERE rol_id = (SELECT id FROM rol WHERE kod = 'planlama_proje')
   AND islem = 'finans.maliyet-oku';
