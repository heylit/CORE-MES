-- Tetikleyici fonksiyonları modülün adıyla başlar (ad kuralı rota_); tetikleyiciler fonksiyonu kimliğiyle tuttuğu için yeniden bağlanmaz.
ALTER FUNCTION rotalar_revizyon_kilitli() RENAME TO rota_revizyon_kilitli;
ALTER FUNCTION rotalar_revizyon_bosaltilmaz() RENAME TO rota_revizyon_bosaltilmaz;
ALTER FUNCTION rotalar_icerik_kilitli() RENAME TO rota_icerik_kilitli;
