-- Hizmet kartı (kart #163, kullanıcı kararları MH1-MH5): sayfa "Malzemeler ve Hizmetler" olur; hizmet altıncı türdür, stok kodu HZ ile başlar,
-- yönü (alınan / verilen) zorunludur ve kart bir kez aktif olunca değişmez. Hizmet Logo tür karşılığına girmez (o kısıt değişmez).

-- Önce sayar: yeni hizmet birimlerinden biri listede zaten varsa (ayardan eklenmiş ya da kartta geçen) göç o satırı değiştirirdi;
-- (büyük-küçük harf ayrımı yok: "Saat" de sayılır); HZ önekli kart varsa yeni tür onunla karışırdı. İkisinde de hiçbir şeyi değiştirmeden durur ve satırları yazar.
-- Kart, kategori ve Logo karşılığı satırları bu göçte değişmez; yerleşik adet, kg ve m² satırlarına yalnız liste adı eklenir.
DO $$
DECLARE
  sayi int;
  liste text;
BEGIN
  SELECT count(*), string_agg(kod, '; ' ORDER BY kod) INTO sayi, liste
    FROM malzeme_birimi WHERE lower(kod) IN ('saat', 'gün', 'sefer', 'ay', 'km');
  IF sayi > 0 THEN
    RAISE EXCEPTION '% birim listesi satırı hizmet birimleriyle çakışıyor (%); hizmet göçü uygulanmadı (kart #163).', sayi, liste;
  END IF;
  SELECT count(*), string_agg(stok_kodu, '; ' ORDER BY stok_kodu) INTO sayi, liste
    FROM malzeme_katalog_karti WHERE onek LIKE 'HZ-%';
  IF sayi > 0 THEN
    RAISE EXCEPTION '% malzeme kartı HZ önekini taşıyor (%); hizmet göçü uygulanmadı (kart #163).', sayi, liste;
  END IF;
END $$;

ALTER TABLE malzeme_katalog_karti DROP CONSTRAINT malzeme_katalog_karti_tur;
ALTER TABLE malzeme_katalog_karti ADD CONSTRAINT malzeme_katalog_karti_tur
  CHECK (tur IN ('hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'hizmet'));

-- Yön kartta `kayit.g.yon`; sunucu her yazımda bu sütuna çevirir. Hizmette zorunlu, başka türde boş.
ALTER TABLE malzeme_katalog_karti
  ADD COLUMN hizmet_yonu text CONSTRAINT malzeme_katalog_karti_hizmet_yonu_degeri CHECK (hizmet_yonu IN ('alinan', 'verilen')),
  ADD CONSTRAINT malzeme_katalog_karti_hizmet_yonu CHECK ((tur = 'hizmet') = (hizmet_yonu IS NOT NULL));

-- Yön, tür ve kod gibi yalnız hiç aktif olmamış taslakta değişir.
CREATE FUNCTION malzeme_katalog_karti_hizmet_yonu_koru() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.onay_durumu <> 'taslak' OR OLD.aktif_oldu) AND NEW.hizmet_yonu IS DISTINCT FROM OLD.hizmet_yonu THEN
    RAISE EXCEPTION 'Hizmet kartının yönü aktif olduktan sonra değişmez (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_hizmet_yonu_degismez';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER malzeme_katalog_karti_hizmet_yonu_koru BEFORE UPDATE OF hizmet_yonu ON malzeme_katalog_karti
  FOR EACH ROW EXECUTE FUNCTION malzeme_katalog_karti_hizmet_yonu_koru();

-- Hizmet grubu (kartta `kayit.g.kat`) kategori listesinde durur; kısa kod stok kodunun grubudur (HZ-FSN-00001).
ALTER TABLE malzeme_kategorisi DROP CONSTRAINT malzeme_kategorisi_tur;
ALTER TABLE malzeme_kategorisi ADD CONSTRAINT malzeme_kategorisi_tur CHECK (tur IN ('sarf', 'demirbas', 'hizmet'));
INSERT INTO malzeme_kategorisi (tur, kod, ad, kisa_kod, yerlesik, aktif) VALUES
  ('hizmet', 'fason', 'Fason işçilik', 'FSN', true, true), ('hizmet', 'bakim', 'Bakım ve onarım', 'BKM', true, true),
  ('hizmet', 'nakliye', 'Nakliye', 'NAK', true, true), ('hizmet', 'danismanlik', 'Danışmanlık', 'DNS', true, true),
  ('hizmet', 'diger', 'Diğer hizmet', 'DGR', true, true);

-- Hizmet birimleri (MH4 a ve kullanıcının eki kg, m², km); liste Ayarlar'dan genişler. Yerleşik adet, kg, m² satırına yalnız liste adı eklenir,
-- seçilebilirliği değişmez (yönetici gizlediyse bir sonraki ayar kaydı yeniden hesaplar).
UPDATE malzeme_birimi SET yerlesik_listeler = array_append(yerlesik_listeler, 'birim|hizmet'), guncelleme = now() WHERE kod IN ('adet', 'kg', 'm²');
INSERT INTO malzeme_birimi (kod, yerlesik_listeler, aktif)
SELECT kod, ARRAY['birim|hizmet'], true FROM unnest(ARRAY['saat', 'gün', 'sefer', 'ay', 'km']) AS kod;
