-- Dış operasyon (fason) hizmet siparişi hangi iş emri için verildiğini taşır (kart #542, kullanıcı kararı D4 a). Bağ isteğe bağlıdır;
-- bağlı iş emri silinemez: hizmet siparişi sahipsiz kalmasın.
ALTER TABLE satin_alma_siparis_satiri
  ADD COLUMN is_emri_id int CONSTRAINT satin_alma_siparis_satiri_is_emri REFERENCES uretim_emirleri_is_emri;
