# Arkon P1: pdfjs ile açılan PDF'te betik çalışması (ön liste, kod yazılmadı)

Kart #199. Dal: güncel ana daldan `199-arkon-p1`. Arkon ekranının görünümü ve akışı değişmez. Yeni paket yok, sürüm değişmez.

## Bugün (DOĞRULANDI)
- Sürüm: `pdfjs-dist@3.11.174`, kesin sabit (`package.json:60`, `"pdfjs-dist-3": "npm:pdfjs-dist@3.11.174"`). Derlemede `vendor/pdfjs/pdf.min.js` ve `pdf.worker.min.js` olarak kopyalanır (`arkon/vite.config.ts:12-13`).
- Arkon PDF'i tek yerde açar ve seçenek ZATEN kapalı: `arkon/web/src/app/pdf.ts:8`
  `getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true })`. `arkon/web/src` içinde başka `getDocument` çağrısı yok (arama).
- Yani 1. adımın istediği seçenek bugün kullanımda; kod değişikliği gerekmiyor. Eksik olan, bunun bir testle sabitlenmesi.

## Bilinen açık ve seçeneğin etkisi (kaynaklı)
1. CVE-2024-4367, GHSA-wgrm-67xf-hhpq, "Arbitrary JavaScript execution upon opening a malicious PDF".
   Etkilenen: `<= 4.1.392`, düzeltilen: `4.2.67`. Kaynaktaki geçici önlem, aynen: "Set the option `isEvalSupported` to `false`."
   https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq
   Sonuç: 3.11.174 etkilenen aralıkta; Arkon kaynağın önerdiği önlemi uyguluyor. DOĞRULANDI (belge ve kod). Tarayıcıda kötü niyetli örnekle DENENMEDİ.
2. CVE-2026-16633, GHSA-hq66-cqwq-w95j (aynı başlık). Etkilenen: `>= 5.6.83, < 6.2.108`, düzeltilen: `6.2.108`; koşulu `enableScripting` açık olması.
   https://github.com/advisories/GHSA-hq66-cqwq-w95j
   Sonuç: 3.11.174 bu aralıkta değil. Yükseltme hedefini etkiler (aşağıda).
- GitHub danışma veritabanında `pdfjs-dist` aramasında bu ikisi dışında kayıt görmedim (08.10.2026). BİLMİYORUM: kayda geçmemiş açık.

## Yazılacaklar (onaydan sonra)
1. Test (istemci/src/moduller/arkon, `sun.test.ts` gibi node ortamında): `arkon/web/src` altındaki her `getDocument(` çağrısı `isEvalSupported: false` taşır.
   İzinli: bugünkü kod geçer. Ret: seçenek kaldırılmış ya da `true` yapılmış örnek metin testte reddedilir (mutasyonla da denenir).
2. UYUM-BORCU (`npm audit` maddesi yerine üç satır):
   - P1: pdfjs-dist 3.11.174 CVE-2024-4367 etkilenen sürümde; `isEvalSupported: false` ile açılıyor (kaynak bağlantısı) ve testle sabit. İkinci katman CSP zorlayıcı kip. "Canlı öncesi yeniden bakılacak".
   - P4 (koordinatörün satırı, doğrulayarak): `tar` kritik ve `@mapbox/node-pre-gyp` yüksek kabul edildi; pdfjs-dist 3'ün `canvas` bağımlılığından gelir; kurulu değil (`npm ls --all tar` ve `npm ls --all canvas` boş, DOĞRULANDI). Yükseltmede zincir kalkar: 4.9.155 ve 4.10.38'in isteğe bağlı bağımlılığı `@napi-rs/canvas` (npm kayıt, DOĞRULANDI); `canvas`'ın ilk hangi sürümde bırakıldığını bilmiyorum. "Canlı öncesi yeniden bakılacak".
   - Z4: yinelemede kaydı başlatan kişi pasife alınmış ya da yetkisini kaybetmişse yineleme reddedilir, satır "hatali" olur ve listede nedeniyle görünür. Not: bugün aynı durumda satır "reddedildi: yetki" oluyor (`servis.ts bekleyeniIsle`); "hatali"ye geçiş zamanlanmış iş yazımıyla gelir.
   - DS6: "özetini bilen her rol dosyayı okur" açığı dosya saklama işiyle kapanacak; o zamana dek "kullanımı etkileyen" sınıfında.
3. FARK: "3. tur, P1" bölümü.

## 4.x yükseltme kart önerisi (kart açılmadı; metin)
Başlık: Arkon: pdfjs-dist 3.11.174 yükseltmesi
Gövde: Arkon PDF okuyucu pdfjs-dist 3.11.174 kullanıyor. Bu sürüm CVE-2024-4367'den etkileniyor; bugün `isEvalSupported: false` önlemiyle açılıyor. Yükseltme hedefi 6.2.108 ya da sonrası olmalı: 4.2.67 ile 5.6.82 arası CVE-2024-4367'yi kapatır, ama 5.6.83 ile 6.2.107 arası CVE-2026-16633'ten etkilenir. Yükseltme `canvas` zincirini de kaldırır (`tar`, `@mapbox/node-pre-gyp` uyarıları). İş: `package.json` sürümü, `arkon/vite.config.ts` kopyalama yolları (`.mjs` ve `legacy` yapısı sürüme göre değişir), `pdf.ts` API uyumu, CSP ilkesinde çalışan ve modül betiği satırları, PDF okuma ve OCR akışının tarayıcıda yeniden denenmesi. Yeni paket sürümü kullanıcı onayıyla.

## Bu konu şunları varsayacak
1. `isEvalSupported` yalnız `getDocument` seçeneğiyle verilir; pdfjs'in kendi varsayılanı bu sürümde açıktır (önlem bu yüzden şart).
2. Arkon pdfjs'i görüntüleyici (viewer) olmadan, yalnız çizim ve metin okuma için kullanır; `enableScripting` yolu kullanılmaz (VARSAYIM: viewer dosyaları derlemeye kopyalanmıyor, `vite.config.ts:12-13`).
