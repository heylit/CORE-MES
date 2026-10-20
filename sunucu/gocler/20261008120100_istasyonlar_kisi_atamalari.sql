-- Kişi istasyona ve makineye yüzdeyle (iki ondalık, IK3) ve geçerlilik başlangıç tarihiyle (IK2) atanır; bir kişi birden çok
-- istasyona ve makineye bakabilir (IK1). Her değişiklik yeni satırdır, aynı gün ikinci değişiklik o günün satırını ezer;
-- yüzde boşsa kişi o tarihten itibaren çıkarılmıştır. Bir tarihte geçerli olan, o tarihe kadarki en son satırdır.
-- Kişinin bütün atamalarının toplamının 100'ü geçmemesi satırlar arası kuraldır; servis kişi bazında kilitleyerek tutar.
-- Kişi, istasyon ve makine silinmez, kademeli silme yok: ataması olan kayıt pasife alınır.
CREATE TABLE istasyon_kisi (
  istasyon_id int NOT NULL REFERENCES istasyon,
  kisi_id int NOT NULL REFERENCES kisi,
  baslangic date NOT NULL,
  yuzde numeric(5,2) CONSTRAINT istasyon_kisi_yuzde_araligi CHECK (yuzde > 0 AND yuzde <= 100),
  PRIMARY KEY (istasyon_id, kisi_id, baslangic)
);
CREATE INDEX istasyon_kisi_kisi_idx ON istasyon_kisi (kisi_id);

CREATE TABLE makine_kisi (
  makine_id int NOT NULL REFERENCES makine,
  kisi_id int NOT NULL REFERENCES kisi,
  baslangic date NOT NULL,
  yuzde numeric(5,2) CONSTRAINT makine_kisi_yuzde_araligi CHECK (yuzde > 0 AND yuzde <= 100),
  PRIMARY KEY (makine_id, kisi_id, baslangic)
);
CREATE INDEX makine_kisi_kisi_idx ON makine_kisi (kisi_id);
