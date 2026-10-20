# UYUM BORCU: sevkiyat (kart #598, Aşama 1: teslim olduğu gibi toplandı)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI, VARSAYIM, BİLMİYORUM.

## Bağlamada kapanacak

1. ~~Firma bağı yok.~~ Kapandı (kart #836): boş olabilen `sevkiyat_noktasi.firma_id` -> `musteri_tedarikci_firma(id)` (kart #1164 ile finanstan taşındı), ad musteri-tedarikci `disari.ts`'ten okunur; firmanın tek aktif noktası olur.
   Elle girilen (bağsız) müşteri, tedarikçi ve fason noktası kalır.
2. Belge no serbest metin (`sevkiyat_isi.belge_no`); Logo irsaliyesiyle bağ yok. Uyum: akış C bağlanırken sorulur. Stok çıkışı (E-12): ürün taşıyan işin durum değişimi
   olayla bildirilir (`urunSevkiDinle`, #1875); stok dinleyicisi kullanıcı kararı 235 a ile (yolda: Yolda konumu, teslim: çıkış) Stok şeridinde yazılır.
3. Fabrika konumu iki yerde olabilir (kart #836 ile Sistem Ayarları'ndaki konum doluysa sevkiyat onu kullanır): sevkiyatın fabrika noktası ve atölye (Fabrika Haritası, kart #599). Sahiplik sorulur.
   Karar (kullanıcı, proje sohbeti 17.10.2026 18:53): fabrika konumunun tek kaynağı Sistem Ayarları; sevkiyat noktasının elle konumunu kapatan kod işi dondurma sonrası.
4. Kişi sütunu yok: onay, sonuç ve iş yazan kişi yalnız çekirdek denetim kaydında. Uyum: gerekirse `onaylayan_kisi_id`, `sonuc_kisi_id`.
5. ~~Tekrar koruması yok.~~ Kapandı (kart #1323): nokta, araç ve iş açma, iş iptali ve durumu, plan onayı ve onay kaldırma, bekleme listesinde işe çevirme ve kaldırma `tekrarKorumali`; istemci aynı kimlikle yeniden dener.
   Güncelleme uçlarında sürüm denetimi de geldi (`surum` sütunu, göç `20261014203000`).
6. ~~Harita verisi ortam değişkeninden: modül `process.env.TMIV2_HARITA_DIZINI`'yi doğrudan okur.~~ Kapandı: değişkeni çekirdek
   `haritaDiziniOku` (`sunucu/cekirdek/ayar.ts`) okur; ad ve davranış aynı (yoksa ya da boşsa depodaki `harita-paketi/`). `.env.ornek` ve
   `kurulum/devir.md` değişkeni zaten anlatıyor.
7. ~~`/sevkiyat/harita` yanıtı yaklaşık 4,5 MB.~~ Kapandı: çekirdek eşiği aşan JSON'u gzip ile gönderir (`sunucu/cekirdek/uc.ts`, `SIKISTIRMA_ESIGI`); uç
   `onbellek: 'etag'` ile döner, değişmeyen harita 304 ve gövdesizdir (#1827, `uclar.test.ts` "borç 7").
8. Ana menü simgesi `next` (kamyon simgesi satın almada). Uyum: ortak simge setine sevkiyat simgesi istenirse çekirdek işi.
9. KAPANDI (borç değerlendirmesi 17.10.2026): kurallar `SVK-n` önekli (ON-PAKET, KURAL-TEST), test adları kural numarasını taşır (SVK-21 testi adla eşleşmedi, önek yok). Eski metin: İş kuralları numaralı ama modül önekli değil (ON-PAKET 1-43); test adları kural numarası taşımıyor. Uyum: `SVK-n` öneki.
10. KAPANDI (kullanıcı kararı 17.10.2026): stoktaki "Sevkiyat" modu, düğmesi ve hazırlık teslim seçeneği "Sevk çıkışı" adını aldı; davranış aynı.
11. KAPANDI (kart #1310): fason dönüşünde sağlamı yalnız mal kabul stoğa alır; Dış operasyonlardaki dönüş yalnız hurdayı firmadan düşer.
12. KAPANDI (kart #1310): kapanmış emrin firmada kalan parçası stok iş kutusunda "fason firmasında kaldı" olarak görünür.
13. İSTİSNA (kullanıcının yazılı onayı 16.10.2026): "Sürücüye gönder" Google Haritalar / Yandex rota bağlantısı üretir (`istemci/src/moduller/sevkiyat/SurucuBaglantisi.tsx`).
   Ekranda dört öğe kalır (kullanıcı kararı 16.10.2026 "Kalsın"): "Google Haritalar'da aç" ve "Yandex'te aç" bağlantıları ile "Google/Yandex bağlantısını kopyala" düğmeleri.
   Asıl amaç rotayı sürücüye göndermektir; sürücü bağlantıyı kendi telefonunda, kendi internetiyle açar. Sunucu dışarı çağırmaz. "Dış servis çağrısı yok" kuralına yalnız bu bağlantı için istisnadır, borç değildir.
