# HTTPS (kart #1278)

Telefonun bağlandığı kapı (4101, sunucunun arayüz kapısı; `TMIV2_ARAYUZ_PORT` ile değişir) HTTPS ile sunulunca Android Chrome TMI'yi uygulama olarak kurar ve service worker çalışır (kart #1269).
Şirket dışından iç uygulamaya erişim VPN ile olur (2026-10-14 kullanıcı kararı): telefon VPN'e bağlanınca iç ağdaki gibi aynı adres ve aynı
sertifikayla girer. İç uygulama internete açılmaz. Portal ve Mesaj'ın dış kullanımı ayrı dış sunucudan olur (ADR 0021); Let's Encrypt yalnız o sunucudadır.
VPN'in kurulumu bilgi işlemindir.

## Nasıl çalışır

- İki ortam değişkeni birlikte verilir; ikisi de yoksa uygulama bugünkü gibi düz HTTP sunar:
  - `TMIV2_HTTPS_SERTIFIKA`: sunucu sertifikası, PEM biçiminde (`.crt` / `.pem`), mutlak yol. Ara sertifika varsa aynı dosyada, sunucu sertifikasının altında durur.
  - `TMIV2_HTTPS_ANAHTAR`: sertifikanın gizli anahtarı, PEM biçiminde, parolasız, mutlak yol. Yalnız servis hesabı okuyabilsin.
- `npm run baslat` açılışta ikisini denetler. Yalnız biri verilmişse, dosya yoksa, okunamıyorsa ya da sertifika ile anahtar birbirine
  ait değilse sunucu Türkçe iletiyle açılmaz. Kod: `istemci/src/ortak/pwa/https.ts`.
  `npm run gelistir:istemci` `.env` okumaz; orada değişkenler süreç ortamından verilirse aynı denetim çalışır.
- HTTPS açıkken 4101 yalnız HTTPS konuşur; `http://` adresi çalışmaz, telefonlar `https://<sunucu-adı-ya-da-ip>:4101` ile girer.
  4100 (sunucu) HTTP kalır; telefonlar ona bağlanmaz, `/api` istekleri 4101 üzerinden gider.

## Telefonların 4101'e ulaşması (kart #1280)

- `npm run baslat` 4101'i varsayılan olarak yalnız bu makinede açar (`localhost`); telefon ulaşamaz.
- Telefonların yerel ağdan bağlanması için `.env`'e `TMIV2_ONIZLEME_ADRESI` yazılır: `0.0.0.0` bütün ağ arayüzleri, belirli bir IP
  (ör. `10.0.9.88`) yalnız o arayüz. IP olmayan değerde sunucu Türkçe iletiyle açılmaz. Kod: `istemci/src/ortak/pwa/dinleme.ts`.
  Değişkenin adı eskiden 4101'i ayrı süreç (`vite preview`) açtığı içindir; artık arayüz kapısını etkiler, API kapısı (4100) bu makinede kalır.
  `npm run gelistir:istemci` bu makinede kalır.
- HTTPS değişkenleriyle birlikte telefonlar `https://<sunucu-adı-ya-da-ip>:4101` ile girer.
- Sunucu bilgisayarında Windows güvenlik duvarı 4101'e gelen TCP bağlantısına izin vermelidir. Kuralı yönetici yetkisiyle bilgi işlem ekler;
  yalnız 4101 açılır, 4100 açılmaz. Ağ "Ortak (Public)" sayılan yerde (ör. evde) kural yoksa telefon bağlanamaz.
- İç uygulama internete açılmaz: erişimi kurum güvenlik duvarı ve VPN belirler. Dış sunucu için ADR 0021.
- `.env` varsa değişkenler oraya yazılır (`.env.ornek`); yoksa süreç ortamından okunur.
- Arkon (`/arkon-mes/`) aynı kapıdan aynı içerik ilkesiyle (CSP) sunulmaya devam eder.

## Kurum sertifika otoritesiyle (asıl yol)

1. Bilgi işlemden sunucu için sertifika isteyin. Sertifikada telefonların yazacağı ad ya da IP "Subject Alternative Name" olarak bulunmalı
   (ör. `DNS:tmi.kurum.local`, `IP:192.168.1.10`). Süre en çok 825 gün olmalı; iPhone daha uzununu kabul etmez.
