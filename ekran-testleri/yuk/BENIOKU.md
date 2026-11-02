# Yük koşusu

Sentetik kişiler aynı anda gerçek ekranların yokladığı uçları ve açtığı sayfaları çağırır. Çıktı: uç başına sayı, saniyede istek,
p50/p95/p99, en çok süre, 4xx, 5xx, 503 (havuz dolu ya da veritabanı yok) ve cevapsız istek; sunucu tarafında olay döngüsü
gecikmesi, veritabanı bağlantı sayısı ve bellek (Sağlık ayrıntısından, 10 sn arayla). Yeni paket yoktur; Node `fetch` kullanılır.
Canlı paketine girmez (`ekran-testleri/` export-ignore).

## Sınırlar

- Yalnız canlı olmayan ortamda: `TMIV2_ORTAM=canli` ise ya da hedef sunucunun kendi bildirdiği ortam `canli` ise ya da
  okunamıyorsa koşu açılmaz. Hedef yalnız bu makinedeki düz HTTP kapısıdır (`http://127.0.0.1:<kapı>`).
- Varsayılan yalnız okumadır. `--yazma` senaryodaki `yazma` seçeneklerini de koşar; bu kayıt yazar, yalnız atılacak test
  veritabanında kullanılır. Yazma uçlarının eşzamanlılık doğruluğu kritik yazma testlerindedir (ADR 0025 kural 6); burada ölçülen yüktür.
- Giriş sıralıdır: sunucu aynı adresten eşzamanlı girişi 429 ile reddeder ve koşunun bütün kişileri tek adresten gelir.
  Vardiya başında eşzamanlı giriş yükü bu koşuda ölçülmez.
- Tek makinede yük üreten ile sunucu aynı işlemciyi paylaşır; sonuç sunucu donanımında koşulmadıkça yalnız göstergedir.
- Terminalin yazma sonrası aynı istasyondaki kayıtları yeniden okuması (1747 süzgeci) modellenmez; kayıt okumaları yalnız aralıkla gelir.

## Ayarlar

Ayar komut satırından verilir; verilmeyen `.env`'den, o da yoksa varsayılandan gelir. `TMIV2_YUK_*` değişkenini süreç
ortamından vermek (`TMIV2_YUK_KISI=200 npm run yuk`) `.env` varken "Ortam çelişkisi" ile durur (araclar/ortam.ts); bu kural
gevşetilmez, yerine komut satırı kullanılır.

| Seçenek | `.env` | Varsayılan | Anlamı |
|---|---|---|---|
| `--kisi N` | `TMIV2_YUK_KISI` | 1000 | Sanal kişi (cihaz) sayısı |
| `--sure SN` | `TMIV2_YUK_SURE_SN` | 300 | Ölçüm süresi |
| `--isinma SN` | `TMIV2_YUK_ISINMA_SN` | 60 | Ölçülmeyen ısınma |
| `--tohum N` | `TMIV2_YUK_TOHUM` | 1 | Aynı tohum aynı davranış |
| `--senaryo DOSYA` | `TMIV2_YUK_SENARYO` | `senaryo.ts` varsayılanı | Profil listesi (aşağıda) |
| `--karma ad=pay,...` | `TMIV2_YUK_KARMA` | senaryodaki paylar | Cihaz karması; adı geçmeyen profil koşmaz |
| `--yazma` | `TMIV2_YUK_YAZMA=1` | kapalı | Yazma dahil iş yükü |
| `--sunucu-ac` | | kapalı | Sunucuyu koşu açar, bitince SIGINT ile kapatır |
| `--profil` | `TMIV2_YUK_PROFIL=1` | kapalı | Sunucunun CPU profili (`--sunucu-ac` içerir) |
| `--yonetici AD` | `TMIV2_YUK_YONETICI` | `ornek.yonetici` | Kişi açan ve sağlığı okuyan yönetici |

Hedef adres yalnız `.env`'deki `TMIV2_YUK_ADRESI`'ndedir (örnek `http://127.0.0.1:4100`).
`ornek.yonetici` dışındaki yöneticinin parolası yalnız `.env`'deki `TMIV2_YUK_YONETICI_PAROLA`'dadır; böylece koşu örnek veri
yüklenmemiş (boş olmayan) bir test veritabanında da açılır. Örnek yönetici ise `npm run ekran:hazirla`'nın parolasını kullanır.

