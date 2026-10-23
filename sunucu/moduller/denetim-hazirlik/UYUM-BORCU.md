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
| Ctrl K ortak palette (kart #139, karar 102 a) | Çerçevede basılan Ctrl K prototipe ulaşmadan kabuğa gider (`cerceve-kopru.ts`, yakalama evresi). Prototip palet öğelerini `window.__paletOgeleri` ile açar (tek satır): "Komutlar" grubu paletin "Bu sayfa" grubunda, yazılanın bütün sonuçları (sayfa, soru, cihaz, doküman, terim) öneri olarak. Prototipin kendi paleti `/` ve palet düğmesiyle yerinde kalır. | Kullanıcı kabulünde `/` ve palet düğmesinin kalkması (prototip değişikliği) sorulur. |

## Sunucuda zorunlu olup eksik kalan
Belge deposu kuralları (yol, erişim, sürüm, kilit, ek boyutu, yetki) sunucuda ve veritabanı kısıtlarındadır (KURAL-TEST.md).
Prototipin iş kuralları sunucuda değildir; yukarıdaki tablodadır.

## Oturtmada eklenen (kart #742)
| Kural / konu | İstisna | Nasıl uyumlanır |
|---|---|---|
| KAPANDI (B7, 23.10.2026): Genel depo ucu yok (proje kuralı 7) | Uç yalnız prototipin önekli yerel depo anahtarına (`yerel/kalite-denetim*`, kişisel kökte de) yazar, siler, kilitler ve okur; öteki yol 403 (KURAL-TEST BD-15). Prototip başka koleksiyon kullanmaz; tek koleksiyon için ayrı uç açılmadı (VARSAYIM, geri alma ucuz). | Kayıt tablolara ayrıştırılınca kayıt başına uç ve işlem. |
| Onaylı kayıt değişmez (B7, Soru 162 a, 23.10.2026: şimdilik kilit yok) | Prototipte kesinleşme durumu yok: denetim `plan` ya da `done`; tamamlanmış denetimde "Sonucu düzenle" ve "Sil" prototipin akışıdır. Bütün durum tek belgede yazıldığı için sunucu reddi aynı yazmadaki ilgisiz değişiklikleri de düşürür; kilit konmadı. DÖF kilidi kalite-merkezi'nindir (Soru 155 a, B16/T4). | Kayıt tablolara ayrıştırılınca kayıt başına durum ve sunucu kuralı. |
| KAPANDI (226 a, 23.10.2026): Yıkıcı işlemler yalnız yönetici | Profil silme, "Tümünü sil" ve dolu kaydı boşaltan ya da okunamaz kılan yazma `denetim-hazirlik.yonet` ister (KURAL-TEST BD-16); düğmeler yönetici olmayana gizlenir (`istemci/src/moduller/denetim-hazirlik/yonetim-dugmeleri.ts`, prototip dosyası değişmedi). | Kayıt tablolara ayrıştırılınca kayıt başına silme ucu ve `.yonet` denetimi. |
| Ad yakınlığı | Depodaki `denetim` modülü (istek defteri `denetim_kaydi`) başka kavramdır; bu modülün adı, tablo öneki (`denetim_hazirlik_`), işlemleri ve yolu ayrıdır. | Gerekmez; ikisi birleşmez. |

## Ölçü aletleri tek kaynak: Kalibrasyon (kart 329 a, kullanıcı onayı 20.10.2026)
Prototip dosyası (`cerceve/denetim-hazirlik.html`) değişmedi; `istemci/src/moduller/denetim-hazirlik/olcu-aleti.ts` çerçevede prototipten önce koşan betiktir.
| Kural / konu | İstisna | Nasıl uyumlanır |
|---|---|---|
| Tek kaynak | "Kalibrasyon" sekmesi cihaz listesi (`kal.devs`) Kalibrasyondan salt okunur gelir (GET `/denetim-hazirlik/olcu-aletleri`, 20 sn'de bir yoklanır). Ekleme, içe aktarma, düzenleme, kalibrasyon kaydı ve silme tıklamaları yakalanır, kullanıcı Kalibrasyon sayfasına gider. Prototipin durumu yerel depoda tek parçadır; okunurken liste Kalibrasyondan konur, yazılırken kayıtta önceden duran liste aynen geri konur. | Prototip kaynağı değişirse (kart gerekir) yerel depo sarmalı kalkar. |
| Eski kayıtlar | Yerel depodaki eski `devs` SİLİNMEZ, ekranda gösterilmez. | Gerekmez. |
| Boş alanlar | Marka, seri, çözünürlük, sorumlu, laboratuvar, kabul boş gelir (uydurma yok). | Gerekmez. |
| Periyot (VARSAYIM, geri alma ucuz) | Gün/30 ay taşınır, ama prototip `normKal` periyodu 1..120 tam sayıya yuvarlar ve türü "dış lab" yapar. Vade `nx` olarak sunucudan geldiği için ekranda doğru gün gösterilir ("N gün"), tablo/takvim durumu doğrudur. Prototipin CSV ve başka çıktılarında tam ay sayısı ve "dış lab" yazar (kesin değil). | Prototipte tam sayı kısıtı kalkarsa (kart gerekir). |
| Yenileme | Liste değişince yalnız Kalibrasyon sekmesi açıkken uygulanır (yarım form bozulmasın); en çok ~20 sn gecikme. Eski sürüm anahtarlı (`iso9001-denetim-v*`) yerel depo varsa ilk açılışta liste ancak sonraki yoklamada gelir. | Gerekmez. |
| Ad yedeği | Kalibrasyonda `ad` boşsa cihaz türü ad olarak gösterilir. | Gerekmez. |

## Kapananlar
- Takvime ekleme bağlantısı: Google Takvim bağlantısı çerçeve kurulurken çıkarılır (`DenetimHazirlikCercevesi.tsx` sayfaKur); takvime ekleme prototipin .ics indirmesiyle kalır (kullanıcı onayı 2026-10-17, soru 36).
