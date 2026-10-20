-- Kayıt, ucun modülünü ve istediği yetki işlemini taşır: içerik görünürlüğü ileride modülü okuyabilene bağlanabilsin.
-- Boş olabilir: eski satırlar ve uç katmanı dışında yazılan kayıtlar bu bilgiyi taşımaz; sonradan doldurulmaz (yalnız ekleme).
ALTER TABLE denetim_kaydi ADD COLUMN modul text, ADD COLUMN yetki text;
