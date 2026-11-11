# ADR 0014 — Sunucudan kurum içi etiket yazıcısına doğrudan baskı

Durum: kabul (kullanıcı kararları 98 evet, 18.10.2026; 113 evet, 19.10.2026).

## Bağlam

Kırmızı çizgi "telemetri ve dış servis çağrısı yok" diyor; istisna kurum içi iki servistir: Logo köprüsü (ADR 0011) ve SmartES (ADR 0013).
Atölyedeki etiket yazıcıları (Zebra ağda, Argox USB'de) komutu ağda TCP 9100'den alır. Komut dosyasını indirip elle göndermek atölyede
yavaştır ve yanlış yazıcıya basılmasına yol açar. Kullanıcı kararı 98: Etiket Merkezi ağdaki yazıcıya sunucudan doğrudan bassın.

## Karar

1. **Kurum içi etiket yazıcısı ayrı tutulur.** Sunucunun kurum içindeki yazıcıya TCP 9100 bağlantısı "dış servis çağrısı" sayılmaz.
   İnternete çıkan her çağrı, telemetri ve CDN yasağı aynen sürer.
2. **Yazıcıyla tek modül konuşur.** Yalnız `sunucu/moduller/etiket-merkezi/gonderici.ts` (`node:net`) yazıcıya bağlanır; başka modül
   `disari.ts` üzerinden de gönderemez.
3. **Adres aralığı yalnız ortam değişkenindedir** (`TMIV2_ETIKET_YAZICI_AGI`, CIDR listesi). Aralık yalnız kurum içi bloklarda olabilir
   (10/8, 172.16/12, 192.168/16, 127/8, fc00::/7, fe80::/10); değilse sunucu açılmaz ve hata değeri yazmaz (`ag.ts`).
4. **Adres yazıcı tanımındaki tek IP'dir, ad çözülmez.** Tanım da her gönderim de aralıkla sınanır. Kapı sabit 9100 (`YAZICI_KAPISI`).
   Bağlantı tek yönlüdür, 5 sn süre sınırı vardır, cevap okunmaz.
5. **Bağlantı varsayılan kapalıdır.** Gönderim ancak değişken tanımlıyken VE Sistem Ayarları'ndaki `etiket-merkezi.dogrudan-baski`
   açıkken çıkar; değilse reddedilir. Komut dosyasını indirme yolu her durumda açıktır.
6. **Her gönderim yalnız eklenen deftere yazılır** (`etiket_merkezi_baski`, `yalniz_ekleme` tetikleyicisi): kişi, yazıcı, şablon, adet,
   sonuç. Hata metni yazıcı adresini taşımaz.

## Sonuçlar

- Atölye ağındaki yazıcıya tek tuşla baskı. Bedeli sunucudan iç ağa yeni bir çıkış yoludur; sınırı modülün testleri tutar (aralık dışı,
  değişken yok, ad verilmiş, ayar kapalı, ulaşılamayan yazıcı).
- USB'deki yazıcıya (Argox) sunucudan baskı yoktur; komut dosyası indirilir.

## Vazgeçilenler

- **Yazıcı sürücüsü ya da baskı sunucusu (CUPS, Windows kuyruğu):** ikinci kurulum ve yeni bağımlılık.
- **Ad ile adres:** DNS çözümü aralık denetimini aşmanın yolu olur.

## Ek: tarayıcıdan vektörel baskı (11.11.2026, kullanıcı kararı, kart 2904)

"Sonuçlar"daki "USB'deki yazıcıya sunucudan baskı yoktur" maddesine ek. USB ya da Windows yazıcısına tarayıcıdan, yazıcının Windows
sürücüsüyle vektörel baskı yapılır: etiket gerçek mm ölçüsünde SVG sayfası olarak tarayıcının yazdırma penceresinden basılır, yazıcı
seçimi Windows'tadır. Sunucu ağa yeni istek atmaz; yalnız etiketin yerleşimini verir ve 6. maddedeki deftere yazıcısız satır yazar.
Kırmızı çizgideki "yalnız TCP 9100" kuralı yalnız sunucudan gönderim içindir ve değişmez. Sunucuda Windows yazıcı kuyruğu ya da sürücü
kullanımı yoktur ("Vazgeçilenler"); yerel yardımcı program da yoktur. WebUSB için aşağıdaki 2954 ekine bakın.

## Ek: tarayıcıdan USB yazıcıya baskı (11.11.2026, kullanıcı kararı 2953 c, kart 2954)

Bağlam: Argox CP-2140'ın ağ girişi yok, tek bilgisayara USB ile bağlı; kullanıcı canlının HTTPS olduğunu bildirdi (Güvenlik kaydında
aksi yazıyor; denemede doğrulanacak). 2904 ekindeki "WebUSB yoktur" cümlesi bu ekle değişir.

Karar:
1. Yazıcı Etiket Merkezi'nde "dosya" türüyle tanımlanır; yeni bağlantı türü, göç ve uç yoktur. "USB yazıcıya bas" indirme ucunu
   (`POST /etiket-merkezi/sablonlar/:anahtar/indir`) çağırır: yetki (`etiket-merkezi.bas`), adet ve toplam etiket sınırı, kayıt uyumu ve
   baskı defteri değişmeden sunucudadır. Komutu (PPLB ya da ZPL) sunucu üretir; tarayıcı yalnız dönen komutu UTF-8 bayt olarak
   (ağ yoluyla aynı kodlama) eşleşmiş USB aygıtının yazıcı arayüzüne (sınıf 7, bulk çıkış) aktarır. Sunucu ağa yeni istek atmaz.
2. Defter sınırı: kayıt komut kişiye verildiğinde, USB aktarımından önce `indirildi` sonucuyla yazılır. Tarayıcının "basıldı"
   bildirimi alınmaz; defter "bu komut bu kişiye verildi" demektir, kağıda çıktığı doğrulanmaz (dosya indirme ve vektörel yazdırmayla
   aynı sınır). Aktarım başarısız olursa komut dosyası iner ve neden ekranda yazılır.
3. İki kat kapı, varsayılan kapalı: sistem ayarı `etiket-merkezi.usb-baski` (sistem geneli, varsayılan kapalı) ve cihaz başına
   tarayıcı eşleşmesi. Ayar açık olsa da yazıcıyı o tarayıcıda izin penceresinden eşleştirmemiş bilgisayar USB ile basamaz; eşleşme
   tarayıcıdadır, sunucuda tutulmaz.
4. Yalnız güvenli bağlamda (HTTPS) ve WebUSB'li tarayıcıda (Chrome, Edge) çalışır; değilse ya da ayar kapalıysa ekran bugünkü
   "Yazıcı için indir" ve "Vektörel yazdır" yollarıyla aynen kalır. Kod yalnız Etiket Merkezi'ndedir (`web-usb.ts`); yeni paket yoktur.

Sonuçlar ve sınırlar:
- Windows'ta tarayıcının aygıta erişmesi için aygıtın WinUSB sürücüsüne geçmesi gerekir (doğrulanmadı; deneme tarifi kart 2954
  teslimindedir). Geçince o bilgisayarda yazıcının kendi programı ve Windows yazdırma bu yazıcıyı görmez; geri alma sürücüyü geri
  kurmaktır.
- Yazıcının dili (PPLB) bu modelde doğrulanmadı; tanımdaki dil yanlışsa yazıcı komutu basmaz.
- Kırmızı çizgi metnine (CLAUDE.md) Web USB istisnası ayrı kartla yazılır; bu ek onu değiştirmez.
