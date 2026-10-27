# Arkon'un başka modüllerden istekleri

Arkon bu modüllerin dosyalarına yazmaz. Her istek sahibi modülün kartına taşınır. Arkon'un `uretim-emirleri/disari.ts`
üzerinden kullandığı her fonksiyonun sözleşmesi `uretim-emirleri-sozlesme.test.ts` dosyasındadır. Dışarıdan gelen sürüm
imzayı ya da davranışı değiştirirse bu test kırmızı olur ve kırılan madde aşağıya eklenir.

## uretim-emirleri

1. **Emir çalışma durumu (`emirOzeti`).** #241 ile duraklamış emir istasyonu kilitlemiyor; Arkon `queued`'u artık
   `emirDuraklat`'a eşliyor (#199 2. tur). Çalışmayan emirde TMI çakışmayla reddediyor; Arkon bunu "değişiklik yok"
   sayıyor ama duraklamış ile durmuşu ayıramıyor. Durmuş emir kuyruğa alınınca istasyon kilitli kalıyor.
   İstek: `EmirOzeti`'ne isteğe bağlı `calisma` alanı (`calisiyor`, `durakli`, `durdu`).
2. **Hurda düzeltme komutu.** Arkon'da eksi hurda düzeltmesi var, TMI'de yok, bu yüzden TMI hurda toplamı fazla kalır.
   İstek: `emirSayim` hurdada eksi düzeltmeyi kabul etsin, ya da ayrı bir hurda düzeltme komutu gelsin.
3. **Olay zamanı.** Çevrimdışı gelen sayım TMI'de varış anıyla sayılıyor. İstek: komutlara isteğe bağlı bir
   `olayZamani` parametresi; Arkon kayıt zamanını (sunucunun 12 saat geri, 2 dakika ileri penceresiyle süzdüğü) verir.
4. **Yeni emir modeli (ürün emri + iş emirleri).** Kullanıcı kararı (UE5, 08.10.2026): Arkon paketi İŞ EMRİNE bağlanır;
   operatör iş emrinde çalışır, üretim emri ürün içindir. Bugünkü bağ (`tmi-ue-<id>`, üretim emri kimliği) yeni model gelene
   dek kalır; geçişte paket kimliği iş emri kimliğine bağlanır. İstek: `acikEmirler` ve `emirOzeti` karşılıkları iş emri
   düzeyinde, `emirBaslat`, `emirDevam`, `emirDuraklat`, `emirDurdur`, `emirSayim`, `emirBitir` iş emri kimliğiyle.
   İmzalar değişirse sözleşme testi neyin kırıldığını gösterir.
5. **İsteğe bağlı `emirAdlari(db, idler)`.** #243 listesi emir numarasını yansıma satırındaki paket kimliğinden okuyor.
   Emrin güncel numarası ve parça adı için toplu ad okuması işe yarar. Bu istek acil değil.
6. **Toplu emir durumu (AR2). KAPANDI:** `emirDurumlari(db, idler)` geldi; paket listesi kapanmış emirleri tek sorguda okur. Arkon, TMI'de iptal edilen emrin paketini listeden düşürmek için kayıtlı her `tmi-ue-<id>` paketinde
   ayrı `emirOzeti` çağırıyor (paket sayısı kadar sorgu). İstek: kimlik listesiyle durum dönen tek sorgu (ör. `emirDurumlari(db, idler):
   Map<id, EmirDurumu>`). Gelince Arkon döngüyü kaldırır. Acil değil: paket sayısı bugün küçük.

## kisiler (çekirdek üzerinden)

6. **#248, rol atama uyarısı.** Bir kişiye ikinci bir Arkon rollü TMI rolü verilince kişiler ekranı uyarı göstersin.
   Arkon tek Arkon rolü kabul eder; ikinci rolün yetkisi düşer.
