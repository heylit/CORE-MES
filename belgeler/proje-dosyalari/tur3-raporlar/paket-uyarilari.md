# Paket guvenlik uyarilari (npm audit), salt okuma rapor

Ana dal: dd7fd6c. Node v24.21.0, npm 11. `npm ci` ve ardindan `npm audit` kosuldu. Depoda degisiklik yok, commit yok.
Ozet satiri (DOGRULANDI, cikti): `16 vulnerabilities (5 moderate, 8 high, 3 critical)`.

16 kayit aslinda 5 kok kaynaktan geliyor. Kalan 11 kayit bunlarin zincirindeki paketler.

## Kaynaklara gore

### 1. pdfjs-dist 3.11.174 (yuksek), Arkon
- Uyari: GHSA-wgrm-67xf-hhpq. Kotu niyetli bir PDF acilinca betik calisabiliyor. Etkilenen surumler <=4.1.392, duzeltme 4.2.67'de.
- Nereden: `package.json` devDependencies `pdfjs-dist-3: npm:pdfjs-dist@3.11.174`. Yalniz Arkon kullaniyor: `arkon/vite.config.ts` 12-13 `build/pdf.min.js` ve `pdf.worker.min.js` dosyalarini kopyaliyor, `arkon/web/index.html` 19-22 bunlari yukluyor.
- Erisilebilir mi: DOGRULANDI, buyuk olcude kapali. Tek cagri `arkon/web/src/app/pdf.ts:8` ve `getDocument({ ..., isEvalSupported: false })` ile yapiliyor. Bu acik, yazi tipi yolunu `eval` ile derlerken kullaniliyor; `isEvalSupported: false` o yolu kapatiyor. VARSAYIM: GitHub uyarisi ve pdf.js'in kendi duyurusu bu ayari gecici onlem olarak veriyor; bu belgeyi bu oturumda yeniden okumadim.
  Ek savunma YOK: Arkon'un icerik politikasi yalniz rapor kipinde (`arkon/sun.ts:33` `Content-Security-Policy-Report-Only`), yani `unsafe-eval` yasagi uygulanmiyor, yalniz raporlaniyor.
- Secenekler:
  a) Kabul (bugunku durum). `sunucu/moduller/arkon/UYUM-BORCU.md` 107. satirda zaten yazili. Arkon ekranina etkisi yok.
  b) 4.2.67 ya da sonrasina yukseltme. DOGRULANDI: 4.x paketinde `build/pdf.min.js` yok, yalniz `pdf.min.mjs` ve `pdf.worker.min.mjs` var (`npm pack --dry-run`). Bu yuzden Arkon'un yukleme bicimi (`ARKON_FILES`, `window.pdfjsLib`, `arkon/vite.config.ts` kopya listesi) degisir. Arkon ekrani disarida yazildi; degisiklik Arkon'un sahibine istek olarak gider. Tabletlerdeki tarayicinin 4.x ya da 6.x'i calistirip calistirmadigini BILMIYORUM.
  c) Icerik politikasini uygulama kipine almak (`unsafe-eval` olmadan). Paket degismez, ama Arkon'un baska kutuphaneleri (OCR, 3B) `eval` kullaniyorsa onlar kirilir. Bunu `sunucu/moduller/arkon/FARK.md` 56. satir "bilinmiyor" diye yaziyor; tarayici denemesindeki CSP satirlari bunu gosterecek.

### 2. tar <=7.5.20 (kritik) ve @mapbox/node-pre-gyp (yuksek)
- Nereden: DOGRULANDI. `pdfjs-dist@3.11.174`'un istege bagli bagimliligi `canvas ^2.11.2` (`npm view`), `canvas` de `@mapbox/node-pre-gyp`'i, o da `tar`'i istiyor.
- Erisilebilir mi: DOGRULANDI, hayir. `npm ls --all tar` bos donuyor; paket kilit dosyasinda kayitli ama kurulu degil. npm 11 `canvas`'in kurulum betigini calistirmiyor ("install scripts not yet covered by allowScripts"). Kurulu olsa bile yalniz `canvas` derlenirken kendi indirdigi arsivi acardi; uygulamanin hicbir yeri tar acmiyor.
- Secenekler: a) kabul; b) `npm audit fix` (zorlamasiz) yalniz kilit dosyasini gunceller, ama kilit degisikligi bagimlilik degisikligidir ve onay ister; c) pdfjs 4.10 ve sonrasi `canvas` yerine `@napi-rs/canvas` istiyor (DOGRULANDI, `npm view`), o yukseltmeyle bu zincir kendiliginden kalkar. Arkon ekranina etkisi yalniz c'de, 1b ile ayni.

