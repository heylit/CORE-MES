# Çekirdek istekleri (finans, tam teslim, taban c2c9871)

Kilitli dosyalar teslimde yoktur. Çalışma kopyamda aşağıdaki hallerle derlendi ve bütün depo testleri koşuldu (sunucu 1029/1029, istemci 504/504).

## 1. Toplayıcılar (firma teslimindeki istekle aynı; değişmedi)

`paylasilan/islemler.ts`: `import { FINANS_ISLEMLERI } from './islemler/finans.ts';` ve `VERI_ISLEMLERI` içine `...FINANS_ISLEMLERI,`.
`paylasilan/sayfalar.ts`: `import { FINANS_IKINCI_MENU, FINANS_SAYFALARI } from './sayfalar/finans.ts';`, `SAYFALAR` içine `...FINANS_SAYFALARI,` ve
`export const IKINCI_MENULER = [ARKON_IKINCI_MENU, FINANS_IKINCI_MENU] as const satisfies readonly IkinciMenuTanimi[];`
Bu teslimde `FINANS_ISLEMLERI` beş işlem taşır: `finans.firma-oku`, `finans.firma-yaz`, `finans.oku`, `finans.yaz`, `finans.yonet`.

## 2. Denetim kipi listesi (tek satır)

`sunucu/cekirdek/uygulama.test.ts`, `TAM_DENETLENMEYEN_UCLAR` dizisine:
```ts
  'POST /finans/toplu-ice-aktar govdesiz',
```
Gerekçe: kullanıcının "büyük gövdeli uç için denetim kipini toplu içe aktarmada kullan" kararı. Bu satır girmeden "denetim kapsamı ... (kart #212)" testi kırmızıdır; yeni özellik istenmiyor.

## 3. Yeni paket (K-8 onaylı)

`package.json` `dependencies`: `"chart.js": "4.4.1"` (tam sürüm, lisans MIT; `npm install chart.js@4.4.1 --save-exact`). Kilit dosyası buna göre güncellenir.
Kullanım: `istemci/src/moduller/finans/FinansCercevesi.tsx` paketin UMD dosyasını `?raw` ile okur ve çerçeveye satır içi betik olarak gömer. Paket `exports` alanında UMD yolunu açmadığı için ithal göreli yoldandır: `../../../../node_modules/chart.js/dist/chart.umd.js?raw`. Çekirdek bir Vite takma adı (`chart-umd`) tanımlamayı tercih ederse tek satır değişir.

## 4. Dosya türü istisnası (firma teslimiyle aynı)

`istemci/src/moduller/finans/cerceve/finans.html`, `cerceve/yazi/*.woff2` (12), `cerceve/yazi/*-OFL.txt` (2). Yazı tipleri: IBM Plex Sans 400/500/600, Schibsted Grotesk 600/700/800; kaynak `@fontsource/*@5.3.0`, lisans SIL OFL 1.1.

## 5. Rol x işlem (öneri; teslimle girmez, kullanıcı onayıyla ayrı göç)

| Rol | İşlemler |
|---|---|
| `muhasebe_finans` | sayfa.finans, finans.oku, finans.yaz, finans.yonet, finans.firma-oku, finans.firma-yaz |
| `mudur` | sayfa.finans, finans.oku, finans.firma-oku |
| `satin_alma` | sayfa.finans, finans.firma-oku, finans.firma-yaz |
| `planlama_proje` | sayfa.finans, finans.firma-oku, finans.firma-yaz |
| `depo` | finans.firma-oku |

## Oturtmada uygulananlar (dal 246-finans)

- Bölüm 1 ve 2: dar istisnayla, ayrı commit'te; yalnız finans satırları. İkinci menü toplayıcıya kendi satırı olarak girdi (`  FINANS_IKINCI_MENU,`, #281 biçimi).
- Bölüm 3: `chart.js` 4.4.1 kullanıcı onayıyla (FN2), ayrı commit.
- Bölüm 4: gerekmedi; depo `.html` ve `.woff2` dosyalarını modül klasöründe zaten taşıyor (malzemeler kataloğu), `sinir` bunları ihlal saymadı.
- Bölüm 5: uygulanmadı; roller Aşama 2'de kullanıcı onayıyla.

