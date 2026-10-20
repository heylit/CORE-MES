# denetim-hazirlik: uyum borcu

## Bağlamada kapanacak
| Kural / konu | İstisna | Nasıl uyumlanır |
|---|---|---|
| Veri tek jsonb belgede | Prototipin bütün durumu `yerel/kalite-denetim-v4` belgesinde metin olarak durur; sunucu içeriği yorumlamaz. | Aşama 2: denetim, bulgu, DÖF tabloları ve uçları; prototip katmanı uçlara bağlanır. |
| Eşzamanlı düzenleme | İki kişi aynı anda düzenlerse ikinci yazan uyarı alır, değişikliği kaydedilmez. | Aşama 2: kayıt başına tablo ve sürüm. |
| Kendi stili, rengi ve bileşenleri | Ekran prototipin kendisidir (yalıtılmış çerçeve, kendi CSS ve renkleri); TMI tasarım değişkenleri ve ortak bileşenler kullanılmaz. | Kullanıcı kararı: ekran olduğu gibi (görünüm değişmez). |
| KAPANDI (borç turu 19.10.2026): önek listesi gözden geçirildi, `kalite-denetim-v4` kalıcı; eski sürüm anahtarları (`iso9001-denetim-v1..v3`) yalnız taşıma için okunur, bellekte kalır; değişiklik gerekmedi (prototipteki `localStorage` çağrıları tarandı). Tarayıcıda tutulan veri | Prototipin `localStorage` kullanımı köprüyle sunucuya taşınır; önek dışındaki anahtarlar yalnız o sekmede kalır. | Bağlamada önek listesi gözden geçirilir. |
| Ek boyutu | Ek en çok 700 KB (JSON gövde sınırı); ekler modülün kendi tablosunda. | Aşama 2: `dosyalar` modülüne bağlanır. |
| Kişi yabancı anahtarı yok | `*_kisi_id` sütunları `kisi` tablosuna bağlı değil. | Aşama 2: ayrı göçle yabancı anahtar. |
| Tema yalnız açılışta | Açık/koyu tema çerçeve kurulurken geçer; açıkken değişirse sayfa yenilenince uyar. | Gerekirse köprüye tema iletisi. |
| Kullanılmayan çekirdek kalıbı | Belge deposu her modülde ayrı kopyadır (sunucu + `cerceve-kopru.ts`). | Önerilen çekirdek parçası: ortak belge deposu (CEKIRDEK-ISTEKLERI). |

## Sunucuda zorunlu olup eksik kalan
Belge deposu kuralları (yol, erişim, sürüm, kilit, ek boyutu, yetki) sunucuda ve veritabanı kısıtlarındadır (KURAL-TEST.md).
Prototipin iş kuralları sunucuda değildir; yukarıdaki tablodadır.

## Oturtmada eklenen (kart #742)
| Kural / konu | İstisna | Nasıl uyumlanır |
|---|---|---|
| Genel depo ucu yok (proje kuralı 7) | `/denetim-hazirlik/belge/yaz` ve `/sorgu` her koleksiyona yazar, okur. | Aşama 2: koleksiyon başına adı belli uç ve işlem. |
| Onaylı kayıt değişmez | Kesinleşmiş denetim ve DÖF kaydı sunucuda kilitli değil. | Aşama 2: kayıt tablosunda durum ve sunucu kuralı. |
| Ad yakınlığı | Depodaki `denetim` modülü (istek defteri `denetim_kaydi`) başka kavramdır; bu modülün adı, tablo öneki (`denetim_hazirlik_`), işlemleri ve yolu ayrıdır. | Gerekmez; ikisi birleşmez. |

## Kapananlar
- Takvime ekleme bağlantısı: Google Takvim bağlantısı çerçeve kurulurken çıkarılır (`DenetimHazirlikCercevesi.tsx` sayfaKur); takvime ekleme prototipin .ics indirmesiyle kalır (kullanıcı onayı 2026-10-17, soru 36).
