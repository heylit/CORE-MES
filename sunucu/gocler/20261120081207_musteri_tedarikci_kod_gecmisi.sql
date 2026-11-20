-- 3473: Logo'ya bağlanan firmanın kodu Logo cari koduna geçer; eski kod burada kalır, eski kodla arama ve toplu yükleme firmayı bulsun.
-- Yeni tablo boş başlar; var olan firma satırı bu göçte değişmez (zaten bağlı firmaların dönüşümü sonraki göçtedir).
CREATE TABLE musteri_tedarikci_kod_gecmisi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firma_id int NOT NULL CONSTRAINT musteri_tedarikci_kod_gecmisi_firma REFERENCES musteri_tedarikci_firma (id) ON DELETE CASCADE,
  kod text NOT NULL CONSTRAINT musteri_tedarikci_kod_gecmisi_kod_bicim CHECK (btrim(kod) = kod AND length(kod) BETWEEN 1 AND 40),
  birakildi timestamptz NOT NULL DEFAULT now(),
  -- Boş: kod göçle bırakıldı (zaten bağlı firmaların dönüşümü).
  birakan_id int CONSTRAINT musteri_tedarikci_kod_gecmisi_birakan REFERENCES kisi (id)
);
CREATE INDEX musteri_tedarikci_kod_gecmisi_firma_sirasi ON musteri_tedarikci_kod_gecmisi (firma_id, birakildi);
CREATE INDEX musteri_tedarikci_kod_gecmisi_kod_sirasi ON musteri_tedarikci_kod_gecmisi (upper(kod));
