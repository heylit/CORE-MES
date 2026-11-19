# ADR 0015 — Bildirimlerin kurum içi posta sunucusundan e-postayla gönderilmesi

Durum: kabul (kullanıcı kararları 223 a, 19.10.2026; 274 a, 20.10.2026); dış posta servisi eki 3397-4 a (17.11.2026). Kodu
`bildirim/posta.ts` (3397). Kurgu belgesi depo dışındadır.

## Bağlam

Kırmızı çizgi "telemetri ve dış servis çağrısı yok" diyor; istisna kurum içi üç servistir: Logo köprüsü (ADR 0011), SmartES (ADR 0013) ve
etiket yazıcısı (ADR 0014). Onay bekleyen işler (satın alma, sipariş, izin, kalite kararı) masa başında olmayan onaycıya yalnız uygulama
içi zil ve mesajla ulaşmıyor. Kullanıcı kararı 223 a: bildirimler şirket içindeki posta sunucusu üzerinden e-postayla da gidebilsin.

## Karar

1. **Kurum içi posta sunucusu ayrı tutulur.** Sunucunun kurum içindeki posta sunucusuna SMTP bağlantısı "dış servis çağrısı" sayılmaz.
   İnternete çıkan her çağrı, telemetri ve CDN yasağı aynen sürer.
2. **Posta sunucusuyla tek modül konuşur.** Yalnız `bildirim` modülünün göndericisi (`node:net` ve `node:tls`) bağlanır; başka modül
   `disari.ts` ile yalnız kuyruğa yazar, bağlanamaz.
3. **Adres yalnız ortam değişkenindedir ve yalnız IP'dir** (`TMIV2_POSTA_SUNUCUSU`, `<ip>:<kapı>` biçiminde). Adres kurum içi bloklarda
   olmalıdır (ADR 0014'teki liste); değilse sunucu açılmaz ve hata değeri yazmaz. Ad çözülmez.
4. **Alıcı alanı kısıtlıdır.** E-posta yalnız `TMIV2_POSTA_ALAN_ADI` listesindeki şirket alan adlarına gider; yanlış yazılmış dış adrese
   gönderilmez. Adres İK'daki iş e-postasından alınır; İK kaydı olmayan kişiye e-posta gitmez.
5. **Bağlantı varsayılan kapalıdır.** Gönderim ancak değişken tanımlıyken VE Sistem Ayarları'ndaki `bildirim.eposta` açıkken çıkar;
   değilse kuyruk birikir, gönderilmez.
6. **Her deneme yalnız eklenen deftere yazılır** (kişi, olay, sonuç, neden). Hata metni sunucu adresini ve parolayı taşımaz. İçerikte ek
   ve dış görsel yoktur. Gömülü görsel yalnız şablon simgesi ve, şablonda açıksa, Sistem Ayarları'ndaki kurum logosudur (PNG, iletinin
   içinde; dış adresten resim çekilmez; varsayılan kapalı; kullanıcı kararı kart 3435-2 logo a, 19.11.2026).
7. **Yeni paket yok.** SMTP konuşması Node'un kendi modülleriyle yazılır; paket istenirse ayrı yazılı onay gerekir.

## Ek: dış posta servisi (3397-3, 3397-4 a; 17.11.2026)

Firma postası dışarıda barındırılabilir (bulut posta servisi). Kullanıcı kararı: kip Sistem Ayarları'ndan seçilir, varsayılan dış servis.
Madde 1 ve 3 bu kipte şöyle genişler; diğer maddeler aynen geçer.

1. **Üç kip** (`bildirim.eposta-kipi`): kurum içi posta sunucusu, yerel aktarıcı (dış servise bilgi işlemin kurduğu kurum içi aktarıcı)
   ve dış posta servisi. İlk ikisi `TMIV2_POSTA_SUNUCUSU` (madde 3) kullanır; üçüncüsü yalnız `TMIV2_POSTA_DIS_SUNUCUSU`.
2. **Dış adres tek ve yalnız ortamdadır:** `<alan adı>:465` ya da `<alan adı>:587`; IP ve başka kapı kabul edilmez. Arayüzden adres
   yazılmaz; değişken yoksa dış kip seçili olsa da hiçbir ileti gitmez.
3. **Şifre ve kimlik zorunlu:** 465'te doğrudan TLS, 587'de STARTTLS; sunucu STARTTLS sunmazsa parola ve ileti gönderilmez. Sertifika
   sistemin güven deposuyla ve sunucu adıyla doğrulanır (kurum içi sertifika otoritesi bu kipte kullanılmaz). Kullanıcı ve parola zorunlu.
4. **Madde 4, 5 ve 6 aynen:** alıcı yalnız şirket alan adları, kanal varsayılan kapalı (`bildirim.eposta`), gövde yalnız gereken alanlar,
   gömülü küçük simge ve şablonda açıksa gömülü kurum logosu dışında ek ve dış görsel yok.
5. **Dış istek kodu yalnız `posta.ts`'tedir** (`npm run sinir` kural j). Geri alma: kip kurum içine çekilir, değişken silinir.

Bedeli: posta içeriği (konu, olay adı, kayıt no) firma dışındaki servise çıkar. Bu, firmanın zaten kullandığı posta servisidir; yeni bir
üçüncü taraf eklenmez.

## Kırmızı çizgi metni

Posta istisnası CLAUDE.md kırmızı çizgiler bölümündedir (3397); dış servis eki aynı satıra yazılıdır.

## Sonuçlar

- Masa başında olmayan onaycıya bildirim ulaşır. Bedeli sunucudan iç ağa yeni bir çıkış yoludur; sınırı modülün testleri tutar
  (aralık dışı adres, değişken yok, ad verilmiş, ayar kapalı, alan dışı alıcı, ulaşılamayan sunucu).
- Posta sunucusu ve hesabı bilgi işlemde kurulur; parola yalnız `.env`'dedir.

## Vazgeçilenler

- **E-posta olmasın (223 b):** onaycı masa başında değilken iş bekler.
- **Posta paketi (nodemailer):** yeni bağımlılık; ihtiyaç duyulan SMTP alt kümesi küçüktür.
- **Ad ile adres:** DNS çözümü aralık denetimini aşmanın yolu olur.
