-- Tarayıcıdan vektörel yazdırma (kart 2904, kullanıcı kararı 11.11.2026): bu bilgisayara takılı yazıcıya Windows sürücüsüyle basılır;
-- yazıcı tanımı gerekmez, deftere yazıcısız "yazdirildi" satırı girer. Var olan satırlar değişmez: sonuç listesi genişler, yazıcı
-- yalnız tarayıcıdan yazdırmada boş kalır (öteki sonuçlarda tanımlı yazıcı zorunlu kalır).
ALTER TABLE etiket_merkezi_baski DROP CONSTRAINT etiket_merkezi_baski_sonuc,
  ADD CONSTRAINT etiket_merkezi_baski_sonuc CHECK (sonuc IN ('gonderildi', 'hata', 'indirildi', 'yazdirildi')),
  ALTER COLUMN yazici_id DROP NOT NULL,
  ADD CONSTRAINT etiket_merkezi_baski_yazici CHECK ((sonuc = 'yazdirildi') = (yazici_id IS NULL));