## 6. Ortak görünüm köprüsü yalıtılmış çerçeveyi desteklesin (kapandı)

`istemci/src/ortak/rota/cerceve-gorunumu.ts` (`useCerceveGorunumu`) ve `cerceve-iletisi.ts` (`kabukKoprusuKur`) aynı kökenli çerçeve bekliyor: iletiyi `postMessage(ileti, koken)` ile gönderiyor ve çerçeve penceresini ref'ten alıyor. Yalıtılmış çerçevede (`YalitilmisCerceve`) köken `'null'`dur (adresle gönderilemez, `'*'` gerekir) ve pencereye yalnız `iletiGeldi`'nin `yanitla`sı ulaşır. İstek: ortak hook ya da `YalitilmisCerceve`, opak kökenli çerçevede görünüm sözleşmesini işletsin. O zamana kadar finans `gorunum-koprusu.ts` ile modül içinde uyarlıyor (UYUM-BORCU bağlamada 1).

Karşılandı: FC #328 `useYalitilmisGorunum` ekledi; finans ona geçti, yerel dosya silindi (dal 246-finans-form).

## 7. Yalıtılmış çerçeveye `allow-forms` izni (kullanımı tutan)

`istemci/src/ortak/arayuz/YalitilmisCerceve.tsx`: `export type YalitimIzni = 'allow-downloads' | 'allow-modals' | 'allow-forms';`. Ardından finans `FinansCercevesi.tsx` `izinler`'e `'allow-forms'` ekler (tek satır, modül işi). Gerekçe: korumalı çerçevede form gönderimi `submit` olayından önce durur; finansın bütün kayıt pencereleri formdur (UYUM-BORCU bağlamada 11, tarayıcıda doğrulandı). Güvenlik: form yine dışarı gönderilemez; çerçevenin içerik politikası `form-action 'none'` gerçek gönderimi kapatır, `submit` olayını prototip `preventDefault` ile kendisi işler. Aynı kökene ve üst gezinmeye izin verilmez.

Karşılandı: FC #328 (kart #172) `allow-forms` izni verdi; `form-action 'none'`'u ortak bileşen belge başına koyar, modül gevşetemez. Finans `izinler`'e `'allow-forms'` ekledi (dal 246-finans-form).

## 8. Sözleşmeye üç alan (denetim B-004, B-009; dal 246-finans-denetim)

`paylasilan/sozlesme/finans.ts`: `odemeSemasi`'na `iptalNedeni: z.string().nullable()` (sütun `finans_odeme.iptal_nedeni`), mahsup şemasına `caprazKur: numerik.nullable()` (sütun `finans_mahsup.capraz_kur`, göç `20261008154024_finans_capraz_kur.sql`). Ayar okuma şemasına ve ayar güncelleme gövdesine `caprazKurPayi` (yüzde, 0'dan büyük, en çok 100; sütun `finans_ayar.capraz_kur_payi`, kullanıcı kararı FK1). Ardından finans sorgusu iki alanı seçer (modül işi). Gerekçe: veri artık doğru sütunda saklanıyor ama okuma uçlarından görünmüyor; çekirdek şeridi olduğu için bu dalda yapılmadı.

Karşılandı (akış D): `paylasilan/sozlesme/finans.ts` finansın kendi sözleşme dosyasıdır; üç alan ve sorgular aynı dalda girdi. Ayar güncellemede `caprazKurPayi` isteğe bağlıdır (gönderilmezse korunur).

## 9. Rol satırı: finans.kur-yaz (kart #953, kullanıcı kararı 13.10.2026 "Ayrı işlem ver")

Yeni işlem `finans.kur-yaz` (`paylasilan/islemler/finans.ts`, adı `paylasilan/islem-adlari.ts`'te: "Günlük kur ve faiz girme") bu dalda girdi. İstenen göç: `rol_islemi`'ne ('muhasebe_finans', 'finans.kur-yaz') ve ('satin_alma', 'finans.kur-yaz'); `kurulum/yetki-matrisi.md` iki satıra eklenir. Bu göç girmeden kur ve faizi yalnız yönetici girebilir: iki dal aynı partide birleşmeli.
