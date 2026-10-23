## 1324-fazla-mesai-plani (kart #1324, plan kapasitesi)
- Yeni boş tablolar `vardiya_fazla_mesai` ve `vardiya_fazla_mesai_kisi` (göç `20261014194747_vardiya_fazla_mesai.sql`): bir gün, başlangıç ve bitiş saati (gece yarısını geçebilir), kapsam iş merkezi ya da istasyon, isteğe bağlı kişi listesi ve not. İptal edilen kayıt silinmez, takvime girmez.
- Uçlar: `GET /fazla-mesai?baslangic&bitis` (sayfa.vardiya ya da vardiya.yaz; iptaller dahil), `POST /fazla-mesai` (tekrar korumalı), `POST /fazla-mesai/:id/guncelle` (sürümlü), `POST /fazla-mesai/:id/iptal` (sürümlü). Yazma mevcut `vardiya.yaz`; yeni işlem ve rol x işlem değişikliği yok. Geçmiş tarih `vardiya.gecmis-yaz` ister.
- Takvim (`calismaTakvimi`, `calismaTakvimleri`): kapsamdaki fazla mesai makine, istasyon ve iş merkezi takvimine eklenir (iş merkezi kaydı merkezin istasyon ve makinelerine de; istasyon kaydı yalnız o istasyona ve makinelerine), örtüşen aralıklar birleşir, planlı duruş düşer, tatil ve kapalı günde de geçerlidir. Kişi takvimine yalnız listesinde olduğu kayıt girer.
- Kişinin İK'da onaylı izinli günü 0 dakikadır, günde `izinli: true` (okuma `ik/disari.ts` `kisininIzinleri`, kişi başına bir sorgu). Kişi takviminde `yuzde`: istasyon atama yüzdeleri toplamı / 100 (atama yoksa null).
- Günde `fazlaMesaiDakika`: güne giren planlı fazla mesai (vardiyayla örtüşmeyen kısım). Plan fazla mesaisi takvime girdiği için İK'nın onaylı fazla mesai saatini aynı gün ayrıca ekleyen okuyucu (Üretim Anomali emek verimi, #1336) bu alan doluysa İK saatini saymamalı.
- Ekran: Vardiya ikinci menüsünde "Fazla mesai" (`/vardiya/fazla-mesai`): haftalık liste (önceki ve sonraki hafta, toplam saat), ekle ve düzenle penceresi (tarih, saat, kapsam, hedef, hedefin personeli arama ve "görünenlerin hepsi" ile; istenirse başka istasyondakiler), iki adımlı iptal. Menü kaydı modülün kendi satırı (`paylasilan/sayfalar/vardiya.ts`).

