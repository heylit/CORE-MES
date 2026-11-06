# Uygulama kapalıyken cihaz bildirimi: Web Push (kart 2174; ADR 0031)

Uygulama açıkken cihaz bildirimi dış servis olmadan çalışır (zil yoklar, service worker gösterir). Uygulama kapalıyken bildirim
yalnız tarayıcının kendi push servisi üzerinden gelebilir; bu yüzden sunucunun internete, yalnız push servislerine istek atması gerekir.
Dışarı yalnız gövdesiz "yeni bildirim var" sinyali çıkar: başlık, metin, kişi adı, kayıt numarası ya da yol gitmez. Cihaz ayrıntıyı
iç sunucudan oturum çereziyle kendisi çeker. Varsayılan kapalıdır.

## Ortam değişkenleri

| Değişken | İçerik |
|---|---|
| `TMIV2_PUSH_ACIK` | `1` ise açık. Başka her değerde hiç istek atılmaz, Tercihlerim'de "Uygulama kapalıyken" kartı görünmez. |
| `TMIV2_PUSH_VAPID_OZEL` | VAPID özel anahtarı: P-256, 32 bayt, base64url. Açıkken zorunlu; geçersizse sunucu açılmaz. |
| `TMIV2_PUSH_KONU` | Push servisinin sorun olursa ulaşacağı iletişim adresi: `mailto:` ya da `https://` ile. Açıkken zorunlu. |

Değerler `.env` dosyasına (depoya girmez) ya da sunucu servisinin ortamına yazılır; depoya, karta, belgeye girmez.
Anahtar bir kez üretilir ve saklanır: değişirse bütün cihazların aboneliği geçersiz olur, kişiler cihazlarını yeniden açar.

Anahtar üretimi (sunucuda, bir kez):

```
node -e "const c=require('node:crypto').createECDH('prime256v1');c.generateKeys();console.log(c.getPrivateKey('base64url'))"
```

## Ağ

- Sunucudan yalnız `sunucu/moduller/bildirim/push.ts` içindeki `PUSH_SERVISLERI` listesindeki ana bilgisayarlara TCP 443 çıkışı açılır.
  Liste tam ad ya da nokta ile başlayan sonektir (sonek, o alanın altındaki her ana bilgisayar demektir). Başka çıkış açılmaz.
- İnternet kesikken uygulama kapalı cihazlara sinyal gitmez; uygulama açık cihazlarda bugünkü yol çalışır.
- Push servisi içerik görmez; hangi cihaza hangi zamanda sinyal gittiğini ve sunucunun genel IP adresini görür.

## Cihaz

- Kişi Profil > Bildirimler > Tercihlerim'deki "Uygulama kapalıyken > Bu cihaza bildir" anahtarıyla kendi cihazını açar ve kapatır.
- Service worker güvenli bağlam ister: uygulama HTTPS ile açılmalı ve iç sertifika cihazda güvenilir olmalıdır (`kurulum/https.md`).
- iPhone ve iPad'de yalnız ana ekrana eklenmiş uygulamada çalışır.
- Telefon şirket ağı dışındaysa ayrıntı çekilemez; yalnız "CORE: yeni bildirim" görünür.
- Varsayılan olarak görev, hatırlatma ve acil bildirimler sinyal üretir; bilgi üretmez. Türe göre açma kapama `ayarlar.yaz` işlemiyle
  `/api/bildirimler/push/turler` ucundadır (yönetim ekranı kart 2174 aşama 3).

## İş

`bildirim-push-gonder` zamanlanmış işi 15 saniyede bir koşar; kişi başına en çok dakikada bir sinyal gider (bekleyen bildirimler tek
sinyalde). Kapalıyken iş sağlık ayrıntısında "beklemede" görünür. 404 ya da 410 dönen abonelik silinir; zaman aşımı 5 saniyedir.
