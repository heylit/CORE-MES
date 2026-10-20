# UYGULA: stok, Aşama 1 oturtması (kart #206)

Oturtmada yazıldı (teslimde yoktu; teslimin kendi notları `NOTLAR.md` ve `ON-PAKET-stok.md` "Doğrulananlar"da).

- Teslim: `teslim-stok 08.10.2026 12.55` (63 dosya), taban 5eb9481. Dal: `206-stok-depo`, taban main 9347e1c (paket isteği #316 dahil).
- Tanı ve kararlar: `/mnt/project-files/tur4-raporlar/stok-tani.md`; kullanıcı kararları STK1-STK6 (08.10.2026).
- Uygulama: `npm ci`, `npm run goc` (beş yeni göç `20261008142031`..`35`). Rol x işlem satırı yok: işlemler yalnız yöneticide; satırlar Aşama 2'de, onayla (`BASKA-MODUL-ISTEKLERI.md` K3 tablosu öneridir).
- Koşulan (yerel, Node v22.22.0, PostgreSQL 16; CI Node 24 ve PostgreSQL 18):
  - `npm run tip`: çıkış 0.
  - `npm run lint`: çıkış 0.
  - `npm run sinir`: çıkış 0. `npm run sinir -- --modul stok`: sınır 488 dosya 0 ihlal, döngü 0, göç damgası 0 ihlal; yol denetimi yalnız dar istisna satırlarını (`paylasilan/islemler.ts`, `paylasilan/sayfalar.ts`) gösterir.
  - `npm run test:modul -- stok`: sunucu `# tests 43 / # pass 43 / # fail 0`; istemci `Test Files 3 passed, Tests 34 passed`.
  - `npm test` (bütün depo): sunucu `# tests 1299 / # pass 1299 / # fail 0`; istemci `Test Files 51 passed (51)`, `Tests 623 passed (623)`.
  - `npm run derle:istemci`: `built` (500 kB üstü parça uyarısı; derleme başarılı).
- Koşulmayan: tarayıcıda deneme (360, 768, 1280), 3B depo ve kamera gerçek cihazda; Node 24 yerelde.
