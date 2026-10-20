# ADR 0010 — Zamanlanmış iş

Durum: kabul (kullanıcı kararları Z1 a, Z2 a, Z3 a, Z4 a, Z4d a, Z5 b, V3 koşullu kabul, V4 kabul; 08.10.2026, kartlar #208, #298)

## Bağlam

Çekirdekte arka plan işi kalıbı yok. Onaylı karar #70 madde 5 "toplayıcı ve arka plan işi yazılmaz" (makine verisi bağlamında) ve #92 soru 2 (süreye bağlı kurallar okuma anında hesaplanır) bunu bilerek dışarıda bırakmıştı.
Bugün bunun bedeli Arkon'da görünüyor: TMI üretim emrine yazılamayan Arkon kaydı (`arkon_tmi_yansima`, sonuç `bekliyor`) yalnız yeni bir Arkon kaydı gelince yeniden deneniyor (`sunucu/moduller/arkon/UYUM-BORCU.md` sınır f; `servis.ts` `bekleyenleriSupur`). Hiç kayıt gelmezse satır bekler.
Logo giden kutusu, Logo irsaliye okuma ve SMARTES gerçekleşen okuma (#205, #213) da aynı kalıba muhtaç; onlar Logo bağlantısıyla gelir (#205 karar 6).

## Karar

1. **Çekirdekte tek zamanlanmış iş kalıbı vardır** (`sunucu/cekirdek/zamanlayici.ts`). #70 madde 5'in genel "arka plan işi yazılmaz" hükmü bu kalıp için kalkar. Makine verisi toplayıcısı yasağı (#70 madde 5, #213 karar 1) aynen sürer: TMI tezgahtan veri toplamaz.
2. **İş web sunucusuyla aynı süreçte koşar** (Z2 a). Ayrı servis, işletim sistemi görev zamanlayıcısı ya da yeni kurulum adımı yoktur. Yeni paket yoktur; zamanlama Node `setTimeout` ile yapılır.
3. **Modül işini kendi `isler.ts` dosyasında verir** (`export const isler = [isTanimi({ ad, aralikMs, calis })]`). Çekirdek, uçlarda olduğu gibi modül klasörlerinden keşfeder; çekirdek modülü ithal etmez (sınır kuralı b).
4. **Bir iş ayrı bir veritabanı işleminde koşar.** İşlemin başında `pg_try_advisory_xact_lock(hashtext('<şema>:is-<ad>'))` alınır; alınamazsa o tur atlanır. Aynı veritabanına iki süreç bağlansa da iş tek koşar. Tur bitince bir sonraki kurulur (`setInterval` yok, üst üste binme yok).
5. **Hata süreci düşürmez.** Tur hatası sunucu günlüğüne yazılır ve iş durumuna işlenir; sonraki tur yine denenir. Turun her sorgusu çekirdeğin sorgu süre sınırı altındadır; turun bütününe süre sınırı yoktur, veritabanı dışında bekleyen iş (dış çağrı) kendi süre sınırını koyar.
6. **Kapanışta durur.** `SIGINT`/`SIGTERM` gelince yeni tur kurulmaz, süren tur sınırlı süre beklenir, sonra uygulama ve havuz kapanır.
7. **Arka plan işinin kişisi yoktur** (Z4 a). Sistem kullanıcısı açılmaz; `kisiler`'e "sistem" satırı girmez. İş bir kayıt adına yazıyorsa o kaydı başlatan kişinin adına ve onun o anki yetkisiyle yazar. Kişi pasife alınmış ya da yetkisini kaybetmişse yazım reddedilir ve kayıt "hatalı" olur, nedeni listede görünür.
8. **Arka plan işinin her yinelemesi iz bırakır** (V3, kullanıcı koşulu). İş istek değildir, uç katmanının denetim kaydı
   (`denetim_kaydi`) ona uygulanmaz. Bunun yerine iş, ele aldığı her kaydın denemesini kendi tablosunda zamanı ve sonucuyla yazar;
   kayda özgü hatayı kayıt noktasıyla yakalar, turu düşürmez (Arkon: `arkon_tmi_yansima` deneme, son deneme, sonuç, neden).
   Turun bütününü düşüren hata (veritabanına ulaşılamadı gibi) turun yazdıklarını da geri alır: o turda yazma olmamıştır, izi
   sunucu günlüğünde ve iş durumundadır. Böylece izi kalmayan yazma olmaz. Kalıp bunu zorlayamaz (işin tablosunu bilmez); işi yazan
   modülün testi gösterir.
9. **İş durumu `/saglik/ayrinti` ucunda görünür** (Z5 b): iş başına ad, son başlama, son bitiş, son sonuç (tamam / hata / atlandı), son hata özeti. Yeni işlem yoktur; uç bugünkü `saglik.ayrinti-oku` işlemindedir. Durum bellekte tutulur, tablo yoktur; sunucu yeniden başlayınca sıfırlanır.
10. **İş testi zamanlayıcı kurmaz.** Sunucuda zamanlayıcıyı yalnız `sunucu/ana.ts` başlatır; modül testleri işi `isiBirKezCalistir` ile
   doğrudan, saat beklemeden çağırır. Zamanlayıcıyı yalnız kalıbın kendi testi ve sağlık ayrıntısının testi kurar.

## Sonuçlar

- Arkon yansıma yineleyici bu kalıba bağlanır; borç (f) kapanır. Kayıt isteğindeki süpürme kalır (gecikmeyi kısaltır).
- Giden kutusu (Logo, SMARTES) bu kalıbı kullanır ama Logo bağlantısıyla gelir (Z3 a); kendi tablosu ve ekranı onunla gelir.
- Sunucu kapalıyken iş de durur. Bekleyen iş kendi tablosunda kalır, açılınca sürer.
- Denetim (karar 8): Arkon yineleyicinin izi `arkon_tmi_yansima`dadır (kişi, sonuç, neden, deneme, son deneme zamanı).
- Süreçte tek zamanlayıcı başlatılır; ikincisi açılışta hata verir. İş adı tekildir; iki modül aynı adı verirse sunucu açılmaz.
- Kilit anahtarı şemayı içerir (`<şema>:is-<ad>`): aynı veritabanında paralel test şemaları birbirinin işini atlatmaz.

## Vazgeçilenler

- **Ayrı işçi süreci ya da ikinci Windows servisi** (Z2 b): kurulum ve izleme yükü; bugünkü tek iş için gereksiz. Yük büyürse kalıp değişmeden ayrı sürece taşınabilir.
- **İşletim sistemi görev zamanlayıcısı** (Z2 c): kurulumu depodan bağımsız bir yere taşır; günlük ve durum dağılır.
- **Cron paketi** (node-cron vb.): yeni bağımlılık; sabit aralık için gereksiz.
- **Sistem kullanıcısı** (Z4 b): her yetki denetimine yeni bir istisna açar.
- **İş geçmişi tablosu**: bugün gerekmez; giden kutusu kendi satır durumunu tutar.

## Doğrulanmadı

- Windows'ta servis olarak koşan Node sürecinde `setTimeout` döngüsü ve `SIGTERM` kapanışı bu kalıpla denenmedi. `kurulum/devir.md` satır 34 Windows'ta yetim süreç uyarısı taşıyor. Canlı kurulumda (#44) denenecek.
