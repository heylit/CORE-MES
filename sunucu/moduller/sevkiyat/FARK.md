# FARK: sevkiyat (araç rota planlama) — dal `sevkiyat`, taban `main`

Bu teslim, 6 Ekim'de hazırlanan haritalı sevkiyat modülünü depoya alır. 11 Ekim'de verilen kararlar da uygulandı.

## Kararlar (kullanıcı, 11 Ekim: "1a, 2 seçenekler kalsın, 3a, 4a, ayrı yap")
- Ön paket soru 0 (çözücü kodu, ARKON paketinin çevirisi): (a) kabul.
- Soru 1 (modül adı): `sevkiyat`. Soru 6 (Google/Yandex sürücü bağlantısı): kalsın.
- Soru 3 (rol x işlem), bölüm 3'e göre uygulandı:
  - planlama_proje: oku, is-yaz, plan-yaz;
  - depo: bütün beş işlem;
  - öteki roller: oku. Her rol `/sevkiyat` sayfasını görür.
  - VARSAYIM: "sevkiyat sorumlusu" diye bir rol yok; `depo` rolüne verildi. Geri alma maliyeti düşük (tek göç satırı ve test beklentisi).
- Soru 7: bekleyen iş varken onay uyarır. Pencerede "N iş hiçbir araca yerleşmedi" yazar; "Yine de onayla" ile onaylanır.
- Soru 8: aktif fabrika noktası pasifleştirilemez ve başka türe çevrilemez. Fabrika taşındıysa noktanın konumu güncellenir.
- Soru 12: bugün ve sonrasına ait onaylı planda kullanılan araç ya da nokta değiştirilemez ve pasifleştirilemez. İleti planın tarihini verir; önce o günün onayı kaldırılır.
- "Ayrı yap": Fabrika Haritası ve Sevkiyat önizlemeleri ayrı dosyalardır. Fabrika önizlemesinden yanlış sevkiyat taklidi çıkarıldı ve `atolye` dalından yeniden derlendi.

## Ne yapıldı
- 6 Ekim teslim ağacı bugünkü depoya kondu. Göçün damgası yenilendi: `20261011160000_sevkiyat_tablolar.sql`.
- Etkisiz üç `eslint-disable` yorumu kaldırıldı.
- Kurallar `kurallar.ts`'te (`fabrikaKaldirilir`, `onayliPlanIletisi`). Sorgu `sorgular.ts`'te (`onayliPlanTarihleri`). Denetim servisin güncelle ve pasifleştir yollarında.
- Rol satırları göçle girdi: `20261011180000_kisiler_sevkiyat_islemleri.sql`. Onaylı matrisi sabitleyen kisiler, oturum ve sağlık testleri yeni satırlarla güncellendi.

## Commit'ler (`yamalar/` içinde, sırasıyla)
1. `core: register the sevkiyat page and its five permissions`
2. `sevkiyat: vehicle route planning module (day plan, single route, points, vehicles)`
3. `sevkiyat: decided rules for approval, factory point and approved plans`
4. `core: sevkiyat role grants (approved matrix)`
5. `core: pin sevkiyat grants in the approved role matrix tests`
6. `sevkiyat: simpler day plan screen` (arayüz sadeleştirme, 11 Ekim akşam)
7. `sevkiyat: list-first day plan and a clearer route calculator` (liste önce kurgusu)
8. `sevkiyat: shipment pool with job status (planned, on the road, done, not done)` (havuz ve durumlar, şema)
9. `sevkiyat: show overdue and retry on stops, hide zero totals before planning`
10. `sevkiyat: route calculator shows the chosen vehicle and where it was opened from`
11. `core: built-in sevkiyat role with the same rights as depo`
12. `sevkiyat: say that not-done and leftover jobs move to the next day's pool`

## Komut çıktıları (Node 24.21.0, PostgreSQL 16.13, test kümesi port 5433)
```
npm run kontrol (commit 11) → çıkış 0; sunucu ℹ tests 663 / ℹ pass 663 / ℹ fail 0; istemci Test Files 27 passed (27) / Tests 272 passed (272)
sunucu/moduller/sevkiyat/*.test.ts → ℹ tests 77 / ℹ pass 77 / ℹ fail 0
istemci src/moduller/sevkiyat → Tests 21 passed (21)
npm run sinir -- --modul sevkiyat → 0 sınır ihlali; göç damgası 0 ihlal; yol denetimi 6 isabet (çekirdek commit'lerindeki
  paylasilan/islemler.ts, paylasilan/sayfalar.ts ve kisiler/oturum/saglik testleri)
```

