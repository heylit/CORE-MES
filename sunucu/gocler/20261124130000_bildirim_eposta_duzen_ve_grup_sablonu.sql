-- 3639: e-posta şablonunun üst bant, önem rozeti, başlık altı satırı, tablo satır adı ve düğme rengi ayarı tek jsonb sütunudur; boş
-- sütun kod varsayılanı demektir. Alıcı grubu (bildirim kuralı) kendi e-posta şablonunu seçer; kuyruk satırı hangi şablonla
-- gideceğini taşır. Yalnız boş olabilen sütun ekler: var olan satır ve veri değişmez, silinmez.
ALTER TABLE bildirim_eposta_sablonu
  ADD COLUMN duzen jsonb CONSTRAINT bildirim_eposta_sablonu_duzen_gecerli CHECK (duzen IS NULL OR jsonb_typeof(duzen) = 'object');
ALTER TABLE bildirim_eposta_ozel_sablon
  ADD COLUMN duzen jsonb CONSTRAINT bildirim_eposta_ozel_sablon_duzen_gecerli CHECK (duzen IS NULL OR jsonb_typeof(duzen) = 'object');
ALTER TABLE bildirim_kurali
  ADD COLUMN sablon_id int CONSTRAINT bildirim_kurali_sablon_fk REFERENCES bildirim_eposta_ozel_sablon ON DELETE SET NULL;
ALTER TABLE bildirim_eposta_kuyrugu
  ADD COLUMN sablon_id int CONSTRAINT bildirim_eposta_kuyrugu_sablon_fk REFERENCES bildirim_eposta_ozel_sablon ON DELETE SET NULL;
