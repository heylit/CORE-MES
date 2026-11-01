# Yük koşusu

Sentetik kişiler aynı anda gerçek ekranların yokladığı uçları ve açtığı sayfaları çağırır. Çıktı: uç başına sayı, saniyede istek,
p50/p95/p99, en çok süre, 4xx, 5xx, 503 (havuz dolu ya da veritabanı yok) ve cevapsız istek; sunucu tarafında olay döngüsü
gecikmesi, veritabanı bağlantı sayısı ve bellek (Sağlık ayrıntısından, 10 sn arayla). Yeni paket yoktur; Node `fetch` kullanılır.
Canlı paketine girmez (`ekran-testleri/` export-ignore).

## Sınırlar

- Yalnız canlı olmayan ortamda: `TMIV2_ORTAM=canli` ise ya da hedef sunucunun kendi bildirdiği ortam `canli` ise ya da
  okunamıyorsa koşu açılmaz. Hedef yalnız bu makinedeki düz HTTP kapısıdır (`http://127.0.0.1:<kapı>`).
- Yalnız okuma yapar. Yazma uçlarının eşzamanlılığı kritik yazma testlerindedir (ADR 0025 kural 6).
- Giriş sıralıdır: sunucu aynı adresten eşzamanlı girişi 429 ile reddeder ve koşunun bütün kişileri tek adresten gelir.
  Vardiya başında eşzamanlı giriş yükü bu koşuda ölçülmez.
- Tek makinede yük üreten ile sunucu aynı işlemciyi paylaşır; sonuç sunucu donanımında koşulmadıkça yalnız göstergedir.

## Koşmak

1. Boş test veritabanı, göçler ve örnek veri: `npm run goc`, `npm run ekran:hazirla` (örnek hesapların parolası buradan gelir).
2. Sunucu açık: `npm run sunucu`.
3. `.env`'e ekleyin (ayarlar yalnız `.env`'den okunur):
   ```
   TMIV2_YUK_ADRESI=http://127.0.0.1:4100
   TMIV2_YUK_KISI=1000
   TMIV2_YUK_SURE_SN=300
   TMIV2_YUK_ISINMA_SN=60
   TMIV2_YUK_TOHUM=1
   ```
   `TMIV2_YUK_SENARYO` isteğe bağlıdır: profil listesini taşıyan JSON dosyasının yolu (biçim `senaryo.ts` `senaryoSemasi`).
4. `npm run yuk -- hazirla`: `yuk.0001` ... biçiminde sentetik kişiler kişi modülünün kendi uçlarıyla açılır. Ad "Yuk Kisi 0001",
   sicil "YUK-0001"; rol, profilin örnek hesabının rolüdür. Parola koşuya özel üretilir ve yalnız işletim sisteminin geçici
   klasöründe (`tmiv2-yuk/hesaplar.json`) durur.
5. `npm run yuk`. Sonuç ekrana ve geçici klasöre (`tmiv2-yuk/sonuc-<zaman>.json`) yazılır.

Aynı tohum aynı kişi davranışını üretir; sonuç dosyasındaki tohumla koşu yeniden üretilir.

## Senaryo

Varsayılan karışım bir varsayımdır (`senaryo.ts` `VARSAYILAN_SENARYO`): yüzde 70 operatör, 10 planlama, 10 depo, 5 kalite,
5 müdür. Yoklama aralıkları ekranlardakiyle aynıdır (bildirim sayacı 30 sn, atölye ve kalite 15 sn). Rolün izni olmayan yol
koşunun başında bir kez denenir, 2xx dönmezse senaryodan çıkarılır ve "Senaryodan çıktı" satırıyla yazılır.

## Test

`npm run yuk:test` saf hesapları (dağılım, yüzdelik, adres ve ortam denetimi) tohumlu çok turla sınar; sunucu istemez.