## Arayüz sadeleştirme (commit 6)
- Gün planında tek birincil düğme var: plan kurulduysa "Planı onayla", kurulmadıysa "Otomatik dağıt". Tarihin yanında önceki/sonraki gün okları.
- Özet şeridinde beş toplam görünür. Öncelik seçimi (en hızlı / en kısa / en ucuz) öteki seçenek seçilseydi oluşacak farkı da gösterir.
- Sıradaki adım tek cümleyle yazılır ve plan durumuna göre değişir.
- Harita yanında tek kolon: bekleyenler üstte ("Yerleştir" düğmesiyle), araçlar kapalı kart.
  - Kapalı kart saat aralığını, durak sayısını, km'yi, yük çubuklarını ve güzergâhı gösterir.
  - Kart açılınca duraklar listelenir ve harita o araca odaklanır.
- Duraklar tek satırdır; menü üç gruba ayrıldı: Sıra, Başka araca ver, Diğer.
- Tek rota aynı öncelik seçimini kullanır. Nokta ve araç satırlarında düzenle ve pasifleştir düğmeleri tek satırda simge olarak durur.
- Doğrulandı: tip, lint ve sinir temiz; istemcide 269 test geçti (sevkiyat 19). 390, 768 ve 1440 genişlikte ekran görüntüsüyle bakıldı; 360 genişlikte yatay taşma yok.

## Liste önce kurgusu (commit 7)
- Kullanıcının tarif ettiği akış ekrana taşındı: sevkiyat listesi gelir → araçlara elle ya da otomatik dağıtılır → kontrol → onay ve sürücü.
  - Üstte dört adımlı akış şeridi ve tek cümlelik sıradaki adım.
- Solda sevkiyat listesi: önce atanmamış işler, sonra araç araç duraklar. Her satırda "Araç" seçimi var; elle dağıtmanın tek denetimi bu. Harita sağda.
- "Sürücüye gönder" aracın başlığında; bağlantılar pencerede açılır.
- "Tek rota" sekmesinin adı "Rota hesapla" oldu. Sayfa üç numaralı bölümle ilerler:
  1. Duraklar: tek "Durak ekle" seçimi ya da günün planındaki seferden başlama.
  2. Araç ve çıkış.
  3. Sonuç.
- Doğrulandı:
  - Tip ve lint temiz; sınır denetimi 0 ihlal; istemcide 269 test geçti.
  - Önizlemede atama, geri alma ve seferi hesaplayıcıda açma senaryosu çalıştı.
  - 360 genişlikte yatay taşma yok.

## Sevkiyat havuzu ve iş durumları (commit 8-9)
- Kararlar (kullanıcı, 11 Ekim):
  - Beş durum: Havuzda → Planlandı → Yolda → Tamamlandı / Yapılamadı (havuza döner).
  - Plan onaylanınca işler "Yolda" olur.
  - Sonucu planlamacı ya da depo ekrandan işaretler; mevcut "iş yaz" yetkisi kullanılır, yeni yetki yok.
  - Havuzda istenen gün kullanılır; geciken işler sonraki günlerin listesinde "Gecikmiş" görünür.
- Şema, yeni göç `20261011201500_sevkiyat_is_durumu.sql`:
  - İşe `istenen_tarih`, `durum` ve `durum_zamani` eklendi; durağa `sonuc`, `sonuc_zamani` ve `sonuc_notu` eklendi.
  - Durağın işle aynı günde olma bağı kaldırıldı: yapılamayan iş başka günün planına girer.
  - Onaylı planda yalnız sonuç yazılır. Yoldaki ya da tamamlanmış işin içeriği değişmez (veritabanında da).
  - Var olan veride plandaki işler "planlandı" ya da "yolda" olur.
- Günün listesinde şunlar görünür:
  - o günün planı;
  - o güne kadarki havuz;
  - bugünden önceki bir günün taslağında unutulmuş işler;
  - o gün elle kapatılanlar.
- Plana alınan iş:
  - o güne taşınır ve öteki taslaklardan çıkar;
  - plandan çıkarılırsa havuza döner.
