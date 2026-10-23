-- Satış teklifi ve tekliften satış siparişinin kaynağı Siparişler'dir (H10, soru 238): kimlikleri Portal sırasının kimlikleriyle karışmasın
-- diye çift gönderim kalkanında ayrı belge türüyle tutulur. Kısıt genişler, satır değişmez; Portal satırları iz olarak kalır.
ALTER TABLE logo_giden DROP CONSTRAINT logo_giden_belge_turu;
ALTER TABLE logo_giden ADD CONSTRAINT logo_giden_belge_turu CHECK (belge_turu IN (
  'malzeme', 'hizmet', 'malzeme-guncelleme', 'siparis', 'siparis-guncelleme', 'siparis-kapatma', 'siparis-iptal', 'talep', 'karsilama',
  'satis-teklifi', 'satis-siparisi', 'siparisler-teklifi', 'siparisler-siparisi'
));
