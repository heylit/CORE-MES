-- Sipariş numarasını TMI verir (SP-yıl-sıra; kullanıcı kararı 2a, 11.10.2026, kart #544). Elle girilen `siparis_no`
-- Logo / tedarikçi numarası olarak kalır. Sayaç talep numarasıyla aynı kalıptır: yıl başına son sıra.
CREATE TABLE satin_alma_siparis_sayaci (
  yil smallint PRIMARY KEY CONSTRAINT satin_alma_siparis_sayaci_yil CHECK (yil BETWEEN 2000 AND 2999),
  son_sira int NOT NULL DEFAULT 0 CONSTRAINT satin_alma_siparis_sayaci_sira CHECK (son_sira >= 0)
);
ALTER TABLE satin_alma_siparis
  ADD COLUMN no text CONSTRAINT satin_alma_siparis_no_bicim CHECK (no ~ '^SP-[0-9]{4}-[0-9]{3,}$'),
  ADD CONSTRAINT satin_alma_siparis_no_tek UNIQUE (no);
