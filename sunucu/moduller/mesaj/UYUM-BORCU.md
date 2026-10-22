# mesaj: uyum borcu

## Bağlamada kapanacak
| Kural / konu | İstisna | Nasıl uyumlanır |
|---|---|---|
| Veri jsonb belgelerde | Kanal, ileti, görev, sipariş, onay, kural belgeleri `mesaj_belge.veri` içinde. | Aşama 2: sipariş ve üretim adedi `uretim-emirleri`ne, kişi `kisiler`e bağlanır; kalan sohbet verisi için tablo kararı. |
| KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kullanıcı kararı 12.10.2026, `xlsx` paketi yok. Excel dosyası içe aktarımı kapalı | `xlsx` paketi eklenmedi (kullanıcı kararı 12.10.2026); prototipin dış adresten yüklemesini içerik politikası kapatır, `.xlsx` seçilince prototip "CSV olarak kaydedip tekrar dene" der. CSV ve yapıştırma çalışır. | Paket kararı değişirse kütüphane çerçeveye gömülür (teslimdeki `ek-betikler.ts` kalıbı). |
| KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kırmızı çizgi, dış servis yok (CLAUDE.md). Dış bağlantılar açılmaz | Takvim, Outlook, WhatsApp, Meet bağlantıları çerçeve izniyle (`allow-popups` yok) açılmaz. | Kural gereği kapalı kalır ya da kullanıcı kararıyla izin. |
| KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): tek sunucu kurulum kararı (CLAUDE.md "kurum içi, tek sunucu"). Oda tek süreçte | Kim açık bilgisi sunucu belleğinde; çok süreçli kurulumda bölünür. | Tek sunucu varsayımı; gerekirse tabloya alınır. |
| Zamanlayıcı tarayıcıda | Hatırlatma ve kural motoru (`runScheduler`, `runRules`) açık sekmede koşar, belge kilidiyle tek sefer çalışır. | Aşama 2: sunucu işi. |
| Kendi stili, rengi ve bileşenleri | Ekran prototipin kendisidir (yalıtılmış çerçeve, kendi CSS ve renkleri); TMI tasarım değişkenleri ve ortak bileşenler kullanılmaz. | Kullanıcı kararı: ekran olduğu gibi (görünüm değişmez). |
| KAPANDI (borç turu 19.10.2026): önek listesi gözden geçirildi, prototip yalnız `mesai:` önekli anahtar kullanır; değişiklik gerekmedi (prototipteki `localStorage` çağrıları tarandı). Tarayıcıda tutulan veri | Prototipin `localStorage` kullanımı köprüyle sunucuya taşınır; önek dışındaki anahtarlar yalnız o sekmede kalır. | Bağlamada önek listesi gözden geçirilir. |
| Ek boyutu | Ek en çok 700 KB (JSON gövde sınırı); ekler modülün kendi tablosunda. | Aşama 2: `dosyalar` modülüne bağlanır. |
| Kişi yabancı anahtarı yok | `*_kisi_id` sütunları `kisi` tablosuna bağlı değil. | Aşama 2: ayrı göçle yabancı anahtar. |
| Tema yalnız açılışta | Açık/koyu tema çerçeve kurulurken geçer; açıkken değişirse sayfa yenilenince uyar. | Gerekirse köprüye tema iletisi. |
| Kullanılmayan çekirdek kalıbı | Belge deposu her modülde ayrı kopyadır (sunucu + `cerceve-kopru.ts`). | Önerilen çekirdek parçası: ortak belge deposu (CEKIRDEK-ISTEKLERI). |
| Üretim adedi girişi kapalı (311 a) | Siparişteki "Üretim gir", satır içi giriş ve MES üretim aktarımı köprüden gizli; sunucu `orders/*/giris` yazmasını ve `qty`, `imp`, `lastEntry` değişikliğini reddeder. Adet yalnız Üretim Terminali'nden girilir; siparişteki ilerleme bu ekranda artmaz. | Aşama 2: sipariş ilerlemesi üretim emrinden okunur. |
| Ctrl K ortak palette (kart #140, karar 102 a) | Çerçevede basılan Ctrl K prototipe ulaşmadan kabuğa gider (`cerceve-kopru.ts`, yakalama evresi), kabuğun paleti açılır; "Mesajlarda ara" paletin "Bu sayfa" grubunda. Prototipin arama penceresi Ara düğmesiyle yerinde kalır; düğmenin "Ara (Ctrl+K)" ipucu prototip metnidir. | Kanal, mesaj, görev, toplantı, sipariş ve onay araması ortak palete değer alan komut (kural 8) ya da kayıt kaynağı olarak geçince pencere ve ipucu kalkar (prototip değişikliği). |

## Sunucuda zorunlu olup eksik kalan
Belge deposu kuralları (yol, erişim, sürüm, kilit, ek boyutu, yetki) sunucuda ve veritabanı kısıtlarındadır (KURAL-TEST.md).
Prototipin iş kuralları sunucuda değildir; yukarıdaki tablodadır.
