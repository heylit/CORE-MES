# mesaj: kural ve test eşlemesi

Dosyalar: `sunucu/moduller/mesaj/kurallar.test.ts` (saf, 20), `sunucu/moduller/mesaj/mesaj.test.ts` (gerçek PostgreSQL, 18),
`istemci/src/moduller/mesaj/MesajCercevesi.test.tsx` (6), `istemci/src/moduller/mesaj/cerceve-kopru.test.ts` (6). Hepsi koşuldu, yeşil (UYGULA.md).

| Kural | Kısıt / yer | Test |
|---|---|---|
| BD-1 Belge yolu koleksiyon/kimlik çiftleridir; izinsiz karakter ve tek parçalı belge reddedilir | `mesaj_belge_yol_bicimi`, `_yol_butun` | `BD-K1`, `BD-09` |
| BD-2 `data/users/<kişi>` altı yalnız o kişiye açık | servis (`erisebilirMi`) | `BD-K2`, `BD-06` |
| BD-3 Tam yazma gövdeyi değiştirir, birleştirme iç içe alanı korur, olmayan belgeye birleştirme 404 | servis | `BD-K3`, `BD-01`, `BD-02` |
| BD-4 Beklenen sürüm tutmazsa yazma 409 | servis (satır kilidi) | `BD-03` |
| BD-5 Sorgu koşulu, sırası ve sınırı sunucuda | servis (`sorgula`) | `BD-K4`, `BD-K5`, `BD-04` |
| BD-6 Her yazma ve silme damgayı ilerletir | `mesaj_surum` sayacı | `BD-01`, `BD-05` |
| BD-7 Okuma `oku` ya da `yaz`, yazma `yaz`, kurulum `yonet` ister | uç yetkisi | `BD-07`, `BD-11` |
| BD-8 Kilit başkasına geçerliyken verilmez | servis (`kilitAlinirMi`) | `BD-K6`, `BD-08` |
| BD-9 Ek en çok 700 KB, boyut içerikle aynı | `mesaj_ek_boyut` | `BD-10` |
| BD-10 Başlangıç belgeleri yalnız işaret belgesi yokken bir kez | servis | `BD-K8`, `BD-11` |
| BD-11 Oda yalnız son 45 sn içinde görülenleri döner | servis (`canliEsler`) | `BD-K7`, `BD-12` |
| BD-12 Çerçeve dışarıya istek atamaz, yazı tipi gömülüdür | içerik politikası | `prototipi içerik politikasıyla, köprüyle ve dış yazı tipi bağlantısı olmadan yalıtılmış çerçevede açar`, `sayfaKur dış yazı tipi bağlantısını çıkarır, politikayı ve betiği başa koyar` |
| BD-13 Yerel depo önekli anahtarı yazar; ortak kapsamda çatışma uyarır ve durur | köprü | `CK-01`, `CK-02` |
| BD-14 Yetkisiz kişi uçlara gitmez | ekran + uç | `sayfayı görmeyen kişiye yetki iletisi gösterir, uçlara gitmez` |
| BD-15 (225 a) Sipariş, otomatik uyarı, e-posta kuyruğu ve tetik kaydı yalnız sahibince (`by`) ya da `mesaj.yonet` ile değiştirilir ve silinir | servis (`yazmaEngeli`, `silmeEngeli`) | `BD-Y9`, `BD-18` |
| BD-16 (225 a) Kanalın adı, konusu, simgesi ve silinmesi açanın (`createdBy`) ya da `mesaj.yonet`in; başkası yalnız son ileti özetini, anmayı ve @herkes zamanını yazar; kanal başkası adına açılamaz | servis (`yazmaEngeli`, `silmeEngeli`) | `BD-Y10`, `BD-18` |
| BD-17 (225 a) Okundu belgesi `okuma/<kişi>` yalnız o kişiye yazılır ve silinir (yönetici dahil); okuması herkese açık | servis (`yazmaEngeli`, `silmeEngeli`) | `BD-Y11`, `BD-18` |

Prototipin kendi iş kuralları (ekranda kalanlar) `UYUM-BORCU.md`'dedir; bunlar için sunucu testi yoktur.
