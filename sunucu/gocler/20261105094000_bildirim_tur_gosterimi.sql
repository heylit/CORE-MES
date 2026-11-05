-- Otomatik bildirimin gösterimi (2147 Y4): tür başına ekran ortasında çıkar mı, "Okudum, anladım" onayı ister mi. Satır yoksa
-- varsayılan geçer (yalnız acil ortada, onay yok; BIL-16); tablo boş açılır, bugünkü bildirimler değişmez. Tür adı kısıtla
-- sınanmaz: yeni tür göç istemesin, geçerlilik sunucuda sözleşmeden sınanır.
CREATE TABLE bildirim_tur_gosterimi (
  tur text PRIMARY KEY CONSTRAINT bildirim_tur_gosterimi_tur_gecerli CHECK (tur ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  ortada boolean NOT NULL,
  onay_istenir boolean NOT NULL,
  surum int NOT NULL DEFAULT 1 CONSTRAINT bildirim_tur_gosterimi_surum_gecerli CHECK (surum >= 1),
  degistiren_kisi_id int CONSTRAINT bildirim_tur_gosterimi_degistiren_fk REFERENCES kisi,
  degistirildi timestamptz NOT NULL DEFAULT now()
);
