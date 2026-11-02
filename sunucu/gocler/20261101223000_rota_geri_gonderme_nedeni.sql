-- ROT-3 a: onaylayan revizyonu düzeltmeye geri gönderirken neden yazar; planlama neyi düzelteceğini revizyonda görür.
-- Boş olabilen sütundur: var olan satırlar boş kalır, veri değişmez. Revizyon yeniden onaya gönderilince boşalır; önceki nedenler
-- değişiklik defterinde (rota_revizyonu_degisiklik) kalır.
ALTER TABLE rota_revizyonu
  ADD COLUMN geri_gonderme_nedeni text
    CONSTRAINT rota_revizyonu_geri_gonderme_nedeni CHECK (char_length(geri_gonderme_nedeni) BETWEEN 1 AND 500);
