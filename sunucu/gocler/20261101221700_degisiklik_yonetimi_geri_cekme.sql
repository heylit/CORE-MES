-- 1819 (DY-26): açan kişi kararsız talebini geri çeker. Talep durumu, geçmiş olayı ve iç olay türü için yalnız CHECK genişler;
-- var olan satırlar değişmez.
ALTER TABLE degisiklik_yonetimi_talep DROP CONSTRAINT degisiklik_yonetimi_talep_durum_degeri;
ALTER TABLE degisiklik_yonetimi_talep ADD CONSTRAINT degisiklik_yonetimi_talep_durum_degeri CHECK (durum IN (
  'gonderildi', 'analizde', 'ccb_bekliyor', 'musteri_onayi_bekliyor', 'onaylandi', 'emir_acildi', 'reddedildi', 'geri_cekildi'
));
ALTER TABLE degisiklik_yonetimi_gecmis DROP CONSTRAINT degisiklik_yonetimi_gecmis_olay_degeri;
ALTER TABLE degisiklik_yonetimi_gecmis ADD CONSTRAINT degisiklik_yonetimi_gecmis_olay_degeri CHECK (olay IN (
  'talep_gonderildi', 'siniflandirildi', 'etki_analizi', 'ccb_onay', 'ccb_ret', 'musteri_onayi', 'emir_acildi', 'taslak_acildi',
  'kalem_kaydedildi', 'yayina_gonderildi', 'geri_gonderildi', 'yayinlandi', 'karar', 'mrb_karar', 'toplu_karar', 'karar_ertelendi',
  'kararlar_tamam', 'fai_onaylandi', 'fai_tamam', 'kapandi', 'geri_cekildi'
));
ALTER TABLE degisiklik_yonetimi_olay DROP CONSTRAINT degisiklik_yonetimi_olay_tur_degeri;
ALTER TABLE degisiklik_yonetimi_olay ADD CONSTRAINT degisiklik_yonetimi_olay_tur_degeri CHECK (tur IN (
  'talep_gonderildi', 'etki_analizi', 'musteri_onayi_istendi', 'emir_acildi', 'revizyon_yayinlandi', 'gecerlilik', 'karar_onerildi',
  'emir_karari', 'stok_karari', 'emir_karantinada', 'rework_istendi', 'sapma_acildi', 'fai_onaylandi', 'emir_kapandi',
  'talep_reddedildi', 'talep_geri_cekildi'
));
-- Geri çekilen talep sınıflanmadan ya da analiz edilmeden kapanabilir.
ALTER TABLE degisiklik_yonetimi_talep DROP CONSTRAINT degisiklik_yonetimi_talep_sinifli;
ALTER TABLE degisiklik_yonetimi_talep ADD CONSTRAINT degisiklik_yonetimi_talep_sinifli CHECK (
  durum IN ('gonderildi', 'geri_cekildi') OR sinif IS NOT NULL
);
ALTER TABLE degisiklik_yonetimi_talep DROP CONSTRAINT degisiklik_yonetimi_talep_analizli;
ALTER TABLE degisiklik_yonetimi_talep ADD CONSTRAINT degisiklik_yonetimi_talep_analizli CHECK (
  durum IN ('gonderildi', 'analizde', 'geri_cekildi') OR etki IS NOT NULL
);
