---
name: modul-ac
description: Yeni bir modül klasörü açarken kullan (sunucu tarafı, istemci tarafı ve ilk testi).
---

# Modül aç

Örnek kaynağı: `sunucu/moduller/oturum/` (uçlu modül) ve `sunucu/moduller/denetim/` (uçsuz,
yalnız `disari.ts` veren modül).

## Önce

- Onaylı iş kuralları görevde olmalı. Yoksa başlama.
- Tablonun sahibi tek modüldür. Başka modülün tablosuna yazma; onun `disari.ts` fonksiyonunu çağır.

## Adımlar

1. `sunucu/moduller/<ad>/` aç. Ad küçük harf, Türkçe karaktersiz, çoğul ya da kavram adı.
2. Gerekenleri yaz; gerekmeyeni açma:
   `kurallar.ts`, `sorgular.ts`, `servis.ts`, `uclar.ts`, `disari.ts`; şemalar
   `paylasilan/sozlesme/<ad>.ts` içinde (cevap şeması orada; istemci tipini oradan alır; fikstür bu tipe uyar).
3. Yeni tablo gerekiyorsa `goc-yaz`.
4. `uclar.ts` içinde `export const uclar = [...]`. Sunucu modülü klasörden bulur; kayıt dosyası
   yoktur. `npm run harita` ile gör.
5. İlk test: kural için saf test, akış için `testVeritabaniKur('<ad>')`.
6. İstemci tarafı: `istemci/src/moduller/<ad>/`. Rota `rotalar.tsx` içinde `export const rotalar`;
   uygulama klasörden bulur, kayıt dosyası yoktur. Sorgu anahtarları modülün `anahtarlar.ts`
   dosyasında; ilk öğe modüle özgü olsun. Aynı yola iki modül rota verirse uygulama açılmaz.

## Örnek (`sunucu/moduller/denetim/disari.ts`)

```ts
export { denetimYaz } from './servis.ts';
```

`disari.ts` yalnız başkasının gerçekten kullandığını açar; sorgu ve iç tip açmaz.

## Örnek (`istemci/src/moduller/sistem/rotalar.tsx`)

```tsx
export const rotalar: ModulRotasi[] = [{ yol: '/', ekran: SistemDurumu }];
```

Yol `/` ile başlar, sonda `/` olmaz; yalnız küçük harf, rakam, tire ve `:parametre`. Uymayan yolda
uygulama açılmaz. Sayfa yolu ve alt yolları (`/stok`, `/stok/:id`) o sayfaya aittir: yalnız sayfayı
gören kullanıcıya açılır; sayfa yolunun kendisi yer tutucunun yerine geçer. Hiçbir sayfaya ait
olmayan yol oturumu olan herkese açıktır.

## Modül klasörü dışında kalan yerler

- `paylasilan/sozlesme/<ad>.ts`: modülün kendi sözleşme dosyası; modul-yazari yazar. İstemci modülü
  başka modülün sözleşmesini yalnız okur (`sistem` -> `saglik`); değişiklik cekirdek-yazari ile girer.
- `paylasilan/islemler/<ad>.ts`: modülün işlem listesi; modul-yazari yazar. Toplayıcıya
  (`paylasilan/islemler.ts`) eklenmesi ve rollere verilmesi cekirdek-yazari ile girer.
- `paylasilan/sayfalar/<ad>.ts`: modülün menü sayfaları (`export const <AD>_SAYFALARI = [...] as const satisfies readonly SayfaTanimi[]`;
  menü ve `sayfa.<ad>` işlemleri buradan beslenir); modul-yazari yazar. Sayfa grubunu (`paylasilan/sayfa-tanimi.ts`
  içindeki gruplardan) ve grup içi `sira` değerini kendi söyler. Ayarı olan modül aynı kalıpla
  `paylasilan/ayarlar/<ad>.ts` yazar (`export const <AD>_AYARLARI = {...} as const satisfies Record<string, AyarTanimi>`;
  anahtar `<ad>.` ile başlar).
- Aynı dosyada modülün ikinci menüsü (`export const <AD>_IKINCI_MENU = {...} as const satisfies IkinciMenuTanimi`): ana menüde modül tek
  sayfadır, modülün sayfaları ikinci menünün maddeleridir. Menüyü kabuk çizer ve yetkiye göre süzer; modül menü, sekme şeridi
  ya da yan çubuk çizmez. Her madde yolunun rotası `rotalar.tsx`'te olur; sayaç ucu `yetki: 'oturum'` ile yazılır ve sayıyı kullanıcının
  yetkisine göre süzer. Biçim, kurallar (çerçeve sözleşmesi dahil) ve örnek `yapi-kaliplari` "İkinci menü" başlığında.
- Toplayıcıya (`paylasilan/sayfalar.ts`, `paylasilan/ayarlar.ts`) ithal ve yayma satırının (`IKINCI_MENULER` dahil) eklenmesi, yeni menü grubu
  ve sayfa işleminin rollere verilmesi cekirdek-yazari ile girer.

## Bitti ölçütü

`npm run kontrol` ve `npm run sinir -- --modul <ad>` yeşil.