7. **Toplu işlem okuması (3. tur N3). KAPANDI (#297):** `kisilerinIslemleri(db)` geldi; `/arkon/kisiler` kişi başına rol okumasını bıraktı.

## istasyonlar

8. **Toplu iş merkezi kısıtı okuması (3. tur AK).** `/arkon/kisiler` her kişi için ayrı `kisininIzinliIsMerkezleri` çağırıyor
   (kişi sayısı kadar sorgu). İstek: `istasyonlar/disari.ts`'te bütün kişilerin izinli iş merkezlerini tek sorguyla dönen işlev
   (ör. `kisilerinIzinliIsMerkezleri(db): Map<kisiId, isMerkeziId[]>`, kısıtsız kişi haritada yok). Gelince Arkon döngüyü kaldırır.
   Acil değil: liste yalnız `kisiler.oku` olana gidiyor.

## stok

9. **Arkon malzeme isteği stokta istek açar (temizlik planı madde 10, varsayılan). KAPANDI (#469):** Arkon bağlandı (FARK.md "Malzeme isteği stokta"). Bugün operatörün malzeme isteği Arkon'un
   `logi` belgesidir (`kind: 'req'`, serbest metin `item`, `qty`, `note`; depo `logi.handle` ile karşılar). Bağlamada istek stokta
   açılır, Arkon `logi` listesi salt okunur olur ve durumu stoktan gösterir. Uç gelene kadar Arkon değişmez. İstenen `stok/disari.ts`:
   - `malzemeIstegiAc(db, kullanici, { malzemeId, miktar, istasyonId, uretimEmriId, not, kaynakKimligi }): Promise<{ id, no, durum }>`.
     `malzemeId` malzeme kartı no; `miktar` stok miktar metni (ör. `'2.000'`); `uretimEmriId` ve `not` boş olabilir; `kaynakKimligi`
     Arkon belge kimliğidir (`arkon:logi:<id>`) ve tekrar korumasıdır: aynı kimlikle ikinci çağrı ilk kaydı döner. Yetkiyi stok
     denetler (öneri: yeni işlem `stok.istek-ac`, Arkon `logi.req` rollerine verilir; rol x işlem çekirdek isteğidir).
   - `malzemeIstekleri(db, kaynakKimlikleri): Promise<Map<kaynakKimligi, { id, no, durum, miktar, karsilanan, guncelleme }>>`, `durum`
     `acik | hazirlaniyor | teslim | iptal`. Kimliği bilinmeyen haritada yoktur.
   - Kaydın stokta nereye düştüğü (sepet satırı, toplama listesi ya da yeni istek tablosu) stokun kararıdır. VARSAYIM: toplama listesi
     (`stok_toplama`) karşılığı olabilir; ama ad, istasyon ve emir bağı orada yok.
   Arkon tarafı (bağlamada): istek formunda serbest metin yerine `malzemeler/disari.ts` `malzemeAra` seçicisi; mevcut `logi` belgeleri
   silinmez, salt okunur kalır.

## uretim-emirleri (devam)

10. **`acikEmirler` satırında ürün malzeme kartı. KAPANDI (#468):** taslak paket `Emir.malzemeNo`'yu okur; ayrı
    `adimliEmirListesi` okuması kalktı.

11. **İş emrinin kontrol listesi (kart #199 adım 1).** Arkon iş emri paketinin adımları için iş emri bazlı kontrol listesini (`emir_adimi`)
    veren okuma: `isEmriKontrolListesi(db, isEmriIdleri): Promise<Map<isEmriId, { sira, ad, aciklama }[]>>`. Gelene kadar Arkon rotanın
    geçerli talimatını (`rota/disari.ts gecerliTalimat`) kullanır; emre kopyalanan sürümden farklı olabilir (UYUM-BORCU).
12. **`planlanacakIsEmirleri` satırında istasyon (kart #199 adım 1).** Satır kaynağı verir ama iş emrine yazılmış istasyonu vermez; Arkon makine
    kaynağında makinenin bugünkü istasyonunu, kişi kaynağında `isEmriOzeti` ile tek tek okur. Satıra `istasyonId` eklenirse ikisi de kalkar.
13. **Sayım okumaları, anomali panosu için (kart #1149). KAPANDI (#1145, PR #1155; makine kırılımı #1180, Arkon'da #1182):** `aralikAdetleri` ve `sonGirisler` geldi; Arkon istasyon, kişi ve makine üretileni ile giriş yok süresini bunlardan okur.
    Açık kalan: `uretim_sayimi` satırında makine kimliği yok (DOĞRULANDI: sütunlar emir, kişi, istasyon, iş emri). Makine satırının üretileni iş emri sayacından gelir ve önceki gün
    başlamış iş emrinde bilinmez. İstek: `SayimKirilimi`'ne `'makine'` (sayıma makine kimliği yazılması), ya da `isEmriSureOzeti` gibi bir iş emri için günlük net sağlam okuması
    (`isEmriAralikAdedi(db, isEmriId, baslangic, bitis)`). Gelince `servis.ts anomaliler` makine üretilenini ondan okur.
14. **Anomali gün kaydı için iş emri kırılımı ve makine sayımı (kart #1306), uretim-emirleri'nden.**
    a) `SayimKirilimi`'ne `'is_emri'` (`s.is_emri_id`): plan dışı üretim (istasyon sayımından plandaki iş emirlerinin sayımı düşülür) ve beklenenin
       tavanı olarak kalan adet (iş emri adedi - önceki günlerin sağlamı) bununla kurulur. Karşılandı (#1321); Arkon bağladı (AR-AN-9, AR-AN-10).
    b) Makine kırılımı sayımı makineye üretim emri üzerinden bağlıyor (`uretim-emirleri/sorgular.ts` `KIRILIM.makine`, `k.emir_id = s.emir_id`):
       aynı emrin iki iş emri iki makinede aynı anda açıksa sayım ikisine de yazılır. İki tabloda da `is_emri_id` var; eşleme ondan yapılmalı.
    c) `standartSureler` makine ve istasyon kırılımıyla: performans bugün yalnız kişi ve toplamda; makine ve istasyon satırında null.

15. **Makine seçicisi için ayrım okuması (393 d sonrası), uretim-emirleri'nden. KARŞILANDI (UE yaması "makineAyrimlari", bu yamadan önce uygulanır):**
    `makineAyrimlari(db, emirId, makineIdleri)` başlatma ve devam denetimiyle aynı `atanan` ve aynı ayrım kuralını verir; Arkon `GET /arkon/makine-ayrimlari` bunu çağırır,
    kural kopyalanmaz.

16. **Plan sapması okuması (kart 764, 781 a), plan'dan. KARŞILANDI (782 B):**
    `planSapmalari(db, { isEmriIdleri, simdi? })` iş emri başına tahmini bitiş, bitiş kayması, süre oranı, tezgah ve sıra uyumunu verir; Arkon bunu
    `arkon.anomali-bitis-kayma-dk` ve `arkon.anomali-sure-asim-yuzde` eşikleriyle `bitis-kaymasi` ve `sure-asimi` olayına çevirir. Ardıl etkisinin
    tahmini bitişi hâlâ Arkon'da plandaki net süreden kurulur (`tahminiBitis`); plandakine geçmek ayrı karardır. Tezgah ve sıra uyumu olaya çevrilmez.
17. **Zaman olayları için bildirim türleri (kart 764, 769 a), paylasilan/sozlesme/bildirim.ts'ten:** `arkon.gec-giris`, `arkon.gec-teslim`,
    `arkon.ardil-etkisi`, `arkon.teslim-riski`; olay başına bir kez (`kaynakKimlik` = tür + iş emri). KARŞILANDI (bu yama): ek olarak `arkon.plan-sapmasi` ve `arkon.toplu-tutarsiz`; gidiş anı `bildirim` sütununa yazılır.

