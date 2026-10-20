-- Portaldaki satış teklifi ve tekliften satış siparişi Logo'ya aynı giden kutusundan gider (kart #777); kısıt genişler, satır değişmez.
ALTER TABLE logo_giden DROP CONSTRAINT logo_giden_belge_turu;
ALTER TABLE logo_giden ADD CONSTRAINT logo_giden_belge_turu CHECK (belge_turu IN (
  'malzeme', 'hizmet', 'malzeme-guncelleme', 'siparis', 'siparis-guncelleme', 'siparis-kapatma', 'siparis-iptal', 'talep', 'karsilama',
  'satis-teklifi', 'satis-siparisi'
));
