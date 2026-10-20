-- Logo karşılığı yalnız Logo'nun kabul ettiği değer olsun (kart #232, kullanıcı kararı LB7 a ve LB2 a; istek: kart #207 logo BASKA-MODUL-ISTEKLERI madde 2).
-- Tür karşılığı Logo kart türü kodlarından biri: 10 hammadde, 11 yarı mamul, 12 mamul, 13 tüketim malı; demirbaş (Logo 4) şimdilik gönderilmez, karşılığı boş kalır.
-- Birim karşılığı boşluksuz kod (listede olup olmadığına Logo modülü gönderimde bakar).

-- Var olan karşılık kısıtı bozuyorsa göç hiçbir şeyi değiştirmeden durur ve bozan satırları sayısıyla yazar.
DO $$
DECLARE
  sayi int;
  bozanlar text;
BEGIN
  SELECT count(*), string_agg(format('%s %s = %s', cesit, tmi_degeri, logo_degeri), '; ' ORDER BY cesit, tmi_degeri)
    INTO sayi, bozanlar
    FROM malzeme_logo_karsiligi
   WHERE logo_degeri IS NOT NULL
     AND NOT ((cesit = 'tur' AND tmi_degeri <> 'demirbas' AND logo_degeri IN ('10', '11', '12', '13'))
           OR (cesit = 'birim' AND logo_degeri ~ '^\S+$'));
  IF sayi > 0 THEN
    RAISE EXCEPTION '% Logo karşılığı izinli değerlerin dışında (%); karşılık kısıtı göçü uygulanmadı (kart #232).', sayi, bozanlar;
  END IF;
END $$;

ALTER TABLE malzeme_logo_karsiligi ADD CONSTRAINT malzeme_logo_karsiligi_izinli CHECK (
  logo_degeri IS NULL
  OR (cesit = 'tur' AND tmi_degeri <> 'demirbas' AND logo_degeri IN ('10', '11', '12', '13'))
  OR (cesit = 'birim' AND logo_degeri ~ '^\S+$')
);
