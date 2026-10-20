# CEKIRDEK-ISTEKLERI: etiket-merkezi

1. Toplayıcılar: `paylasilan/sayfalar.ts` (1. PR), `paylasilan/islemler.ts`, `ayarlar.ts`, `islem-adlari.ts` (2. PR); yalnız kendi satırları, ayrı commit.
2. Ortak simge setine "yazıcı" simgesi (`istemci/src/ortak/tasarim/simgeler.ts`); gelince sayfa simgesi `book`'tan değişir.
3. Ortak QR bileşeni (`istemci/src/ortak/arayuz`): stok `Qr.tsx`, `LotEtiketi.tsx`, `Etiketler.tsx`, uretim-emirleri `refakat.ts` ve etiket-merkezi `Onizleme.tsx` aynı çizimi tekrar ediyor.
4. Malzeme türü adları için ortak sözlük (`paylasilan`): stok `gorunum.ts`, malzemeler `arama/uclar.ts` ve `LogoGonderimi.tsx`, rota ekranları ve etiket-merkezi `kurallar.ts` aynı adları kopyalıyor.
Yeni paket: yok.
