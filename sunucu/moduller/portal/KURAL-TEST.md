# portal: kural ve test eşlemesi

Dosyalar: `sunucu/moduller/portal/kurallar.test.ts` (saf, 8), `sunucu/moduller/portal/portal.test.ts` (gerçek PostgreSQL, 12),
`istemci/src/moduller/portal/PortalCercevesi.test.tsx` (6), `istemci/src/moduller/portal/cerceve-kopru.test.ts` (6). Hepsi koşuldu, yeşil (UYGULA.md).

| Kural | Kısıt / yer | Test |
|---|---|---|
| BD-1 Belge yolu koleksiyon/kimlik çiftleridir; izinsiz karakter ve tek parçalı belge reddedilir | `portal_belge_yol_bicimi`, `_yol_butun` | `BD-K1`, `BD-09` |
| BD-2 `data/users/<kişi>` altı yalnız o kişiye açık | servis (`erisebilirMi`) | `BD-K2`, `BD-06` |
| BD-3 Tam yazma gövdeyi değiştirir, birleştirme iç içe alanı korur, olmayan belgeye birleştirme 404 | servis | `BD-K3`, `BD-01`, `BD-02` |
| BD-4 Beklenen sürüm tutmazsa yazma 409 | servis (satır kilidi) | `BD-03` |
| BD-5 Sorgu koşulu, sırası ve sınırı sunucuda | servis (`sorgula`) | `BD-K4`, `BD-K5`, `BD-04` |
| BD-6 Her yazma ve silme damgayı ilerletir | `portal_surum` sayacı | `BD-01`, `BD-05` |
| BD-7 Okuma `oku` ya da `yaz`, yazma `yaz`, kurulum `yonet` ister | uç yetkisi | `BD-07`, `BD-11` |
| BD-8 Kilit başkasına geçerliyken verilmez | servis (`kilitAlinirMi`) | `BD-K6`, `BD-08` |
| BD-9 Ek en çok 700 KB, boyut içerikle aynı | `portal_ek_boyut` | `BD-10` |
| BD-10 Başlangıç belgeleri yalnız işaret belgesi yokken bir kez | servis | `BD-K8`, `BD-11` |
| BD-11 Oda yalnız son 45 sn içinde görülenleri döner | servis (`canliEsler`) | `BD-K7`, `BD-12` |
| BD-12 Çerçeve dışarıya istek atamaz, yazı tipi gömülüdür | içerik politikası | `prototipi içerik politikasıyla, köprüyle ve dış yazı tipi bağlantısı olmadan yalıtılmış çerçevede açar`, `sayfaKur dış yazı tipi bağlantısını çıkarır, politikayı ve betiği başa koyar` |
| BD-13 Yerel depo önekli anahtarı yazar; ortak kapsamda çatışma uyarır ve durur | köprü | `CK-01`, `CK-02` |
| BD-14 Yetkisiz kişi uçlara gitmez | ekran + uç | `sayfayı görmeyen kişiye yetki iletisi gösterir, uçlara gitmez` |
| BD-15 Onay adımları sunucuda (B8): onay kaydı yalnız sunucunun hesapladığı zincirle açılır (prototipin stepsFor ve autoSkip kuralı, limitler portal ayarında, sipariş eşikleri satın alma limitinden); onay gerektiren yeni satın alma siparişi, giden ödeme, onaylı sözleşme, fiyat artışı ve iskontolu sürüm onaysız yazılamaz; onayın etkisi kaydın bugünkü değerinin istediği adımları ister | servis (`onayAcilisReddi`, `onaysizYaziReddi`, `onayEtkisiReddi`) | `BD-K35`, `BD-K36`, `BD-K37`, `BD-24` |
| BD-16 Satın alma siparişinin sevkiyatı portalda teslim alınmaz (238, H1); tam yetki de geçemez. Satın almada teslim alma izni yoktur; çerçevedeki kart Stok > Mal kabul'e götürür, kabuk yalnız izinli yola gider | servis (`satinAlmaTeslimiReddi`), `portalRolu`, çerçeve köprüsü (`tmiGit`) | `BD-K38`, `BD-25`, `satın alma sevkiyatı portalda teslim alınmaz; kart Stok > Mal kabul'e götürür, satış sevkiyatı teslim alınır (238, H1)` |
| BD-17 Firma görünürlüğü sunucuda (1019 a; prototipin `visible`): firma içi izleyici her kaydı görür; müşteri yalnız kendi firmasının satış tarafını (teklif talebi, satış siparişi, müşteri uygunsuzluğu, gelen ödeme), tedarikçi yalnız kendi satın alma tarafını (satın alma siparişi, tedarikçi uygunsuzluğu, giden ödeme, fiyat talebi, davet edildiği satın alma teklifi, kendi teklifi) görür; onay bekleyen ya da reddedilen sipariş, onay bekleyen ödeme ve onaysız sözleşme dışarı gitmez; kurala bağlanmamış koleksiyon, alt belge, kişiler, oda ve ekler dış izleyiciye kapalı; süzgeç koşul ve sıradan önce; olmayan ve görünmeyen kayıt aynı 403. Bugün her oturum firma içidir (dış hesap soru 1021) | servis (`izleyiciGorebilirMi`) | `BD-K39`..`BD-K43`, `BD-26` |

Prototipin öteki iş kuralları (ekranda kalanlar) `UYUM-BORCU.md`'dedir; bunlar için sunucu testi yoktur.
