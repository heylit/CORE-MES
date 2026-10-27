-- Kart #732 (kararlar 725 a, 743 a; ADR 0009 DS7): Arkon'un dosya deposu (arkon_dosya) ortak dosya deposuna taşınır. İçerik 512 KB
-- parçalara bölünür; tür ilk baytlardan bulunur, tanınmayan içerik (3B ağ dizileri, STL, IGES) 'ikili' olur (Arkon da bunları türsüz
-- verirdi). Yükleyen korunur; her dosya Arkon'un 'depo' kaydına bağlanır. Ortak depoda zaten olan (Çizim Merkezi taşıması) dosyaya
-- yalnız yükleyen ve bağ eklenir. arkon_dosya silinmez (ayrı göç); açık yüklemeler (arkon_dosya_parcasi) Arkon'da kalır.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM arkon_dosya WHERE boyut = 0) THEN
    RAISE EXCEPTION 'arkon_dosya içinde boş dosya var; ortak depo boş dosya kabul etmez, göç durdu.';
  END IF;
END $$;

INSERT INTO dosya (ozet, boyut, tur, ilk_yukleyen_id, zaman, bagsiz_zaman)
SELECT a.ozet, a.boyut,
       CASE
         WHEN substring(a.icerik FROM 1 FOR 5) = '\x255044462d'::bytea THEN 'pdf'
         WHEN substring(a.icerik FROM 1 FOR 8) = '\x89504e470d0a1a0a'::bytea THEN 'png'
         WHEN substring(a.icerik FROM 1 FOR 3) = '\xffd8ff'::bytea THEN 'jpeg'
         WHEN substring(a.icerik FROM 1 FOR 4) = '\x52494646'::bytea AND substring(a.icerik FROM 9 FOR 4) = '\x57454250'::bytea THEN 'webp'
         WHEN substring(a.icerik FROM 1 FOR 12) = convert_to('ISO-10303-21', 'LATIN1') THEN 'step'
         WHEN substring(a.icerik FROM 1 FOR 4) = convert_to('glTF', 'LATIN1') THEN 'glb'
         ELSE 'ikili'
       END,
       a.yukleyen_id, a.zaman, NULL
  FROM arkon_dosya a
 WHERE NOT EXISTS (SELECT 1 FROM dosya d WHERE d.ozet = a.ozet);

INSERT INTO dosya_icerigi (ozet, sira, icerik)
SELECT a.ozet, s.sira, substring(a.icerik FROM s.sira * 524288 + 1 FOR 524288)
  FROM arkon_dosya a
  CROSS JOIN LATERAL generate_series(0, (a.boyut - 1) / 524288) AS s(sira)
 WHERE NOT EXISTS (SELECT 1 FROM dosya_icerigi i WHERE i.ozet = a.ozet);

INSERT INTO dosya_yukleyeni (ozet, kisi_id, zaman)
SELECT ozet, yukleyen_id, zaman FROM arkon_dosya
ON CONFLICT DO NOTHING;

INSERT INTO dosya_bagi (ozet, modul, kayit, ad, belge_turu, ekleyen_id, zaman)
SELECT ozet, 'arkon', 'depo', ozet, NULL, yukleyen_id, zaman FROM arkon_dosya
ON CONFLICT DO NOTHING;

UPDATE dosya d SET bagsiz_zaman = NULL
 WHERE d.bagsiz_zaman IS NOT NULL AND EXISTS (SELECT 1 FROM arkon_dosya a WHERE a.ozet = d.ozet);
