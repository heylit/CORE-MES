# CEKIRDEK-ISTEKLERI: atolye

Bunların hepsi çalışma kopyasında `main`'e uygulandı ve modül onunla derlenip sınandı (DOĞRULANDI: `npm run kontrol` yeşil). Teslimde modül dosyası değildir; çekirdek turu girer.

## 1. İşlem dosyası: `paylasilan/islemler/atolye.ts` (yeni)

```ts
// Okuma uçları oturumla açılır: harita ve arama her rolün işine yarar. Yaz yerleşimi kaydeder ve salon açar.
export const ATOLYE_ISLEMLERI = ['atolye.yaz'] as const;
```

## 2. Toplayıcı ve sayfa

`paylasilan/islemler.ts`:

```ts
import { ATOLYE_ISLEMLERI } from './islemler/atolye.ts';   // AYARLAR_ISLEMLERI ithalinin altına
// VERI_ISLEMLERI dizisinde ...AYARLAR_ISLEMLERI satırının altına:
  ...ATOLYE_ISLEMLERI,
```

`paylasilan/sayfalar.ts` (`/terminal` satırının altına):

```ts
  { yol: '/atolye', islem: 'sayfa.atolye', baslik: 'Fabrika Haritası', simge: 'grid', grup: 'Üretim' },
```

## 3. Rol x işlem göçü (onaylı matrisle; ON-PAKET açık soru 2)

`sunucu/gocler/<damga>_kisiler_atolye_islemleri.sql`:

```sql
-- Fabrika haritası: sayfayı görenler ve yerleşimi düzenleyen rol (yönetici her işlemi taşır, satır yazılmaz).
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'sayfa.atolye'),
    ('planlama_proje', 'sayfa.atolye'),
    ('planlama_proje', 'atolye.yaz'),
    ('kalite', 'sayfa.atolye'),
    ('cam', 'sayfa.atolye'),
    ('depo', 'sayfa.atolye'),
    ('operator', 'sayfa.atolye')
  ) AS m (kod, islem);
```

Bugün hiçbir göç bir role `atolye.yaz` vermediği için akış testi geçici rol kurar (`atolye.test.ts`, istasyonlar testi kalıbı).

## 4. Kişi adı: `kisiAdlari` (kisiler modülü; talimat gereği çekirdek isteği)

`sunucu/moduller/kisiler/sorgular.ts` sonuna:

```ts
// Ad listesi: başka modüller kişi adını kopyalamaz, kimlikle sorar. Olmayan kimlik sonuçta yer almaz.
export function kisiAdSatirlari(db: Db, idler: readonly number[]): Promise<{ id: number; ad: string }[]> {
  return db.sorgu<{ id: number; ad: string }>('SELECT id, ad FROM kisi WHERE id = ANY($1::int[])', [idler]);
}
```

`sunucu/moduller/kisiler/servis.ts`: sorgular ithaline `kisiAdSatirlari` eklenir; sonuna:

```ts
// Boş liste veritabanına gitmez. Pasif kişinin adı da döner: geçmiş kayıtta kim yaptıysa o görünür.
export async function kisiAdlari(db: Db, idler: number[]): Promise<Map<number, string>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await kisiAdSatirlari(db, tekil)).map((s) => [s.id, s.ad]));
}
```

`sunucu/moduller/kisiler/disari.ts`: servis dışa açımına `kisiAdlari` eklenir. Önerilen test (kisiler): var olan ve pasif kişinin adı döner, olmayan kimlik haritada yoktur, boş liste sorgu atmaz.

## 5. Sahne ve plan renkleri: `istemci/src/ortak/tasarim/tokens.css` sonuna

Plan renkleri temalıdır; 3B malzeme renkleri (`--sahne3b-*`) temadan bağımsızdır (zemin, makine, raf fiziksel nesnedir; yalnız arka plan temayla değişir). Değerler onaylı Canlı Harita prototipinin malzeme renkleridir.

