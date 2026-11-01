# Motor girdisi: sunucu tablolarından tipli kurulum (1683 b, kart 1715)

Durum: tasarım. Motor (`motor/*.betik`) değişmez; değişen yalnız ona giden girdidir. Kod sözleşmesi `tipler.ts`, fark aracı
`esdegerlik.ts`, düzenin testi `esdegerlik.test.ts`. Bu belge ile kod çelişirse kod geçerlidir; belge güncellenir.

## 1. Bugünkü yol

Planlama sayfası açılınca ve sunucu çözücüsü koşunca girdi tek yoldan kurulur: `plan-girdisi.ts` `planGirdisi` ->
`motor/girdi.betik` `girdiKur`. Üç kaynak birleşir:

1. Kaynak okuması (`planlama-servis.ts` `kaynakOku`): Reçete ve Rota'nın bağlı durumu (`recete-rota/disari.ts` `durumVeEmirler`) ve planın
   ekleri (kapasite, satın alma, fiyat, sipariş bedeli). Sahibi belli, sürümlü, yetkili.
2. Reçete ve Rota kaydı (`recete-rota-motoru-v1`, tek JSON satırı): kaynak okunamazsa ürün, rota ve emir buradan.
3. Planlama çalışması (`...:planlama`, tek JSON satırı): elle girilen ana veri ve sayfa ayarları, varlıkların `plan` alt nesnesinde.

`girdi.betik` `kaynakBirlestir` sunucudan gelen alanı açık çalışmanın üstüne yazar, gelmeyen alan çalışmadaki gibi kalır. Tip denetimi yoktur.

## 2. Hedef ve sınır

- Girdinin sözleşmesi `tipler.ts` `MotorVerisi`'dir (motorun `st.D`'si). Yeni yol bu tipi döndürür; tip derlemede denetlenir.
- Her alanın tek kaynağı vardır (3). Sunucu alanı her okumada sahibinin `disari.ts` okumasından yeniden kurulur; elle alan 1719 ile
  sahibinin tablosuna taşınır; sayfa alanı JSON kaydında kalır.
- `st`'nin üst alanları (`now`, `down`, `gercek`, `bitti`, `locks`, `ekMesai`, `olaylar`, `w`) bu planın dışındadır: `stTamKur` aynı kalır,
  yeni yol yalnız `S.D`'yi kurar. 1720 `st`'yi de eşdeğerlikle sınar.
- Motorun algoritması ve planın sonucu değişmez; değişirse eşdeğerlik kırmızıdır.

## 3. Alan kaynak tablosu

Tam liste kodda: `UST_ALAN_KAYNAKLARI` (üst alan) ve `TEZGAH_ALANLARI`, `KISI_ALANLARI`, `ROTA_ADIMI_ALANLARI`, `MALZEME_ALANLARI`,
`SIPARIS_ALANLARI`, `FASONCU_ALANLARI` (satır alanı). `satisfies` her tip alanının yazılmasını zorlar; ED-02 ve ED-03 motorun ve eski
yolun kurduğu her alanın tabloda olduğunu denetler. Kaynak türleri: sunucu, elle (1719 adayı), karma (sunucudan gelir, elle ezilir ya da
ilk kurulumdan sonra sayfada kalır), sayfa.

| Dilim (kart) | Üst alanlar | Sahip (okuma) | Elle ya da karma satır alanı |
|---|---|---|---|
| Kaynaklar (1716) | vardiyalar, calismaGunleri, tatiller, tezgahlar, personel, devamsizlik | vardiya, istasyonlar, kisiler, finans (maliyet) | tezgâh ücreti (71 b izleme), verim ve vardiya listesi (ilk kurulumdan sonra sayfada), ışıksız, arıza günü, onarım saati; kişinin ayarcılığı (ilk kurulumda görevden); elle devamsızlık satırı |
| Emir ve rota (1717) | urunler, siparisler, opAdet, fasoncular | rota, uretim-emirleri, siparisler, musteri-tedarikci | adımın aile, aparat, FAI, program, fason izni; siparişin serbest saati, gelir ve ceza (sipariş satırı yoksa); fasoncunun kapasite, çıkış günü, çıkış saati, sapma, süre |
| Malzeme (1718) | malzemeler, satinalma | malzemeler, stok, satin-alma | tedarik ve muayene günü; elle satın alma satırı |
| Elle ana veri (1719) | ayarlar, aparatlar, ayarMatrisi, tedarikciler | sahiplik sorusuyla | hepsi elle |
| Sayfa (1720) | meta ve `SAYFA_ALANLARI` | plan (JSON kaydı) | öncelik ağırlığı (siparişin elle çarpanı), plan dengesi, yıllık çözüm |