## Koşmak

1. Test veritabanı ve göçler: `npm run goc`. Örnek hesaplarla koşulacaksa boş veritabanında `npm run ekran:hazirla`.
2. Sunucu açık (`npm run sunucu`) ya da her komuta `--sunucu-ac`.
3. `npm run yuk -- hazirla --kisi 200 --senaryo ekran-testleri/yuk/cihaz-senaryosu.json --karma terminal=120,ofis=60,pano=20`:
   sentetik kişiler kişi modülünün kendi uçlarıyla açılır. Hesap adı profile bağlıdır (`yuk.terminal.0001`), ad
   "Yuk Kisi terminal 0001", sicil "YUK-TERMINAL-0001"; rol profilin `ornekHesap`'ının rolü ya da `rol` adındaki roldür. Parola koşuya
   özel üretilir ve yalnız işletim sisteminin geçici klasöründe (`tmiv2-yuk/hesaplar.json`) durur. Karma değişince eksik
   profilin hesabı açılır, öncekiler korunur.
4. `npm run yuk -- --kisi 200 --sure 300 --senaryo ... --karma ... [--yazma] [--profil]`. Sonuç ekrana ve geçici klasöre
   (`tmiv2-yuk/sonuc-<zaman>.json`) yazılır.

Aynı tohum aynı kişi davranışını üretir; sonuç dosyasındaki tohum ve ayarla koşu yeniden üretilir.

## CPU profili

`--profil` sunucuyu `node --cpu-prof` ile açar (kapı doluysa açmaz: başka sürece profil alındığı sanılmasın), koşu bitince
SIGINT ile kapatır ve profili özetler: kategori (modül, çekirdek, pg, zod, fastify, günlük, GC, boşta), fonksiyon ve kapsayıcı
modül fonksiyonu payı. Profil açılıştan kapanışa bütün süreyi kapsar. Dosya `tmiv2-yuk/profil-<zaman>/` altında kalır;
yeniden özet: `npm run yuk -- profil-ozet <dosya.cpuprofile>`. Çalışan sürece dışarıdan bağlanılmaz (denetçi kapısı açılmaz).

## Senaryo

Varsayılan karışım bir varsayımdır (`senaryo.ts` `VARSAYILAN_SENARYO`): yüzde 70 operatör, 10 planlama, 10 depo, 5 kalite,
5 müdür. Yoklama aralıkları ekranlardakiyle aynıdır (bildirim sayacı 30 sn, atölye ve kalite 15 sn). Rolün izni olmayan yol
koşunun başında bir kez denenir, 2xx dönmezse senaryodan çıkarılır ve "Senaryodan çıktı" satırıyla yazılır.

`cihaz-senaryosu.json` 2 Kasım yük raporunun iş yükünü taşır: terminal, ofis ve pano; terminal yazması ortalama 90 sn'de bir,
yüzde 70 sayım, yüzde 30 duruş. Dosya ya düz profil listesidir ya da `{ "istasyonlar": ..., "profiller": [...] }`.
`istasyonlar` elle liste (`[{ "id": 1, "kod": "...", "emirId": 6, "emirNo": "..." }]`) ya da `"kesfet"`tir: hedef sunucuda
başlamış emri olan her istasyon bir kez alınır. Kişiler istasyonlara profil içinde sırayla dağılır.

Yol ve yazma gövdesi yer tutucu taşıyabilir (`sablon.ts`): `{uuid}`, `{simdi}`, `{simdi-<sn>}`, `{kaynak}` (kişinin hesap adı),
`{istasyon.<alan>}`. Bilinmeyen yer tutucu senaryo okunurken reddedilir. Yazma seçeneği:
`"yazma": { "ortalamaSn": 90, "secenekler": [{ "yol": "...", "govde": { ... }, "agirlik": 7 }] }`.

## Test

`npm run yuk:test` saf hesapları (ayar okuma, karma, şablon, dağılım, yüzdelik, profil özeti, adres ve ortam denetimi)
tohumlu çok turla sınar; sunucu istemez.
