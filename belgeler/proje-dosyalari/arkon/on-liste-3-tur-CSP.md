# Arkon 3. tur, A1s: içerik güvenliği ilkesi (CSP), adım 1 yalnız-rapor: ön liste (kod yazılmadı)

Dal: N1 birleştikten sonra güncel ana daldan `199-arkon-csp`. Kart #199. Arkon ekranının görünümü ve akışı değişmez; adım 1 hiçbir şeyi engellemez.
Yeni paket yok, `package.json` değişmez, şema değişmez.

## Nereye konur (DOĞRULANDI: `arkon/sun.ts`, `arkon/vite.config.ts`)
- Arkon bugün `/arkon-mes/` yolundan, istemci geliştirme sunucusunun ara katmanıyla (`arkon/sun.ts arkonuSun`) `arkon/dist` içinden sunuluyor.
  İlke bu ara katmanın cevabına HTTP başlığı olarak eklenir: `Content-Security-Policy-Report-Only`. Yalnız `index.html` cevabına; öteki dosyalara gerekmez.
- Yalnız-rapor kipi `<meta>` etiketiyle verilemez, başlık gerekir (belge: CSP düzeyi 3 ve MDN; tarayıcıda denenmedi). Bu yüzden derlemeye değil sunucuya eklenir.
- Satır içi iki betiğin (`index.html`: TMI köprüsünü çağıran satır ve `window.ARKON_FILES`) özeti (sha256), sunucu açılırken `dist/index.html`'den hesaplanır.
  Arkon derlemesi (`npm run derle:arkon`) DEĞİŞMEZ; Arkon yeniden derlenince özet kendiliğinden güncellenir.
- BİLMİYORUM: üretimde istemci çıktısını (Arkon kopyası dahil) neyin sunduğu depoda yok (ters vekil askıda). Orada başlık o sunucunun ayarıdır; adım 1 yalnız `arkon/sun.ts` ile sunulan Arkon'u kapsar.
  Ayrıca ilke yalnız Arkon çerçevesine uygulanır; TMI sayfasının kendisine CSP konmaz.
- Rapor yeri: ihlaller yalnız tarayıcı konsoluna yazılır (`report-uri` yok, dış çağrı yok).

## İlke taslağı ve her satırın nedeni
| Yönerge | Değer | Neden |
|---|---|---|
| default-src | 'self' | Listede olmayan her şey yalnız aynı kökenden |
| script-src | 'self' 'sha256-…'(2) 'wasm-unsafe-eval' | Arkon paketi ve kütüphaneler `vendor/` dosyalarından betik olarak yüklenir (`yukleyici.ts loadLib`); iki satır içi betik özetle; OCCT ve Tesseract wasm ikilisini bellekten derler |
| style-src | 'self' 'unsafe-inline' | Vite CSS dosyası; Arkon ekranı ve çizim svg'si `style="…"` özniteliği kullanır; rapor sayfası satır içi `<style>` yazar |
| img-src | 'self' blob: data: | PDF sayfası tuvalden blob adresine çevrilip `<img>` ile gösterilir (`teknik-resim.ts`); data: önlem |
| font-src | 'self' data: | Yazı tipleri derlemede `dist/assets` altına gelir; PDF okuyucu gömülü yazı tipini gerekirse data: ile yükler |
| worker-src | 'self' blob: | PDF okuyucu çalışan dosyasını betik olarak ana iş parçacığında yüklüyor (VARSAYIM: `pdfjsWorker` tanımlı olunca ayrı çalışan açmaz); açarsa rapor gösterir |
| connect-src | 'self' | `vendor/` ikilileri ve OCR modeli `fetch` ile; TMI uçları köprüden, TMI penceresinin işleviyle gider |
| media-src | 'self' blob: | Kamera akışı `srcObject` ile bağlanır (adres değil); önlem |
| frame-src | 'self' | Android yazdırma yolunda rapor `srcdoc` çerçevesinde açılır |
| object-src | 'none' | Eklenti yok |
| base-uri | 'self' | |
| form-action | 'none' | Arkon form göndermez |
| frame-ancestors | 'self' | Arkon'u yalnız TMI çerçeveler (başlıkta geçerli; yalnız-rapor kipinde yalnız raporlar) |

## Kütüphanelerin ihtiyacı
- PDF okuyucu (pdf.js 3, `pdf.min.js` + `pdf.worker.min.js`): betik 'self'; `isEvalSupported: false` ile açılıyor (DOĞRULANDI: `pdf.ts`), eval gerekmez (VARSAYIM). Sayfa görüntüsü blob: resim. Gömülü yazı tipi için font-src data: gerekebilir.
- OCR (tesseract.js-core, wasm + `eng.traineddata.gz`): betik 'self', wasm için 'wasm-unsafe-eval', model `fetch` 'self' ve tarayıcıda açılır (DecompressionStream, CSP dışı).
  BİLMİYORUM: Emscripten yapıştırıcısı `eval` ya da `new Function` kullanıyor mu (kütüphane dosyasını bu oturumda okuyamadım). Kullanıyorsa rapor `unsafe-eval` ihlali gösterir; o zaman karar sizindir.
- 3B model (occt-import-js wasm + three.js 147 + OrbitControls): betik 'self', wasm için 'wasm-unsafe-eval'. three.js WebGL kullanır; CSP yönergesi gerekmez. Aynı BİLMİYORUM (Emscripten) burada da geçerli.
- QR (jsQR, qrcode-generator): betik 'self'. QR svg'si `dangerouslySetInnerHTML` ile basılır; style-src gerekmez (öznitelik yok).
- Kamera: CSP değil, çerçevenin `allow="camera"` izni (değişmez).
- Rapor yazdırma: `window.open('')` + `document.write` ile açılan pencere ilkeyi devralır; satır içi `<style>` için 'unsafe-inline' yeterli, betik yok (DOĞRULANDI: `<script` aramasında rapor üretecinde yok).

## Derlemede ne değişiyor
- Arkon derlemesi (`arkon/vite.config.ts`): değişmez.
- İstemci derlemesi: değişmez. Derleme çıktısındaki Arkon kopyası başlık taşıyamaz (statik dosya); üretim sunucusu ayarı ayrı iştir (yukarıdaki BİLMİYORUM).
- Değişen tek dosya `arkon/sun.ts` (ara katmana başlık ve özet hesabı) ve onun testi.

## Testler
- İzinli: `index.html` cevabında `Content-Security-Policy-Report-Only` başlığı var, iki satır içi betiğin özeti ilkede, `Content-Security-Policy` (zorlayıcı) başlığı YOK.
- Ret: `index.html` satır içi betiği değişince eski özet ilkede kalmaz (özet dosyadan hesaplanır); `vendor/` dosyası cevabında başlık yok.

## Adım 2 (sizin konsol listenizden sonra)
Konsoldaki ihlaller tek listede gelir: ya ilke genişler (satır ve neden) ya da Arkon tarafında değişiklik gerekir (ekrana dokunmadan). Sonra başlık zorlayıcı kipe geçer.
