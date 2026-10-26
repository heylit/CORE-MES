# FARK: oturum, hesap kilidi (kullanıcı kararı 14.10.2026)

## Eklenen
- Bir kullanıcı adına bütün cihazlardan, son başarılı denemeden ve son kilidin başından beri 10 hatalı deneme adı 15 dk kilitler.
  Kilitliyken `POST /oturum/giris`, `POST /oturum/pin-belirle` ve `POST /hesabim/parola-degistir` sırra bakılmadan, kayıt yazılmadan
  401 `OTURUM_YOK` alır: "Çok sayıda hatalı deneme. Giriş N dk sonra yeniden denenebilir." Olmayan ad da kilitlenir; cevap aynıdır.
  Cihaz başına artan bekleme (en çok 60 sn) olduğu gibi kalır.
- Tablo `oturum_hesap_kilidi` (göç `20261014220800_oturum_hesap_kilidi.sql`, yeni ve boş): silinmez, boşaltılmaz; yalnız bir kez açılır.
- `GET /oturum/kilitler` (etkin kilitler, sayfalı) ve `POST /oturum/kilitler/:id/ac` (aynı addaki etkin kilitleri açar; açan kişi ve
  an sunucudan). İkisi de `kisiler.rol-yonet`; yeni işlem yok. Kilitlenince sunucu günlüğüne uyarı yazılır.

## Değişen
- `oturum.test.ts` "bekleme 60 sn üst sınırı" testi on iki yerine dokuz hatalı denemeyle sınar (onuncu kilitler).

## Ekran
Yok (UYUM-BORCU m.5).
# FARK: oturum, güvenlik izlemesine okumalar (dal guvenlik-merkezi)

## Eklenen
- `disari.ts`: `girisDenemeleriniOzetle`, `saatlikGirisDenemeleri`, `girisDenemeleriListesi`, `acikOturumlariSay`, `acikOturumlar`,
  `oturumuKapat`. SQL `sorgular.ts`'te. Şema, uç ve ekran değişmedi. Yetki denetlemezler; çağıran `guvenlik` modülü ucunda denetler.
- `oturumuKapat` isteği yapanın kendi oturumunu kapatmaz (`'kendi'`); açık olmayan oturumda `'yok'`.
- Hesap kilidi okumaları (`disari.ts`): `etkinHesapKilitleri`, `etkinHesapKilidiSay`, `sonHesapKilitleri` (son pencerede kurulan kilit, ada göre),
  `hesapKilidiniKaldir` (oturum ucunun açma servisi; 404 ve açan kişi aynı). Yetki çağıran modülün ucundadır.

# FARK: oturum, PIN ile giriş (dal 484-pin-giris; kart #484; ADR 0012)

## Eklenen
- `POST /oturum/giris` gövdesi `{ kullaniciAdi, parola }` ya da `{ kullaniciAdi, pin }` (ikisi birden ya da hiçbiri 400). Geçici PIN
  doğruysa oturum açılmaz, cevap `{ kullanici: null, pinBelirlenecek: true }`.
- `POST /oturum/pin-belirle` (açık): `{ kullaniciAdi, geciciPin, yeniPin }`; girişle aynı bekleme ve sayaç. Yeni PIN kuralı geçici
  PIN'e bakılmadan sınanır. Başarıda PIN yazılır ve oturum açılır.
- Giriş ekranı yeniden: PIN alanı ve rakam tuşları, "Parola ile gir" (seçim tarayıcıda hatırlanır), ilk girişte PIN belirleme adımı;
  geniş ekranda tanıtım sütunu. Ekran kendi isteklerini yapar; `ortak/veri/oturum.ts` `useGiris` artık kullanılmıyor (Ortak şeridine
  kaldırma isteği).

## Değişen
- Hatalı giriş iletisi "Kullanıcı adı, PIN ya da parola hatalı." oldu.

## Değişen onaylı kararlar
- ADR 0002 m.3, ADR 0012 ile değişti.

# FARK: oturum, Aşama 1 tur 2 (dal 259-temel-moduller, taban main 65901d0)

Yalnız belge eklendi: `UYUM-BORCU.md`, `ORTAKLIK-oturum.md`, `GUVENLIK-DENETIMI.md`. Kod, şema, uç ve ekran değişmedi.
Değişen onaylı karar yok; K1 a (`giris_denemesi` tablo öneki istisnası) borca yazıldı.

# FARK: oturum, ortak cihaz (kart #739, karar 738 a)

- Yeni tablo `oturum_ortak_cihaz` (göç 20261026203500); dolu tabloya dokunulmadı. Belirteç saklanmaz, yalnız özeti.
- Yeni işlem `oturum.ortak-cihaz`, yalnız yöneticide (bayraklı rol bütün işlemleri aldığı için rol göçü yok); yetki matrisi belgesi ve testi güncellendi.
- Uçlar: `GET /oturum/cihaz` (oturumdaki her kişi; ortak mı), `GET/POST /oturum/ortak-cihazlar`, `POST /oturum/ortak-cihazlar/:id/kapat`.
- Cihaz çerezi `tmiv2_cihaz` (HttpOnly, SameSite=Strict, canlıda Secure, bir yıl, her soruda tazelenir) oturum çerezinden ayrıdır; çıkışta silinmez.

Bu tur şunları varsaydı:
1. Kayıt ortak yapılacak cihazın kendisinden yapılır (yönetici o cihazda oturum açar); uzaktan kayıt kodu yok.
2. Cihaz belirtecinin sunucuda süresi yok; iptal edilene dek geçerlidir. Tarayıcı çerezi bir yıl, her kullanımda tazelenir.
3. Son görülme tutulmaz: okuma ucu veritabanına yazmaz.
4. Açık cihaz adları büyük-küçük harf ayrımsız tekildir; iptal edilen adla yeni cihaz kaydedilebilir.
