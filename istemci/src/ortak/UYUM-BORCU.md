# ortak arayüz: uyum borcu

## Kabul edilen

- Tam ekrandan Esc ile çıkış, odak çerçevenin (Arkon, malzemeler kataloğu) içindeyken çalışmaz (kullanıcı kararı E1 a, 08.10.2026). Çerçevedeki tuş olayı üst pencereye gelmez ve modüle bunun için ek yapılmaz. Çıkış her zaman üst çubuktaki düğmeyle yapılır. `arayuz/tam-ekran.test.tsx`, düğmenin tam ekranda üst çubukta kaldığını, gizlenen bölgelerin dışında olduğunu ve çalıştığını sınar; sütun ve şerit kipinin ikisinde de. Test ortamı stil uygulamaz, sınır kuralı h da testin stil dosyasını okumasını yasaklar. Bu yüzden görünürlük tarayıcıda ölçüldü: 360, 768 ve 1280 genişlikte, `/arkon` ve `/malzemeler` sayfalarında düğme görünür ve pencerenin içinde (44x44). Ölçüm 08.10.2026'da yapıldı, DOĞRULANDI.
- SONRA, canlı öncesi yeniden bakılacak (kullanıcı kararı P3 a, 08.10.2026). Konu, `react-router-dom` 6.30.6 için `npm audit`'in verdiği iki orta uyarı:
  - GHSA-wrjc-x8rr-h8h6: `Link` ve `useNavigate` hedefinde ters eğik çizgiyle açık yönlendirme.
  - GHSA-337j-9hxr-rhxg: SSR'de `deserializeErrors`.
  - İkisi de `>=6.0.0 <7.18.0` aralığında. 6.x için düzeltme yok, düzeltme ana sürüm 7'de (`npm audit`: 7.18.4).
  - Bu kurulumda erişilebilir değil, gerekçesi:
    - SSR yok: `istemci/src/App.tsx` `BrowserRouter` kullanıyor ve depoda `renderToString` ya da `hydrateRoot` geçmiyor.
    - Yönlendirme hedefleri sabit önekle başlar: menü yolları, sayısal emir kimliği (`/uretim-emirleri/${id}`) ve `encodeURIComponent` ile `/arkon/` altına konan Arkon görünüm adı (`moduller/arkon/ArkonCercevesi.tsx`, `gezin(` satırı). Kullanıcı girdisi hedefin başına gelmez.

## Bağlamada kapanacak

- Bağlamada kalkar (kart #506, soru 308 d): ana menüdeki "Yeni ekranlar (deneme)" grubu. TS geçişindeki yeni ekranların (`<kök>/yeni`) satırları yalnız yeni ekran kapısını geçen yöneticide görünür; ana menüde modül başına tek sayfa kuralının onaylı geçici istisnasıdır. Kaldırmak için `rota/yeni-ekran-menusu.ts` ile testi silinir ve `arayuz/Kabuk.tsx`'teki `yeniEkranlar` satırı ile iki grup bloğu çıkarılır.
