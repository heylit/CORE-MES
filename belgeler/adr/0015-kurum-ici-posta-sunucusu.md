# ADR 0015 — Bildirimlerin kurum içi posta sunucusundan e-postayla gönderilmesi

Durum: kabul (kullanıcı kararları 223 a, 19.10.2026; 274 a, 20.10.2026). Kod yoktur; bildirim merkezinin üçüncü aşamasında gelir. Kurgu
belgesi depo dışındadır.

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
   ve dış görsel yoktur.
7. **Yeni paket yok.** SMTP konuşması Node'un kendi modülleriyle yazılır; paket istenirse ayrı yazılı onay gerekir.

## Kırmızı çizgi metni

Posta istisnası CLAUDE.md'ye kod geldiğinde girer; o zamana kadar kullanılmaz.

## Sonuçlar

- Masa başında olmayan onaycıya bildirim ulaşır. Bedeli sunucudan iç ağa yeni bir çıkış yoludur; sınırı modülün testleri tutar
  (aralık dışı adres, değişken yok, ad verilmiş, ayar kapalı, alan dışı alıcı, ulaşılamayan sunucu).
- Posta sunucusu ve hesabı bilgi işlemde kurulur; parola yalnız `.env`'dedir.

## Vazgeçilenler

- **E-posta olmasın (223 b):** onaycı masa başında değilken iş bekler.
- **Posta paketi (nodemailer):** yeni bağımlılık; ihtiyaç duyulan SMTP alt kümesi küçüktür.
- **Ad ile adres:** DNS çözümü aralık denetimini aşmanın yolu olur.