Elle alanların sahibi (`sahip` sütunu) öneridir; kesin sahip 1719'un sahiplik sorusuyla belli olur.

## 4. Yeni yolun biçimi

1. **Dilim** (`tipler.ts` `Dilim`): `kur(okuma, elle) -> Pick<MotorVerisi, alanlar>`. `kur` saftır (veritabanı ve saat yok, `kurallar`
   kalıbı); okuma ayrı fonksiyondur ve yalnız sahibi modüllerin `disari.ts`'ini çağırır. Dosyalar: `girdi/kaynaklar.ts` (1716),
   `girdi/emirler.ts`, `girdi/rota.ts` (1717), `girdi/malzeme.ts` (1718).
2. **Elle veri** 1719'a kadar açık çalışmanın `plan` alt nesnelerinden okunur: dilim `elle` parametresini eski yolun aynı kimlikle koruduğu
   alanlardan alır. 1719 bu okumayı sahibinin tablosuna çevirir; dilimin `kur`'u değişmez.
3. **Karma alan kuralı** eski yolunkiyle aynıdır (ör. 71 b ücret izleme, 1459 a stok bilinmezse null, 1329 fiyat okunamazsa boş). Kural
   `kur` içinde tek yerde yazılır ve eski yolun kararına atıf yapar.