```css
/* Atolye haritasi: iki boyutlu plan ve sahne arka plani (temaya gore) */
:root, [data-theme="dark"] {
  --sahne-arka: #0b1117; --sahne-duvar: #59606a; --sahne-cam: #8fc3e6; --sahne-raf: #2a5d9f; --sahne-ahsap: #b48a5a;
  --sahne-yol: #e0b233; --sahne-bolge: #e0b233; --sahne-karantina: #e0533a; --sahne-sevkiyat: #3aa35f; --sahne-oda: #6d9fc6;
  --plan-zemin: #151b22; --plan-izgara: rgba(220,228,234,.08); --plan-izgara-kalin: rgba(220,228,234,.18);
}
[data-theme="light"] {
  --sahne-arka: #dce2e7; --sahne-duvar: #c9ced4; --sahne-cam: #7fb6da; --sahne-raf: #1d4d8a; --sahne-ahsap: #b48a5a;
  --sahne-yol: #e0b233; --sahne-bolge: #e0b233; --sahne-karantina: #cc3d33; --sahne-sevkiyat: #23945a; --sahne-oda: #5aa2d4;
  --plan-zemin: #e9ecee; --plan-izgara: rgba(24,34,44,.05); --plan-izgara-kalin: rgba(24,34,44,.16);
}
/* Atolye 3B sahne malzemeleri: fiziksel nesnenin rengi temaya gore degismez (zemin, makine, raf) */
:root {
  --sahne3b-zemin: #a3a49f; --sahne3b-derz: #262624; --sahne3b-leke: #48463e; --sahne3b-yag: #28241c; --sahne3b-beton: #9fa19e;
  --sahne3b-duvar: #d2d6d8; --sahne3b-supurgelik: #9a9d9b; --sahne3b-kapi: #b9bec2; --sahne3b-pencere: #cfe2ef; --sahne3b-pencere-isik: #b9d3e6;
  --sahne3b-panel: #d3d7da; --sahne3b-boya: #c9cdcf; --sahne3b-boya-orta: #aab0b5; --sahne3b-koyu: #2b3136; --sahne3b-siyah: #151719;
  --sahne3b-celik: #b9bfc4; --sahne3b-celik-koyu: #70767b; --sahne3b-alu: #d3d8dc; --sahne3b-krom: #e8ecef; --sahne3b-galv: #a9b0b5;
  --sahne3b-vurgu: #2b6a96; --sahne3b-mavi: #21507f; --sahne3b-sari: #e3b21e; --sahne3b-turuncu: #d9661e; --sahne3b-kirmizi: #c42d23;
  --sahne3b-kolon: #5d6a76; --sahne3b-raf: #1d4d8a; --sahne3b-raf-kiris: #e0661b; --sahne3b-ahsap: #b38757; --sahne3b-karton: #a98559;
  --sahne3b-ahsap-ust: #c49a68; --sahne3b-kaucuk: #1b1c1e; --sahne3b-ic: #c4c9cc; --sahne3b-kutu: #1d4a8f; --sahne3b-kutu-gri: #6d7479;
  --sahne3b-granit: #2a2c2e; --sahne3b-granit-acik: #6b6d70; --sahne3b-cam: #b8ccd8; --sahne3b-cam-lazer: #d4661b; --sahne3b-cam-oda: #cfe0ea;
  --sahne3b-isik: #fff1dc; --sahne3b-gok: #eef3f8; --sahne3b-yer: #5f5a52; --sahne3b-ortam: #5f6368; --sahne3b-ortam-zemin: #4a4b4c;
  --sahne3b-lamba: #fff7e7; --sahne3b-gun: #b9d8ff;
  --sahne3b-andon-yesil: #24e05f; --sahne3b-andon-sari: #ffae00; --sahne3b-andon-kirmizi: #ff2a18;
  --sahne3b-andon-yesil-sonuk: #1b3a24; --sahne3b-andon-sari-sonuk: #4a3a12; --sahne3b-andon-kirmizi-sonuk: #4a1a15;
  --sahne3b-ekran: #0b1520; --sahne3b-ekran-yazi: #cfe0ee; --sahne3b-ekran-soluk: #8fa5b8; --sahne3b-ekran-cubuk: #1e2f40;
  --sahne3b-ekran-ilerleme: #6faedc; --sahne3b-ekran-alarm: #ff5a4f; --sahne3b-ekran-calisiyor: #23945a; --sahne3b-ekran-durakli: #c98a12;
  --sahne3b-ekran-durdu: #cc3d33; --sahne3b-ekran-bekliyor: #7d8c9b;
  --sahne3b-rota: #3d8fd6; --sahne3b-kivilcim: #ff8a3a; --sahne3b-kivilcim-hale: #ffb060;
  --sahne3b-cizgi: #e0b11d; --sahne3b-bolge-kirmizi: #d8352a; --sahne3b-bolge-yesil: #2f9e5f; --sahne3b-bolge-mavi: #2b6a96;
  --sahne3b-tarama: #1d1d1b; --sahne3b-ok: #f4f4ee; --sahne3b-oda-yazi: #283038;
}
```

