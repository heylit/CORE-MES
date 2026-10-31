-- S-10 (kart 1414): stok_hareketi_emir_yalniz_uretimde hiçbir satırı reddetmiyordu. Çıkış satırında giris_kaynagi NULL olduğundan
-- ifade NULL'a çıkar ve CHECK NULL'u geçirir. Kural bugünkü yazıcılara göre NULL'a dayanıklı yazılır: emre bağlı olabilen hareketler
-- taşıma (teslim, statü çevirme, sevk yola çıkışı), geri alma, tedarikçiye iade dışındaki çıkışlar (elle çıkış emirle her nedende
-- yazılabilir) ve üretimden giriştir. Sayım ve mal kabul girişi emre bağlanmaz.
-- Eski satırlar değişmez ve denetlenmez (NOT VALID); kurala uymayan eski satır sayısı bilgi olarak yazılır.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM stok_hareketi
   WHERE uretim_emri_id IS NOT NULL AND NOT (
     tur IN ('transfer', 'geri_alma')
     OR (tur = 'cikis' AND cikis_nedeni IS DISTINCT FROM 'tedarikci_iade')
     OR (tur = 'giris' AND giris_kaynagi IS NOT DISTINCT FROM 'uretim'));
  RAISE NOTICE 'stok_hareketi_emir_kurali: % eski satir yeni kurala uymuyor; satirlar degismez.', n;
END $$;

ALTER TABLE stok_hareketi DROP CONSTRAINT stok_hareketi_emir_yalniz_uretimde;
ALTER TABLE stok_hareketi ADD CONSTRAINT stok_hareketi_emir_kurali CHECK (
  uretim_emri_id IS NULL
  OR tur IN ('transfer', 'geri_alma')
  OR (tur = 'cikis' AND cikis_nedeni IS DISTINCT FROM 'tedarikci_iade')
  OR (tur = 'giris' AND giris_kaynagi IS NOT DISTINCT FROM 'uretim')
) NOT VALID;
