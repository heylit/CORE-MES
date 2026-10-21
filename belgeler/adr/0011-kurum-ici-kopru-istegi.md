# ADR 0011 — Sunucudan kurum içi köprü servisine istek

Durum: kısmen yerine geçildi. 1, 2 ve 4. kararların yerine ADR 0017 (Logo yardımcısı, yalnız 127.0.0.1) geçti; 3, 5, 6 ve 7 sürer.
Karar 2'deki adres kuralı SmartES için (ADR 0013) geçerlidir. İlk kabul: kartlar #209, #207, #210; kullanıcı kararları 08.10.2026, kabul 11.10.2026.

## Bağlam

Kırmızı çizgi "telemetri ve dış servis çağrısı yok" diyor. Logo'ya yazmanın tek yolu kurum içindeki Logo köprü servisidir (HTTP; #205).
Kullanıcı kararı (08.10.2026): #205 madde 6 malzeme kartı için kalktı, gönderim altyapısı şimdi yazılır; deneme sahte köprüyle yapılır,
gerçek köprüye istek atılmaz. Firma, sipariş, talep ve fişler bu kararın dışındadır.

## Karar

1. **Kurum içi köprü ayrı tutulur.** Sunucunun kurum içindeki Logo köprü servisine HTTP isteği "dış servis çağrısı" sayılmaz.
   İnternete çıkan her çağrı, telemetri ve CDN yasağı aynen sürer.
2. **Kurum içi adres açılışta denetlenir.** Köprü adresi yalnız özel ya da yerel IPv4 (10/8, 172.16/12, 192.168/16, 127/8), yerel IPv6
   (`::1`, `fc00::/7`, `fe80::/10`) ya da noktasız tek parçalı sunucu adıdır. Alan adı (`ornek.com`) ve genel IP reddedilir, sunucu açılmaz
   (`sunucu/moduller/logo/ayar.ts` `kurumIciMi`). Adreste kullanıcı, parola, sorgu ve `#` olmaz; yönlendirme izlenmez (`redirect: 'error'`).
3. **Köprüyle tek modül konuşur.** `sunucu/moduller/logo/kopru.ts` dışında hiçbir dosya köprüye istek atmaz; başka modüller (malzemeler dahil)
   köprüyü çağırmaz. Bağlantı modülü sahibi modülün `disari.ts` işlevleriyle kuyruğu okur ve sonucu yazar (ADR 0006 yönü: logo -> malzemeler).
4. **Adres ve anahtar yalnız ortam değişkenindedir** (`TMIV2_LOGO_KOPRU_ADRESI`, `TMIV2_LOGO_KOPRU_ANAHTARI`; #210). Depoya, karta, teste,
   günlüğe ve hata metnine girmez; ekranda görünen hata metinleri sabit metindir, adres taşımaz. Anahtar `X-Api-Key` başlığıyla gider.
5. **Bağlantı varsayılan kapalıdır.** İstek ancak Sistem Ayarları'ndaki "Logo bağlantısı" anahtarı (`logo.baglanti`, varsayılan kapalı) açık VE
   iki değişken tanımlıyken çıkar. Anahtar kapalıysa iş koşar, istek atmaz, yazmaz; kuyruk birikir. Anahtar açık ama değişken yoksa istek
   atılmaz, iş durumu nedeni sağlık ayrıntısında gösterir. Anahtar değişikliği denetim kaydına yazılır. Biri eksik ya da adres geçersizse
   sunucu açılmaz (ileti değişkenin adını söyler, değerini söylemez).
6. **İş zamanlanmış iş kalıbıyla koşar** (ADR 0010). Yeni paket yok: Node'un kendi `fetch`'i. İstek süresi 60 saniye; tur, iki isteği
   bekleyebilmek için yalnız kendi transaction'ında "boşta transaction" kesmesini uzatır (`set_config(..., true)`).
7. **Aynı kart Logo'da iki kez açılmaz.** Her gönderim "var mı" okumasıyla başlar; açma isteğinden önce kalıcı niyet yazılır (ayrı tur);
   sonucu bilinmeyen istekten (zaman aşımı, kopan bağlantı, 5xx, çöken süreç) sonra 5 dakika yeni açma isteği gitmez, sonra yine önce
   "var mı" okunur. Eşzamanlı iki işçiyi ADR 0010'un tur kilidi ayırır.

## CLAUDE.md için öneri metni (kırmızı çizgiler, ilk madde)

> - Depoya yalnız kod girer: müşteri adı, parça no, çizim, gerçek veri, parola, anahtar girmez. Telemetri ve internete çıkan servis çağrısı yok.
>   Tek istisna kurum içindeki Logo köprüsüdür (ADR 0011): yalnız `logo` modülü, yalnız kurum içi adrese, adres ve anahtar `TMIV2_*` ortam değişkeninde.

## Sonuçlar

- Gerçek köprüye geçiş yalnız ortam değişkenini vermektir; kod değişmez. Önce kullanıcının yapacakları `kurulum/logo-yardimcisi.md`'dedir (eski `logo-koprusu.md`).
- Firma, sipariş, talep ve fiş gönderimi aynı modüle ve aynı giden kutusuna (`logo_giden.belge_turu`) eklenir; her biri kendi kararıyla gelir.

## Vazgeçilenler

- **Kuralı yalnız belgede gevşetmek:** adres denetimi olmadan yanlış yazılmış bir değişken sunucuyu internete çıkarabilirdi.
- **Köprüyü her modülün kendisi çağırması:** anahtar ve sıra (köprü tek oturum) dağılır; çift gönderim kalkanı tek yerde tutulamaz.
- **İstek kuyruğu için yeni paket:** gereksiz; ADR 0010 kalıbı yeter.

## Doğrulanmadı

- Köprünün gerçek cevap biçimi: "var mı" ve birim seti ucunun cevabı, `validate` biçimi (VARSAYIM; sahte köprü bu varsayımı taklit eder).
- Logo'nun aynı stok koduyla ikinci kartı reddedip reddetmediği (BİLMİYORUM; kalkan buna güvenmez).
- Köprü kuyruğunda bekleyen bir isteğin en uzun süresi; 5 dakikalık bekleme VARSAYIM'dır.
