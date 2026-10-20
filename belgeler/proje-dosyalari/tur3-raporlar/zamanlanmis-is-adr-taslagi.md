# ADR 0008 — Zamanlanmış iş (taslak)

Durum: taslak. Kullanıcı kararları Z1 a, Z2 a, Z3 a, Z4 a, Z5 b (08.10.2026, kart #208). "yaz" onayı bekleniyor.
Numara VARSAYIM: depoda son ADR 0007 (`belgeler/adr/0007-okuma-ucunda-sayfa-islemi.md`, ana dal 1a7892e); açık bir dal 0008 alırsa numara kayar.

## Bağlam

Çekirdekte arka plan işi kalıbı yok. Onaylı karar #70 madde 5 "toplayıcı ve arka plan işi yazılmaz" (makine verisi bağlamında) ve #92 soru 2 (süreye bağlı kurallar okuma anında hesaplanır) bunu bilerek dışarıda bırakmıştı.
Bugün bunun bedeli Arkon'da görünüyor: TMI üretim emrine yazılamayan Arkon kaydı (`arkon_tmi_yansima`, sonuç `bekliyor`) yalnız yeni bir Arkon kaydı gelince yeniden deneniyor (`sunucu/moduller/arkon/UYUM-BORCU.md` sınır f; `servis.ts` `bekleyenleriSupur`). Hiç kayıt gelmezse satır bekler.
Logo giden kutusu, Logo irsaliye okuma ve SMARTES gerçekleşen okuma (#205, #213) da aynı kalıba muhtaç; onlar Logo bağlantısıyla gelir (#205 karar 6).

## Karar

1. **Çekirdekte tek zamanlanmış iş kalıbı vardır** (`sunucu/cekirdek/zamanlayici.ts`). #70 madde 5'in genel "arka plan işi yazılmaz" hükmü bu kalıp için kalkar. Makine verisi toplayıcısı yasağı (#70 madde 5, #213 karar 1) aynen sürer: TMI tezgahtan veri toplamaz.
2. **İş web sunucusuyla aynı süreçte koşar** (Z2 a). Ayrı servis, işletim sistemi görev zamanlayıcısı ya da yeni kurulum adımı yoktur. Yeni paket yoktur; zamanlama Node `setTimeout` ile yapılır.
3. **Modül işini kendi `isler.ts` dosyasında verir** (`export const isler = [isTanimi({ ad, aralikMs, calis })]`). Çekirdek, uçlarda olduğu gibi modül klasörlerinden keşfeder; çekirdek modülü ithal etmez (sınır kuralı b).
4. **Bir iş ayrı bir veritabanı işleminde koşar.** İşlemin başında `pg_try_advisory_xact_lock(hashtext('is-<ad>'))` alınır; alınamazsa o tur atlanır. Aynı veritabanına iki süreç bağlansa da iş tek koşar. Tur bitince bir sonraki kurulur (`setInterval` yok, üst üste binme yok).
5. **Hata süreci düşürmez.** Tur hatası sunucu günlüğüne yazılır ve iş durumuna işlenir; sonraki tur yine denenir. Tur, çekirdeğin sorgu süre sınırı altındadır.
6. **Kapanışta durur.** `SIGINT`/`SIGTERM` gelince yeni tur kurulmaz, süren tur sınırlı süre beklenir, sonra uygulama ve havuz kapanır.
7. **Arka plan işinin kişisi yoktur** (Z4 a). Sistem kullanıcısı açılmaz; `kisiler`'e "sistem" satırı girmez. İş bir kayıt adına yazıyorsa o kaydı başlatan kişinin adına ve onun o anki yetkisiyle yazar. Kişi pasife alınmış ya da yetkisini kaybetmişse yazım reddedilir ve kayıt "hatalı" olur, nedeni listede görünür.
8. **İş durumu `/saglik/ayrinti` ucunda görünür** (Z5 b): iş başına ad, son başlama, son bitiş, son sonuç (tamam / hata / atlandı), son hata özeti. Yeni işlem yoktur; uç bugünkü `saglik.ayrinti-oku` işlemindedir. Durum bellekte tutulur, tablo yoktur; sunucu yeniden başlayınca sıfırlanır.
9. **Testte zamanlayıcı kurulmaz.** Zamanlayıcıyı yalnız `sunucu/ana.ts` başlatır; testler işi `isiBirKezCalistir` ile doğrudan, saat beklemeden çağırır.

## Sonuçlar

- Arkon yansıma yineleyici bu kalıba bağlanır; borç (f) kapanır. Kayıt isteğindeki süpürme kalır (gecikmeyi kısaltır).
- Giden kutusu (Logo, SMARTES) bu kalıbı kullanır ama Logo bağlantısıyla gelir (Z3 a); kendi tablosu ve ekranı onunla gelir.
- Sunucu kapalıyken iş de durur. Bekleyen iş kendi tablosunda kalır, açılınca sürer.
- Denetim: arka plan işi istek değildir, uç katmanının denetim kaydı ona uygulanmaz. İşin yazdığı kaydın izi işin kendi tablosundadır (Arkon için `arkon_tmi_yansima`: kişi, sonuç, neden, deneme, son deneme). VARSAYIM; bkz. yazım listesi V3.

## Vazgeçilenler

- **Ayrı işçi süreci ya da ikinci Windows servisi** (Z2 b): kurulum ve izleme yükü; bugünkü tek iş için gereksiz. Yük büyürse kalıp değişmeden ayrı sürece taşınabilir.
- **İşletim sistemi görev zamanlayıcısı** (Z2 c): kurulumu depodan bağımsız bir yere taşır; günlük ve durum dağılır.
- **Cron paketi** (node-cron vb.): yeni bağımlılık; sabit aralık için gereksiz.
- **Sistem kullanıcısı** (Z4 b): her yetki denetimine yeni bir istisna açar.
- **İş geçmişi tablosu**: bugün gerekmez; giden kutusu kendi satır durumunu tutar.

## Doğrulanmadı

- Windows'ta servis olarak koşan Node sürecinde `setTimeout` döngüsü ve `SIGTERM` kapanışı bu kalıpla denenmedi. `kurulum/devir.md` satır 34 Windows'ta yetim süreç uyarısı taşıyor. Canlı kurulumda (#44) denenecek.
