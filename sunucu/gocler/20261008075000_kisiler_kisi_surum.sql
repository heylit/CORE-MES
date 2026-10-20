-- İki kişi aynı kaydı değiştirirse son yazan kazanmasın: kişi satırını ya da rollerini değiştiren her komut sürümü artırır.
ALTER TABLE kisi ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT kisi_surum_pozitif CHECK (surum > 0);
