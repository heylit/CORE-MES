-- Kalite kararının satırı kararı vereni taşır (504 a). kisi_id sayan operatörde kalır: kişi başı üretim sayıları ondan okunur.
-- Boş: karar satırı değil ya da bu sütundan önce yazılmış karar satırı (kararı veren bilinmez).
ALTER TABLE uretim_sayimi ADD COLUMN karar_veren_kisi_id int REFERENCES kisi;
ALTER TABLE uretim_sayimi ADD CONSTRAINT uretim_sayimi_karar_veren_duzeltmede
  CHECK (karar_veren_kisi_id IS NULL OR (duzeltme AND tur IN ('karar_bekliyor', 'saglam', 'red')));