### 3. vitest 2.1.9 zinciri (kritik): tinypool, vite 5.4.21 (ic), vite-node, @vitest/mocker, esbuild 0.21.5
- Nereden: `vitest ^2.1.8` (devDependency). Yalniz istemci testleri (`npm run test:istemci`, `test:modul`).
- Erisilebilir mi: DOGRULANDI, hayir; yalniz test sirasinda calisiyor, uretimde yok.
  - tinypool (kritik): saldirganin worker seceneklerini denetlemesi gerekir. Kendi testlerimizin girdisi bu degil.
  - Vitest UI acigi (kritik): yalniz `--ui` sunucusu acikken. `@vitest/ui` kurulu degil, betiklerde `--ui` yok.
  - Ic vite 5.4.21 ve esbuild 0.21.5: gelistirme sunucusu aciklari. vitest bunlari ag sunucusu olarak acmiyor. Gelistirme sunucusu (`gelistir:istemci`) ust duzeydeki vite 6.4.3 ve esbuild 0.25.12'yi kullaniyor; bunlar uyari listesinde yok.
- Secenekler: a) kabul; b) vitest 4.1.11 ya da sonrasina yukseltme. Ana surum degisiyor, test yapilandirmasi ve bazi test API'leri degisebilir; ne kadar oldugunu BILMIYORUM, denemek gerekir. Arkon ekranina etkisi yok (yalniz test).

### 4. react-router 6.30.6 ve react-router-dom (orta)
- Uyarilar: `<Link>` ve `useNavigate` ile ters egik cizgiden acik yonlendirme; SSR hydration'da `deserializeErrors`. Duzeltme yalniz 7.18 ve sonrasinda; 6.x icin duzeltme yok (DOGRULANDI, son 6.x 6.30.6).
- Nereden: `react-router-dom ^6.28.0` (dependencies). Uretimde kabukta calisiyor.
- Erisilebilir mi: DOGRULANDI, hayir.
  - SSR yok: `istemci/src/App.tsx:31` `BrowserRouter`, hydration verisi yok.
  - Yonlendirme hedefleri sabit: menu yollari (`ortak/rota/cerceve-gorunumu.ts`, `IkinciMenu.tsx`, `Kabuk.tsx`). Arkon'dan gelen gorunum adi `encodeURIComponent` ile `/arkon/` altina konuyor (`ArkonCercevesi.tsx:66`), ters egik cizgi `%5C` olur.
  - Kullanici metni yonlendirme hedefi olmuyor.
- Secenekler: a) kabul; b) v7'ye yukseltme. Ana surum; kabuktaki yonlendirme kodu etkilenir. Arkon cercevesinin icine etkisi yok, `ArkonCercevesi.tsx` gecis kodu denenmeli.

### 5. stylelint 17.16.0 zinciri (yuksek): braces 3.0.3, micromatch, fast-glob, globby
- Uyari: braces, cok derin ic ice desenle yigin tasmasi (DoS). Duzeltilmis braces surumu yok. npm'in onerdigi "stylelint 7.7.0" eski bir surume dusurmek, gecerli bir cozum degil.
- Erisilebilir mi: DOGRULANDI, hayir. Desen yalniz `package.json` betigindeki `"istemci/**/*.css"`; yalniz lint sirasinda calisiyor.
- Secenekler: a) kabul (oneri); b) braces duzeltilince stylelint guncellemesi. Arkon ekranina etkisi yok.

## Sorulacak kararlar (kodla cevap)
- P1 pdfjs: a kabul, borcta kalir (oneri: erisim `isEvalSupported: false` ile kapali); b 4.x/6.x yukseltme, Arkon sahibine istek ve tablet denemesi; c icerik politikasini uygulamaya al (tarayici denemesindeki CSP satirlarindan sonra).
- P2 vitest: a kabul (oneri: yalniz test); b 4.1.11+ yukseltme, ayri kart, test calismalari degisebilir.
- P3 react-router: a kabul (oneri: SSR yok, hedefler sabit); b v7 yukseltme, ayri kart.
- P4 tar/node-pre-gyp ve stylelint zinciri: a kabul (oneri: kurulu degil ya da yalniz lint); b `npm audit fix` ile kilit guncelleme (bagimlilik degisikligi, onay ister).

## Kosulanlar
- `npm ci` cikis 0; `npm audit` cikis 1 (uyari var).
- `npm audit --json`, `npm ls`, `npm view` (pdfjs, canvas, vitest, react-router-dom surumleri), `npm pack pdfjs-dist@4.10.38 --dry-run`.
- `npm audit fix --dry-run`: degisiklik yazmadi, `git status` temiz.
Kosulmayan: hicbir yukseltme denenmedi (package.json ve kilit dosyasi degismez).
