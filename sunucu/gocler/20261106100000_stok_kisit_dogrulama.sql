-- Emre bağlı hareket kuralı eski satırlarda da denetlensin diye kısıt doğrulanır (2204-1 a, 312 b kalıbı). Hareket defteri
-- yalnız eklenir; kurala uymayan eski satır varsa düzeltilmez, kısıt NOT VALID kalır ve sayısı NOTICE ile yazılır.
-- Sayım kısıtın kendi ifadesiyledir: CHECK gibi NULL sonucu ihlal saymaz.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM stok_hareketi
   WHERE NOT (uretim_emri_id IS NULL
     OR tur IN ('transfer', 'geri_alma')
     OR (tur = 'cikis' AND cikis_nedeni IS DISTINCT FROM 'tedarikci_iade')
     OR (tur = 'giris' AND giris_kaynagi IS NOT DISTINCT FROM 'uretim'));
  IF n = 0 THEN
    ALTER TABLE stok_hareketi VALIDATE CONSTRAINT stok_hareketi_emir_kurali;
  ELSE
    RAISE NOTICE 'stok_hareketi_emir_kurali: % eski satir kurala uymuyor; satirlar degismez, kisit yalniz yeni satirlari denetler.', n;
  END IF;
END $$;
