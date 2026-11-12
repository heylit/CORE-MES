-- 3078 b: "Logo geçişi" sayfasını malzeme kartı açabilen (malzemeler.yaz) her rol görür. Sayfa yalnız menü görünürlüğüdür;
-- alma ve bağlama yine malzemeler.yaz, "Şimdi oku" ve "Geçişi bitir" ayarlar.yaz ister. Bu göçten sonra malzemeler.yaz verilen rol
-- sayfayı kendiliğinden almaz; Yetkiler ekranından verilir. Yalnız satır ekler; elle verilmiş satır olduğu gibi kalır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT DISTINCT ri.rol_id, 'sayfa.logo-gecisi'
  FROM rol_islemi ri
 WHERE ri.islem = 'malzemeler.yaz'
ON CONFLICT DO NOTHING;
