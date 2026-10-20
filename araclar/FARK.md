# FARK: araçlar

Araç değişikliklerinin farkı. Göç, tablo, uç ve modül dosyası değişmez.

## İnternetsiz güncelleme paketi (kart #1562)
- `araclar/paket-yap.ts`: yük, HEAD ağacına ek olarak lock dosyasındaki npm paketlerinin tarball'larını `.npm-onbellek/`
  klasöründe npm önbelleği olarak taşır; imza yükün tamamını kapsar. Önbellek paketi hazırlayan makinede `npm cache add` ile
  toplanır; her tarball lock'taki bütünlük değeriyle önbellekte yoksa paket yazılmaz. `--platform` (varsayılan `win32-x64`)
  yalnız sunucunun ikililerini alır. `--klasor` yükü ayrıca bir klasöre açar (internetsiz kanala ilk geçiş).
- Paketteki `package.json` ve lock'tan `@playwright/test` ve yalnız onun getirdikleri çıkar (`SUNUCUDA_KURULMAYAN`); depodaki
  dosyalar değişmez, ekran testleri geliştirme makinesinde ve CI'da aynı kalır.
- `araclar/guncelleyici.ts`: `npm ci --offline --cache <sürüm klasörü>/.npm-onbellek`; önbellek taşımayan paket hazırlıkta
  reddedilir (sonuç "Başarısız", sistem değişmez). Kurulumdan sonra önbellek klasörü silinir.
- `araclar/tar-yaz.ts`: yükün tar yazıcısı (dosya, klasör, uzun yol için pax); yalnız `tar-oku.ts`'nin bildiği türler.

## Güncelleyici (kart #1210, dal 1210-guncelleme-uygula-kur)
- `araclar/guncelleyici.ts`: `npm run baslat` güncelleme klasörü ve anahtar tanımlıysa sunucuyu güncelleyiciyle açar. Sistem
  Ayarları'nın yazdığı isteği alır: doğrula, hazırla (eski sürüm çalışırken), durdur, yedek, göç, aç; göç ya da açılış bozulursa
  yedek geri yüklenir ve eski sürüm açılır. Sürümler `<klasör>/surumler/<commit>` altında. Ayrıntı `kurulum/guncelleme.md`.
- `araclar/tar-oku.ts`: paket yükü (`git archive` tar.gz) yeni paket olmadan açılır; güvensiz yol ve bağ reddedilir.
- `araclar/baslat.ts`: güncelleme klasörü yoksa eski davranış (derle, aç) değişmedi.
- `ayarlar/disari.ts`: güncelleyici `saklananPaketiDogrula`, `yedekAl`, `yedekOrtamiOku` alır.

## randomUUID lint kuralı (kart #485, denetim S-03, dal 485-uuid-lint; 11.10.2026)
Taban: `main` 53c33e6 (rota #486 ve satın alma #488 düzeltmeleri dahil). Kart #485 kapanmaz: commit "Refs #485" taşır.

### Eklenen
- `eslint.config.js` `RASTGELE_KIMLIK`: istemcide `crypto.randomUUID` üye erişimi (nokta, köşeli parantez) ve yapı bozma
  kırmızıdır; düz http ile açılan kurum içi sunucuda bu işlev yoktur. Muaf: `istemci/src/ortak/veri/istek-kimligi.ts` (typeof
  korumalı ortak üretici) ve istemci testleri (bağlamı taklit eder). Sunucu kapsam dışıdır.
- `araclar/lint.test.ts`: dört kırmızı biçim, tsx, üretici, test, sunucu ve `getRandomValues` yeşil.

## Paket uyarıları borcu (kart #72, dal 72-paket-uyarilari-borc; kullanıcı kararları P2 a, P4 a; 08.10.2026)
Kart #72 kapanmaz: commit "Refs #72" taşır (koordinatör kararı; bu iş kartın konusu dışında).
Taban: `main` 1a7892e. Yalnız belge; `package.json` ve kilit dosyası değişmedi.

### Eklenen
- `araclar/UYUM-BORCU.md`: `vitest` 2 zinciri ve `stylelint` zinciri "canlı öncesi yeniden bakılacak" (SONRA), gerekçe ve ölçümle.

## Kart #72 (dal 72-harita-rol-islemi)
Taban: `main` cdf20ee.

### Değişen
- `araclar/harita.ts` `sahipligiCoz`: yazan sorgu yoksa ve kuran göç modül adı taşımıyorsa, tabloya satır yazan (INSERT, UPDATE, DELETE) modül adlı göçlerin hepsi tek modülün adını taşıyorsa sahip o modüldür. Kaynak etiketi `goc-yazan`, metinde "yazan göçlerin adından". İki modülün göçü yazıyorsa tablo belirsiz kalır.
- Sonuç: `rol_islemi` kisiler'de görünür; "Sahibi belirsiz tablolar (0)".
- `araclar/NOTLAR.md`: harita satırı yeni kuralı ve K2'yi anar.

### Eklenen
- Test: "harita: yazan ve adlı kuran yoksa tabloya satır yazan adlı göçlerin tek modülü sahiptir" (izinli); "harita: tabloya iki modülün adlı göçü satır yazıyorsa sahip uydurulmaz" (reddedilen).

### Onaylı kararlar
- K2 (kullanıcı, 08.10.2026): `rol` ve `rol_islemi` sahibi kisiler; rol x işlem satırlarını çekirdek konusu kisiler adlı göçlerle yazar. Göç dosyalarına dokunulmadı.

### Varsayımlar
- Başka bir tablo da ileride bu kuralla sahiplenebilir; bugün yalnız `rol_islemi` değişir. Geri alma: tek kural.

## Kart #122 (dal 122-platform-esligi-2, #277 ile birleşti)
Kayıt için. `.nvmrc` 24; `.gitattributes` çalışma ağacında LF zorlamaz (normalleştirme 0 dosya); ortam yükleyici `.env` varken tek kaynak, çelişkide değişken adıyla durur, `TMIV2_ORTAM` zorunlu; git yönlendirme değişkenleri ana ağaç aramasına geçmez; `TMIV2_` adı büyük harfle eşlenir; `test:modul` kabuksuz koşar (`araclar/paket-bin.ts`). Kararlar D-N1..D-N4. Windows'ta doğrulanmadı.
