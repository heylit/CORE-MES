# Uygulama notu: finans, tam teslim

Taban commit: c2c9871. Teslim adı: `teslim-finans-c2c9871.zip`. Firma teslimini (`teslim-finans-firma-c2c9871.zip`) içerir ve onun yerine geçer; firma göçü değişmedi, para kayıtları yeni göçle gelir.

## Uygulama adımları

1. Zip'teki dosyaları depo köküne aynı yollarla kopyalayın. Firma teslimi oturtulmuşsa aynı yollardaki dosyaların üstüne yazılır; firma göçü (`20261008132200_finans_firma.sql`) bit bit aynıdır.
2. CEKIRDEK-ISTEKLERI.md: toplayıcı satırları (bölüm 1), `TAM_DENETLENMEYEN_UCLAR` satırı (bölüm 2), `chart.js@4.4.1` bağımlılığı (bölüm 3), dosya türü istisnası (bölüm 4).
3. `npm install` ve `npm run goc`: `20261008132300_finans_cekirdek.sql` uygulanır (yürürlükteki KDV oranlarını ve tek ayar satırını da yazar).
4. Rol satırları ayrı göçle (CEKIRDEK-ISTEKLERI.md bölüm 5).

## Koşulan denetimler (Node 24.21.0, PostgreSQL 16.15; çalışma kopyasında çekirdek istekleri eklenmiş halde)

| Komut | Sonuç |
|---|---|
| `npm run tip` | çıkış kodu 0 |
| `npm run lint` | çıkış kodu 0 |
| `npm run sinir -- --modul finans` | "Sınır denetimi: 0 ihlal", "Döngü denetimi (finans): 0 döngü", "Göç damgası denetimi: 0 ihlal"; "Yol denetimi: 4 ihlal" = çalışma kopyasındaki çekirdek istekleri (`paylasilan/islemler.ts`, `paylasilan/sayfalar.ts`, `package.json`, `package-lock.json`), teslimde yok |
| `node --test sunucu/moduller/finans/kurallar.test.ts` | pass 15, fail 0 |
| `node --import ./araclar/ortam-yukle-goc.ts --test sunucu/moduller/finans/*.test.ts` | tests 64, pass 64, fail 0 (gerçek PostgreSQL) |
| `npx vitest run --config istemci/vite.config.ts istemci/src/moduller/finans` | Tests 9 passed (9) |
| `CI=true npm run test:sunucu` (bütün depo) | tests 1029, pass 1029, fail 0 |
| `CI=true npm run test:istemci` (bütün depo) | Test Files 34 passed, Tests 504 passed |
| Tarayıcı uçtan uca (Playwright, `npm run sunucu` + vite, gerçek giriş, kabuk) | GUVENLIK-DENETIMI.md bölüm 3C |
| Canlı saldırı denemeleri (curl) | GUVENLIK-DENETIMI.md bölüm 3A |
| Temiz taban denemesi: sıfırdan açılmış c2c9871 + bu zip + CEKIRDEK-ISTEKLERI'ndeki satırlar | `npm run tip` 0; finans sunucu testleri 62/62; finans istemci testleri 9/9 |

Not: zip git deposu değildir; iki araç testi git ister, çalışma kopyası `git init` ile depoya çevrildi. Çalışma ortamında PostgreSQL komutlar arasında zaman zaman kapandı (ortam); yeniden başlatılınca bütün koşular geçti.

## Koşulamayanlar

- PostgreSQL 18 (Actions sürümü): yalnız 16.15 ile koşuldu.
- `npm run teslim` deneme aracı: `.html`, `.woff2`, `.txt` dosyalarını kilitli gösterir (şartnamede bilinen sınır).
- Logo köprüsü ve eşleme akışı: köprü yok; yalnız alan, kilit ve tekillik kuralları sınandı.
- Cihaz (telefon, tablet) kabulü: kullanıcıda.

## Varsayımlar (mesajda ulaşmayan ya da çelişen yerler)

- Belge parasal alanlarının kilidi (FNS-9) ve Logo kilidi (FNS-10) belge tarihini ve firmayı da kapsar.
- "Karşılıksız" işareti ve çekin geri alınması `finans.yonet` ister; ileri geçişler (tahsile verme, tahsil, ödendi, ciro) `finans.yaz`.
- Çek yalnız aynı para birimindeki banka hesabına tahsil edilir ya da oradan ödenir (kasa ve kredi kartı değil).
- FNS-46 onaylandığı haliyle: pasif firmaya yeni ödeme de açılamaz (eski faturasının tahsilatı dahil). Tahsilat açık kalsın istenirse tetikleyiciden ödeme tablosu çıkarılır (tek satır).
- Bütçe değeri girildiği aydan itibaren geçerlidir; aynı ay için yeniden girilen değer o ayın satırını düzeltir, önceki ayların satırları kalır (D-6).
- Toplu aktarımda firma eşlemesi Türkçe İ/I farkını yok sayar ("FIRMA" = "Firma").
- Yürürlükteki KDV oranları (0, 1, 10, 20; 10.07.2023'ten) göçle sistem sabiti olarak girer; eski oranlar Ayarlar'dan eklenir.
- Grafik kitaplığı paketin UMD dosyasından göreli yolla okunur (paket `exports` alanında açmıyor); çekirdek takma ad tanımlarsa tek satır değişir.
