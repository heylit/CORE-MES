-- 3315 c: CORE proje kartı Logo'ya açılır; çift gönderim izi öteki kartlar gibi logo_giden'dedir. Kısıt genişler, satır değişmez.
ALTER TABLE logo_giden DROP CONSTRAINT logo_giden_belge_turu;
ALTER TABLE logo_giden ADD CONSTRAINT logo_giden_belge_turu CHECK (belge_turu IN (
  'malzeme', 'hizmet', 'malzeme-guncelleme', 'siparis', 'siparis-guncelleme', 'siparis-kapatma', 'siparis-bekletme', 'siparis-iptal', 'talep', 'karsilama',
  'satis-teklifi', 'satis-siparisi', 'siparisler-teklifi', 'siparisler-siparisi', 'proje'
));
