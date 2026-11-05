# Kural -> test: ortak-dosyalar

`ortak-dosyalar.test.ts` gerçek PostgreSQL ve gerçek giriş; `kurallar.test.ts` saf; `istemci/src/moduller/ortak-dosyalar/OrtakDosyalar.test.tsx` ekran.
Test adları başlığın başıdır.

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| OD-1 Düzeyler sıralı | `kurallar.test.ts` `OD-1` | aynı test: alttaki üsttekini içermez |
| OD-2 Miras: en yakın özel üstün satırları | `OD-2 miras ...`, `OD-2/5 ...` | `OD-2 kopuk ya da döngülü zincir ...` |
| OD-3 Düzey rollerin en yükseği; yönetici her yerde yonetir | `OD-3 ...` | aynı test: rolsüz `yok` |
| OD-4 Bilinmeyen klasör `yok` | - | `OD-4 ...` |
| OD-5 Görünmez klasör listede yok, doğrudan istek 404 | `OD-2/5 ...` | aynı test: 404; `kurallar.test.ts` `OD-5` |
| OD-6 Ad anahtarı tr-TR, harf duyarsız | `OD-6 ...` | `OD-10 ...` (aynı ad 409) |
| OD-7 Tür sınırı ve yükleyen bağlar | `OD-11 ...` (PDF) | `OD-7 ...` (STEP 400, başkasının içeriği 400) |
| OD-8 Sayfa işlemi şart | - | `OD-8 ...` (403) |
| OD-9 Kökü yalnız yönetici açar | `OD-9 ...` | aynı test: 403 |
| OD-10 Alt klasör yonetir ister | `OD-10 ...` | aynı test: ekler 403, aynı ad 409, `/` 400 |
| OD-11 Yükleme ekler ister; aynı ad yeni sürüm; eski sürüm iner | `OD-11 ...` | aynı test: gorur 403, başka klasör yolu 404 |
| OD-12 Arşiv yonetir; arşivde indirme yok; geri alma | `OD-12 ...` | aynı test: ekler 403, ikinci arşiv 409, çakışan geri alma 409 |
| OD-13 Yetki sekmesi yalnız `yetki-ver` | `OD-13 ...` (yönetici okur) | aynı test: 403, yönetici satırı 400, köke miras 400, eski sürüm 409 |
| OD-14 Yetki değişikliği hemen geçer | `OD-14 ...` | aynı test: özel yetkiyle gizlenen klasör 404 |
| OD-15 Son eklenenler yalnız görünenler | `OD-15 ...` | aynı test: gizli klasörün dosyası yok |
| OD-16 Geçmiş ve denetim izi | `OD-16 ...` | - |