## 6. Yeni bağımlılık (kullanıcı onayı: ON-PAKET açık soru 1)

`package.json`: `dependencies` içine `"three": "^0.186.1"`, `devDependencies` içine `"@types/three": "^0.186.0"`; `npm install` ile `package-lock.json`. Kullanılan eklentiler paketin kendi içinden: `three/examples/jsm/controls/OrbitControls.js`, `three/examples/jsm/utils/BufferGeometryUtils.js`. Sahne ayrı pakette tembel yüklenir (`React.lazy`); yalnız `/atolye` açılınca iner. Dış CDN, yazı tipi ya da istek yok.

### 6b. STEP çevirici: `occt-import-js` (kullanıcı onayı: "STEP de doğrudan olsun")

`dependencies` içine `"occt-import-js": "^0.0.23"`. Lisans LGPL-2.1 (DOĞRULANDI: paketin `package.json` ve `dist/license.occt.txt`); paket değiştirilmeden, ayrı dosya (wasm) olarak kullanılır. Yalnız model kütüphanesi açılınca iner (`React.lazy` + ayrı iş parçacığı `?worker&inline`, wasm `?url`); dışarıya istek yok, wasm paketin kendisinden. Ek olarak `three/examples/jsm/loaders/GLTFLoader.js`, `STLLoader.js`, `exporters/GLTFExporter.js` (three içinden).

### 6d. PDF okuyucu: `pdfjs-dist` (kullanıcı onayı: "PDF var ... girsin")

`dependencies` içine `"pdfjs-dist": "^6.3.289"` (2026-08-29 sürümü). Lisans Apache-2.0. Tarayıcıda eski yapı (`legacy/build`) kullanılır: yeni yapı Chrome 141'de `Map.prototype.getOrInsertComputed` yokluğundan açılmadı (DOĞRULANDI: önizleme). Yalnız yerleşim düzenleyicisinde kroki açılınca iner (ayrı iş parçacığı `?worker&inline`); dışarıya istek yok. İsteğe bağlı alt bağımlılığı `@napi-rs/canvas` yalnız Node'da çizim içindir, tarayıcı paketine girmez. Gömülü olmayan standart yazı tipleri sistem yazı tipiyle çizilir (pdf.js yazı tipi verisi paketlenmedi); JPEG 2000 ve JBIG2 görüntülü taranmış PDF'lerin açılıp açılmadığını BİLMİYORUM (denenmedi).
Uygulama: `main` üzerinde "core: pdfjs-dist dependency for atolye floor plan underlay (working copy only)".

### 6c. Zod'suz paylaşılan dosya: `paylasilan/atolye-sabitleri.ts` (yeni; sabitler ve parça eşleme anahtarı)

```ts
// Atölye modülünün zod taşımayan sabitleri: istemci değer olarak ithal eder (sözleşme dosyası yalnız tip olarak).
// 3B model dosyası GLB 2.0'dır; uç gövdesi 1 MiB ile sınırlı olduğundan dosya parça parça gider ve gelir.
export const MODEL_PARCA_BAYT = 524288;
export const MODEL_AZAMI_BAYT = 26214400;

// Parça numarası eşleme anahtarı: baştaki ve sondaki boşluk atılır, iç boşluk teke iner, Türkçe büyük harfe çevrilir.
// Üretim emrindeki parça no serbest metindir; parça modeli bu anahtarla bulunur (sunucu ve istemci aynı işlevi kullanır).
export function parcaAnahtari(parcaNo: string): string {
  return parcaNo.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
}
```
İstemci bu değerleri değer olarak ithal eder (parçalama, sınır iletisi); sözleşme dosyası zod taşıdığı için istemciye yalnız tip olarak girer. `eslint.config.js` içindeki `ZODSUZ` listesine `'atolye-sabitleri'` eklenir. `paylasilan/sozlesme/atolye.ts` bu dosyadan ithal edip yeniden dışa verir.

