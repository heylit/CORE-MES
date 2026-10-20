# UYUM BORCU: araçlar ve geliştirme paketleri

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI (kod ya da komut), VARSAYIM, BİLMİYORUM.
Sınıflar: TUTAN (kullanımı tutar), ETKİLEYEN (kullanımı etkiler), SONRA. Ölçüm: `npm audit`, ana dal dd7fd6c, 08.10.2026
(rapor: proje dosyaları `tur3-raporlar/paket-uyarilari.md`).

## Canlı öncesi yeniden bakılacak
1. KAPANDI (kullanıcı kararı 141 a, 19.10.2026): `vitest` ^4.1.12'ye yükseltildi; `vite-node` artık kurulu değil ve
   `vitest`/`@vitest/mocker` bulgusu `npm audit`'ten kalktı. DOĞRULANDI: `npm ls vite-node` boş, `npm audit` (19.10.2026).
2. SONRA. Lint paketi `stylelint` 17.16.0 zinciri: `braces` 3.0.3 (yüksek, çok derin iç içe desenle yığın taşması),
   `micromatch`, `fast-glob`, `globby`. Kullanıcı kararı P4 a (08.10.2026): kabul. Neden: desen yalnız `package.json`
   betiğindeki `"istemci/**/*.css"`; yalnız lint sırasında çalışır. Düzeltilmiş `braces` sürümü yok; npm'in önerdiği
   `stylelint` 7.7.0'a inmek çözüm değildir. DOĞRULANDI: `npm audit --json`, `npm ls`.
   Uyum: `braces` düzeltmesi çıkınca `stylelint` güncellemesi (yeni bağımlılık sürümü, onayla).
   19.10.2026 (141 a sonrası) yeniden bakıldı: zincir aynı (stylelint > globby > fast-glob > micromatch > braces), ciddiyet
   yüksek, yol yalnız geliştirme (lint). Koordinatör kararıyla kabul sürer; düzeltilmiş `braces` sürümü çıkınca kapanır.
   DOĞRULANDI: `npm audit` (19.10.2026).
3. SONRA. Dışa aktarma paketi `exceljs` zinciri: `uuid` <11.1.1 (orta, v3/v5/v6'da `buf` verilince sınır denetimi yok).
   Yol: Excel dışa aktarma (üretimde çalışır); `uuid`'in yalnız `buf` verilen çağrısı etkilenir, `exceljs`'in o çağrıyı
   yapıp yapmadığını BİLMİYORUM. npm'in tek önerisi `exceljs` 3.4.0'a inmek; yapılmaz (eski sürüm, yeni paket kararı gerekir).
   Koordinatör kararıyla kabul (19.10.2026, 141 a sonrası). Uyum: `exceljs`'in düzeltilmiş `uuid`'li sürümü çıkınca
   güncelleme (onayla). DOĞRULANDI: `npm audit` (19.10.2026).

Bu dosyada olmayan iki kabul kendi sahiplerinde: `tar` ve `@mapbox/node-pre-gyp` Arkon borcunda (pdfjs zinciri),
`react-router-dom` ortak arayüz borcunda.
