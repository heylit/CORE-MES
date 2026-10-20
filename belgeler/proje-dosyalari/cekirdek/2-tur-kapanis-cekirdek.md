# Cekirdek (kart #259): 2. tur kapanis raporu

Ana dal: 7c20cef (2026-10-08). Kaynak: `git log origin/main`, ilgili `uclar.ts` dosyalari, cekme istekleri #266, #272.

## Duzen tablosu (cekirdek parcasi)

| Is | Cekme istegi | Durum |
|---|---|---|
| Okuma ucunda islem listesi `{ biri: [...] }` (ADR 0007) | #266 | birlesti |
| Bakim rolu ve Arkon rolleri (224 goclerinden), yetki matrisi belgesi ve testi | #266 | birlesti |
| `malzemeler.tanim-yaz` mudur ve planlama_proje | #266 | birlesti (#267 sonra girdi; ara surede dort goz acigi ana dalda vardi) |
| `test:modul` tirnaksiz desen, sinir araci `arkon/` klasoru | #266 | birlesti |
| `arkon.yansima-oku` mudur ve planlama_proje (#243) | #272 | birlesti (ead823c) |
| Satin alma toplayici satiri gozden gecirme notu | #272 | birlesti (7c20cef) |
| Malzemeler, istasyonlar ve oteki ikinci menu toplayici satirlari | modullerin kendi istekleri | birlesti (konular kendisi ekledi) |

## Borc: cekirdege dusen (tutan / etkileyen / sonra)

- KULLANIMI TUTAN: kapanan 2 (okuma kalibi, Arkon rol matrisi), kalan 0.
- KULLANIMI ETKILEYEN: kapanan 2 (`test:modul`, sinir araci); kalan 1: satin alma denetim kaydinda onceki deger (S2, kullanici karari bekliyor; ozet secici yalniz govdeyi goruyor).
- SONRA: kalan 4: arka plan yineleyici (C3, Arkon sinir f); #157 defter haklari; #169 liste ve zaman kalibi; #82 dosya saklama.

## Biriken istekler

- uretim-emirleri (DOGRULANDI, `sunucu/moduller/uretim-emirleri/uclar.ts`): `GET /uretim-emirleri`, `GET /uretim-emirleri/:id`, `GET /terminal/isler` hala `yetki: 'oturum'`. Istek: `{ biri: ['sayfa.uretim-emirleri'] }` ve `{ biri: ['sayfa.terminal'] }`, her uca izinli/reddedilen test. Arkon'un istegi: `emirOzeti` ciktisina calisma durumu alani.
- durus-nedenleri: KAPANDI. `/durus-nedenleri` ve `/hurda-nedenleri` artik `OKUMA` listesiyle (`durus-nedenleri/uclar.ts:19,44`).
- Satin alma: `sayfa.satin-alma` hicbir rolde yok; rol matrisi kararinda talep eden ve depo ile birlikte (`BASKA-MODUL-ISTEKLERI.md`).

## 3. tura onerilenler (onaysiz konu acilmaz)

1. Satin alma denetim kaydi S2 kararinin yazilmasi (karar gelirse).
2. Arkon uclarinin `yetki: 'oturum'` olanlarinin (13 uc, `arkon/uclar.ts`) gozden gecirilmesi: Arkon rolunu servis mi denetliyor, kalip mi gerekli.
3. `/istasyonlar/secim` ve `/kisi-is-merkezleri/:kisiId` `'oturum'` istisnalari ADR 0007 madde 4'e uygun mu: tek satir onay.
4. Yetki matrisi belgesinde ikinci menu maddelerinin islemleri (rol x madde gorunurlugu) icin tablo.
