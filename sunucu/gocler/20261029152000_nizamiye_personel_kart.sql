-- Nizamiye 1326 (karar 1327 a): personel kartı kaydı. İstasyonda kart + PIN ile giriş kartı buradan kişiye çevirir; PDKS de ileride aynı
-- kayıttan okur (tek kaynak). Yeni ve boş tablo. Kart numarası düz saklanmaz: özeti ve ekranda tanımak için son dört hanesi saklanır.
-- Kaldırılan kart satırı silinmez, kapanır; etkin kart ve kişi ikilisi tektir.
CREATE TABLE nizamiye_personel_kart (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kisi_id int NOT NULL CONSTRAINT nizamiye_personel_kart_kisi REFERENCES kisi,
  kart_ozeti text NOT NULL CONSTRAINT nizamiye_personel_kart_ozet_bicim CHECK (kart_ozeti ~ '^[0-9a-f]{64}$'),
  kart_son4 text NOT NULL CONSTRAINT nizamiye_personel_kart_son4_bicim CHECK (kart_son4 ~ '^[0-9A-F]{4}$'),
  kaydeden_kisi_id int NOT NULL REFERENCES kisi,
  kaydedildi timestamptz NOT NULL DEFAULT now(),
  kapandi timestamptz,
  kapatan_kisi_id int REFERENCES kisi,
  surum int NOT NULL DEFAULT 1,
  CONSTRAINT nizamiye_personel_kart_kapanis_butun CHECK ((kapandi IS NULL) = (kapatan_kisi_id IS NULL))
);
CREATE UNIQUE INDEX nizamiye_personel_kart_etkin_kart ON nizamiye_personel_kart (kart_ozeti) WHERE kapandi IS NULL;
CREATE UNIQUE INDEX nizamiye_personel_kart_etkin_kisi ON nizamiye_personel_kart (kisi_id) WHERE kapandi IS NULL;
