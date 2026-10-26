-- Bir emirde paralel adım (kart 639, 646 a, 648 a). Akışlı ve bağımsız adımlar aynı anda çalışabilir; adımın çalışma hâli
-- kendi olaylarından türer (yeni sütun yok). Emrin calisma sütunu özettir: bir adım çalışıyorsa 'calisiyor', yoksa yeni olayın
-- hâli. Tek çalışan adımda (bugünkü bütün veri) özet eski kuralla aynı sonucu verir: yeni olay o adımın son olayıdır.
-- Dolu tablolarda satır değişmez; değişen tetikleyici fonksiyonu ve dizinlerdir.
DO $$
DECLARE
  coklu bigint;
  cift_katilim bigint;
BEGIN
  SELECT count(*) INTO coklu FROM (
    SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE durum = 'calisiyor' GROUP BY uretim_emri_id HAVING count(*) > 1) x;
  SELECT count(*) INTO cift_katilim FROM (
    SELECT is_emri_id, kisi_id FROM uretim_emirleri_katilim WHERE cikis IS NULL AND is_emri_id IS NOT NULL
     GROUP BY is_emri_id, kisi_id HAVING count(*) > 1) x;
  RAISE NOTICE 'birden çok çalışan adımı olan emir: %; adımda iki açık katılımı olan kişi: %', coklu, cift_katilim;
  -- Bugünkü kurallar ikisini de üretemez; varsa özet kuralı eskisinden farklı sonuç verebilir, göç durur ve hiçbir şey değişmez.
  IF coklu > 0 THEN
    RAISE EXCEPTION 'Birden çok çalışan adımı olan % emir var; paralel adım göçü uygulanmadı.', coklu;
  END IF;
END $$;

-- Adım başına son olay okuması (adımın çalışma hâli, duruşun kapanışı).
CREATE INDEX uretim_olayi_is_emri_idx ON uretim_olayi (is_emri_id, id) WHERE is_emri_id IS NOT NULL;

-- Ayar olayı adımın çalışma hâlini değiştirmez (sonOlaylariGetir ile aynı); olaysız çalışan adım çalışıyordur.
CREATE OR REPLACE FUNCTION uretim_olayi_calisma_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE uretim_emri
     SET calisma = CASE
       WHEN EXISTS (
         SELECT 1 FROM uretim_emirleri_is_emri i
          WHERE i.uretim_emri_id = NEW.emir_id AND i.durum = 'calisiyor'
            AND COALESCE((SELECT o.olay FROM uretim_olayi o WHERE o.is_emri_id = i.id AND o.olay <> 'ayar' ORDER BY o.id DESC LIMIT 1),
                         'devam') NOT IN ('duraklat', 'durdur'))
         THEN 'calisiyor'
       ELSE CASE NEW.olay WHEN 'duraklat' THEN 'durakli' WHEN 'durdur' THEN 'durdu' ELSE 'calisiyor' END
     END
   WHERE id = NEW.emir_id;
  RETURN NULL;
END
$$;

-- Tek açık katılım emir başına değil adım başınadır: kişi aynı emrin iki adımında aynı anda çalışabilir (648 a). Adlı dizin
-- iş emirli satırı taşır, servisin kısıt eşlemesi bu adla kalır; iş emirsiz eski emirde kural emir başına sürer. Yeni kural
-- eskisinden gevşektir, var olan veri ihlal etmez.
DROP INDEX uretim_emirleri_katilim_kiside_tek_acik;
CREATE UNIQUE INDEX uretim_emirleri_katilim_kiside_tek_acik ON uretim_emirleri_katilim (is_emri_id, kisi_id)
  WHERE cikis IS NULL AND is_emri_id IS NOT NULL;
CREATE UNIQUE INDEX uretim_emirleri_katilim_is_emirsiz_tek_acik ON uretim_emirleri_katilim (emir_id, kisi_id)
  WHERE cikis IS NULL AND is_emri_id IS NULL;
