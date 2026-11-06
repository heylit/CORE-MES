# ADR 0031 — Uygulama kapalıyken cihaza içeriksiz Web Push sinyali

Durum: kabul (2174-1 c, teyit 06.11.2026; metin onayı 2174-9 a, 06.11.2026). Numara 0031 koordinatörce 2174 için ayrıldı.

## Bağlam

Kullanıcı, uygulama kapalıyken de telefona ve bilgisayara bildirim istedi (2174-1 c, teyitli). Bugün cihaz bildirimi yalnız uygulama açıkken
düşer: zil 30 sn'de bir yoklar, service worker gösterir, dış servis yoktur (342 a, `istemci/src/moduller/bildirim/cihaz.ts`).
Tarayıcılar kapalı sayfaya yalnız kendi push servisleri üzerinden ulaşır (Chrome, Edge: Google/Microsoft; Safari: Apple; Firefox: Mozilla).
Kendi push sunucusu kurmak tarayıcıların izin verdiği bir yol değildir. Bu yüzden iç sunucunun internete istek atması gerekir ve bu,
CLAUDE.md'deki "telemetri ve dış servis çağrısı yok" kırmızı çizgisine yeni bir istisnadır.

## Seçenekler

- **a) Mevcut yol:** dış servis yok; uygulama kapalıyken bildirim yok.
- **b) Masaüstü tepsi istemcisi:** iç ağda kalır; ayrı program, kurulum ve bakım; telefonda çözüm değil.
- **c) Web Push, içerikli:** başlık ve metin şifreli olarak push servisinden geçer; şifre çözülemese de içerik şirket dışına çıkar.
- **d) Web Push, içeriksiz sinyal:** dışarı yalnız "yeni bildirim var" sinyali çıkar (gövde boş); cihaz ayrıntıyı iç sunucudan kendisi çeker.

## Karar

d seçilir.

1. **Tek modül, tek dosya.** Dışarıya yalnız `bildirim` modülü, yalnız `sunucu/moduller/bildirim/push.ts` istek atar. Başka modül ve başka dosya dış istek atmaz; sınır denetimi bunu sınar.
2. **Gövde boş.** Push isteği yalnız VAPID imzalı başlıkları taşır; gövde, başlık, metin, kişi adı, kayıt numarası, yol gönderilmez. Şifreleme gerekmez, yeni paket gerekmez (imza `node:crypto` ES256).
3. **Hedef izin listesi.** Abonelik uç noktası yalnız koddaki push servisi ana bilgisayarlarından biriyse (https, 443) kaydedilir; liste dışı adres reddedilir (sunucunun keyfi adrese istek atması engellenir). Liste: Google, Apple, Mozilla ve Microsoft'un yayımlanmış push alan adları.
4. **Varsayılan kapalı.** `TMIV2_PUSH_ACIK=1` yoksa hiç istek atılmaz ve abonelik düğmesi görünmez. VAPID özel anahtarı yalnız `TMIV2_PUSH_VAPID_OZEL`'de; konu (iletişim adresi) yalnız `TMIV2_PUSH_KONU`'da. Depoya anahtar, kurum adı ya da adres girmez.
5. **Cihaz ayrıntıyı içeriden çeker.** Service worker push olayında aynı kökene (iç sunucu) oturum çereziyle okunmamış bildirimleri sorar ve gösterir. İç sunucuya ulaşamazsa yalnız "CORE: yeni bildirim" gösterir. Her push'ta bir bildirim gösterilir (tarayıcı kuralı).
6. **Gönderim transaction dışında.** Bildirim yazılınca kişi kuyruğa işaretlenir; zamanlanmış iş (ADR 0010, txDisi) gönderir. Zaman aşımı 5 sn; 404 ve 410 dönen abonelik silinir; aynı kişiye en çok dakikada bir sinyal (birden çok bildirim tek sinyalde).
7. **Kim alır.** Kişi kendi cihazını oturumla açar ve kapatır (Bildirim tercihleri ekranında). Varsayılan olarak yalnız görev, hatırlatma ve acil bildirimler sinyal üretir; bilgi göndermez. Yönetici türe göre kapatabilir (Bildirim yönetimi).
8. **Ağ.** Sunucuda yalnız izin listesindeki ana bilgisayarlara 443 çıkışı açılır; kurulum belgesine yazılır. Uygulama başka hiçbir yere istek atmaz.
9. **CLAUDE.md.** Kırmızı çizgilerdeki dış servis istisnalarına tek satır eklenir: "Web Push (ADR 0031, yalnız `bildirim` modülü `push.ts`): yalnız izin listesindeki push servislerine, gövdesiz sinyal; varsayılan kapalı."

## Sonuçlar

- Push servisi (Google, Apple, Mozilla, Microsoft) içerik görmez ama hangi cihaza hangi zamanda sinyal gittiğini ve sunucunun genel IP adresini görür.
- Sunucu internete çıkabilen bir makine olur (yalnız izin listesine). İnternet kesikken uygulama kapalı cihazlara sinyal gitmez; uygulama açık cihazlarda bugünkü yol çalışmaya devam eder.
- iPhone'da yalnız ana ekrana eklenmiş uygulamada çalışır. Telefon şirket ağının dışındaysa ayrıntı çekilemez, genel metin görünür.
- Service worker değişir (onay listesinde; bu ADR'nin onayı onu da kapsar).

## Vazgeçilenler

- c (içerikli): şifreli de olsa iş içeriği şirket dışına çıkar.
- b (tepsi istemcisi): telefonu karşılamaz, ayrı program bakımı.
- Kendi push sunucusu: tarayıcılar desteklemez.

## Doğrulanmadı

- Dört push servisinin gövdesiz isteği kabul ettiği: Web Push belgesi (RFC 8030) gövdesiz itmeye izin verir; servis başına denenmedi.
- İç sunucunun sertifikasının telefonlarda güvenilir olduğu: service worker güvenli bağlam ister; bugünkü cihaz bildirimi de bunu istediği için var sayıldı, denenmedi.
- Push servis alan adlarının güncel listesi: yazımdan önce servislerin belgelerinden alınır.
