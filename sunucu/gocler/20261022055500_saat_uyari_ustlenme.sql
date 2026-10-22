-- Saatten uyarı üstlenme (kart #86, karar 79 a): saat modülünün ilk tablosu. Uyarılar durumdan türetilir, kimlikleri yoktur;
-- satır uyarının kimliğiyle (tür, istasyon, alet ve vadesi, emir, başlangıç) tutulur. Üstlenme uyarıyı kapatmaz: uyarı kaynağında
-- kapanınca listeden düşer. Yeni duruş ya da arıza yeni başlangıç, yani yeni kimliktir. Bir uyarıyı aynı anda tek kişi üstlenir;
-- üstlenme 12 saat geçerlidir (servis sorgusu), sonra başkası üstlenebilir.
CREATE TABLE saat_uyari_ustlenme (
  kimlik text PRIMARY KEY CONSTRAINT saat_uyari_ustlenme_kimlik_gecerli CHECK (length(kimlik) BETWEEN 1 AND 300),
  kisi_id int NOT NULL CONSTRAINT saat_uyari_ustlenme_kisi_fk REFERENCES kisi,
  ustlenme timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saat_uyari_ustlenme_kisi ON saat_uyari_ustlenme (kisi_id);
