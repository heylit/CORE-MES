-- 3760 karar 8 a: hareketin yazdığı CORE duruş olayı; neden sonradan eşlenince düzeltme bu olaya yazılır. Yalnız ekler.
ALTER TABLE smartes_hareket ADD COLUMN olay_id int REFERENCES uretim_olayi;
