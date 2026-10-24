-- Malzeme fişi stoğundur (293 a, 294 c; kart #492). Fiş stok hareketlerinden doğar ve elle düzenlenmez:
-- emir fişleri (sarf, üretimden giriş, fire) emir başına türünde tektir; sayım fazlası, sayım eksiği ve ambar (Logo ambarı farklı depolar arası
-- taşıma) fişi aynı komutun (aynı işlem) hareketlerini toplar. Logo'ya gidiş Logo modülündedir; fiş yalnız değişiklik sayacını ve elle
-- gönderim isteğini taşır.
-- Bugüne kadar fiş yalnız Logo giden kutusundaydı (logo_malzeme_fisi_giden, belge no = emir kimliği). Açık emir fişleri bir kez buraya açılır
-- (293 a: "açık fişler bir kez taşınır"); giden kutusunun numarası Logo göçünde (20261024173400) bu fişlerin kimliğine çevrilir.
DO $$
DECLARE n bigint; m bigint;
BEGIN
  SELECT count(*) INTO n FROM logo_malzeme_fisi_giden;
  SELECT count(*) INTO m FROM stok_hareketi WHERE uretim_emri_id IS NOT NULL;
  RAISE NOTICE 'stok_malzeme_fisi: % Logo fis satiri ve % emirli stok hareketi okunur, ikisi de degismez.', n, m;
END $$;

CREATE TABLE stok_malzeme_fisi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT stok_malzeme_fisi_tur_degeri
    CHECK (tur IN ('sarf', 'uretim_girisi', 'fire', 'sayim_fazlasi', 'sayim_eksigi', 'ambar')),
  uretim_emri_id int, -- Aşama 2: yabancı anahtar ayrı göçle (STK6 b)
  -- Sayım ve ambar fişi: hareketi yazan işlem. Aynı komutun hareketleri tek fişte toplanır.
  islem_kimligi xid8,
  acilis timestamptz NOT NULL DEFAULT now(),
  -- Satırları her değiştiğinde artar; Logo giden kutusu son gördüğü değeri tutar.
  degisiklik int NOT NULL DEFAULT 0 CONSTRAINT stok_malzeme_fisi_degisiklik_pozitif CHECK (degisiklik >= 0),
  degisiklik_zamani timestamptz NOT NULL DEFAULT now(),
  gonderim_istegi timestamptz,
  gonderim_isteyen_kisi_id int REFERENCES kisi,
  surum int NOT NULL DEFAULT 1,
  CONSTRAINT stok_malzeme_fisi_emir_bagi CHECK ((uretim_emri_id IS NOT NULL) = (tur IN ('sarf', 'uretim_girisi', 'fire'))),
  CONSTRAINT stok_malzeme_fisi_islem_bagi CHECK ((islem_kimligi IS NOT NULL) = (tur IN ('sayim_fazlasi', 'sayim_eksigi', 'ambar'))),
  CONSTRAINT stok_malzeme_fisi_gonderim_istegi CHECK ((gonderim_istegi IS NULL) = (gonderim_isteyen_kisi_id IS NULL))
);
CREATE UNIQUE INDEX stok_malzeme_fisi_emir_turu_tek ON stok_malzeme_fisi (uretim_emri_id, tur) WHERE uretim_emri_id IS NOT NULL;
CREATE UNIQUE INDEX stok_malzeme_fisi_islem_turu_tek ON stok_malzeme_fisi (islem_kimligi, tur) WHERE islem_kimligi IS NOT NULL;
CREATE INDEX stok_malzeme_fisi_degisiklik_idx ON stok_malzeme_fisi (degisiklik_zamani, id);
CREATE INDEX stok_malzeme_fisi_acilis_idx ON stok_malzeme_fisi (acilis DESC, id DESC);

-- Fişin hareketleri: bir hareket en çok bir fiştedir. Geri alma, geri aldığı hareketin fişine bağlanır (satır net miktardır).
CREATE TABLE stok_malzeme_fisi_hareketi (
  hareket_id bigint PRIMARY KEY REFERENCES stok_hareketi,
  fis_id int NOT NULL REFERENCES stok_malzeme_fisi
);
CREATE INDEX stok_malzeme_fisi_hareketi_fis_idx ON stok_malzeme_fisi_hareketi (fis_id);

-- Emirli üretim hareketleri ve Logo giden kutusundaki emirler: emir başına türünde bir fiş. Açılış ilk hareket ya da giden kutusu satırıdır.
-- Fire bugüne kadar sarfın içindeydi; ayrı fire fişi de açılır (Logo'ya gidişi Logo ayarına bağlıdır, varsayılan kapalı).
WITH kaynak AS (
  SELECT a.uretim_emri_id AS emir,
    CASE WHEN a.tur = 'giris' THEN 'uretim_girisi' WHEN a.cikis_nedeni = 'fire' THEN 'fire' ELSE 'sarf' END AS tur,
    a.zaman
  FROM stok_hareketi a
  WHERE a.uretim_emri_id IS NOT NULL
    AND ((a.tur = 'cikis' AND a.cikis_nedeni IN ('uretime_sarf', 'fire')) OR (a.tur = 'giris' AND a.giris_kaynagi = 'uretim'))
  UNION ALL
  SELECT g.belge_no, CASE g.belge_turu WHEN 'sarf-fisi' THEN 'sarf' ELSE 'uretim_girisi' END, g.olusma
  FROM logo_malzeme_fisi_giden g
)
INSERT INTO stok_malzeme_fisi (tur, uretim_emri_id, acilis, degisiklik_zamani)
SELECT tur, emir, min(zaman), min(zaman) FROM kaynak GROUP BY emir, tur ORDER BY emir, tur;

-- Hareketler ve geri almaları fişine bağlanır.
INSERT INTO stok_malzeme_fisi_hareketi (hareket_id, fis_id)
SELECT h.id, f.id
FROM stok_hareketi h
JOIN stok_hareketi a ON a.id = COALESCE(h.geri_alinan_id, h.id)
JOIN stok_malzeme_fisi f ON f.uretim_emri_id = a.uretim_emri_id
  AND f.tur = CASE WHEN a.tur = 'giris' THEN 'uretim_girisi' WHEN a.cikis_nedeni = 'fire' THEN 'fire' ELSE 'sarf' END
WHERE a.uretim_emri_id IS NOT NULL
  AND ((a.tur = 'cikis' AND a.cikis_nedeni IN ('uretime_sarf', 'fire')) OR (a.tur = 'giris' AND a.giris_kaynagi = 'uretim'));
