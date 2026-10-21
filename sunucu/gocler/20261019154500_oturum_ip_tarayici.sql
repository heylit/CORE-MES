-- 386 a: Güvenlik Merkezi açık oturumu hangi cihazdan açıldığıyla gösterir. Girişte bir kez yazılır, sonra değişmez.
-- Eski oturumlar boş kalır: girişteki adres ve tarayıcı geriye dönük bilinmez.
ALTER TABLE oturum
  ADD COLUMN ip text CONSTRAINT oturum_ip_dolu CHECK (ip IS NULL OR btrim(ip) <> ''),
  ADD COLUMN tarayici text CONSTRAINT oturum_tarayici_dolu CHECK (tarayici IS NULL OR (btrim(tarayici) <> '' AND char_length(tarayici) <= 300));
