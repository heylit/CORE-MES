# Canlı kurulum: HTTPS ve ters vekil (kart #175)

Kullanıcı kararı (16.10.2026, "Zorunlu HTTPS"): canlıda bağlantı her zaman HTTPS'tir ve kurum sertifika otoritesinin (CA) sertifikasıyla
kurum ters vekili sunar. Uygulama yalnız bu makinede dinler. Geliştirme makinesindeki `npm run baslat` bugünkü gibi kalır.

## Yerleşim

```
telefon / bilgisayar --HTTPS (kurum CA)--> kurum ters vekili (aynı makine, 443)
                                            --HTTP--> 127.0.0.1:4101 sunucunun arayüz kapısı (ekran dosyaları ve /api)
```

- Varsayılan: ters vekil uygulamayla aynı makinededir. Başka bilgisayardaysa aşağıdaki "Vekil başka bilgisayardaysa" bölümü uygulanır.
- `.env`'de `TMIV2_ORTAM=canli`. Bu kipte:
  - sunucunun API kapısı (4100) yalnız `127.0.0.1`'i dinler (`sunucu/cekirdek/ayar.ts` `dinlemeAdresi`);
  - arayüz kapısı (4101, `TMIV2_ARAYUZ_PORT` ile değişir; aynı sunucu süreci, `sunucu/cekirdek/arayuz.ts`) yalnız `127.0.0.1`'i dinler; `TMIV2_ONIZLEME_ADRESI` boş kalır ya da `127.0.0.1` olur, ağa açan değer açılışı durdurur
    (`istemci/src/ortak/pwa/dinleme.ts`);
  - oturum çerezi her zaman `Secure` taşır: tarayıcı HTTPS'tedir, vekilin arkasındaki istek düz HTTP görünse de çerez şifresiz kapıya gitmez.
- `TMIV2_HTTPS_SERTIFIKA` ve `TMIV2_HTTPS_ANAHTAR` canlıda verilmez: şifrelemeyi vekil bitirir. Sertifika isteği ve telefona kök sertifika
  yükleme `kurulum/https.md` ile aynıdır; yalnız sertifika vekile kurulur.
- Windows güvenlik duvarında yalnız vekilin kapısı (443) açılır; 4100 ve 4101 açılmaz.

## Vekil başka bilgisayardaysa

- `.env`'e iki satır yazılır: `TMIV2_ONIZLEME_ADRESI` uygulama bilgisayarının vekile bakan IP'si, `TMIV2_VEKIL_ADRESI` vekilin IP'si.
  Biri olmadan öbürü verilirse sunucu açılmaz. Sunucu (4100) yine yalnız 127.0.0.1'i dinler; vekil yalnız 4101'e bağlanır.
- Sunucu `X-Forwarded-For` başlığına yalnız bu makineden ve `TMIV2_VEKIL_ADRESI`'nden geldiğinde güvenir: giriş bekleme sayacı gerçek cihaza göre sayılır.
- Windows güvenlik duvarında 4101 yalnız vekilin IP'sine açılır (kuralı bilgi işlem ekler). Vekil ile uygulama arasındaki bağlantı düz HTTP'dir;
  iki bilgisayar aynı kapalı ağ bölümünde durmalıdır.

## Vekilin yapması gerekenler

- Bütün yolları (`/`, `/api/`, `/arkon-mes/`) `http://127.0.0.1:4101`'e iletir; adresi değiştirmez.
- `X-Forwarded-For` başlığına istemcinin adresini, `X-Forwarded-Proto` başlığına `https` ekler. Sunucu yalnız 127.0.0.1'den gelen bu
  başlıklara güvenir; giriş bekleme sayacı gerçek cihazın adresine göre sayılır.
- `http://` ile gelen isteği `https://`'e yönlendirir; HSTS başlığını (`Strict-Transport-Security`) vekil koyar.
- Uygulamanın verdiği güvenlik başlıklarını (`Content-Security-Policy` dahil) silmez, değiştirmez.

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
- Vekilin yeri denetlenir: başka bilgisayardaysa `.env`'de `TMIV2_VEKIL_ADRESI` vekilin IP'sidir. Adres eksikse sunucu ilk vekil isteğinde
  günlüğe "X-Forwarded-For güvenilmeyen eşten geldi" uyarısını bir kez yazar; kabulde bir giriş yapılıp günlükte bu satırın olmadığı
  görülür (yoksa bütün cihazlar vekilin IP'siyle sayılır, cihaz başına giriş sınırı herkese ortak olur).
- PostgreSQL yalnız bu bilgisayardan bağlantı kabul eder: `postgresql.conf`'ta `listen_addresses = 'localhost'`; `pg_hba.conf`'ta
  yalnız `127.0.0.1/32` ve `::1/128` satırları kalır (yöntem `scram-sha-256`), başka adres satırı silinir. Değişiklik PostgreSQL
  servisi yeniden başlatılınca geçerli olur. Kabul: ağdaki başka bir bilgisayardan 5432'ye bağlantı kurulamaz; sunucunun kendisinde
  `npm run goc` ve uygulama çalışır. Uzaktan yönetim gerekiyorsa VPN ve uzak masaüstüyle sunucuya girilir, veritabanı ağa açılmaz.
- Yedek ve anahtar ayrı yerde durur (`kurulum/yedek.md`): yedek klasörü veritabanından başka bir diskte, haftalık indirilen kopya
  sunucunun dışında; yedek anahtarı bunların hiçbirinde değil, bilgi işlemin ayrı sakladığı yerdedir.
- Kabul: telefondan `https://<ad>` açılır, giriş yapılır; `http://<ad>:4100/api/oturum` ve `http://<ad>:4101/` ağdan açılmaz.
