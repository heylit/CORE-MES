-- Eski malzeme kartı ve katalog tanım tabloları kalkıyor; yeni katalog kartı (malzeme_katalog_*) esastır.
-- Boş olmayan ya da elle değiştirilmiş tablo sessizce silinmez: göç durur, kullanıcıya sorulur.

-- Denetimden düşürmeye kadar başka oturum bu tablolara yazamaz; kilit alınamazsa (lock_timeout) göç durur, hiçbir şey düşmez.
LOCK TABLE malzeme_sarf_degeri, malzeme_olcusu, malzeme_sarf, malzeme_hammadde, malzeme_duzenleyen, malzeme, kalite_esdegeri, kalite, secenek,
  sarf_alan_secenegi, sarf_alani, sarf_kategorisi, aile_formu, form_olcusu, form, malzeme_sinifi, kod_grubu, malzeme_ailesi
  IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  t record;
  sayi bigint;
  ozet text;
  farkli text := '';
BEGIN
  -- Kart tabloları: tek satır varsa dur.
  FOR t IN SELECT unnest(ARRAY['malzeme', 'malzeme_duzenleyen', 'malzeme_hammadde', 'malzeme_olcusu', 'malzeme_sarf', 'malzeme_sarf_degeri']) AS tablo LOOP
    EXECUTE format('SELECT count(*) FROM %I', t.tablo) INTO sayi;
    IF sayi > 0 THEN
      RAISE EXCEPTION '% tablosunda % satır var; eski malzeme kartı kalkıyor. Satırları gözden geçirin, sonra göçü yeniden çalıştırın.', t.tablo, sayi;
    END IF;
  END LOOP;

  -- Tanım tabloları: içerik özeti, tohum göçünün (20261006191108) boş şemaya uygulanmış hâlinden ölçülen özetle aynı olmalı.
  -- Özet satırların metninden alınır, satır sırasından bağımsızdır (C sıralaması). Otomatik kimlikler (kalite.id, malzeme_sinifi.id, secenek.id)
  -- tohum sırasına bağlı olduğu için özete girmez; bağlantılar doğal anahtarlarıyla (sınıfın grup_kodu, kalitenin aile_kodu + kod) yazılır.
  -- Bu tablolarda zaman sütunu yok. Satır sayısı, aktif ve son_sira da özetin içindedir.
  FOR t IN
    SELECT * FROM (VALUES
      ('malzeme_ailesi', 'SELECT row(kod, ad, sira)::text FROM malzeme_ailesi', '7a4e3bbd70710717b0dd7ce8a358b859'),
      ('kod_grubu', 'SELECT row(kod, son_sira)::text FROM kod_grubu', '6eda6e9f85c25600af247984c935ea87'),
      ('malzeme_sinifi', 'SELECT row(aile_kodu, ad, grup_kodu, aktif)::text FROM malzeme_sinifi', '1ab4737ddd004f23e75371c4abc44ee6'),
      ('kalite', 'SELECT row(k.aile_kodu, k.kod, k.ad, k.ana_standart, k.yogunluk, k.aktif, s.grup_kodu)::text FROM kalite k JOIN malzeme_sinifi s ON s.id = k.sinif_id', '7b5a58ee33ea5fd6a2556fe4cff70eb1'),
      ('kalite_esdegeri', 'SELECT row(k.aile_kodu, k.kod, e.sistem, e.ad, e.yaklasik)::text FROM kalite_esdegeri e JOIN kalite k ON k.id = e.kalite_id', '2c3107bf78e4121d1d9d4e9a6e000d94'),
      ('form', 'SELECT row(kod, ad, sira)::text FROM form', '7f63ba334101bbc64cbf92587d4b2486'),
      ('form_olcusu', 'SELECT row(form_kodu, kod, ad, birim, sira)::text FROM form_olcusu', '59328a0aa8b6b5556f6d412f05e4f72e'),
      ('aile_formu', 'SELECT row(aile_kodu, form_kodu)::text FROM aile_formu', '910ec10853254935ac764de5115cb53f'),
      ('secenek', 'SELECT row(e.tur, e.aile_kodu, s.grup_kodu, e.ad, e.aktif)::text FROM secenek e LEFT JOIN malzeme_sinifi s ON s.id = e.sinif_id', 'b8a5ffbc11390ebfd1eefd8e6e5fcf19'),
      ('sarf_kategorisi', 'SELECT row(kod, ad, grup_kodu, aktif)::text FROM sarf_kategorisi', 'be91fda2e4228f8b0144aa65cb1decd3'),
      ('sarf_alani', 'SELECT row(kategori_kodu, kod, ad, tip, birim, zorunlu, sira)::text FROM sarf_alani', '3a94abf3bf7faef62d05253c3a5d4a1e'),
      ('sarf_alan_secenegi', 'SELECT row(kategori_kodu, alan_kodu, deger, sira)::text FROM sarf_alan_secenegi', '87b1e4299f395ea58493e48194cf2495')
    ) AS v (tablo, sorgu, beklenen)
  LOOP
    EXECUTE 'SELECT coalesce(md5(string_agg(r, chr(10) ORDER BY r COLLATE "C")), ''bos'') FROM (' || t.sorgu || ') q (r)' INTO ozet;
    IF ozet <> t.beklenen THEN
      farkli := farkli || E'\n  ' || t.tablo || ' (özet ' || ozet || ', tohumda ' || t.beklenen || ')';
    END IF;
  END LOOP;
  IF farkli <> '' THEN
    RAISE EXCEPTION 'Eski katalog tanımı tohumdan farklı (elle eklenmiş, değiştirilmiş, kapatılmış ya da silinmiş); eski tanımlar kalkıyor. Gözden geçirin, sonra göçü yeniden çalıştırın. Farklı tablolar:%', farkli;
  END IF;
END $$;

-- Yabancı anahtar sırasıyla; CASCADE yok: bağımlı başka nesne varsa göç kendiliğinden durur.
DROP TABLE malzeme_sarf_degeri;
DROP TABLE malzeme_olcusu;
DROP TABLE malzeme_sarf;
DROP TABLE malzeme_hammadde;
DROP TABLE malzeme_duzenleyen;
DROP TABLE malzeme;
DROP TABLE kalite_esdegeri;
DROP TABLE kalite;
DROP TABLE secenek;
DROP TABLE sarf_alan_secenegi;
DROP TABLE sarf_alani;
DROP TABLE sarf_kategorisi;
DROP TABLE aile_formu;
DROP TABLE form_olcusu;
DROP TABLE form;
DROP TABLE malzeme_sinifi;
DROP TABLE kod_grubu;
DROP TABLE malzeme_ailesi;

DROP FUNCTION malzeme_silinmez();
DROP FUNCTION malzeme_tanimi_kilitli();
DROP FUNCTION malzeme_karti_kilitli();
