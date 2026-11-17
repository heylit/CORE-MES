-- Logo kuyruğu talebi sayı kimliğiyle (satin_alma_talep.sayi_id), karşılamayı sipariş satırı kimliğiyle tutar; uuid ile eşlemek
-- etki okumasını tür hatasıyla düşürüyordu (3409).
CREATE OR REPLACE FUNCTION ayarlar_temizlik_fk_siz_baglar(OUT kaynak text, OUT turler text[], OUT hedef text, OUT sutun text)
RETURNS SETOF record LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  VALUES
    ('logo_giden', ARRAY['malzeme', 'hizmet', 'malzeme-guncelleme'], 'malzeme_katalog_karti', 'no'),
    ('logo_giden', ARRAY['siparisler-teklifi', 'siparisler-siparisi'], 'siparisler_logo_gonderim', 'id'),
    ('logo_giden', ARRAY['siparis', 'siparis-guncelleme', 'siparis-kapatma', 'siparis-bekletme', 'siparis-iptal'], 'satin_alma_siparis', 'id'),
    ('logo_giden', ARRAY['talep'], 'satin_alma_talep', 'sayi_id'),
    ('logo_giden', ARRAY['karsilama'], 'satin_alma_siparis_satiri', 'id'),
    ('logo_giden', ARRAY['proje'], 'projeler_proje', 'id'),
    ('logo_malzeme_fisi_giden', NULL::text[], 'stok_malzeme_fisi', 'id')
$$;
