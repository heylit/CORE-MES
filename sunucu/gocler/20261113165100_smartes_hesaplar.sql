-- SmartES'in kendi hesapları (kart 3174): OEE raporu ve parça çevrim süresi CORE'un hesabının yerine geçmez, yanında gösterilir.
-- Yalnız yeni boş tablolar; var olan tablolara dokunulmaz.

-- OEEReport satırı: vardiya + makine başına tek kayıt, her okumada güncellenir. Oranlar SmartES'in gönderdiği haliyle saklanır
-- (kesir mi yüzde mi olduğu belgede yazmıyor; ekrana çıkarken ayrılır).
CREATE TABLE smartes_oee (
  vardiya_tarihi date NOT NULL,
  vardiya int NOT NULL CONSTRAINT smartes_oee_vardiya CHECK (vardiya BETWEEN 1 AND 9),
  makine_kodu text NOT NULL CONSTRAINT smartes_oee_makine_kodu CHECK (btrim(makine_kodu) <> '' AND length(makine_kodu) <= 200),
  kullanilabilirlik numeric,
  performans numeric,
  kalite numeric,
  oee numeric,
  ham jsonb NOT NULL CONSTRAINT smartes_oee_ham CHECK (jsonb_typeof(ham) = 'object'),
  ilk_okuma timestamptz NOT NULL,
  son_okuma timestamptz NOT NULL,
  PRIMARY KEY (vardiya_tarihi, vardiya, makine_kodu)
);

-- PartsCycleTimesList satırı: stok + operasyon + makine + istasyon başına tek kayıt (anahtar bu dördünden kurulur; eksik olan boş geçer).
-- Süre metin olarak saklanır: belgede Varchar(50), birimi yazmıyor; saniyeye ancak biçimi belliyse çevrilir.
CREATE TABLE smartes_cevrim_suresi (
  anahtar text PRIMARY KEY CONSTRAINT smartes_cevrim_suresi_anahtar CHECK (btrim(anahtar) <> '' AND length(anahtar) <= 820),
  stok_no text,
  operasyon_kodu text,
  makine_kodu text,
  istasyon_kodu text,
  cevrim_metni text,
  yukleme_metni text,
  parca_sayisi int,
  gun_sayisi int,
  ham jsonb NOT NULL CONSTRAINT smartes_cevrim_suresi_ham CHECK (jsonb_typeof(ham) = 'object'),
  ilk_okuma timestamptz NOT NULL,
  son_okuma timestamptz NOT NULL
);

-- İki okumanın izi, tür başına tek satır.
CREATE TABLE smartes_hesap_okuma (
  tur text PRIMARY KEY CONSTRAINT smartes_hesap_okuma_tur CHECK (tur IN ('oee', 'cevrim')),
  son_deneme timestamptz NOT NULL,
  son_sonuc text NOT NULL CONSTRAINT smartes_hesap_okuma_son_sonuc CHECK (son_sonuc IN ('tamam', 'hata')),
  son_hata text CONSTRAINT smartes_hesap_okuma_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  son_basarili timestamptz,
  okunan int CONSTRAINT smartes_hesap_okuma_okunan CHECK (okunan IS NULL OR okunan >= 0),
  CONSTRAINT smartes_hesap_okuma_butun CHECK ((son_hata IS NOT NULL) = (son_sonuc = 'hata'))
);
