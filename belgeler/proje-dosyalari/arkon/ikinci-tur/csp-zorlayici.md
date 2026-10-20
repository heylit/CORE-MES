# Zorlayici CSP sonrasi tarayici kontrolu

Tarih 2026-10-08, 17:40-17:52. main `b462168` (#341 birlesmis). Kod degismedi, commit yok.
Ortam ikinci turla ayni (Chromium + Playwright, gelistirme sunucusu 4101). Yerel veritabani yeni goc damgasi yuzunden sifirdan kuruldu (60 goc), deneme verisi `betikler/kurulum.mjs` ile yeniden girildi. Veri uydurmadir.
Klasor: `csp/`. Betikler ikinci turunkiyle ayni (`betikler/`).

## Sonuc

**CSP ihlali ya da engellenen kaynak: 0.** Bu kosunun 5 konsol dosyasinda (`csp/**/konsol*.json*`) "Content Security Policy", "Refused to" ya da `securitypolicyviolation` satiri yok.

## Yanit basliklari (curl -I, 4101)

| Yol | Baslik |
|---|---|
| `/arkon-mes/index.html` | `Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-HchObSIgmzvVitImo07J4Dy9MdhTlS60iaE3XH+F1Ac=' 'sha256-TUh3poU/jZ43G0UCMPZKEVgI6K4bZdtegh1Pj29RidI=' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; media-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'` (zorlayici; `unsafe-eval` YOK; `Report-Only` basligi artik yok) |
| `/arkon-mes/vendor/occt/step-calisan.js` | `Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'` (tek `unsafe-eval`) |
| `/arkon-mes/vendor/occt/occt-import-js.js` | CSP basligi yok (calisan icinden yuklenir) |
| `/arkon-mes/vendor/qr/qrcode.js` | CSP basligi yok |

Sunucu 4100 Arkon dosyalarini sunmuyor (404); canli kurulumdaki sunan katman #175'te.

## Denenenler

| Konu | Kim, genislik | Sonuc | Kanit |
|---|---|---|---|
| Ana akis | planlama emir acti; CAM paketi doldurup yayinladi (PDF + STEP, OCR, adim); operator 768'de ayar > kaliteye gonder; kalite onay; uretime gec, sayim, hurda, bitir | **DOGRULANDI**. TMI: UE-000001 `bitti`, saglam 4, hurda 2 | `csp/a/op768a-*.png`, `csp/a/op768b-*.png`, `csp/a/op768c-*.png` |
| STEP 3B (ayri calisan) | operator 768 (pakette STEP), CAM cizim studyosu | **DOGRULANDI**. Operatorde 3B model cizildi; studyoda STEP 3 sn'de okundu, calisan `vendor/occt/step-calisan.js` olarak kuruldu | `csp/a/op768b-07.png`, `csp/step/d_cam-3-step-3b.png` |
| PDF | CAM, operator 768 | **DOGRULANDI**. Teknik resim acildi; kontrol planinda 3 nokta eklenip paket yayinlandi | `csp/a/cam-3-kontrol-plani.png`, `csp/a/op768b-01.png` |
| SVG indirme | CAM | **DOGRULANDI**. `deneme-parca-01-teknik-resim.svg` 6184 bayt | `csp/step/inen-*.svg` |
| CSV indirme | mudur 768 | **DOGRULANDI**. 5 dosya indi | `csp/ciktilar/inen-*.csv` |
| Yazdirma | mudur 768 (Raporlar), kalite (olcum raporu yeni pencerede) | **DOGRULANDI**. `print` cagrildi; olcum raporu penceresi icerikle acildi, orada da CSP satiri yok | `csp/ciktilar/d_mudur-768-raporlar.png`, `csp/ciktilar/d_kalite-olcum-raporu-penceresi.png` |
| QR | operator | **DOGRULANDI**. Kamerayla UE-000001 okundu ("Is emri acildi"); kamerasiz pencere ve olmayan kod uyarisi calisti | `csp/qr/*.png` |
| Menu sayfalari | mudur ve operator, 768 | **DOGRULANDI**. Her sayfa acildi, yatay tasma 0 | `csp/roller/*.png` |

Denenmeyen: Android tablet; mudur ve operator disindaki roller (istenmedi).

## CSP disi yan gozlemler

- **Operatorde yeni 403:** `GET /api/arkon/belgeler/gauges` 403 "Arkon rolunuz bu depoyu okuyamaz." her operator sayfa acilisinda (ikinci turda `a45e794`'te yoktu). Ekranda gorunen bir bozulma gorulmedi. CSP ile ilgisi yok.
- **Ayar durumunda sayim:** operator AYAR durumundayken (uretime gecmeden) basilan Iyi ve Hurda sayilip uretim basladiginda TMI'ye yazildi (ilk denemede yanlislikla basildi; sonuc saglam 4, hurda 2 oldu). Kasitli mi bilinmiyor: BILMIYORUM.
- pdf.js "Setting up fake worker" uyarisi rapor kipinde de vardi (ikinci tur, 20 kez); CSP'den degil.
- Bilinen A5: `POST /arkon/kayitlar/audit/ekle` 400.