4. **Açık emrin adımları** (1609 a, değişiklik yönetimi kararı): açık emir plana emrin sabit kopyasıyla girer: adım, tezgâh, süre, bağ
   ve malzeme emrin iş emirlerinden (uretim-emirleri `disari.ts`) okunur, yürürlükteki rotadan değil. Yürürlükteki rota yalnız emri
   açılmamış iş (taslak, teklif denemesi) içindir. Motor ürünün rotasını okuduğu için (siparişin `urun`'u) açık emir motorda emre özgü
   ürün kopyasıyla gösterilir; motor değişmez, kimlik biçimi 1717'de belirlenir (çok katmanlı emrin düğüm siparişi gibi). Eski yol
   yürürlükteki rotayı okur (`girdi.betik` `sunucuKaydi`): bu bilerek kabul edilen farktır, 1717'nin testinde izinli fark listesine 1609 a ile
   girer. VARSAYIM: iş emirleri adımın malzeme satırını da taşır; taşımıyorsa 1717 sorar.
5. **Birleştirme** (1720): `plan-girdisi.ts` dilimleri sırayla kurar, sayfa alanlarını açık çalışmadan taşır, `stTamKur` aynı kalır. Yeni
   yol bayrakla kapalıdır. Öneri (1720'de kesinleşir): bayrak açıkken eski yol da karşılaştırma için koşar ve fark günlüğe yazılır. Eski yol (girdi.betik birleştirme kısmı,
   emirler.betik) kullanıcının "tamam"ından sonra 1723'te silinir.
   İlk parça "1720 kaynak" (yalnız kaynak dilimi): bayrak sistem ayarı `plan.tipli-girdi` (varsayılan kapalı). Açıkken `planlamaGirdisi`
   tipli okumayı da verir; `plan-girdisi.ts` betik bağlamındaki `kaynakBirlestir`'i sarar (`birlestirme.ts`): eski birleştirme önce koşar,
   dilimi okunan kaynak alanları sonra tipli kurulumla değişir. Okunamayan dilimin alanı eski yolunki kalır (1744 a: Reçete ve Rota kaydında
   makine ya da kişi varsa oradan, yoksa açık çalışmadaki gibi, 1742). Tipli tezgâh listesi kimlik ya da istasyon olarak eskisinden ayrılırsa
   ürünlerin adımları eski listeye kurulu olduğundan tezgâhlar eski yolunki kalır. Günlüğe yazan gölge koşu yapılmadı; eşdeğerliği
   `kaynaklar-vt.test.ts` KV-05 ve KV-06 bütün çalışma (S) ve motor girdisi (st) üzerinde sınar. Kayıt yokken açılan boş çalışma
   (`yeniCalisma`) eski yoldadır.
   İkinci parça "1720 değerlendirme": planlama değerlendirmesi ve satış teklifi denemesi kendi iş parçacıklarında koşar. Bayrak açıkken
   `birlestirme.ts` oraya dinamik import ile yüklenir ve aynı sarma kurulur. Teklif yolu da takvim ekiyle okunur (bulgu 4, 1769 a); tipli
   dilim takvimlidir. Tipli dilimle iş parçacığı hata verirse istek eski yolla, kalan sürede yeniden koşar.
   Sınama `degerlendirme-esdegerlik.test.ts`'tedir.

## 5. Eşdeğerlik düzeni

- **ED-01** fark aracı: anahtar sırası fark değildir (jsonb), dizi sırası farktır, undefined ile alanın yokluğu aynıdır; fark yol ile yazılır
  (`tezgahlar[0].ucret`), en çok 50.
- **ED-02** motorun okuduğu üst alanlar davranıştan ölçülür (senaryo motorda planlanıp değerlendirilirken `st.D` okumaları sayılır):
  okunan her alan tipli ya da `SAYFA_ALANLARI`'nda, tipli her alan okunur. Motor yeni alan okursa ya da liste eskirse kırmızı.
- **ED-03** eski yolun sentetik senaryoda kurduğu her üst ve satır alanı kaynak tablosunda; sunucu ve karma alanlar senaryoda dolu.
- **ED-04** eski yol kendisiyle eşdeğer; tek alan sapması tek fark olarak yakalanır.
- **ED-05** eski yolun karma ve elle alanlardaki bugünkü değerleri (yeni yolun hedefi).

Dilim kartlarının testi: (a) saf test: senaryodan dilimin okuma biçimini kurar, `dilimFarki(eskiD, kur(...), alanlar)` boş olmalı; senaryo
ilk dilim kartında `girdi/test-ortak.ts`'e taşınır. (b) Gerçek PostgreSQL testi: aynı tohum verisinde `planlamaGirdisi` (eski yol) ile
dilimin `oku`+`kur`'u karşılaştırılır; dilimin her sunucu alanı en az bir dolu ve bir okunamayan (yetkisiz) durumla. Bilerek kabul edilen
fark yalnız testte adlandırılmış izinli fark listesine, karar numarasıyla girer; sessiz fark yoktur. Gerçek veriyle kıyas seti (1475 a)
kullanıcıda koşar.

Senaryonun kapsamadığı ve dilim kartının eklemesi gerekenler: çok katmanlı emir düğümü (1476-D), başlamış adım, kaynak okunamayan kullanıcı,
dövizli sipariş bedeli, kg fiyatından tahmini malzeme fiyatı.

## 6. Bulgular (düzeltilmedi; davranış değişikliği onay ister)

1. [Muhtemel] Ham malzemenin elle tedarik ve muayene günü kaynak okundukça 0'a döner: `girdi.betik` `sunucuKaydi` motor ayarını açık
   çalışmadan yalnız ürünler için alır (`urun0`), ham malzemede Reçete ve Rota kaydındaki kopyaya bakar; yoksa `rrCevir` 0 yazar. ED-05 bunu
   olduğu gibi tutar. İstemcide bu alanları yazan ekran bulunamadı (arama: `tedarikGun`), alan fiilen hep 0 olabilir. 1719'da sorulur.
2. [Kesin] Tezgâhın verimi ve vardiya listesi yalnız ilk kurulumda istasyondan gelir (`rrCevir` `if (!a)`); sonra istasyonun verimi
   değişse de plan eskisiyle kurulur. Yeni yolda bu "karma" kural olarak korunur; sunucu alanına çevirmek davranış değişikliğidir.
3. [Kesin] Fasoncunun kapasitesi elle girilmemişse 999'dur (`tmiFasoncular`): "sınırsız" ile "bilinmiyor" ayrılmaz. 1719'da sorulur.
4. [Kesin] Satış teklifi denemesinin okumasında takvim eki yoktu: çalışma günleri Vardiya'dan değil Reçete ve Rota kaydındaki kopyadan,
   o da yoksa boş kurulurdu. 1769 a ile düzeltildi; teklif planlama sayfasıyla aynı takvimi görür (`teklif-servisi.test.ts`).

## 7. Doğrulanmadı

- ED-02 yalnız senaryonun koştuğu motor dallarındaki okumaları görür; `SAYFA_ALANLARI` listesi bu yüzden betiklerin `D.<alan>` taramasından
  (elle, tek seferlik) çıkarıldı ve testte tersine denetlenmez.
- Satır alanı tabloları betik taramasından ve eski yolun çıktısından çıkarıldı; motorun satır düzeyinde okuyup eski yolun hiç kurmadığı
  alan (yalnız sayfanın yazdığı) tablolarda eksik olabilir. ED-03 yalnız eski yolun kurduğunu görür; 1716-1718 kendi dilimlerinde tamamlar.
- Sayfanın (istemci) kendi girdi kurulumu bu düzende yoktur: istemcideki planlama girdisi testi ayrıdır.
