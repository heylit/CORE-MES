-- Kart #746 (kullanıcı kararı: tek seferlik göç): Arkon çizim ve iş paketlerindeki dosyalar ile atölye haritasının
-- krokileri Çizim Merkezi'ne bir kez kopyalanır. Kaynak tablolar değişmez (yalnız okunur); kaynak modüller kendi dosyalarını
-- kullanmayı sürdürür, bağlamada (Aşama 2) merkezden okumaya geçer.
-- Her farklı içerik tek belge olur, yayında A revizyonuyla. Merkezde aynı özetli revizyon varsa dosya atlanır.
-- Tür içerikten bulunur (dosya modülünün turBul kuralı): PDF teknik resim, STEP/STL/IGES 3B model; başkası (ör. örnek paketin
-- sahte baytları) atlanır. Atölye 3B modelleri GLB'dir; dosya modülü GLB almadığı için taşınmaz (CEKIRDEK-ISTEKLERI C1).
-- Yardımcı işlevler yalnız bu göç içindir, sonunda silinir (veritabanı rolünün geçici şema hakkı yoktur).
-- Yükleyen ve yayınlayan kaynak kaydın son yazanıdır (Arkon degistiren_id, atölye kaydeden_kisi_id); zaman da onun zamanıdır.

CREATE FUNCTION cizimler_tasima_tur_bul(b bytea) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN substring(b FROM 1 FOR 5) = convert_to('%PDF-', 'LATIN1') THEN 'pdf'
    WHEN substring(b FROM 1 FOR 12) = convert_to('ISO-10303-21', 'LATIN1') THEN 'step'
    -- İkili STL'nin imzası yoktur; boyut üçgen sayısıyla tutarsa STL'dir.
    WHEN length(b) >= 84 AND length(b) = 84 + 50 * (get_byte(b, 80) + get_byte(b, 81) * 256 + get_byte(b, 82) * 65536
                                                   + get_byte(b, 83)::bigint * 16777216) THEN 'stl'
    -- IGES başlangıç bölümü: 73. sütun 'S', ardından sıra numarası 1. escape kodlaması sıfır baytı metne çevirir.
    WHEN length(b) >= 80 AND get_byte(b, 72) = 83 AND encode(substring(b FROM 74 FOR 7), 'escape') ~ '^ *0*1$' THEN 'iges'
    WHEN encode(substring(b FROM 1 FOR 80), 'escape') ~ '^\s*solid[ \t\r\n]' THEN 'stl'
  END
$$;

-- Dosyayı `dosya` tablolarına yazar (varsa yalnız bağlı sayar), belgeyi, yayındaki A revizyonunu ve dosya bağını açar.
CREATE FUNCTION cizimler_tasima_belge_ac(icerik bytea, dosya_adi text, belge_turu text, dosya_turu text, aciklama text, kisi int, zaman timestamptz)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  oz text := encode(sha256(icerik), 'hex');
  ad_ text := left(btrim(dosya_adi), 120);
  belge int;
BEGIN
  IF ad_ = '' THEN ad_ := 'Adsız dosya'; END IF;
  INSERT INTO dosya (ozet, boyut, tur, ilk_yukleyen_id, zaman, bagsiz_zaman)
  VALUES (oz, length(icerik), dosya_turu, kisi, zaman, NULL)
  ON CONFLICT (ozet) DO UPDATE SET bagsiz_zaman = NULL;
  IF NOT EXISTS (SELECT 1 FROM dosya_icerigi WHERE ozet = oz) THEN
    INSERT INTO dosya_icerigi (ozet, sira, icerik)
    SELECT oz, s, substring(icerik FROM s * 524288 + 1 FOR 524288)
      FROM generate_series(0, (length(icerik) - 1) / 524288) AS s;
  END IF;
  INSERT INTO dosya_yukleyeni (ozet, kisi_id, zaman) VALUES (oz, kisi, zaman) ON CONFLICT DO NOTHING;

  INSERT INTO cizimler_belge (ad, tur, aciklama, olusturan_id, olusturuldu, guncellendi)
  VALUES (ad_, belge_turu, left(aciklama, 500), kisi, zaman, zaman) RETURNING id INTO belge;
  INSERT INTO cizimler_revizyon (belge_id, sira, ozet, dosya_turu, durum, yukleyen_id, yuklendi, yayinlayan_id, yayinlandi)
  VALUES (belge, 1, oz, dosya_turu, 'yayinda', kisi, zaman, kisi, zaman);
  INSERT INTO dosya_bagi (ozet, modul, kayit, ad, belge_turu, ekleyen_id, zaman)
  VALUES (oz, 'cizimler', belge::text, ad_, belge_turu, kisi, zaman);
  RETURN belge;
