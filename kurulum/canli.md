# Canlı kurulum: HTTPS (2275-1 a; kart #175'in yerine)

Kullanıcı kararı (16.10.2026, "Zorunlu HTTPS"): canlıda bağlantı her zaman HTTPS'tir. 08.11.2026 kararı (2275-1 a): HTTPS'i uygulamanın kendisi
bitirir; ters vekil gerekmez. Sertifika kurum sertifika otoritesinin (AD CS) ad ve IP kısıtlı ara CA'sından verilir (2280-1).
Geliştirme makinesindeki `npm run baslat` bugünkü gibi kalır.

## Yerleşim

```
telefon / bilgisayar --HTTPS (kurum CA)--> sunucunun arayüz kapısı (4101; ekran dosyaları ve /api)
                                            --aynı süreç--> API (127.0.0.1:4100)
```

- `.env`'de `TMIV2_ORTAM=canli`. Bu kipte:
  - sunucunun API kapısı (4100) yalnız `127.0.0.1`'i dinler (`sunucu/cekirdek/ayar.ts` `dinlemeAdresi`); ağdan gelen `/api` isteği 4101 üzerinden gelir;
  - arayüz kapısı (4101, `TMIV2_ARAYUZ_PORT` ile değişir; `sunucu/cekirdek/arayuz.ts`) `TMIV2_ONIZLEME_ADRESI`'ndeki adreste dinler
    (sunucunun IP'si ya da `0.0.0.0`);
  - açılış kuralı (`istemci/src/ortak/pwa/dinleme.ts`): ağa açılan 4101 ya HTTPS değişkenleriyle (`TMIV2_HTTPS_SERTIFIKA` ve
    `TMIV2_HTTPS_ANAHTAR`) ya ters vekilin adresiyle (`TMIV2_VEKIL_ADRESI`) açılır; ikisi de yoksa uygulama başlamaz. Ağa açılan kapı düz HTTP konuşmaz;
  - HTTPS açıkken 4101 yalnız HTTPS konuşur, en az TLS 1.2 kabul eder ve her cevaba HSTS başlığı (`Strict-Transport-Security`, 180 gün) koyar;
  - oturum çerezi her zaman `Secure` taşır.
- Düz HTTP için ayrı kapı (80) açılmaz; `http://` adresinden yönlendirme yoktur. Cihazlar uygulamayı kısayoldan `https://` adresiyle açar.
- Windows güvenlik duvarında yalnız 4101 (ya da `TMIV2_ARAYUZ_PORT`) açılır; 4100 açılmaz.

## Sertifika

1. Bilgi işlem kurum CA'sının ad ve IP kısıtlı ara CA'sından sunucu sertifikası verir (2280-1). Sertifikada telefonların yazacağı ad
   "Subject Alternative Name" olarak bulunur (ör. `DNS:tmi.kurum.local`); süre en çok 825 gündür. Adımlar ve telefona kök yükleme `kurulum/https.md`.
2. Sertifika (ara sertifika aynı dosyada, altta) ve parolasız anahtar PEM olarak sunucuda bir klasöre konur; klasörü yalnız servis hesabı okur.
3. `.env`'e yazılır:
   ```
   TMIV2_ORTAM=canli
   TMIV2_ONIZLEME_ADRESI=<sunucunun IP'si>
   TMIV2_HTTPS_SERTIFIKA=D:\TMIV2-SERTIFIKA\tmi.crt
   TMIV2_HTTPS_ANAHTAR=D:\TMIV2-SERTIFIKA\tmi.key
   ```
   Biri eksikse, dosya okunamıyorsa ya da sertifika ile anahtar birbirine ait değilse sunucu Türkçe iletiyle açılmaz.
4. Telefonlar ve bilgisayarlar IP ile değil sertifikadaki adla girer (`https://tmi.kurum.local:4101`): HSTS yalnız adla çalışır, tarayıcı IP'de yok sayar.
   Ad kurum DNS'inde sunucunun IP'sine çözülmelidir (bilgi işlem).
5. Bitiş Güvenlik Merkezi > Durum > Sunucu durumu kartında görünür; son 30 günde uyarı verir. Yenileme: yeni sertifika aynı yollara konur,
   uygulama mesai dışında yeniden başlatılır; telefonlara dokunulmaz (kök aynı kaldıkça).

## Seçenek: ters vekil

Varsayılan yol yukarıdakidir. Bilgi işlem ileride HTTPS'i bir ters vekille bitirmek isterse:

- Vekil aynı makinedeyse `TMIV2_ONIZLEME_ADRESI` boş kalır (4101 yalnız `127.0.0.1`), HTTPS değişkenleri verilmez; vekil bütün yolları
  (`/`, `/api/`, `/arkon-mes/`) adresi değiştirmeden `http://127.0.0.1:4101`'e iletir.
- Vekil başka bilgisayardaysa `TMIV2_ONIZLEME_ADRESI` uygulama bilgisayarının vekile bakan IP'si, `TMIV2_VEKIL_ADRESI` vekilin IP'sidir;
  4101 güvenlik duvarında yalnız vekilin IP'sine açılır. Vekil ile uygulama arasındaki bağlantı düz HTTP'dir; iki bilgisayar aynı kapalı ağ bölümünde durur.
- Vekil `X-Forwarded-For` başlığına istemcinin adresini, `X-Forwarded-Proto` başlığına `https` ekler; sunucu bu başlıklara yalnız bu makineden
  ve `TMIV2_VEKIL_ADRESI`'nden geldiğinde güvenir (giriş bekleme sayacı gerçek cihaza göre sayılır). `http://` isteğini `https://`'e yönlendirir,
  HSTS'i vekil koyar; uygulamanın güvenlik başlıklarını (`Content-Security-Policy` dahil) silmez, değiştirmez.
- Vekilin sertifikası uygulamadan görünmez; bitişi `TMIV2_IZLENEN_SERTIFIKA` ile izlenir (`kurulum/gunluk.md` "Vekil sertifikası").

## İçerik güvenlik politikası (CSP)

Derlenmiş uygulama (4101, sunucunun arayüz kapısı) tam politikayla sunulur: `istemci/src/ortak/pwa/icerik-ilkesi.ts`. Her şey yalnız kendi kökeninden yüklenir;
dış adres, CDN, eklenti (`object-src 'none'`), başka siteye form ve başka sitenin uygulamayı çerçevelemesi kapalıdır. Arkon sayfası ve
STEP çalışanı kendi politikalarını alır (`arkon/sun.ts`). Geliştirme sunucusunda (`npm run gelistir:istemci`) yalnız `frame-ancestors` kalır.

Bilerek açık kalanlar (karar "Şimdilik izin"): ekranını çerçevede (srcdoc) satır içi betikle çizen modüller ana sayfanın politikasını
miras alır, o yüzden `script-src`'de `'unsafe-inline'` vardır; modüller ayrı dosyaya taşındıkça kalkar (ayrı kart). STEP okuyucusu
(CNC Kurulum ve Kalite Merkezi çerçevesinde) Function yapıcısı ve wasm kullandığı için `'unsafe-eval'` ve `'wasm-unsafe-eval'` de
vardır. Denetim: tarayıcı konsolunda "Refused to" ya da "Content Security Policy" satırı çıkmamalı.

## Canlıya geçmeden

- `kurulum/devir.md` "Canlı kurulumdan önce": boş veritabanı, herkese yeni geçici PIN.
- Açılış satırında arayüz adresi `https://` ile yazılır (`CORE dinliyor: ... | arayüz: https://...`).
- Yalnız vekil seçeneğinde: başka bilgisayardaysa `.env`'de `TMIV2_VEKIL_ADRESI` vekilin IP'sidir. Adres eksikse sunucu ilk vekil isteğinde
  günlüğe "X-Forwarded-For güvenilmeyen eşten geldi" uyarısını bir kez yazar; kabulde bir giriş yapılıp günlükte bu satırın olmadığı
  görülür (yoksa bütün cihazlar vekilin IP'siyle sayılır, cihaz başına giriş sınırı herkese ortak olur).
- PostgreSQL yalnız bu bilgisayardan bağlantı kabul eder: `postgresql.conf`'ta `listen_addresses = 'localhost'`; `pg_hba.conf`'ta
  yalnız `127.0.0.1/32` ve `::1/128` satırları kalır (yöntem `scram-sha-256`), başka adres satırı silinir. Değişiklik PostgreSQL
  servisi yeniden başlatılınca geçerli olur. Kabul: ağdaki başka bir bilgisayardan 5432'ye bağlantı kurulamaz; sunucunun kendisinde
  `npm run goc` ve uygulama çalışır. Uzaktan yönetim gerekiyorsa VPN ve uzak masaüstüyle sunucuya girilir, veritabanı ağa açılmaz.
- Yedek ve anahtar ayrı yerde durur (`kurulum/yedek.md`): yedek klasörü veritabanından başka bir diskte, haftalık indirilen kopya
  sunucunun dışında; yedek anahtarı bunların hiçbirinde değil, bilgi işlemin ayrı sakladığı yerdedir.
- Kabul: telefondan `https://<ad>:4101` açılır, adres çubuğunda uyarı yoktur, giriş yapılır; `http://<ad>:4100/api/oturum` ve `http://<ad>:4101/`
  ağdan açılmaz; Güvenlik Merkezi'nde HTTPS ve sertifika maddeleri yeşildir.
