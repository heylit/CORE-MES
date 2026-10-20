-- Satın alma belgeleri (sipariş ve düzenleme, kapatma, iptali; talep fişi; karşılama) ve malzeme adı güncellemesi Logo'ya aynı giden kutusundan
-- gider (#205 karar 1; kart #777 S2 b, S3 b, S4 b); kısıt genişler, satır değişmez.
ALTER TABLE logo_giden DROP CONSTRAINT logo_giden_belge_turu;
ALTER TABLE logo_giden ADD CONSTRAINT logo_giden_belge_turu CHECK (belge_turu IN (
  'malzeme', 'hizmet', 'malzeme-guncelleme', 'siparis', 'siparis-guncelleme', 'siparis-kapatma', 'siparis-iptal', 'talep', 'karsilama'
));