END $$;

DO $$
DECLARE
  f record;
  k record;
  icerik bytea;
  tur text;
  belge int;
BEGIN
  -- Çizimler önce gelir: aynı dosya pakette de varsa açıklama çizimden alınır.
  FOR f IN
    SELECT b.depo, b.degistiren_id, b.degisti, d.e AS dosya,
           btrim(coalesce(CASE WHEN b.depo = 'draws' THEN b.govde ->> 'name'
                               ELSE coalesce(b.govde ->> 'partNo', b.govde ->> 'part', b.govde ->> 'no') END, '')) AS kaynak_adi
      FROM arkon_belge b
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b.govde -> 'files') = 'array' THEN b.govde -> 'files' ELSE '[]'::jsonb END) AS d(e)
     WHERE b.depo IN ('draws', 'pkgs') AND jsonb_typeof(b.govde) = 'object'
     ORDER BY b.depo = 'draws' DESC, b.degisti, b.kimlik
  LOOP
    CONTINUE WHEN jsonb_typeof(f.dosya) <> 'object' OR jsonb_typeof(f.dosya -> 'bytes') IS DISTINCT FROM 'object';
    icerik := NULL;
    IF jsonb_typeof(f.dosya -> 'bytes' -> '$blob') = 'string' THEN
      SELECT a.icerik INTO icerik FROM arkon_dosya a WHERE a.ozet = f.dosya -> 'bytes' ->> '$blob';
    ELSIF coalesce(f.dosya -> 'bytes' ->> 'b', '') ~ '^[A-Za-z0-9+/]*={0,2}$' AND length(f.dosya -> 'bytes' ->> 'b') % 4 = 0 THEN
      icerik := decode(f.dosya -> 'bytes' ->> 'b', 'base64');
    END IF;
    CONTINUE WHEN icerik IS NULL OR length(icerik) = 0 OR length(icerik) > 200 * 1024 * 1024;
    tur := cizimler_tasima_tur_bul(icerik);
    CONTINUE WHEN tur IS NULL OR tur NOT IN ('pdf', 'step', 'stl', 'iges');
    CONTINUE WHEN EXISTS (SELECT 1 FROM cizimler_revizyon WHERE ozet = encode(sha256(icerik), 'hex'));
    PERFORM cizimler_tasima_belge_ac(
      icerik, coalesce(f.dosya ->> 'name', ''), CASE WHEN tur = 'pdf' THEN 'teknik-resim' ELSE '3b-model' END, tur,
      CASE WHEN f.depo = 'draws' THEN 'Arkon çiziminden taşındı' ELSE 'Arkon iş paketinden taşındı' END
        || CASE WHEN f.kaynak_adi <> '' THEN ': ' || f.kaynak_adi ELSE '.' END,
      f.degistiren_id, f.degisti);
  END LOOP;

  FOR k IN
    SELECT r.id, r.salon_id, r.ad, r.kaydeden_kisi_id, r.kaydedildi, s.ad AS salon_adi
      FROM atolye_kroki r LEFT JOIN atolye_salon s ON s.id = r.salon_id
     WHERE r.tamam
     ORDER BY r.id
  LOOP
    SELECT string_agg(p.veri, ''::bytea ORDER BY p.sira) INTO icerik FROM atolye_kroki_parca p WHERE p.kroki_id = k.id;
    CONTINUE WHEN icerik IS NULL OR cizimler_tasima_tur_bul(icerik) IS DISTINCT FROM 'pdf';
    CONTINUE WHEN EXISTS (SELECT 1 FROM cizimler_revizyon WHERE ozet = encode(sha256(icerik), 'hex'));
    belge := cizimler_tasima_belge_ac(icerik, k.ad, 'kroki', 'pdf',
      'Fabrika haritasından taşındı: ' || coalesce(k.salon_adi, 'fabrika krokisi'), k.kaydeden_kisi_id, k.kaydedildi);
    -- Fabrika krokisinin (salon boş) bağlanacak kaydı yoktur.
    IF k.salon_id IS NOT NULL THEN
      INSERT INTO cizimler_bag (belge_id, hedef_modul, hedef_id, ekleyen_id, eklendi)
      VALUES (belge, 'atolye', k.salon_id, k.kaydeden_kisi_id, k.kaydedildi);
    END IF;
  END LOOP;
END $$;

DROP FUNCTION cizimler_tasima_belge_ac(bytea, text, text, text, text, int, timestamptz);
DROP FUNCTION cizimler_tasima_tur_bul(bytea);
