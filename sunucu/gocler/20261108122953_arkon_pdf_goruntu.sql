-- Kart 2339-S, ADR 0032: yayındaki iş paketindeki PDF'in sayfa görüntüsü sunucuda bir kez, ayrı süreçte hazırlanır; tablet hazır görüntüyü alır.
-- Anahtar kaynak dosyanın içerik özeti (arkon blob özeti), sayfa ve renk imzasıdır (paylasilan/pdf-renk.ts renkImzasi): revizyon değişince
-- özet değişir, eski görüntü yeni dosya için verilmez. Görüntü türetilmiş veridir; satır silinirse sonraki turda yeniden üretilir.
-- Hazırlanamayan kaynak hata metniyle bir kez yazılır, her turda yeniden denenmez (kalıcı hata). Yeni tablo; dolu tabloya dokunulmaz.
CREATE TABLE arkon_pdf_goruntu (
  kaynak text NOT NULL CONSTRAINT arkon_pdf_goruntu_kaynak_bicimi CHECK (kaynak ~ '^[0-9a-f]{64}$'),
  sayfa int NOT NULL CONSTRAINT arkon_pdf_goruntu_sayfa CHECK (sayfa BETWEEN 1 AND 9999),
  imza text NOT NULL CONSTRAINT arkon_pdf_goruntu_imza_bicimi CHECK (char_length(imza) BETWEEN 1 AND 64),
  genislik int CONSTRAINT arkon_pdf_goruntu_genislik CHECK (genislik > 0),
  yukseklik int CONSTRAINT arkon_pdf_goruntu_yukseklik CHECK (yukseklik > 0),
  png bytea,
  hata text CONSTRAINT arkon_pdf_goruntu_hata_uzunlugu CHECK (char_length(hata) <= 200),
  sure_ms int CONSTRAINT arkon_pdf_goruntu_sure CHECK (sure_ms >= 0),
  olusturma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arkon_pdf_goruntu_ya_goruntu_ya_hata CHECK (
    (png IS NOT NULL AND hata IS NULL AND genislik IS NOT NULL AND yukseklik IS NOT NULL) OR (png IS NULL AND hata IS NOT NULL)
  ),
  PRIMARY KEY (kaynak, sayfa, imza)
);
