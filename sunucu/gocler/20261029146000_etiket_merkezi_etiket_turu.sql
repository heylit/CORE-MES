-- Etiket listesi (kart #1292; 1285 a, 1288 teyitli): bütün etiket türleri tek tabloda, Etiket Merkezi merkezli. Yeni boş tablo;
-- dolu tabloya dokunmaz. Satırlar katalogdur, gerçek veri değildir. Basılabilen türün kayıt türü koddaki KAYIT_TURLERI'ndedir;
-- iki listenin ayrışmadığını modül testi denetler.
-- durum: hazir (Etiket Merkezi'nden basılıyor), ilk-tur ve ikinci-tur (yapılacak, 1285 a). disaridaki_yol: bugün Etiket Merkezi
-- dışında basıldığı yer (1288: oradan Etiket Merkezi'ne taşınacak).
CREATE TABLE etiket_merkezi_etiket_turu (
  kod text PRIMARY KEY CONSTRAINT etiket_merkezi_etiket_turu_kod CHECK (kod ~ '^[a-z][a-z0-9-]{1,39}$'),
  ad text NOT NULL CONSTRAINT etiket_merkezi_etiket_turu_ad CHECK (length(btrim(ad)) BETWEEN 1 AND 80),
  sahip_modul text NOT NULL CONSTRAINT etiket_merkezi_etiket_turu_sahip CHECK (sahip_modul ~ '^[a-z][a-z-]{1,39}$'),
  tetik text NOT NULL CONSTRAINT etiket_merkezi_etiket_turu_tetik CHECK (length(btrim(tetik)) BETWEEN 1 AND 300),
  alanlar text NOT NULL CONSTRAINT etiket_merkezi_etiket_turu_alanlar CHECK (length(btrim(alanlar)) BETWEEN 1 AND 400),
  sablon_turu text,
  kayit_turleri text[] NOT NULL DEFAULT '{}',
  durum text NOT NULL CONSTRAINT etiket_merkezi_etiket_turu_durum CHECK (durum IN ('hazir', 'ilk-tur', 'ikinci-tur')),
  disaridaki_yol text CONSTRAINT etiket_merkezi_etiket_turu_disari CHECK (disaridaki_yol IS NULL OR length(btrim(disaridaki_yol)) BETWEEN 1 AND 200),
  sira smallint NOT NULL CONSTRAINT etiket_merkezi_etiket_turu_sira CHECK (sira > 0),
  -- Hazır tür bir şablonla basılır; yapılacak türün şablonu ve kayıt kaynağı henüz yoktur.
  CONSTRAINT etiket_merkezi_etiket_turu_hazir CHECK ((durum = 'hazir') = (sablon_turu IS NOT NULL)),
  CONSTRAINT etiket_merkezi_etiket_turu_kaynaksiz CHECK (durum = 'hazir' OR cardinality(kayit_turleri) = 0)
);

INSERT INTO etiket_merkezi_etiket_turu (kod, ad, sahip_modul, tetik, alanlar, sablon_turu, kayit_turleri, durum, disaridaki_yol, sira) VALUES
  ('konum', 'Konum etiketi', 'stok', 'Konum açılınca ya da kodu değişince',
   'QR (LOC), konum kodu, konum adı, salon ve kutu türü', 'konum', '{konum}', 'hazir', 'Stok Merkezi · Konum etiketleri (A4 sayfa)', 10),
  ('raf', 'Raf etiketi', 'atolye', 'Fabrika Haritası''nda raf kurulunca',
   'QR (RAF), raf kodu, raf adı, bölüm, bölme ve kat', 'raf', '{raf}', 'hazir', NULL, 20),
  ('malzeme', 'Malzeme etiketi', 'malzemeler', 'Malzeme kartı açılınca',
   'QR (MLZ), malzeme adı, stok kodu, kart no', 'malzeme', '{malzeme}', 'hazir', 'Malzemeler ve Hizmetler · Katalog etiketi', 30),
  ('lot', 'Lot etiketi', 'stok', 'Mal kabulde lot açılınca',
   'QR (LOT), lot no, malzeme, kart ve tür, parti, döküm, sertifika, giriş tarihi, miktar, belge', 'lot', '{lot,mal-kabul}', 'hazir',
   'Stok Merkezi · Lot etiketi penceresi', 40),
  ('refakat', 'Refakat kartı', 'stok', 'Emre depodan lot verilince (refakat partisi)',
   'QR (RP), emir no, ürün adı, parça no, adet ve termin, parti, lot, işlem sırası, basım tarihi', 'refakat', '{refakat-partisi}', 'hazir', NULL, 50),
  ('istasyon', 'İstasyon etiketi', 'istasyonlar', 'İstasyonun stok konumu açılınca',
   'QR (LOC), istasyon kodu, istasyon adı', 'istasyon', '{istasyon}', 'hazir', NULL, 60),
  ('deneme', 'Yazıcı denemesi', 'etiket-merkezi', 'Yazıcı tanımlanınca ya da ayarı değişince',
   'QR, Türkçe harfler, yazı boyları, yazıcı dili ve çözünürlüğü', 'deneme', '{}', 'hazir', NULL, 70),
  ('kalite-durum', 'Kalite durum etiketi', 'stok', 'Lot karantinaya girince ve kalite kararı (serbest, şartlı, red) verilince',
   'QR (LOT), durum, lot no, malzeme kodu ve adı, miktar ve birim, karar tarihi, karar veren, GKK ya da NCR no, şartlı kabul notu',
   NULL, '{}', 'ilk-tur', 'Kalite Merkezi · KF-19 Ürün durum etiketi', 110),
  ('hatali-parca', 'Hatalı parça etiketi', 'uretim-emirleri', 'Terminalde parça hatalı ayrılınca; kalite rework, hurda ya da red deyince',
   'QR, durum, emir no, parça no ve adı, işlem no ve adı, adet, hurda nedeni, ayıran ve zaman, karar ve NCR no', NULL, '{}', 'ilk-tur', NULL, 120),
  ('sevk-koli', 'Sevk koli etiketi', 'sevkiyat', 'Ürün sevke hazırlanınca',
   'QR, müşteri, müşteri sipariş no, parça no ve adı, revizyon, koli içi adet, koli sırası (n/N), emir no, lot, sevk tarihi, belge no',
   NULL, '{}', 'ilk-tur', NULL, 130),
  ('kalibrasyon', 'Kalibrasyon etiketi', 'kalibrasyon', 'Ölçü aletinin kalibrasyonu uygun kaydedilince',
   'QR, alet no, alet türü, son kalibrasyon, vade, sertifika no, kullanım dışı', NULL, '{}', 'ikinci-tur', NULL, 210),
  ('seri-no', 'Seri no etiketi', 'arkon', 'Parçaya seri no verilince',
   'QR (seri no), seri no, parça adı, parça no, revizyon, tarih', NULL, '{}', 'ikinci-tur', 'Üretim Hazırlık · Seri no etiketi', 220),
  ('fason-gidis', 'Fason gidiş etiketi', 'sevkiyat', 'Parça fasona gönderilince',
   'QR, fason firma, işlem, emir no, adet, gidiş tarihi, beklenen dönüş', NULL, '{}', 'ikinci-tur', NULL, 230);
