-- Ticari mal (kart #1218, kullanıcı kararı 14.10.2026): alınıp satılan, üretilmeyen yedinci tür; stok kodu TM ile başlar.
-- Logo'da ticari mal ayrı kart türüdür (kod 1); bu yüzden kategori değil türdür. Logo karşılığı değersiz kalır, yönetici doldurur.

-- Önce sayar: TM önekli kart varsa yeni tür onunla karışırdı; hiçbir şeyi değiştirmeden durur ve kartları yazar.
-- Var olan karşılıklar yeni kısıtı bozuyorsa (tür karşılığına 1 yazılmış) yine durur.
DO $$
DECLARE
  sayi int;
  liste text;
BEGIN
  SELECT count(*), string_agg(stok_kodu, '; ' ORDER BY stok_kodu) INTO sayi, liste
    FROM malzeme_katalog_karti WHERE onek LIKE 'TM-%';
  IF sayi > 0 THEN
    RAISE EXCEPTION '% malzeme kartı TM önekini taşıyor (%); ticari mal göçü uygulanmadı (kart #1218).', sayi, liste;
  END IF;
  SELECT count(*), string_agg(format('%s = %s', tmi_degeri, logo_degeri), '; ' ORDER BY tmi_degeri) INTO sayi, liste
    FROM malzeme_logo_karsiligi WHERE cesit = 'tur' AND logo_degeri = '1';
  IF sayi > 0 THEN
    RAISE EXCEPTION '% Logo tür karşılığı 1 değerini taşıyor (%); ticari mal göçü uygulanmadı (kart #1218).', sayi, liste;
  END IF;
END $$;

ALTER TABLE malzeme_katalog_karti DROP CONSTRAINT malzeme_katalog_karti_tur;
ALTER TABLE malzeme_katalog_karti ADD CONSTRAINT malzeme_katalog_karti_tur
  CHECK (tur IN ('hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'hizmet', 'ticari_mal'));

ALTER TABLE malzeme_logo_karsiligi DROP CONSTRAINT malzeme_logo_karsiligi_tur;
ALTER TABLE malzeme_logo_karsiligi ADD CONSTRAINT malzeme_logo_karsiligi_tur
  CHECK (cesit <> 'tur' OR tmi_degeri IN ('hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'ticari_mal'));

-- Ticari malın karşılığı yalnız Logo kart türü 1; öteki türler eskisi gibi 10-13, demirbaş boş.
ALTER TABLE malzeme_logo_karsiligi DROP CONSTRAINT malzeme_logo_karsiligi_izinli;
ALTER TABLE malzeme_logo_karsiligi ADD CONSTRAINT malzeme_logo_karsiligi_izinli CHECK (
  logo_degeri IS NULL
  OR (cesit = 'tur' AND tmi_degeri = 'ticari_mal' AND logo_degeri = '1')
  OR (cesit = 'tur' AND tmi_degeri NOT IN ('demirbas', 'ticari_mal') AND logo_degeri IN ('10', '11', '12', '13'))
  OR (cesit = 'birim' AND logo_degeri ~ '^\S+$')
);
