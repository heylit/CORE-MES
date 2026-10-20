-- İstasyon sorumlusu bilgi alanıdır, yetki vermez; boş olabilir. Kişi silinmez, kademeli silme yok.
-- Kapasiteyi makinenin mi insanın mı belirlediği istasyon başına seçilir (IK4); hesabı vardiya modülündedir.
-- İki sütun da boş olabilir: dolu tabloda satır silinmez, değer değişmez (kullanıcı onayı E1g). Zorunluluğu bugün ekran tutar (E2z).
ALTER TABLE istasyon ADD COLUMN sorumlu_kisi_id int REFERENCES kisi;
CREATE INDEX istasyon_sorumlu_idx ON istasyon (sorumlu_kisi_id);
ALTER TABLE istasyon ADD COLUMN kapasite_kaynagi text
  CONSTRAINT istasyon_kapasite_kaynagi_degeri CHECK (kapasite_kaynagi IN ('makine', 'insan'));
