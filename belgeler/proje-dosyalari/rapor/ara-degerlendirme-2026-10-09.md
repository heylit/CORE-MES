# Ara değerlendirme: kod büyüklüğü ve kalite (09.10.2026)

Ana dal `6e04d3e` (Merge PR #366, 162-satin-alma-bagla). Göç sırası: 69 göç, ilki `20261005120000_kisiler.sql`, sonuncusu `20261009024000_satin_alma_katalog_malzeme_bagi.sql` (`npm run harita`). Salt okuma; dal, commit, çekme isteği yok.

## 0. Toplam büyüklük ve mimari (ek soru, 09.10.2026)

### Toplam büyüklük (`git ls-files`, satır; DOĞRULANDI)

| Tür | Dosya | Satır |
|---|---|---|
| TypeScript kod (.ts, .tsx; test hariç) | 453 | 53.312 |
| TypeScript test | 185 | 44.441 |
| Gömülü prototip HTML | 4 | 14.071 |
| CSS | 51 | 4.284 |
| SQL (69 göç + 3 araç betiği) | 72 | 5.490 |
| Belge (.md) | 161 | 7.681 |
| **Toplam (yukarıdakiler)** | **926** | **129.279** |
| Diğer (package-lock dahil .json 8.578, yazı tipleri, yapılandırma) | 51 | 12.307 |
| Depodaki her şey | 977 | 141.586 |

Elle yazılan kod (TS kod + CSS + SQL) yaklaşık 63 bin satır. Testlerle birlikte 107 bin satır. Gömülü HTML, prototip olarak dışarıdan geldi.

### Dil ve çerçeveler (sürümler `node_modules` içinden; DOĞRULANDI)

- Dil: TypeScript 5.9.3, her yerde `strict` (`tsconfig.base.json:5`). İstisna `arkon/web` (`strict: false`). Tanımlayıcılar Türkçe (ASCII). Arkon web ve satın alma merkezinin içinde İngilizce adlar da var.
- Sunucu: Node 24 (`engines`), derleme adımı yok, `.ts` tip silmeyle doğrudan koşar (ADR 0001 madde 2). Fastify 5.12.5, şema doğrulaması zod 3.25.76.
- Veri: PostgreSQL (CI'da 18), sürücü pg 8.23.1. ORM yok, SQL elle yazılır ve yalnız `sorgular.ts` içinde durur. İki veritabanı kullanıcısı var: göç sahibi ve uygulama (ADR 0005). Göçler zaman damgalı tek dosyalardır, uygulanmış göç değişmez.
- İstemci: React 18.3.1, react-router-dom 6.30.6, @tanstack/react-query 5.104.1, Vite 6.4.3. Grafikte chart.js 4.4.1, 3B'de three 0.169.0.
- Arkon web: React ve htm 3.1.1 (JSX yok), ayrı Vite derlemesi, `/arkon-mes/` yolunda sunulur (`arkon/sun.ts`). Geliştirme paketleri: pdf.js 3.11, tesseract.js (OCR), occt-import-js (STEP), jsqr, qrcode-generator.
- Test: sunucuda Node'un kendi test koşucusu, gerçek PostgreSQL'de koşu başına ayrı şema; istemcide vitest 2.1.9, jsdom ve Testing Library.
- Denetim araçları: eslint 10.12 ve typescript-eslint 8.71, stylelint 17.16. Ayrıca kendi araçları var (`araclar/`): sınır denetimi, harita, teslim inceleme, durum.

### Mimari (ADR 0001, 0006; DOĞRULANDI dosyadan)

- Modüler monolit: tek süreç, tek PostgreSQL, mikroservis yok.
- Klasörler:
  - `sunucu/cekirdek`: uç tanımı (`uc({...})`), yetki, oturum çerezi, transaction, sürüm, kapsam, göç koşucusu.
  - `sunucu/moduller/<ad>`: her modülde `uclar.ts`, `servis.ts`, `sorgular.ts` (yalnız SQL), `kurallar.ts` (saf iş kuralı), `disari.ts` (başka modüllere açılan tek kapı) ve testler.
  - `paylasilan/`: sunucu ve istemcinin ortak sözleşmeleri. Altında `sozlesme/<ad>.ts` (zod şemaları), `islemler/` (yetki işlemleri), `sayfalar/` (menü ve ikinci menü verisi), `ayarlar/`.
  - `istemci/src/ortak`: kabuk, menü, tasarım değişkenleri, ortak bileşenler, veri kancaları. `istemci/src/moduller/<ad>` modül ekranlarıdır.
- Uç kalıbı: her uç tek tanımda yazılır: yöntem, yol, sayfa, yetki işlemi, şemalar, işleyici. Okuma kaynak, yazma komut. Yazma tek transaction'da koşar. Tanımsız uç yoktur.
- Yetki: işlem tabanlı (ADR 0003). Rol, işlem satırlarıyla verilir ve okuma ucunda sayfa işlemi denetlenir (ADR 0007).
- Modüller arası bağ: yalnız `disari.ts` üzerinden olur, yön tektir ve döngü yoktur (ADR 0006). `npm run sinir` bunu denetler: 571 dosya, 0 ihlal.
- Bugünkü sunucu bağ grafiği (`../<ad>/disari.ts` ithalleri, test hariç):
  - arkon → durus-nedenleri, istasyonlar, kisiler, uretim-emirleri
  - uretim-emirleri → durus-nedenleri, istasyonlar, kisiler
  - plan → rota, malzemeler, istasyonlar, kisiler
  - rota → malzemeler, istasyonlar, ayarlar, kisiler
  - stok → uretim-emirleri, malzemeler, kisiler
  - satin-alma → finans, malzemeler, ayarlar, kisiler
  - malzemeler → ayarlar, kisiler
  - istasyonlar, kalibrasyon, oturum, denetim → kisiler
  - ayarlar → denetim
- Grafiğin tabanında kisiler var: 11 modül ona bağlı. finans hiçbir modüle bağlı değil. Henüz bağlanmamış yerler (stok → satın alma, plan → iş emri) UYUM-BORCU'da "bağlamada kapanacak" diye yazılı.
- İstemci modülleri yalnız `ortak`'ı ithal ediyor. Tek çapraz bağ var: bir modül `../istasyonlar/disari.ts`'i kullanıyor.
- Ekran mimarisi tek değil, dört türlü (bölüm 7, madde 1). Çekirdekteki kurallar (tasarım değişkeni, ortak bileşen, lint) yalnız React ve ortak arayüzle yazılan ekranlarda tam geçerli.

### Değerlendirme (VARSAYIM, yukarıdaki ölçümlere dayalı yorum)

Sunucu tarafı tutarlı ve kurala bağlı. Bütün modüller aynı beş dosya kalıbını kullanıyor, sınır aracı yönü ve döngüyü denetliyor ve testler gerçek veritabanında koşuyor. Dağınıklık istemci tarafında: dışarıdan gelen prototip ekranlar olduğu gibi alındığı için dört ayrı ekran tekniği yan yana duruyor. Bakım yükü ve güvenlik denetimi en çok orada artar.

## 1. Komut sonuçları (DOĞRULANDI, bu oturumda koşuldu)

| Komut | Sonuç |
|---|---|
| `npm run tip` | çıkış 0 (31 sn) |
| `npm run sinir` | "Sınır denetimi: 571 dosya, 0 ihlal." |
| `npm run lint` (eslint + stylelint) | çıkış 0, uyarı yok |
| `npm run test:sunucu` (gerçek PostgreSQL) | tests 1526, pass 1526, fail 0, skipped 0, todo 0 (2 dk 39 sn, eşzamanlı 8) |
| `npm run test:istemci` (vitest) | Test Files 61 passed (61), Tests 698 passed (698) (50 sn) |
| `npm run derle:istemci` | çalıştırılmadı |

Ortam farkı: yerelde Node 22.22 (package.json `engines` >=24) ve PostgreSQL 16 (CI 18) kullanıldı. Sonuçların CI'daki ile aynı olacağı VARSAYIM (ana dal CI'ı koordinatöre göre yeşil).

## 2. Büyüklük (satır, `wc -l` eşdeğeri; boş satır ve yorum dahil)

Toplam: TS kod 53.206, TS test 44.392, CSS 4.284, gömülü prototip HTML 14.059, göç SQL 5.226 (69 dosya). 185 test dosyası, depoda 977 dosya.

| Parça | Sunucu kod | Sunucu test | İstemci kod | İstemci test | CSS | Prototip HTML | Paylaşılan | Göç (adet) |
|---|---|---|---|---|---|---|---|---|
| Çekirdek (sunucu/cekirdek) | 2.410 | 5.876 | - | - | - | - | - | 115 (2) |
| Paylaşılan kök | 526 | 496 | - | - | - | - | - | - |
| Ortak arayüz (istemci/src/ortak + kök) | - | - | 3.632 | 5.064 | 974 | - | - | - |
| Araçlar | 3.881 | 3.878 | - | - | - | - | - | - |
| arkon (sunucu + istemci köprüsü) | 2.728 | 3.873 | 553 | 657 | 7 | - | 190 | 99 (4) |
| arkon web uygulaması (`arkon/`) | - | - | 6.514 | 0 | 1.619 | 59 | - | - |
| satin-alma | 1.166 | 1.144 | 4.522 | 268 | 751 | - | 371 | 460 (6) |
| stok | 1.737 | 719 | 3.533 | 468 | 245 | - | 692 | 381 (5) |
| rota (plan ekranları dahil) | 1.739 | 796 | 3.472 | 436 | 540 | - | 347 | 247 (3) |
| istasyonlar | 1.181 | 1.563 | 1.045 | 495 | 9 | - | 337 | 239 (10) |
| finans | 1.411 | 1.259 | 313 | 174 | 4 | 4.052 | 397 | 719 (3) |
| malzemeler | 1.228 | 3.626 | 511 | 432 | 9 | 9.948 | 182 | 2.202 (10) |
| uretim-emirleri (dışarıda) | 850 | 2.085 | 445 | 544 | 22 | - | 172 (+187 test) | 147 (4) |
| kisiler | 877 | 2.443 | 482 | 566 | 22 | - | 82 | 319 (12) |
| plan | 681 | 367 | (rotada) | - | - | - | 63 | 53 (1) |
| kalibrasyon | 567 | 688 | 457 | 226 | 20 | - | 140 | 49 (1) |
| terminal | - | - | 923 | 1.418 | 12 | - | 8 | - |
| dosya | 530 | 470 | - | - | - | - | 40 | 51 (1) |
| durus-nedenleri | 272 | 450 | 316 | 200 | 2 | - | 86 | 57 (1) |
| oturum | 335 | 1.188 | 49 | 0 | 13 | - | 22 | 46 (2) |
| denetim | 201 | 471 | 136 | 91 | 9 | - | 80 | 20 (2) |
| saglik | 191 | 389 | - | - | - | - | 35 | - |
| ayarlar | 119 | 284 | 113 | 174 | 19 | - | 69 | 9 (1) |
| sistem | - | - | 123 | 348 | 7 | - | - | - |
| istek-kimligi | 97 | 579 | - | - | - | - | - | 13 (1) |

Göç sahibi göç adının önekinden çıkarıldı; `kisiler_*` göçlerinin bir kısmı başka modüllerin rol satırlarını taşır (VARSAYIM: adlar böyle diyor). Malzemeler göçünün 1.501 satırı tek dosyadır (`20261006191108_malzemeler_katalog.sql`).

Test/kod oranı: sunucu 1,15 (37.708 / 32.873, arkon web hariç tutulursa daha yüksek), istemci 0,28 (6.497 / 23.507, arkon web dahil). Oran düşük istemciler: arkon web 0, satin-alma 0,06, stok 0,13, rota 0,13.

## 3. Uyum borcu (UYUM-BORCU.md madde sayısı, yaklaşık)

Sayım betikle yapıldı (numaralı, madde imli ve tablo satırları); dosyaların biçimi tek değil, sınıf başlıktan ya da `[...]` etiketinden okundu. "Sınıfsız" başlığı ne tutan ne bağlama ne sonra diyen maddedir. Arkon ve malzemelerde kapanan maddeler açıklarla aynı dosyada durur (arkon'da 10, malzemelerde 16 "kapandı" geçişi), bu yüzden bu iki sayı fazladır.

| Parça | Toplam açık | Kullanıma açmadan önce | Bağlamada | Sonra | Sınıfsız |
|---|---|---|---|---|---|
| arkon | 90 | 23 | 13 | 0 | 54 |
| malzemeler | 51 | 0 | 9 | 0 | 42 |
| finans | 36 | 0 | 12 | 18 | 6 |
| satin-alma | 36 | 0 | 33 | 3 | 0 |
| stok | 23 | 2 | 9 | 2 | 10 |
| rota | 21 | 0 | 21 | 0 | 0 |
| istasyonlar | 16 | 2 | 9 | 5 | 0 |
| plan | 12 | 0 | 12 | 0 | 0 |
| kalibrasyon | 7 | 0 | 3 | 4 | 0 |
| denetim | 6 | 0 | 1 | 5 | 0 |
| ayarlar | 5 | 0 | 0 | 5 | 0 |
| durus-nedenleri | 5 | 0 | 2 | 3 | 0 |
| kisiler | 4 | 0 | 1 | 3 | 0 |
| dosya | 4 | 0 | 0 | 0 | 4 |
| oturum | 4 | 0 | 0 | 4 | 0 |
| araçlar | 2 | 0 | 0 | 2 | 0 |
| ortak arayüz | 2 | 0 | 0 | 2 | 0 |
| uretim-emirleri, saglik, istek-kimligi | dosya yok | | | | |

Toplam yaklaşık 320 madde.

## 4. Kural ve test eşleşmesi (KURAL-TEST.md kimliklerinin test adlarında geçmesi)

| Parça | Kural kimliği | Test adında geçen | Geçmeyenler |
|---|---|---|---|
| finans (FNS) | 55 | 48 | FNS-15, 16, 28 (yalnız kısıt), 36, 52 (ekranda), 42, 58 |
| rota (RT) | 59 | 54 | RT-21 (harita ile), RT-40, 50, 51, 53 (yalnız kısıt, test sütunu "yok") |
| stok (DEP) | 51 | 44 | DEP-01 (kısıt), 26, 30-33, 35, 36 (bağlanmadı), 43-46 (sonraki adım), 52 |
| satin-alma (SAT) | 29 | 29 | - |
| malzemeler (MKK) | 16 | 14 | - (iki kimlik test adında yok; hangileri ayrıca bakılmadı) |
| dosya (DSK) | 14 | 14 | - |
| istasyonlar (IS) | 10 | 9 | IS12 (adla değil açıklamayla eşleşiyor) |
| kisiler (KS) | 3 | 3 | - |
| plan (PL) | 2 | 2 | - |
| denetim (DNT) | 1 | 1 | - |
| arkon, oturum, ayarlar | kimliksiz tablo (46, 16, 9 satır) | eşleşme sayılamadı | |
| kalibrasyon, durus-nedenleri | KURAL-TEST.md yok | | |

"Her kural iki test" (izinli + reddedilen) ölçülmedi; yalnız kimliğin test adında geçmesi sayıldı. Yalnız veritabanı kısıtına bağlanan kuralların kısıt testi olup olmadığı BİLMİYORUM.

## 5. Kalite göstergeleri (grep, test dosyaları hariç tutulanlar belirtildi)

- `@ts-nocheck` 0, `@ts-ignore` 0, `@ts-expect-error` 35 (hepsi test dosyalarında), TODO/FIXME 0, `eslint-disable` 4 (araclar).
- `: any` 76 ve `as any` 4: hepsi `arkon/` altında (45'i `arkon/web/src/data/store.ts`).
- `innerHTML` 39 (test dışı): hepsi `satin-alma/merkez`; `dangerouslySetInnerHTML` 2 (`arkon/web`). Satın almada kaçış elle `esc()` ile (UYUM-BORCU madde 15).
- Okuma ucunda `yetki: 'oturum'` (ADR 0007 dışı): stok 27, rota 10, denetim 7, arkon 6, dosya 3, uretim-emirleri 3 (yaklaşık, grep).
- `tekrarKorumali: true`: finans 11 / 42 yazma; stok 0 / 24, istasyonlar 0 / 20, arkon 0 / 7, malzemeler 0 / 6, durus-nedenleri 0 / 4 (yaklaşık, grep; tekrar koruması her yazmada gerekmez).

## 6. Büyük dosyalar (>= 600 satır, test dışı kod)

| Satır | Dosya |
|---|---|
| 9.948 | istemci/src/moduller/malzemeler/katalog/katalog.html (gömülü prototip) |
| 4.052 | istemci/src/moduller/finans/cerceve/finans.html (gömülü prototip) |
| 1.614 | arkon/web/src/styles/style.css |
| 1.178 | sunucu/moduller/arkon/kurallar.ts |
| 1.146 | istemci/src/moduller/satin-alma/merkez/ui.ts |
| 860 | sunucu/moduller/stok/servis.ts |
| 826 | sunucu/moduller/arkon/servis.ts |
| 809 | istemci/src/moduller/satin-alma/merkez/views.ts |
| 739 | istemci/src/moduller/satin-alma/merkez/styles.css |
| 737 | araclar/teslim-incele.ts |
| 701 | sunucu/moduller/rota/servis.ts |
| 632 | araclar/harita-ayrinti.ts |
| 620 | sunucu/moduller/finans/servis.ts |

## 7. Belirgin kalite riskleri

1. Dört ayrı ekran mimarisi var: React ve ortak arayüz (çoğu modül); yalıtılmış çerçevede tek dosya HTML prototip (malzemeler 9.948, finans 4.052 satır); düz TypeScript ve DOM, `innerHTML` ile (satın alma 4.522 satır); ayrı Arkon web uygulaması (6.514 satır). Son üçünde lint, tasarım değişkeni ve 360/768/1280 kuralları ya kapsam dışı ya ölçülmedi.
2. Arkon web uygulaması denetimin dışında: eslint yok sayar (`eslint.config.js:38` `'arkon/web/**'`), `strict: false` ve `noImplicitAny: false` (`arkon/web/tsconfig.json:11-12`; yalnız `tsconfig.core.json` alt kümesi sıkı), test dosyası 0.
3. İstemci testi ince: istemci test/kod 0,28; satın alma 268 / 4.522, stok 468 / 3.533, rota 436 / 3.472. Sunucu tarafı güçlü (1.526 test, gerçek PostgreSQL).
4. Uyum borcu ölçülemiyor: dört farklı dosya biçimi; arkon ve malzemelerdeki 141 maddenin 96'sı sınıfsız, kapanan maddeler açıklarla karışık. Aşama 2'de "kullanımı etkileyenlerden başlayarak" sırası bu hâliyle sayılamaz.
5. Okuma yetkisi ve tekrar koruması borcu stokta yoğun: 27 okuma ucu `'oturum'`, 24 yazma ucunun hiçbiri tekrar korumalı değil (UYUM-BORCU 12 ve 13, "kullanıma açmadan önce" sınıfı).
6. Plan gerçek veriyle çalışmıyor: iş emri kaynağı geçici karşılık (plan UYUM-BORCU P-B1); plan ekranları rota istemcisinde (P-B7).
7. Belge eksikleri: kalibrasyon ve durus-nedenleri'nde KURAL-TEST.md yok; arkon, oturum, ayarlar tablolarında kural kimliği yok; uretim-emirleri dışarıda olduğu için hiçbir teslim belgesi yok.

## 8. Yöntem ve sınırlar

Sayımlar `/tmp` altındaki betiklerle yapıldı (dosya uzantısı ve klasöre göre; `paylasilan/{sozlesme,sayfalar,islemler,ayarlar}/<modul>.ts` modüle yazıldı). Satır sayısı mantıksal karmaşıklık değildir. Grep sayımları yaklaşık; uç sayımında `uc({` geçişi sayıldı. Kod okunarak yapılan bir inceleme (hata avı) bu raporun kapsamında değildir.
