-- Kart 3443 (3443 a; ADR 0030 madde 6 değişti): dosyanın müşterisi ve projesi, arşivdeki dosyanın kalıcı silinmesi ve dört göz isteği.
-- Yalnız ekler: dolu satır değişmez; yeni sütunlar boş olabilir, yeni tablo boştur. Silme yalnız kişinin komutuyla olur, göç silmez.

-- Müşteri yalnız müşteri ya da ikisi türü firmadır; proje varsa firması seçilen müşteriyle aynıdır. İkisi yazımda sunucuda denetlenir
-- (kurallar.ts); firma türü sonradan değişirse eski bağ kalır. Firma ve proje silinmez (modüllerinde silme yok), bağ NO ACTION kalır.
ALTER TABLE ortak_dosyalar_dosya
  ADD COLUMN firma_id int CONSTRAINT ortak_dosyalar_dosya_firma_fk REFERENCES musteri_tedarikci_firma,
  ADD COLUMN proje_id int CONSTRAINT ortak_dosyalar_dosya_proje_fk REFERENCES projeler_proje;
CREATE INDEX ortak_dosyalar_dosya_firma ON ortak_dosyalar_dosya (firma_id) WHERE firma_id IS NOT NULL;
CREATE INDEX ortak_dosyalar_dosya_proje ON ortak_dosyalar_dosya (proje_id) WHERE proje_id IS NOT NULL;

-- Kalıcı silme ve dört göz isteği tek defterdir: dört göz kapalıyken doğrudan silme `dort_goz = false, durum = 'silindi'` satırıdır,
-- açıkken önce `acik` istek yazılır, ikinci kişi sonuçlar. Dosya silinince satır kalır (Geçmiş ve iz): dosya_id yabancı anahtar değildir,
-- dosyanın adı kopyalanır. Klasör silinmez, ona bağ vardır.
CREATE TABLE ortak_dosyalar_silme (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  klasor_id int NOT NULL CONSTRAINT ortak_dosyalar_silme_klasor_fk REFERENCES ortak_dosyalar_klasor,
  dosya_id int NOT NULL,
  dosya_adi text NOT NULL CONSTRAINT ortak_dosyalar_silme_ad_bicimi CHECK (btrim(dosya_adi) = dosya_adi AND dosya_adi <> '' AND char_length(dosya_adi) <= 120),
  -- İstek anındaki dosya sürümü: onay anında dosya değişmişse istek eskimiştir (Risk K2).
  dosya_surumu int NOT NULL,
  surum_sayisi int CONSTRAINT ortak_dosyalar_silme_surum_sayisi CHECK (surum_sayisi IS NULL OR surum_sayisi > 0),
  dort_goz boolean NOT NULL,
  isteyen_kisi_id int NOT NULL CONSTRAINT ortak_dosyalar_silme_isteyen_fk REFERENCES kisi,
  istek_zamani timestamptz NOT NULL DEFAULT now(),
  durum text NOT NULL CONSTRAINT ortak_dosyalar_silme_durum_degeri
    CHECK (durum IN ('acik', 'silindi', 'reddedildi', 'geri-cekildi', 'dustu')),
  sonuclayan_kisi_id int CONSTRAINT ortak_dosyalar_silme_sonuclayan_fk REFERENCES kisi,
  sonuc_zamani timestamptz,
  CONSTRAINT ortak_dosyalar_silme_sonuc_butun CHECK (
    (durum = 'acik') = (sonuclayan_kisi_id IS NULL) AND (sonuclayan_kisi_id IS NULL) = (sonuc_zamani IS NULL)
  ),
  -- Dört göz kapalıyken istek yoktur: tek satır doğrudan silmedir ve silen kişi kendisidir.
  CONSTRAINT ortak_dosyalar_silme_tek_kisi CHECK (dort_goz OR durum = 'silindi' AND sonuclayan_kisi_id = isteyen_kisi_id),
  -- Dört gözde isteyen kendi isteğini onaylayamaz (kurallar.ts ile aynı kural).
  CONSTRAINT ortak_dosyalar_silme_dort_goz CHECK (NOT dort_goz OR durum <> 'silindi' OR sonuclayan_kisi_id <> isteyen_kisi_id),
  CONSTRAINT ortak_dosyalar_silme_geri_ceken CHECK (durum <> 'geri-cekildi' OR sonuclayan_kisi_id = isteyen_kisi_id)
);
-- Dosya başına tek açık istek.
CREATE UNIQUE INDEX ortak_dosyalar_silme_acik_tekil ON ortak_dosyalar_silme (dosya_id) WHERE durum = 'acik';
CREATE INDEX ortak_dosyalar_silme_klasor ON ortak_dosyalar_silme (klasor_id, istek_zamani DESC);