- Yeni uç: `POST /sevkiyat/isler/:id/durum` (yetki `sevkiyat.is-yaz`). Desteklenen geçişler:
  - Teslim edildi.
  - Yapılamadı (nedeniyle).
  - Elle kapat.
  - Yeniden aç.
  - Sonucu geri al. İş başka bir plana alındıysa sonuç geri alınamaz.
- Sonuç girilmiş planın onayı kaldırılamaz.
- Doğrulandı:
  - Tam kontrol yeşil.
  - Önizlemede şu senaryo çalıştı: dağıt, onayla, bir iş teslim edildi, bir iş yapılamadı, ertesi gün havuzda iki iş.

## Rota hesapla: seçimler görünür (commit 10)
- Üstte seçim özeti: araç, gün ve çıkış, öncelik, durak sayısı ve açıldığı sefer (ör. "Günün planı: Kamyon · 1. sefer").
- Araç açılır listeden değil kartlardan seçilir: ad, tür, kapasite; seçili kart sarı. Belirli araç yoksa yalnız tür seçilebilir.
- Hesap araç türüyle yapılır; seçilen aracın kendi maliyet oranları henüz kullanılmaz (VARSAYIM, sunucuda değişiklik yok).

## Kararlar (11 Ekim akşam, commit 11-12)
- Yapılamadı seçilen ya da havuzda kalan iş ertesi güne geçer (ertesi günün havuzunda "Gecikmiş" rozetiyle). Sonuç girilmemiş yoldaki iş, sonuç girilene kadar onaylandığı günde bekler.
- Yerleşik "Sevkiyat" rolü eklendi (göç `20261011224000_kisiler_sevkiyat_rolu.sql`). Depo ile eş yetkide: stok sayfası, sevkiyatta okuma, iş ve plan yazma, onay, nokta ve araç tanımı.
  - VARSAYIM: "eş yetki" stok sayfasını da kapsar; yalnız sevkiyat yetkileri isteniyorsa göçten `sayfa.stok` satırı çıkarılır.
  - Rol sayısı 11'den 12'ye çıktı; onaylı matrisi sabitleyen kisiler, oturum ve sevkiyat testleri güncellendi.

## Bekleyen
- Çekirdek: `TMIV2_HARITA_DIZINI` `.env.ornek` dosyasına ve kurulum belgesine eklenmeli. Dizin yoksa modül açılır ama saat hesabı, dağıtma ve onay kapalıdır.
- Çekirdek: `/sevkiyat/harita` yanıtı yaklaşık 4,5 MB. Sıkıştırma ve önbellek başlığı gerekiyor.
- ~~Harita veri paketi (OpenStreetMap, ODbL) depoya girmez.~~ Değişti: paket depoda (aşağıda "Harita paketi depoda").
- Ön paket soruları 2, 4, 5, 9, 10, 11 açık. Kod, ön pakette önerilen davranışla çalışır.

## Ayrı tutulan
- Yanlış anlaşılıp yazılan irsaliye ve çeki modülü `sevkiyat-ceki` dalında ve `teslim-sevkiyat-ceki.zip` içinde. Birleştirilmedi, silinmedi.

