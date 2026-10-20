-- Kart #651 düzeltmesi (kullanıcı kararı "Geri ver", 12 Ekim): eski Üretim emirleri sayfasını gören her rol /emirler'i de görür;
-- önceki göç yalnız Rota'yı görenlere vermişti, Muhasebe ve Finans emir listesini kaybetmişti. Zaten sahip olan rol atlanır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT e.rol_id, 'sayfa.emirler' FROM rol_islemi e
WHERE e.islem = 'sayfa.uretim-emirleri'
  AND NOT EXISTS (SELECT 1 FROM rol_islemi v WHERE v.rol_id = e.rol_id AND v.islem = 'sayfa.emirler');
