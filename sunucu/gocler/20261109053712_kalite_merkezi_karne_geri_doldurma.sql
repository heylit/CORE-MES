-- Yazılan tablo musteri-tedarikci'nin (musteri_tedarikci_karne_olayi); olay kaynağı kalite-merkezi.
-- Kart 2406: giriş kontrolü kararları tedarikçi karnesine lot olayı yazmıyordu (1259 c); bu göç o kural gelmeden verilmiş kararları bir
-- kere doldurur. Şema değişmez, yalnız satır eklenir. Eşleme kalite-merkezi kurallar.ts girisKarneKarari ile aynıdır: hatalısız GKK
-- kabul; hatalı lotun kalite kararı kabul -> hatali_kabul, sartli_kabul -> sartli_kabul, red -> red; karar bekleyen lot olay vermez.
-- Firması olmayan sipariş satırı ve düzeltilmiş mal kabul atlanır (ekrandaki giriş kontrolü listesiyle aynı). Yeniden koşarsa
-- (kaynak, anahtar) tekilliği satırı düşürür; sunucunun yazdığı olaya dokunmaz.
WITH gkk AS (
  SELECT g.mal_kabul_satiri_id, g.hatali_miktar, g.zaman FROM kalite_merkezi_giris_karari g WHERE g.asama = 'gkk'
),
karar AS (
  SELECT k.mal_kabul_satiri_id, k.karar, k.zaman FROM kalite_merkezi_giris_karari k WHERE k.asama = 'karar'
),
lot AS (
  SELECT g.mal_kabul_satiri_id,
         CASE WHEN g.hatali_miktar <= 0 THEN 'kabul'
              WHEN k.karar = 'kabul' THEN 'hatali_kabul'
              WHEN k.karar = 'sartli_kabul' THEN 'sartli_kabul'
              WHEN k.karar = 'red' THEN 'red' END AS lot_karari,
         CASE WHEN g.hatali_miktar <= 0 THEN g.zaman ELSE k.zaman END AS zaman
    FROM gkk g LEFT JOIN karar k ON k.mal_kabul_satiri_id = g.mal_kabul_satiri_id
)
INSERT INTO musteri_tedarikci_karne_olayi (firma_id, kaynak, anahtar, tur, zaman, lot_karari)
SELECT q.firma_id, 'kalite-merkezi', 'giris:' || l.mal_kabul_satiri_id, 'lot', l.zaman, l.lot_karari
  FROM lot l
  JOIN stok_mal_kabul_satiri s ON s.id = l.mal_kabul_satiri_id
  JOIN stok_mal_kabul m ON m.id = s.mal_kabul_id
  JOIN satin_alma_siparis_satiri ss ON ss.id = s.siparis_satir_id
  JOIN satin_alma_teklif q ON q.talep_id = ss.talep_id AND q.id = ss.teklif_id
 WHERE l.lot_karari IS NOT NULL AND q.firma_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM stok_mal_kabul d WHERE d.duzeltilen_id = m.id)
 ORDER BY l.mal_kabul_satiri_id
ON CONFLICT (kaynak, anahtar) DO NOTHING;