2. Sertifikayı ve anahtarı PEM olarak sunucuda bir klasöre koyun (ör. `D:\TMIV2-SERTIFIKA\tmi.crt` ve `tmi.key`); klasörü yalnız servis hesabı okusun.
3. `.env`'e iki satırı yazın ve `npm run baslat` ile yeniden başlatın:
   ```
   TMIV2_HTTPS_SERTIFIKA=D:\TMIV2-SERTIFIKA\tmi.crt
   TMIV2_HTTPS_ANAHTAR=D:\TMIV2-SERTIFIKA\tmi.key
   ```
4. Kurum CA'sının kök sertifikası telefonlarda yoksa her telefona bir kez yüklenir (aşağıda). Cihaz yönetimi (MDM) kullanılıyorsa bilgi işlem dağıtır.
5. Yenileme: süre dolmadan yeni sertifika aynı yollara konur, uygulama yeniden başlatılır. Telefonlara dokunulmaz (kök aynı kaldıkça).

## Telefona kök sertifika yükleme

Yüklenen dosya kurum CA'sının KÖK sertifikasıdır (`.crt`/`.cer`), sunucu sertifikası ya da anahtar değildir. Menü adları üreticiye ve
sürüme göre değişir (doğrulanmadı).

- Android: dosyayı telefona alın (e-posta, USB). Ayarlar > Güvenlik ve gizlilik > Diğer güvenlik ayarları > Şifreleme ve kimlik bilgileri >
  Sertifika yükle > CA sertifikası. Uyarıyı onaylayıp dosyayı seçin. Chrome kullanıcının yüklediği CA'ya güvenir.
- iPhone: dosyayı Safari ya da e-postayla açın; "Profil indirildi" çıkar. Ayarlar > Genel > VPN ve Cihaz Yönetimi > profili seçip Yükle.
  Sonra Ayarlar > Genel > Hakkında > Sertifika Güven Ayarları > kökü bulup "tam güven"i açın. Bu ikinci adım atlanırsa Safari uyarı verir.

Sonra telefonda `https://<sunucu>:4101` açılır; adres çubuğunda uyarı olmamalı. Uygulama olarak eklemek: Android Chrome menüsü > Ana ekrana ekle
(ya da Uygulamayı yükle); iPhone Safari > Paylaş > Ana Ekrana Ekle.

## Kendi bilgisayarında deneme (geçici sertifika)

Yeni paket gerekmez; Windows'ta Git ile gelen OpenSSL kullanılır (`C:\Program Files\Git\usr\bin\openssl.exe`). Bu sertifikalar yalnız
denemedir; gerçek kurulumda kurum CA'sı kullanılır. Dosyaları depo DIŞINDA bir klasörde üretin; anahtar depoya girmez.

PowerShell'de, `192.168.1.10` yerine bilgisayarın yerel IP'sini yazın (`ipconfig`):

```powershell
$openssl = 'C:\Program Files\Git\usr\bin\openssl.exe'
New-Item -ItemType Directory -Force D:\TMIV2-SERTIFIKA | Out-Null; Set-Location D:\TMIV2-SERTIFIKA
# 1. Deneme kök sertifikası (telefona bu yüklenir)
& $openssl req -x509 -newkey rsa:2048 -nodes -keyout deneme-ca.key -out deneme-ca.crt -days 365 -subj "/CN=TMI Deneme CA"
# 2. Sunucu anahtarı ve isteği
& $openssl req -newkey rsa:2048 -nodes -keyout tmi.key -out tmi.csr -subj "/CN=TMI CORE"
# 3. Kökle imzala; telefonun yazacağı IP ve ad burada
Set-Content ek.txt "subjectAltName=IP:192.168.1.10,IP:127.0.0.1,DNS:localhost`nextendedKeyUsage=serverAuth`nbasicConstraints=CA:FALSE"
& $openssl x509 -req -in tmi.csr -CA deneme-ca.crt -CAkey deneme-ca.key -CAcreateserial -out tmi.crt -days 365 -extfile ek.txt
```

Sonra `.env`'e `TMIV2_HTTPS_SERTIFIKA=D:\TMIV2-SERTIFIKA\tmi.crt` ve `TMIV2_HTTPS_ANAHTAR=D:\TMIV2-SERTIFIKA\tmi.key` yazıp
`npm.cmd run baslat`. Telefona `deneme-ca.crt` yüklenir (yukarıdaki adımlar). Windows güvenlik duvarı 4101'e gelen bağlantıya izin vermeli
(yönetici yetkisi gerekir).
Denemeden sonra iki satırı `.env`'den silin, telefondan deneme kökünü kaldırın ve `deneme-ca.key`'i silin: bu anahtarla herhangi bir
siteye sahte sertifika imzalanabilir.