## 1305-vardiya-toplu (kart #1305)
- Haftalık matris: satır seçimi (tek tek ya da "Hepsini seç", aramaya uyan görünen satırlar), iş merkezi araması; seçim varken altta toplu düzenleme çubuğu (geniş ekranda yapışık): gün (Hafta içi, Hafta sonu, Tüm hafta kısayolları) ve vardiya seçilip Ekle, Kaldır ya da iki adımlı "Yalnız bunlar olsun" (vardiya seçilmezse "Günleri boşalt"); iki adımlı "Seçilenlere kopyala" bir iş merkezinin haftasını yalnız seçilenlere yazar. Tek hücreye dokunarak açıp kapatma aynen durur.
- Vardiya başına personel: ad ya da iş merkezi araması, iş merkezi ve vardiya süzgeci (İş merkezi yok, Seçilmedi dahil); özet tablodaki sayıya dokununca liste o iş merkezi ve vardiyaya süzülür; satır seçimi ve "Görünenlerin hepsini seç"; seçilenlere tek komutla vardiya ya da "Seçilmedi". Satırdaki tek tek seçim kutusu aynen durur.
- Yeni uçlar (`vardiya.yaz`, yeni işlem yok): `POST /vardiya-matrisi/toplu-yaz` (VR-18), `POST /vardiya-matrisi/kopyala` (VR-19), `POST /kisi-vardiyalari/toplu-belirle` (VR-20). Her biri tek transaction, hepsi ya da hiçbiri; kapsam dışı kayıt 403 ve `ayrinti` içinde reddedilen kimlikler (`TopluRetAyrintisi`), ekran nedeni o satıra "Yetkin yok, değişmedi" diye yazar.
- Okuma kipi + "Düzenle" kalıbı (#1296) bilerek alınmadı: matris hücresi ve kişi vardiyası zaten tek dokunuşla yazılıyordu; araya bir adım eklemek tek kayıt işini yavaşlatırdı. Toplu iş satır seçimiyle açılır.
- Göç, tablo, işlem ve rol x işlem değişmedi. `IkiAdimli` ayrı dosyaya (`IkiAdimli.tsx`), personel ekranı `Personel.tsx`'e, sorgu kancaları `veri.ts`'e taşındı.

## 1166-gunluk-mesai-kaldir (kart #1166)
- Ana menüdeki "Günlük Mesai" (`/mesai`) kaldırıldı: aynı ekran (`GunlukMesaiEkrani`) Vardiya ikinci menüsünde "Günlük mesai" (`/vardiya/mesai`) olarak açılır. Sayfa kaydı `menudeGizli: true` ile durur, çünkü `sayfa.mesai` işlemi bu kayıttan gelir; ikinci menü maddesi ve `GET /gunluk-mesai` ucu bu işlemle görünür. Rota `/mesai` adresle açılmaya devam eder.
- Göç, uç, tablo, işlem ve rol x işlem değişmez. Çekirdek listede (`istemci/src/ortak/arayuz/Kabuk.test.tsx` bekletilen sayfalar) yalnız `/mesai` satırı eklendi (ayrı commit).

## 906-ornek-veri (kart #906)
- Eklenen: `ornek-veri.ts` (`npm run ornek-veri` payı; gerekir kisiler, istasyonlar): "Örnek Gündüz" (08-16) ve "Örnek Akşam" (16-24) vardiyaları, ORN-TAL için hafta içi iki vardiya ve cumartesi gündüz, ORN-MON için hafta içi gündüz; üç örnek operatörün vardiyası; ORN-FREZE-2 için yarın 08-10 planlı bakım duruşu. Çalışma takvimine (resmî tatiller) yazılmaz: ortak ayar kurulumun parçasıdır, kullanıcı Takvim'den ekler (denetim KD-066).
- Kayıtlar servis komutlarıyla örnek yönetici adına yazılır. "Örnek " adlı vardiya varsa yüklü sayılır. Göç, uç, yetki değişmez.
- Çekirdek çalıştırıcı (`sunucu/cekirdek/ornek-veri.ts`, aynı çekme isteği): önce bütün modüllere `yukluMu` sorulur; yüklü olan atlanır, eksikler `gerekir` sırasıyla tek transaction'da yüklenir (önceden biri yüklüyse hiçbiri yüklenmiyordu). Sonuç: bir şey yüklendiyse `{ durum: 'yuklendi', moduller: yüklenenler, yuklu?: atlananlar }` (`yuklu` yalnız atlanan varsa), hiç eksik yoksa `{ durum: 'yuklu', moduller: hepsi }`. `araclar/ornek-veri.ts` atlananları "Zaten yüklü, atlandı: ..." satırıyla basar. Testteki sahte zincir halkasının `yukluMu`'su gerçek kaydı sormalı; hep false dönerse ikinci koşuda yeniden yazar.

# FARK: vardiya (kart #410, T3)

Taban: main e0b591f. Başvuru: ilk sistem `ilk-sistem-kodu/sunucu/moduller/vardiya/`, göç `20261007053300_vardiya_takvim.sql`, prototip `prototip-Recete_ve_Rota_Motoru.html` (Kaynaklar > Vardiyalar ve Personel).

## Gelen
- Göç `20261009233000_vardiya_tablolar.sql`: `vardiya`, `vardiya_molasi`, `vardiya_matrisi`, `vardiya_takvim_gunu`, `vardiya_kisi` (bütün kısıtlar adlı).
- Sözleşme `paylasilan/sozlesme/vardiya.ts`; sayfa ve ikinci menü `paylasilan/sayfalar/vardiya.ts` (üç madde); toplayıcıda yalnız `VARDIYA_IKINCI_MENU` satırı (ayrı commit).
- Sunucu `sunucu/moduller/vardiya`: 12 uç, kurallar VR-01..VR-10, `disari.ts` (`calismaTakvimi`, `calismaTakvimleri`, `calismaSuresi`, `gunYaz`, `takvimGunleri`).
- İstemci `istemci/src/moduller/vardiya`: `/vardiya` (matris, vardiya saatleri ve molalar, tatiller), `/vardiya/personel`, `/vardiya/takvim`; `disari.ts` düzen bileşenini rotaya açar.

## İlk sistemden farklar
| Konu | İlk sistem | Burada | Neden |
|---|---|---|---|
| Tablo adları | `is_merkezi_vardiyasi`, `takvim_gunu` | `vardiya_matrisi`, `vardiya_takvim_gunu` | Tablo adı modül adıyla başlar |
| Vardiya güncelleme | sürümsüz | `surum` ister, eskiyse 409 | Güvenlik kuralı (sürüm denetimi) |
| Vardiya açma | düz POST | `istek-kimligi` başlığı zorunlu | Yeni kayıt açan komut tekrar korumalı |
| Kapsam | yok | Matris hücresi ve kişi vardiyası iş merkezi kapsamında; tesis geneli yazma (vardiya, tatil, haftayı uygula, temizle) yalnız kısıtsız kişide (VR-09) | İş merkezine bağlı kayıtta veri kapsamı |
| `calismaTakvimi` | `(db, isMerkeziIdleri, tarihler) -> Map<id, dakika[]>` | `(db, kaynak, { baslangic, bitis }) -> KaynakTakvimi | null`, toplu hali `calismaTakvimleri` | K3: kaynak makine ya da kişi; plan aralık (an) ister |
| Ekran | Rota > Kaynaklar > Vardiyalar | Kendi sayfası `/vardiya`; aynı düzen, rotaya `disari.ts` ile açık | Modül ana menüde tek sayfa, ikinci menülü |

## Yeni (prototip EK ve K3)
- Haftayı tüm iş merkezlerine uygula (iki adımlı), Tümünü temizle (iki adımlı).
- Kişinin vardiyası (kullanıcı kararı 2-a) ve Vardiya başına personel paneli.
- Kaynak bazlı çalışma takvimi (iş merkezi, istasyon, makine, kişi) ve ekranı.

## Planlı duruş (A6, kart #519)
- Planlı duruş Arkon'dan Vardiya'ya geçti (kullanıcı kararı 1a, 2a, 3a, 4a, 5b): `vardiya_planli_durus` tablosu, `vardiya.durus-yaz` işlemi (müdür, planlama; amir kendi iş merkezinde kapsamla), ikinci menüde "Planlı duruşlar" ekranı.
- Aktif duruş çalışma takviminden ve günlük kapasite dakikasından düşülür (VR-15); plan ve Arkon aynı kaydı okur. Eski Arkon duruşları taşınmadı.

## Arkon vardiyaları buradan okur (A7, kart #517)
- `disari.vardiyaTanimlari` (VR-17): bütün vardiyalar molalarıyla; Arkon aktif olanları kendi biçimine çevirir.
- Göç `20261011132800_vardiya_arkon_kopyasi.sql` (kullanıcı kararı 4-a): Arkon `kv/shifts` belgesindeki vardiyalar bir kez kopyalanır; aynı ad varsa buradaki kalır, bozuk satır ve mola atlanır, Arkon belgesi değişmez.

## Dar ekranda yana kayma (kart #544)
- Haftalık vardiya matrisinin kabı konumlandırıldı (`vardiya.css` `.tc-vr-matris-kap`): gizli "Kopyala" başlığı kaydırma kabından taşıp sayfayı 360 genişlikte yana kaydırıyordu.

## Planlı duruş şeridi (B1, kart #544)
- Planlı duruşlar ekranına 7 günlük şerit: gün başlıkları, şimdi çizgisi, gerçekleşme çubukları, geçmiş ve pasif etiketi (başvuru Arkon `pano-planlama.ts:319-322`). Açılım sunucu VR-15'in gösterim karşılığı (`istemci/src/moduller/vardiya/serit.ts`); sunucu ve şema değişmedi.

## Vardiya sayfaları düzenlemesi (kart #544, madde 6)
- Matris hücresinde vardiya kısa adı baş harfleri ayrışana kadar uzar (Ge/Gü/A; `gosterim.ts` `kisaAdlar`); "Bu düzeni diğerlerine kopyala" ikon oldu; 1023 px altında matris iş merkezi başına karttır.
- Vardiya kartında "Kullanımda" aç/kapa anahtarıdır. "Tümünü temizle" tatil listesinin altına alındı.
- Vardiya başına personel: vardiyası seçilmeyen kişi varken hücre kırmızı olmaz. Personel seçim kutusunun görünen etiketi kalktı (ekran okuyucu okur).
- Çalışma takvimi ilk aktif iş merkeziyle açılır. Sunucu ve şema değişmedi.

## Ana sayfa: vardiyası seçilmemiş kişi (kart #544)
- "Bana düşen işler" bölümünde kart (`vardiya.yaz` olana): istasyona atanmış ve vardiyası seçilmemiş kişi sayısı, `/vardiya-personeli`'nden; tıklayınca Vardiya > personel. Sunucu, şema ve yetki değişmedi.

## Günlük Mesai sayfası (kart #544)
- `/mesai` (sayfa.mesai) artık boş değil: seçilen gün istasyona atanmış her kişi, iş merkezi, vardiyası, plan giriş-çıkış, net mesai ve durum (Mesaide, Tatil, Vardiya yok, İş merkezi yok); üstte dört sayı özeti, gün ileri-geri ve Bugün.
- Yeni uç `GET /gunluk-mesai?tarih=` (sayfa.mesai): satır plandır; o gün başlayan vardiyalar (kişinin vardiyası, yoksa iş merkezinin açık vardiyaları), molalar ve planlı duruşlar düşülmüş; gece vardiyası ertesi sabaha uzanır, önceki günün taşan vardiyası girmez (`kurallar.ts` `gununCalismaAraliklari`).
- Gerçek giriş-çıkış kaydı tutulmadığı ekranda yazılıdır. Şema, göç ve rol değişmedi.

## Kullanılabilirlik (kart #834)
- Vardiya yokken `/vardiya` ve `/mesai` boş durum kartı gösterir (`BosVardiya.tsx`): `vardiya.yaz` sahibine "İlk vardiyayı ekle" ve onay penceresi arkasında iki vardiyalı örnek düzen (Gündüz 08:00-16:00, Akşam 16:00-00:00, birer mola); yazma yetkisi olmayana "Vardiya tanımlı değil; yöneticiniz tanımlayınca burada görünür." Örnek düzen var olan `POST /vardiyalar` ucuna, vardiya başına ayrı istek kimliğiyle gider. Tohum göçü yok, sunucu ve sözleşme değişmedi.
- Çalışma takvimi (`/vardiya/takvim`) kaynak listesine istasyon ve aktif makine eklendi (V-B6): istasyonlar `GET /istasyonlar/secim` (oturumlu herkes), makineler `GET /makineler` (`sayfa.istasyonlar` ya da `istasyonlar.yaz`; yetkisiz okumada yalnız makine seçenekleri eksik kalır). `GET /calisma-takvimi` istasyon ve makine takvimini zaten veriyordu (`tur=istasyon|makine`); sunucu, sözleşme ve yetki değişmedi. İstasyonsuz makinede takvim yoktur (null), süreklilik uydurulmaz.
- Dar ekran: çalışma takvimi tablosu kaydırılabilir kapta, 480 px altında panel sıkılaşır, form alanı ve düğmeler satırı doldurur (`vardiya.css`). Tarayıcıda denenmedi, yalnız CSS incelemesi ve vitest.
- Günlük mesai Vardiya ikinci menüsünde `/vardiya/mesai` yolundadır (menü doğrulaması madde yolunun kök altında olmasını ister); aynı ekran ana menüdeki `/mesai`'de de açılır.

## Karar 142 b, 160 a (23.10.2026)
- Resmî tatilin sahibi İK (VR-28). Takvim günleri `ik/disari.ts resmiTatilGunleri` ile İK tatillerini ve Vardiya'nın kendi günlerini birleştirir;
  aynı gün İK tatili kazanır. Aralıksız okuma (`/vardiya-takvimi`, `disari.takvimGunleri`) İK tatillerini geçen yılın başından gelecek yılın sonuna kadar açar.
- Vardiya tatil yazmaz: `POST /takvim-gunleri` `tur: 'tatil'` 400; `POST /takvim-gunleri/resmi-tatiller` ucu ve sabit tatil listesi (`SABIT_RESMI_TATILLER`, `resmiTatiller`) kalktı.
- Göç yok. 142'den önce girilmiş `tatil` satırı tatil okunmaya devam eder ve Vardiya'dan silinebilir (kullanıcı kararı 23.10.2026 14:19; neden: Reçete ve
  Rota planlama sayfası yalnız `tatil`i tatil sayar, `kapali`yı saymaz).
- Sözleşme: `takvimCevabi.gunler[].kaynak` (isteğe bağlı, yalnız 'ik') eklendi; ekran İK satırını bununla ayırır. Vardiya'nın kendi satırı değişmedi.
- Ekran (160 a, prototip değişikliği onaylı): "Resmî tatilleri ekle" kalktı; İK tatilleri bayrakla, silinemez satır; "Tarih ekle" kapalı gün ekler;
  "Tümünü temizle" yalnız Vardiya'nın kendi günleri varken görünür ve onları siler; ipucu "Resmî tatiller İK ayarlarından girilir".
