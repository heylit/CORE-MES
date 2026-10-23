# denetim-hazirlik: kural ve test eşlemesi

Dosyalar: `sunucu/moduller/denetim-hazirlik/kurallar.test.ts` (saf, 13), `sunucu/moduller/denetim-hazirlik/denetim-hazirlik.test.ts` (gerçek PostgreSQL, 18),
`istemci/src/moduller/denetim-hazirlik/DenetimHazirlikCercevesi.test.tsx` (6), `istemci/src/moduller/denetim-hazirlik/cerceve-kopru.test.ts` (6). Hepsi koşuldu, yeşil (UYGULA.md).

| Kural | Kısıt / yer | Test |
|---|---|---|
| BD-1 Belge yolu koleksiyon/kimlik çiftleridir; izinsiz karakter ve tek parçalı belge reddedilir | `denetim_hazirlik_belge_yol_bicimi`, `_yol_butun` | `BD-K1`, `BD-09` |
| BD-2 `data/users/<kişi>` altı yalnız o kişiye açık | servis (`erisebilirMi`) | `BD-K2`, `BD-06` |
| BD-2b Var olan belgeyi yalnız oluşturan değiştirir (ortak kök hariç). BD-15 sonrası uçtan erişilen her yol ya ortak kökte ya kişinin kendi alanındadır; kural ikinci savunma olarak servistedir | servis (`degistirebilirMi`) | `BD-K9`, `BD-13` |
| BD-3 Tam yazma gövdeyi değiştirir, birleştirme iç içe alanı korur, olmayan belgeye birleştirme 404 | servis | `BD-K3`, `BD-01`, `BD-02` |
| BD-4 Beklenen sürüm tutmazsa yazma 409 | servis (satır kilidi) | `BD-03` |
| BD-5 Sorgu koşulu, sırası ve sınırı sunucuda | servis (`sorgula`) | `BD-K4`, `BD-K5`, `BD-04` |
| BD-6 Her yazma ve silme damgayı ilerletir | `denetim_hazirlik_surum` sayacı | `BD-01`, `BD-05` |
| BD-7 Okuma `oku` ya da `yaz`, yazma `yaz`, kurulum `yonet` ister (ortak kaydı silen ya da boşaltan yazma için BD-16) | uç yetkisi | `BD-07`, `BD-11` |
| BD-8 Kilit başkasına geçerliyken verilmez | servis (`kilitAlinirMi`) | `BD-K6`, `BD-08` |
| BD-9 Ek en çok 700 KB, boyut içerikle aynı | `denetim_hazirlik_ek_boyut` | `BD-10` |
| BD-10 Başlangıç belgeleri yalnız işaret belgesi yokken bir kez | servis | `BD-K8`, `BD-11` |
| BD-11 Oda yalnız son 45 sn içinde görülenleri döner | servis (`canliEsler`) | `BD-K7`, `BD-12` |
| BD-12 Çerçeve dışarıya istek atamaz, yazı tipi gömülüdür | içerik politikası | `prototipi içerik politikasıyla, köprüyle ve dış yazı tipi bağlantısı olmadan yalıtılmış çerçevede açar`, `sayfaKur dış yazı tipi bağlantısını çıkarır, politikayı ve betiği başa koyar` |
| BD-13 Yerel depo önekli anahtarı yazar; ortak kapsamda çatışma uyarır ve durur | köprü | `CK-01`, `CK-02` |
| BD-14 Yetkisiz kişi uçlara gitmez | ekran + uç | `sayfayı görmeyen kişiye yetki iletisi gösterir, uçlara gitmez` |
| BD-15 (B7) Genel depo ucu yalnız prototipin önekli yerel depo anahtarına (`yerel/kalite-denetim*`, kişisel kökte `data/users/<kişi>/yerel/anahtarlar/kalite-denetim*`) yazar, siler, kilitler ve okur; sorgu yalnız bu iki koleksiyonda; öteki yol 403 | servis (`izinliBelgeMi`, `izinliKoleksiyonMu`) | `BD-K10`, `BD-15` |
| BD-16 (226 a) Ortak kayıtta profil sayısını düşüren (profil silme, "Tümünü sil"), dolu kaydı boşaltan ya da okunamaz kılan yazma, kilit gövdesi ve dolu kaydın silinmesi `denetim-hazirlik.yonet` ister (yalnız yönetici); olağan düzenleme, profil ekleme ve kopyalama yazara açık. "Dolu" prototipin `isEmptyProfile` tanımıdır. Ekranda bu düğmeler (profil sil, seçerek sıfırla, tümünü sil, yedek yükle) yönetici olmayana gizlenir, tıklama yakalanır | servis (`yonetimGerekirMi`), ekran (`yonetim-dugmeleri.ts`) | `BD-K11`, `BD-16`, `Denetim Hazırlığı yönetim düğmeleri (226 a)`, `yönetici olmayana yönetim düğmelerini gizleyen betik ...` |

Prototipin kendi iş kuralları (ekranda kalanlar) `UYUM-BORCU.md`'dedir; bunlar için sunucu testi yoktur.