## Oturtma (kart #598, dal `598-sevkiyat`)
- Gelen hal tek commit; yalnız modül dosyaları alındı. Teslimdeki kisiler, oturum ve sağlık testi kopyaları eski tabana yazılmıştı
  (`#cekirdek/db.ts` `HAVUZ_BOYUTU` main'de yok); alınmadı, yeni satırlar main'in güncel testlerine işlendi.
- Göç damgaları main'in son göçünden sonraya alındı: `20261011200500_sevkiyat_tablolar.sql`, `20261011200600_sevkiyat_is_durumu.sql`.
  Teslimdeki iki rol göçü tek göçte: `20261011200700_kisiler_sevkiyat_islemleri.sql` (içerik aynı; kullanıcı onayı 11 Ekim).
- Sayfa main'in bugünkü biçiminde (`paylasilan/sayfalar/sevkiyat.ts`); sekme şeridi (`SevkiyatGezinti.tsx`) kalktı, bölümler ikinci menüde.
- Ana menü simgesi `next` (kamyon satın almada; menü simgeleri tekil).
- Eklenen belgeler: ORTAKLIK, GUVENLIK-DENETIMI, UYUM-BORCU, CEKIRDEK ve BASKA-MODUL istekleri, KURAL-TEST.

## Demo provası düzeltmeleri (kart #598, dal `598-sevkiyat-duzeltme`)
- Haritasız onay engeli: araçta iş varken "Planda araca atanmış iş yok" denmez; engel "Harita paketi yüklü değil" olur (`onayEngelleri`, `atanmisIsVar`).
  Dağıtma ve tek rota iletileri de "Harita paketi yüklü değil" der.
- Araç yük çubuğu haritasızken atanmış işlerden sayılır (`rota-duzeni.ts` `yukTepesi`; sunucunun tepe yük sayımıyla aynı).
- "Elle kapatılan" başlığı seçili güne göre: bugünse "Bugün", değilse "GG.AA.YYYY günü".
- Yeni uç `GET /sevkiyat/ozet` (`sevkiyat.oku`) ve ana sayfa "Bana düşen işler" kartları: araca verilmemiş iş ve gecikmiş iş (`sevkiyat.onayla`: Sevkiyat ve depo).
- Harita uyarısı plan ekranında bir kez: engel listesi harita engelini tekrarlamaz, harita panelindeki not kısaldı.
- Araç tanımlama yetkisi olmayana "Araçlar bölümünden ekleyin" denmez.
- `.env.ornek` satırı çekirdekten geldi (#618); çekirdek ayar okuyucusu bağlamada (UYUM-BORCU 6).
- Uyarılar seçili güne göre: "bugün", "yarın", "dün" ya da tarih (`bicim.ts` `gunAdi`); ileri tarihli onaylı planda sıradaki adım
  "araçlar <gün> yola çıkacak" der.
- İleri tarihli onaylı plana teslim ve yapılamadı sonucu girilmez (`ileriSonucIhlali`; sunucu reddeder, ekranda düğme yok).
  Varsayım: plan günü veritabanının bugününe göre; geri alma ve yeniden açma etkilenmez.

## Harita paketi depoda (kart #598, dal `598-harita-paketi`; kullanıcı kararı 12.10.2026 "PAKET DE GİRSİN DEPOYA")
- Eklenen: `sunucu/moduller/sevkiyat/harita-paketi/` (harita.json, yol.json, arama.json; Ankara, OpenStreetMap, ODbL atfı BENIOKU.txt içinde).
- Değişen: `uclar.ts` `TMIV2_HARITA_DIZINI` tanımlı değilse depodaki paketi okur; `git pull` sonrası `.env` gerekmez. Değişken başka bölge için kalır.
- Kullanıcı onaylı istisna: "Depoya yalnız kod girer" kuralı değişmedi; bu paket yalnız kullanıcının izniyle (12.10.2026 "İSTİSNA BENİM İZNİMLE SADECE")
  tek seferlik istisnadır. NOTLAR, devir ve `.env.ornek` paketin yerini anlatacak biçimde güncellendi.

## Yönetici özeti kartı (kart #664, dal `664-sevkiyat-geciken`; Çekirdek #666 "Şirket özeti" bölümüne bağlı)
- Eklenen: ana sayfa kartı `sevkiyat-geciken` (bölüm `yonetim`, işlem `ayarlar.yaz`, sıra 40): geciken sevkiyat sayısı, alt satırda araca verilmemiş iş sayısı.
  Yeni uç yok; `GET /sevkiyat/ozet` ile aynı sorgu anahtarını paylaşır (sayfada tek istek).
  Varsayım: yönetici rolü `sevkiyat.oku` uçuna erişir (rol.yonetici bütün işlemleri taşır); geri alma: kart satırını silmek.

## Kart #836: noktalar firmadan (12 Ekim, kullanıcı: "evet (öneri)", "YAZ")
- Göç `20261012144300_sevkiyat_nokta_firma.sql`: boş olabilen `firma_id` -> `finans_firma(id)`; yalnız müşteri, tedarikçi ve fason türünde (`sevkiyat_noktasi_firma_turu`); firmanın tek aktif noktası (`sevkiyat_noktasi_firma_tek`).
- `GET /sevkiyat/firmalar` (yetki `sevkiyat.tanim-yaz`): finansın `firmaAra` ve `firmaOzetleri` ile müşteri ve tedarikçiler; firmanın var olan noktası `noktaId` ile döner.
- Bağlı noktanın adı listede, planda, tek rotada ve haritada finanstaki firma adından okunur.
- Noktalar formunda "Firmadan al": firma adı (salt okunur), türü (fason bayrağı fason, iki yönlü firma formdaki türü korur ya da müşteri) ve konum aramasına firmanın ili gelir.
- VARSAYIM: konum firmada tutulmaz (finans_firma'da koordinat yok, DOĞRULANDI); noktada kalır.
- Fabrika konumu Sistem Ayarları'ndan (Genel > Firma konumu: `sevkiyat.fabrika-enlem`, `sevkiyat.fabrika-boylam`): ikisi de doluysa fabrika noktasının konumu yerine geçer (plan, tek rota, harita, liste); biri boşsa nokta geçerlidir. Noktalar ekranı bunu yazar.
- VARSAYIM: aktif fabrika noktası yine gerekir (rota onun kimliğiyle kurulur). Geri alma maliyeti düşük.
- Firmadan alınan noktada açık adres firmanın adresi, ilçesi ve ilinden dolar; konum araması ilçe ve ille açılır.

## Kart #1310: bekleme listesi, fason gönderimi (sevkiyat tarafı)
- Göç `20261014190100_sevkiyat_bekleyen.sql`: yeni boş tablo `sevkiyat_bekleyen` (kaynak `urun` | `fason` | `alim`). Biten emir başına tek `urun` satırı, fason hareketi başına tek satır, iş başına tek satır.
- Üretim emirleri olay yayınlar (`emirBittiDinle`, `fasonHareketiDinle`, `uretim-emirleri/disari.ts`); sevkiyat yükleme anında dinler, emirle aynı işlemde yazar.
- Biten emir (fasonla bitiş dahil) sağlam adetiyle "Sevke hazır" düşer; istenen tarih emrin termini.
- Fason gidişi: firmanın aktif sevkiyat noktası varsa bugünlü teslimat işi havuza açılır (belge no emir no) ve kayıt işe bağlı tutulur; nokta yoksa kayıt listede "Firmanın sevkiyat noktası yok" ile bekler, gönderim reddedilmez.
- Uçlar: `GET /sevkiyat/bekleyenler` (`sevkiyat.oku`), `POST /sevkiyat/bekleyenler/:id/ise-cevir` (`sevkiyat.is-yaz`, iş gövdesiyle), `POST /sevkiyat/bekleyenler/:id/kaldir` (`sevkiyat.is-yaz`, kaldıran kişi yazılır). Kapalı kayıtta 409 `BEKLEYEN_KAPALI`.
- Ekran: plan sayfasında havuzun üstünde "Bekleme listesi"; "İşe çevir" iş formunu kayıttan doldurur (nokta, belge no, istenen tarih).
- VARSAYIM: fason işinin yükü 1 palet, 0 kg (fason hareketinde ağırlık yok); planlayıcı düzeltir. Geri alma: düşük.
- VARSAYIM: bütün emirler düşer (müşteri ayrımı yok); sağlam adeti 0 olan bitiş düşmez. Geri alma: düşük.
- VARSAYIM: fason dönüşü iş açmaz; dönüş alımı planlayıcı elle girer. Geri alma: düşük.
- Alım (dal 1310-talep-teslim): satın almanın `alimDinle` olayıyla "biz alacağız" denen siparişin her tedarikçisi `alim` satırı olur; satırlar talebin alım listesine eşitlenir, işe çevrilmiş satıra dokunulmaz. Listede ve işe çevirirken belge no talep numarasıdır (`talepNo`).

## Kart #1338: Akış Süresi için sevk durumu okuması
- `disari.ts` `emirlerinSevkDurumu(db, emirIdleri)`: emir başına bekleme listesine düşüş zamanı, kaldırılma zamanı, bağlı iş, işin durumu ve durum zamanı, iş iptal bayrağı. Listeye düşmemiş emir haritada yoktur; boş dizi sorgu açmaz. Göç ve yetki değişmez.
- VARSAYIM: iptal edilen iş için durum olduğu gibi döner, `isIptalEdildi` ayrıca verilir (istenen imzaya eklenen tek alan). Geri alma: düşük.

## Kart #1323: sürüm denetimi
- Göç `20261014203000_sevkiyat_surum.sql`: `sevkiyat_noktasi`, `sevkiyat_araci`, `sevkiyat_isi` için `surum integer NOT NULL DEFAULT 1` (kullanıcı onayı 14 Ekim, karar kartı "Eklensin"); yoldaki işin değişmezlik tetikleyicisi sürümü içerik saymaz.
- Güncelleme uçları sürüm ister; her yazma (pasifleştirme, iptal, plana alma, durum) sürümü artırır. Ekran formun açıldığı sürümü gönderir.
