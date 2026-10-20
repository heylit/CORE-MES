# Çekirdek istekleri (kalite-merkezi)

Teslimdeki kod bunlar girmeden derlenmez (işlem tipi kayıtlı değil, sayfa menüde yok). Hepsi `cekirdek-1-toplayicilar.diff` dosyasındadır; taban 640bebf'e `git apply` ile uygulanır (temiz ağaçta denendi: modül dosyaları + yama, sınanan ağaçla birebir aynı).

## 1. İşlem toplayıcısı: `paylasilan/islemler.ts`
```ts
import { KALITE_MERKEZI_ISLEMLERI } from './islemler/kalite-merkezi.ts';
// VERI_ISLEMLERI içine, KALIBRASYON_ISLEMLERI satırından sonra:
  ...KALITE_MERKEZI_ISLEMLERI,
```

## 1a. İşlem adları: `paylasilan/islem-adlari.ts` (640bebf'te zorunlu)
```ts
// ISLEM_ADLARI içine, 'kalibrasyon.yaz' satırından sonra:
  'kalite-merkezi.oku': 'Kalite merkezini görme',
  'kalite-merkezi.yaz': 'Kalite kaydı girme',
  'kalite-merkezi.geri-yukle': 'Kalite yedeğini geri yükleme',
// MODUL_ADLARI içine, kalibrasyon satırından sonra:
  'kalite-merkezi': 'Kalite merkezi',
```

## 2. Sayfa toplayıcısı ve ikinci menü: `paylasilan/sayfalar.ts`
```ts
import { KALITE_MERKEZI_IKINCI_MENU, KALITE_MERKEZI_SAYFALARI } from './sayfalar/kalite-merkezi.ts';
// SAYFALAR içine, KALIBRASYON_SAYFALARI satırından sonra:
  ...KALITE_MERKEZI_SAYFALARI,
// IKINCI_MENULER içine, KALIBRASYON_IKINCI_MENU satırından sonra:
  KALITE_MERKEZI_IKINCI_MENU,
```
Sayfa Kalite grubunda `sira: 5` (Ölçü Aletleri'nden önce), ana menü simgesi `check` (ana menüde boş; simgeler tekil testi).

## 3. Rol x işlem göçü
İstenmiyor (Aşama 1: işlemler yalnız yöneticide). Bağlamada ortak yetki matrisinden verilir.

## 4. Bağımlılık
Yeni npm paketi yok. Yazı tanıma kitaplıkları (tesseract.js 5.1.1, çekirdek 5.x, İngilizce dil verisi) `istemci/src/moduller/kalite-merkezi/uygulama/ocr.ts`
ve `ocr-cekirdek.ts` içinde uygulamadan alındığı gibi durur. Kullanıcı onayı: 12.10.2026 ("2 onay"); bu projede karar kartıyla yeniden onaylandı (12.10.2026 10:23, kart #741).

## 5. Dosya türü istisnası
Yok: uygulama paketi ve OCR kitaplıkları `.ts` içinde metin olarak durur (İK kalıbı).
