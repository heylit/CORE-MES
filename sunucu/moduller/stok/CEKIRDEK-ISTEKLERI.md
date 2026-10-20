# Çekirdek istekleri: stok

Kilitli dosyalar teslime girmez. Deneme ağacında `npm run teslim -- ... --yama <dizin>` ile Ç1 uygulanarak denendi (sonuç ON-PAKET-stok.md "Doğrulananlar").

## Ç1. Toplayıcı satırları (zorunlu; yoksa derleme kırılır)

`paylasilan/islemler.ts`: işlemler kayıtlı olmazsa uç tanımı derlenmez.

```diff
 import { SAGLIK_ISLEMLERI } from './islemler/saglik.ts';
+import { STOK_ISLEMLERI } from './islemler/stok.ts';
 ...
   ...SAGLIK_ISLEMLERI,
+  ...STOK_ISLEMLERI,
```

`paylasilan/sayfalar.ts`: ikinci menü toplayıcıya girer (şartname: "Toplayıcıya eklenmesi çekirdek işidir; teslimde istenir").

```diff
-import { STOK_SAYFALARI } from './sayfalar/stok.ts';
+import { STOK_IKINCI_MENU, STOK_SAYFALARI } from './sayfalar/stok.ts';
 ...
-export const IKINCI_MENULER = [] as const satisfies readonly IkinciMenuTanimi[];
+export const IKINCI_MENULER = [STOK_IKINCI_MENU] as const satisfies readonly IkinciMenuTanimi[];
```

## Ç1b. Yeni bağımlılıklar (kullanıcı onayladı)

`package.json` (ve kilit dosyası): Okut kamera yedeği, QR ve 3B depo için. Kullanıcı onayı: "evet hepsini yaz" (üç bağımlılık ve 3B'nin şimdilik modülde yazılması).

```diff
   "dependencies": {
+    "jsqr": "^1.4.0",
+    "qrcode-generator": "^1.4.4",
+    "three": "^0.169.0",
   "devDependencies": {
+    "@types/three": "^0.169.0",
```

Kamera önce tarayıcının BarcodeDetector'ünü kullanır; jsqr yalnız yoksa, gerektiğinde yüklenir (ayrı parça).

## Ç6. İkinci menünün cihaza göre sadeleşmesi (depocu modu)

Önizlemede depocu modunda menü sadeleşir (yalnız Okut, Sepet, Toplama öne çıkar). Menüyü kabuk çizdiği için modül bunu yapamaz; modül içinde depocu açılışı ve alt çubuk var. İstek: `IkinciMenuTanimi`'ne cihaz tercihine bağlı "sade görünüm" madde listesi.

## Ç2. Sistem Ayarları sayı türü

`paylasilan/ayar-tanimi.ts` `TurDegerleri` yalnız `boolean`. Stok iki sayı ister: `stok.sayim-suresi` (gün, varsayılan 30) ve `stok.kare-boyu` (m, varsayılan 5; sonraki sürüm).
Stok artık beklemiyor: sayım süresi ve kare boyu deponun yerleşiminde tutuluyor (düzenleyicide, Bina). Sayı türü gelirse sistem geneli varsayılan olarak oraya taşınabilir.

## Ç3. Ortak 3B parçası (kullanıcı kararı: şimdilik modülde)

`istemci/src/ortak/uc-boyut/`: sahne, ışık, yalnız gerektiğinde çizim, yörünge ve yürüme kamerası, seçme, örnekli ve birleştirilmiş geometri, gizli yüz ayıklama.
Modül yalnız ne çizileceğini verir. Stok (depo) ve atölye (üretim salonu) ortak kullanır. `three` bağımlılığı onayı ister (jsqr ve qrcode-generator ile birlikte).

## Ç4. Simge

`cart` (sepet) ve `pallet` sette yok (sonraki sürüm ekranları). İlk sürüm var olan simgeleri kullanır.

## Ç5. `test:modul` Linux'ta sunucu testlerini bulmuyor

`araclar/test-modul.ts` glob desenini tırnakla geçiriyor (malzemeler UYUM-BORCU madde 9, Ç6 ile aynı). Bu teslimde sunucu testleri doğrudan koşuldu.

## Karşılanan ve çıkarılan

Ön paketin çekirdek isteği 1 (ikinci menü parçası, 1280'de şerit, sayaç, telefon yeri) 5eb9481 ile karşılandı: menüyü kabuk çizer, açıkken ana menü simge şeridine daralır, sayacı kabuk okur, 1280 altında ikinci menü yatay şerittir (DOĞRULANDI `yapi-kaliplari` "İkinci menü").

## Oturtmada durum (kart #206)

- Ç1: dar istisnayla modülün kendi çekme isteğinde, ayrı commit'te girdi (`paylasilan/islemler.ts` `STOK_ISLEMLERI`, `paylasilan/sayfalar.ts` `STOK_IKINCI_MENU` ayrı satır). Diff'teki `IKINCI_MENULER = [STOK_IKINCI_MENU]` biçimi uygulanmadı (listede başka menüler var).
- Ç1b: `three` 0.169.0 ve `@types/three` 0.169.0 ayrı çekme isteğinde (#316, STK1 a). `jsqr` 1.4.0 ve `qrcode-generator` 1.4.4 depoda zaten sabit sürümle vardı.
- Ç5: kapandı (main `araclar/test-modul.ts` düzeltildi; `npm run test:modul -- stok` sunucu testlerini buluyor).
- Ç2, Ç3, Ç4, Ç6: açık; çekirdek kartı ister.

## Ç7. PostgreSQL 18'de RESTRICT yabancı anahtar ihlali 500 dönüyor (CI kırığı)

Yazan: stok oturtma konusu (kart #206). PostgreSQL 18, `ON UPDATE/DELETE RESTRICT` yabancı anahtar ihlalini 23503 yerine 23001 ile bildirir (DOĞRULANDI: #318 CI günlüğü, postgres:18, "violates RESTRICT setting of foreign key constraint"; kodun 23001 olduğu, 23001 eşlemesiyle aynı testlerin yeşile dönmesiyle doğrulandı). `sunucu/cekirdek/db.ts` `KISIT_HATALARI` 23001'i tanımadığı için `kisitKorumali` hatayı çevirmez, uç 500 döner; stokta `stok_bakiye_aktif_konumda` üç testi kırar, kalibrasyondaki `ON DELETE RESTRICT` aynı açığı taşır.
İstenen: `'23001': () => bagimliKayit()` eşlemesi ve gerçek veritabanında RESTRICT anahtarla 409 BAGIMLI_KAYIT bekleyen test (`kisit-korumali.test.ts`). Kullanıcı kararı CK1 a: düzeltme çekirdek konusunun ayrı çekme isteğine (`206-cekirdek-23001`) taşındı ve stok dalından çıkarıldı; stok, o birleşince ana dalı alır. Kalibrasyon ve diğer modüllerdeki etkiyi çekirdek konusu testle kapatır.

## Ç8. Kabukta modül üst eylem yuvası (kart #1208)

Yazan: malzeme teslim konusu. Modül `istemci/src/moduller/<ad>/ust-eylem.tsx` dosyasında `ustEylemler` (anahtar, sıra, işlem, düğme bileşeni) bildirir; `istemci/src/ortak/rota/ust-eylemler.ts` toplar ve denetler (ayar ekranı toplayıcısıyla aynı kalıp), `Kabuk` üst çubukta kullanıcının işlemine göre çizer, `App` verir. Ayrı commit ("Shell: module top-bar action slot"); test `ust-eylemler.test.ts` ve `Kabuk.test.tsx`.
