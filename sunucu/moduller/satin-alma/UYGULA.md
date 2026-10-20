# UYGULA: satin-alma, Aşama 1 1. tur (kart #162)

- Taban: `main` 4a70288. Dal: `162-satin-alma-uyum`. Göç yok.
- Birleşmeden önce çekirdek: CEKIRDEK-ISTEKLERI.md Ç1 (toplayıcı satırı ve iki test beklentisi). Ç1 olmadan tam `kontrol` üç testte kırmızıdır.
- Koşulan (Node v24.21.0, PostgreSQL 16, Ç1 yerelde gönderilmeden uygulanmış):
  - `node --import ./araclar/ortam-yukle-goc.ts --test 'sunucu/moduller/satin-alma/**/*.test.ts'`: tests 24, pass 24, fail 0, skipped 0.
  - `vitest run src/moduller/satin-alma/`: Test Files 3 passed, Tests 13 passed.
  - `npm run tip`: hata yok. `npm run lint`: hata yok.
  - Tarayıcıda (1280 ve 360): menü, bölüm geçişleri, tedarikçi formunda firma arama, talep açma (tekrar korumalı başlıkla 200).
- Not: `npm run test:modul -- satin-alma` sunucu testlerini bulmuyor ("tests 0"): araç glob'u tırnakla geçiriyor (`araclar/test-modul.ts`); araç kartı değil, bildirildi.
