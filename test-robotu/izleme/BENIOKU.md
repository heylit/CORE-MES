# Robot izleme

Test robotunun (ADR 0019) koşu klasörlerini gösteren küçük, ayrı uygulama. Ana uygulamaya ve veritabanına bağlanmaz,
hiçbir şey yazmaz; yalnız `TMIV2_ROBOT_SONUC` altındaki koşu klasörlerini `ekran-testleri/benzetim/sozlesme.ts`
okuyucularıyla okur. Canlı paketine girmez (`.gitattributes` export-ignore).

## Açmak
`npm run robot:izle`, sonra tarayıcıda `http://127.0.0.1:4200`. Robot koşarken açık kalabilir; canlı koşu birkaç saniyede yenilenir.

Ayarlar: `TMIV2_ROBOT_SONUC` (robotla aynı kök; boşsa işletim sisteminin geçici klasöründe `tmiv2-robot`),
`TMIV2_ROBOT_IZLEME_PORT` (varsayılan 4200).

## Ekranlar
- Koşular: tarih, taban, süre, gün, durum, sayaç. Sürümü bilinmeyen ya da bozuk özet hatasıyla listelenir.
- Koşu: özet, rol başına son adım (canlı), süzgeçli adım listesi (yeniden eskiye), en yavaş uçlar (p50/p95).
- Adım: beklenen ve gelen, ileti, ekler (görüntü sayfada, diğer türler indirilir).
- Eğilim: son 20 koşu; düşen, ara sıra ve p95; önceki koşuya göre yeni düşen, düzelen ve yavaşlayan uç.
- Ara sıra düşenler: son koşular boyunca toplanmış, koşu sayısına göre.
- Model yorumu: `yorum.md` düz metin olarak; yorum karar değildir.

## Güvenlik
- Yalnız 127.0.0.1 dinler; `Host` başlığı 127.0.0.1 ya da localhost değilse 421 döner. Yalnız GET; diğer yöntem 405.
- Ek yolu koşunun `ekler/` klasörü dışına çıkamaz: `..`, mutlak yol, sürücü harfi, ters eğik çizgi ve dışarıyı gösteren bağlantı reddedilir.
- İçerik politikası yalnız kendi kaynağı; chart.js depodaki paketten servis edilir, CDN yok. Koşu metni sayfaya yalnız düz metin olarak yazılır.

## Test
`node --test "test-robotu/izleme/*.test.js"`. Dosyalar `.js`'dir: kökteki eslint yapılandırması `.ts` dosyasını bir tsconfig
projesinde arar ve `test-robotu/` hiçbirinde yoktur. Bu testler `robot:test`e ve CI'a girmez.
