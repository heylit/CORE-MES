-- Hizmet çeşitleri (kart #163): üç yeni hizmet grubu. Çeşit, standart ve isterler kartın içinde durur (ekranın HZ_KAT tablosu);
-- burada yalnız grup listesine satır eklenir, çünkü kartın özeti ve süzgeci grubun adını bu tablodan okur.

-- Önce sayar: aynı anahtarlı hizmet grubu varsa göç hiçbir şeyi değiştirmeden durur ve satırları yazar. Var olan satır değişmez.
DO $$
DECLARE
  sayi int;
  liste text;
BEGIN
  SELECT count(*), string_agg(kod, '; ' ORDER BY kod) INTO sayi, liste
    FROM malzeme_kategorisi WHERE tur = 'hizmet' AND kod IN ('yuzey', 'isil', 'muayene');
  IF sayi > 0 THEN
    RAISE EXCEPTION '% hizmet grubu zaten var (%); hizmet çeşidi göçü uygulanmadı (kart #163).', sayi, liste;
  END IF;
END $$;

INSERT INTO malzeme_kategorisi (tur, kod, ad, kisa_kod, yerlesik, aktif) VALUES
  ('hizmet', 'yuzey', 'Yüzey işlem ve kaplama', 'YZY', true, true), ('hizmet', 'isil', 'Isıl işlem', 'ISL', true, true),
  ('hizmet', 'muayene', 'Muayene ve test', 'MYT', true, true);
