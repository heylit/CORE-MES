-- Şoför kimlik no'su (kart 3694-4; kullanıcı kararı 25.11: şifreli ve yetkili saklanır, loglara yazılmaz, tam okuma yalnız yönetici).
-- sifreli: AES-256-GCM, anahtar depo dışında (TMIV2_KISISEL_VERI_ANAHTARI); satır kimliği (sevkiyat_isi_id) şifrenin ek doğrulama verisidir, başka satıra taşınan değer çözülmez.
-- son_uc: ekranda gösterilen son üç hane (maske); tam değer yalnız sevkiyat.sofor-kimlik-oku ile okunur ve her okuma denetim kaydına düşer.
-- Silme: iş silinirse kimlik de gider (CASCADE); sevk tarihinden 90 gün sonra uygulama siler (VARSAYIM, mali müşavire danışılır; süre kodda sabit).
-- Yeni tablo, veri yok: geri alma DROP TABLE.
CREATE TABLE sevkiyat_sofor_kimligi (
  sevkiyat_isi_id int PRIMARY KEY REFERENCES sevkiyat_isi ON DELETE CASCADE,
  sifreli text NOT NULL CONSTRAINT sevkiyat_sofor_kimligi_sifreli CHECK (length(sifreli) BETWEEN 20 AND 400),
  son_uc text NOT NULL CONSTRAINT sevkiyat_sofor_kimligi_son_uc CHECK (son_uc ~ '^[0-9]{3}$'),
  yazan_kisi_id int NOT NULL REFERENCES kisi,
  yazilma timestamptz NOT NULL DEFAULT now()
);