## 7. Ortak bileşen ve değişken istekleri (borç 119: geçildi; kalan maddeler UYUM-BORCU.md 8'de)

Görünüm değişmez: her madde bugünkü değeriyle ortağa girer, modül yalnız ortaktan okur. Satır numaraları `istemci/src/moduller/atolye/atolye.css` içindir (16.10.2026). Adlar öneridir; Çekirdek değiştirebilir.

### 7.1 Tam ekran pencere

| Ne | Nerede | Bugün |
|---|---|---|
| `Pencere tur="tam"` (ortakta `.tc-pencere-tam`) | `YerlesimDuzenleyici.tsx:676` kendi `role="dialog"` katmanı; `atolye.css:165` | `position: fixed; inset: 0; z-index: var(--z-katman)`; ızgara `auto minmax(0,1fr)` (üst çubuk + gövde); genişlik ve yükseklik sınırı yok, köşe yarıçapı 0 |
| Serbest üst çubuk ya da `aria-label` | aynı | Başlık yerine araç çubuğu; bugün `Pencere` (`Pencere.tsx:12`, `tur?: 'orta' \| 'yan'`) başlık istiyor ve `pencere.css:7-13` genişliği sınırlı |
| Kapatmayı onaya bağlama | `YerlesimDuzenleyici.tsx:585-586` Escape elle, `:621` odak elle | Kaydedilmemiş değişiklik varsa Escape önce onay soruyor. VARSAYIM: `useKatman(acik, kapat)` bunu zaten taşır (Escape `kapat`'ı çağırır, onayı `kapat` sorabilir); doğrulanırsa yalnız `tur="tam"` yeter |
| Tam ekran harita katmanı | `AtolyeHaritasi.tsx:314`, `atolye.css:334-337`, `tam-ekran.ts:11` `useTamEkran` | `z-index: calc(var(--z-ust) + 5)` (= 25); `--z-ust: 20` ile `--z-katman: 40` arasında değişken yok |

### 7.2 Sahne etiket katmanı

| Ne | Nerede | Bugün |
|---|---|---|
| Nesneye iliştirilmiş, her karede yer değiştiren etiket düğmesi | `motor.ts:1131-1153` `etiketEkle` | Motor `button` üretir; katman `.tc-atolye-etiketler` (`:74`), sınıflar `tc-atolye-etiket`, `-koyu`, `-giris`, `-bolum`, `-gecis-*` (`:75-97`) ve `tc-atolye-goz-etiket` (`:476-489`) |
| Konum sözleşmesi | `motor.ts:2278-2279`, `:2329-2330` (`--x`, `--y`); `:2281` (`--g`) | `style.setProperty('--x' \| '--y', px)`; `--g` göz genişliği, en az 28px. Lint JSX `style`'ını yakalar, bunu yakalamaz (ON-PAKET açık soru 5). İstek: ortak katman bu üç değişkeni okuyan sınıfı taşısın, modül yalnız değeri versin |
| İkiz ipucu | `DijitalIkiz.tsx:269-270`, `atolye.css:588`, `:591` | Aynı konum düzeni, geçiş `120ms` |

### 7.3 Tasarım değişkenleri

| Önerilen ad | Nerede | Bugün |
|---|---|---|
| `--sahne-yuksek` | `:61`, `:64`, `:371` | `70vh` |
| `--sahne-yuksek-orta` | `:282` / `:400` / `:569` | `62vh` / `52vh` / `60vh` |
| `--panel-yuksek-dar` | `:287` / `:603` | `40vh` / `50vh` |
| `--sahne-oran-*` | `:273` / `:288` / `:385` / `:500` | `max-height: 62%` / `70%` / `min(var(--pencere-genis), 46%)` / `55%` |
| `--z-sahne` | `:544` (tur çubuğu) | `3` |
| `--z-sahne-ust` | `:335` | `calc(var(--z-ust) + 5)` |
| `--saydam-1..n` (opacity) | `:127` / `:86`, `:88`, `:488` / `:226` / `:230` / `:406`, `:407` / `:397` / `:217` | `.92` / `.75` / `.45` / `.5` / `.55` / `.85` / `.7` |
| aynı grup (fill/stroke-opacity) | `:212` / `:213` / `:216` / `:219` / `:225` / `:296` / `:297` / `:279` / `:506` | `.14` / `.18` / `.08` / `.14` / `.28` / `.2` / `.45` / `.1` / `.55` |
| `--kesik-uzun`, `--kesik-orta`, `--kesik-kisa`, `--kesik-nokta` | `:213`, `:232`, `:508` / `:254`, `:261` / `:227` / `:396` | `6 4` / `5 3` / `4 3` / `2 1` |
| (metre birimli kesik) | `:244` | `.4 .3`; sahne birimi, değişkene çevrilmesi ayrı değerlendirilmeli |
| `--cizgi-ince`, `--cizgi`, `--cizgi-orta`, `--cizgi-kalin` | `:209`, `:210`, `:228`, `:508`, `:513`, `:516` / `:509`, `:510`, `:518` / `:515` / `:517` | `1px` / `2px` / `1.5px` / `2.5px` |
| (SVG birimli çizgi ve yazı) | `:394`, `:395-396`, `:411`, `:506`; `:399`, `:404`, `:408`, `:409`, `:480` | `.5`, `1.2`, `2.5`, `.6px`; yazı `4px`, `12px`, `13px`, `line-height: 1.15`. VARSAYIM: SVG birimi oldukları için değişken gerekmeyebilir |
| `--harf-aralik-*` | `:22` / `:107` / `:187`, `:531` / `:280` | `.06em` / `.1em` / `.14em` / `.02em` |
| `--dokunma-cubuk-*` | `:392` / `:474` / `:437` / `:283`, `:472` / `:529` | `calc(var(--dokunma) * 1.4)` / `* 1.6` / `* 1.8` / `* 2` / `* 2.4` |
| `--harita-kucuk-en`, `--harita-kucuk-boy` | `:140`, `:149` | `calc(var(--orb-3) * 2)`, `* 1.5`, `* 1.25` |
| `--sure-kisa` | `:591` | `120ms` sabit. Ortakta `--hareket-sure` var (`tokens.css:48-67`) ama hareket ayarına göre 1ms-300ms arası değişiyor; birebir karşılığı değil, kullanılırsa ipucu hızı ayara bağlanır |
| ortak `.tc-gizli-etiket` | `:351`, `:435` | `width: 1px; height: 1px` ekran okuyucu gizlemesi. Ortakta yalnız `kadran.css:34` `.tc-kadran-gizli` var; genel ada taşınabilir |

Renkler bu listede yok: ortakta (`tokens.css:121-132`) ve doğru kullanılıyor. Doğru kullanılan diğerleri: `--kadran-dusey-pay`, `--orb-1`, `--orb-3`, `--kuyruk-genis`, `--menu-genis`, `--b-*`, `--yari-*`, `--z-*`, `--pay-ince`, `--nokta`, `--dokunma`, `--pencere-genis`, `--cekmece-genis`, `--tus-pencere-genis`.

## 8. Not: `npm run test:modul` Linux'ta sunucu testlerini bulmuyor

`araclar/test-modul.ts`, deseni tırnaklı geçiriyor (`"${sunucu}/**/*.test.ts"`) ve kabuk yalnız Windows'ta açık. Linux'ta node desene tırnaklarıyla bakıyor ve "tests 0" diyor (DOĞRULANDI: `npm run test:modul -- istasyonlar` → `ℹ tests 0`). Öneri: Windows dışında tırnaksız geçir. Araç geliştirme dondurulmuş; yalnız bilgi.
