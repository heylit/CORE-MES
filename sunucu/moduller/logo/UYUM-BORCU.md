# UYUM BORCU: logo (kart #207)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI, VARSAYIM, BİLMİYORUM.

## Bağlamada kapanacak
1. Ortam değişkenini çekirdek okur / bu modül `process.env`'den `TMIV2_LOGO_*` okur / `isler.ts`, `ayar.ts` / zamanlanmış iş kalıbı işe ayar verince
   (`isTanimi` ya da `Ayar` genişler) okuma çekirdeğe taşınır. DOĞRULANDI: kalıp `calis(db)` imzasıyla yalnız `db` verir (`sunucu/cekirdek/zamanlayici.ts` `IsTanimi`).
2. Kapandı (borç 258): bütün Logo işleri `txDisi` biçiminde (`isler.ts` `kopruIsi`); tur iki kısa transaction'dır (`servis.ts` `turuKos`): ilki okur,
   niyet ya da red yazar, köprü istekleri transaction dışında beklenir, sonuç ikinci transaction'da yazılır; fatura okumasında her siparişin sonucu
   kendi transaction'ında. `bostaSuresiniUzat` ve `TUR_BOSTA_SURESI_MS` kalktı. Niyet ayrı turda kalır (davranış aynı). Test: LGB-10 (köprü beklenirken
   işin oturumunda transaction yok), LGB-6 ve LGS-22 (sonuç transaction'ı açılamazsa yeniden deneme ikinci kayıt açmaz), LGB-8 (300 ms boşta kesmesi).
3. Kapandı: kart sonucu bildirilirken bu turda gönderilen (kuyruktan okunan) `logoKartTuru` ve `logoBirimSeti` verilir (`servis.ts` `gonder`,
   malzemeler `malzemeLogoSonucu`); tur sırasında değişen karşılık karta yazılmaz. Test: `logo.test.ts` "LGB-8 gönderilen karşılık".
4. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): bağlantı kodu kapsam dışı; aynı kayıt `kurulum/logo-yardimcisi.md` varsayım listesinde (eski `logo-koprusu.md`).
   Eski metin: Köprü cevap biçimi VARSAYIM / "var mı" ve birim seti cevabı, `validate` biçimi / `kurallar.ts` `cevabiYorumla`, `kopru.ts` `birimSetleriniAyikla` /
   kullanıcı kılavuzdan doğrulayınca (LB8) yalnız bu iki dosya değişir.
5. Bağlantı durumu ekranda / son tur bilgisi yalnız `/saglik/ayrinti`'de; açık-kapalı ve değişken durumu `GET /logo/birim-setleri` `baglanti`
   alanında / malzemelerin Logo gönderimi sayfası bu ucu okuyunca görünür (BASKA-MODUL-ISTEKLERI 3).
8. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): karar verildi (LB10 a, 08.10.2026), ayarla çalışıyor (`servis.ts` `logo.kdv-orani`, `logo.hizmet-kdv-orani`).
   Eski metin: KDV / alış ve satış KDV'si tek orandan gider (LB10 a): alış ve satış ayrı gerekirse ayrı karar / `kurallar.ts` `eklemeGovdesi` /
   oran `logo.kdv-orani` ayarından okunur (varsayılan 20, kullanıcı kararı 08.10.2026).
10. Geçersiz karşılıkla düşen kart / karşılık düzeltilince geri çekilme süresi (en çok 30 dk) dolunca yeniden denenir, hemen değil / `logo_giden.sonraki_deneme` /
   malzemeler karşılık değişince haber verirse (olay ya da `disari` işlevi) bekleme sıfırlanır.
11. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): bağlantı kodu kapsam dışı; aynı kayıt `kurulum/logo-yardimcisi.md`'de (eski `logo-koprusu.md` varsayım 12-17). Hizmet "var mı" yolu ADR 0017 ile verildi.
   Eski metin: Hizmet kartı gönderimi ayarla kapalı / alınan ve verilen ayrı anahtar (`kurallar.ts` `HIZMET_AYARI`) / alan adları (`HIZMET_ALANLARI`) DOĞRULANMADI,
   verilen yolu (`/api/SalesService/AddRich`) VARSAYIM / anahtar açılmadan önce deneme firmasında gerçek köprüyle denenir, sonuç `kurulum/logo-koprusu.md`'ye
   yazılır. "Var mı" ucu çıkarsa `kopru.ts` `hizmetVarMiYolu` verilir ve sonucu bilinmeyen gönderim de kendiliğinden yinelenir.

12. Kapandı: satın alma işi `isler.ts`'te satın almanın `disari.ts` işlevleriyle (12 işlev) listede; istek yalnız `logo.satin-alma-gonderimi`
   açıkken çıkar (madde 13 gerçek köprüde doğrulanana kadar kapalı).
13. Sipariş ve talep gövdesinin JSON alan adları DOĞRULANMADI / köprü notu yalnız XML etiketlerini veriyor / `kurallar.ts` `SIPARIS_ALANLARI`,
   `TALEP_ALANLARI`; talep cevabının satır kabı (`fiche|demand|order`), satır listesi ve karşılama listesi biçimi VARSAYIM (`kopru.ts`, `karsilamaKaydiBul`) /
   deneme firmasında gerçek köprüyle denenince yalnız harita değişir; o zamana kadar `logo.satin-alma-gonderimi` kapalı.
14. Sipariş satırının KDV'si ve ambarı / satın almada KDV ve ambar alanı yok; KDV `logo.kdv-orani` (hizmet satırı `logo.hizmet-kdv-orani`), ambar
   gönderilmez (Logo varsayılanı, VARSAYIM) / `siparisGovdesi` / satın alma bu alanları tutarsa gövdeye eklenir. Nakliye ve diğer masraf Logo'ya gitmez.
15. Niyet yazılmış sipariş TMI'de iptal edilirse / belirsiz açma isteği Logo'da sipariş bırakmış olabilir, TMI bilmez / satın alma kuyruğu / iptal kuyruğu
   Logo kayıt numarası olmayan ama `logo_giden` niyeti olan siparişi de numarayla bulup iptal etmeli; bağlamada satın almayla birlikte yazılır.
16. Kapandı: malzeme adı güncellemesi `isler.ts`'te malzemelerin `logoyaGuncellemeGidecekMalzemeler` ve `malzemeLogoGuncellemeSonucu` işlevlerine bağlı;
   istek yalnız `logo.malzeme-guncelleme-gonderimi` (varsayılan kapalı) açıkken çıkar, kapalıyken kuyruk okunmaz ve kart açma etkilenmez.
17. "Logo'da kontrol edin" hatasıyla duran talep ya da hizmet kartı / kullanıcı Logo'daki kaydın numarasını elle bağlayamıyor / sahibin ekranı /
   bağlamada sahip modül "Logo kayıt no gir" ya da "yeniden gönder" işlemi verir; logo tarafı niyeti siler.

18. Kapandı (kart #941): satış işi portalın dört işleviyle `isler.ts` listesinde; portal firması finans firmasına firma koduyla bağlanır,
   kod yoksa `firmaId` boş gelir ve teklif "Firmanın Logo cari kodu yok" olur.
19. Satış teklifi cevabının satır kabı ve `GET /api/SalesOffer/{ref}` biçimi VARSAYIM; `SalesOffer/customer` bulamayınca 404 VARSAYIM / `kopru.ts` /
   gerçek köprüyle denenince yalnız bu dosya değişir; o zamana kadar `logo.satis-gonderimi` kapalı.

20. Mal kabul satırları yalnız saklanır / `logo_mal_kabul_satiri` stoka, satın almaya ya da başka modüle işlenmez; sipariş satırına bağ (`siparis_satir_ref`)
   yabancı anahtarsız / `servis.ts` `malKabulTuru` / bağlamada stok mal kabul akışı ve satın alma siparişi satırı tabloyu okur ya da kendi kaydına işler (ayrı göç).
21. Okuma uçlarının cevap biçimi DOĞRULANMADI (VARSAYIM) / `receipts`, `Arp/list`, `Lookup/warehouses`, `{no}/invoices` cevabı dizi ya da zarfın `data|items|lines|
   receipts|invoices|results|list` alanında dizi; alan adları `kurallar.ts` `malKabulSatirlariniAyikla`, `listeKayitlariniAyikla`, `faturalariAyikla`; tam satır `ham` jsonb /
   gerçek köprüyle denenince yalnız ayıklayıcılar değişir; o zamana kadar üç okuma anahtarı kapalı. Ayıklanamayan cevap imleci ilerletmez, satır yazmaz.
22. Cari ve ambar yalnız önbellek / `logo_cari`, `logo_ambar` (kod, ad, son okuma); firma kartı, `logoCariKodu` ve depo seçimi bunlardan beslenmez / bağlamada
   musteri-tedarikci cari kodunu, stok ambar seçimini bu önbellekten doğrular (ORTAKLIK-logo.md).
23. Fatura okuması siparişi numarasıyla arar, numara `logo_siparis_no` tablosundadır / `logo_giden` yalnız sipariş kimliğini ve Logo kaydını tutar, numarayı değil;
   numara siparişin Logo'da açıldığı turda yazılır, bu değişiklikten önce açılmış sipariş okunmaz (satın alma işi zaten bağlı değil) / satın alma bağlanınca
   gerekirse eski siparişler için numara bir kez doldurulur. `fatura` akışı bu yüzden `baglanmadi`. Fatura yalnız saklanır; Logo'ya fatura ya da irsaliye yazılmaz.
24. KAPANDI (335, 20.10.2026): kaynak bağlandı. Biten emir `emirBittiYansit` (bağ `sunucu/kablolama.ts`) ile iki fişi (`sarf-fisi`, `uretim-girisi`, belge no
   emir kimliği) `logo_malzeme_fisi_giden`'e bir kez yazar; satırlar gönderimde stoğun `emirMalzemeFisleri` ve üretim emirlerinin `emirHurdalari`
   işlevlerinden okunur (`servis.ts` `emirMalzemeFisiKaynagi`, `kurallar.ts` `emirMalzemeFisi`). Açık kalan VARSAYIM'lar 27'de.
25. Kapandı: hazırlık ekranı Logo'dan TMI'ya okuma akışında sayıyı "okundu" diye yazar (`gonderilen` okunan kayıt sayısıdır, sözleşme değişmedi).
26. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): tek sunucu; süreç içi sıra var (`isler.ts` `sirali`).
   Eski metin: İşler tek köprü sırasını paylaşır / `isler.ts` `sirali` aynı süreçte köprüye iki isteği aynı anda göndermez (tek COM oturumu); süreçler arası sıra yoktur
   (tek sunucu) / zamanlayıcı ortak kilit verirse oraya taşınır.

27. Malzeme fişi (335) VARSAYIM'ları / emir bitince fiş kuyruğa yalnız `logo.baglanti` ve `logo.malzeme-fisi-gonderimi` açıkken girer (kapalıyken biten emrin fişi sonradan
   gitmez, Logo'ya elle girilmiş fişler çiftlenmez); fiş numarası emir numarasıdır, iki fiş türünde aynı (Logo'da ayrı numaralanır sayıldı), 16 karakteri
   aşan numara gövde kuralında reddedilir; tarih ve saat emrin bittiği an (İstanbul); proje kodu gönderilmez; hurda girişte ayrı "Hurda" satırıdır,
   sarftaki fire stoğun sarfının içindedir; satırı olmayan fiş kuyruktan düşer (denenmiş ya da niyetli fiş sonradan boşalırsa düşmez, gönderilmez, hazırlık sayısında
   bekler); kartı ya da birimi olmayan satır fişi reddettirir; satırın kartı
   Logo'ya gitmiş mi bakılmaz (Logo reddeder, geri çekilmeyle yeniden denenir). Fiş gittikten sonraki düzeltme (sayım, hurda) Logo'ya gitmez;
   istenirse düzeltme fişi ayrı karar. Sonuç yalnız giden kutusundadır, stok hareketine yazılmaz (`stok_hareketi_logo` boş kalır) / bağlamada sahiple.
28. Malzeme kartı Açıklama 1-3 (334 a) / `name2`, `name3`, `name4` alan adları ve Logo'daki karşılığı (NAME2-NAME4) DOĞRULANMADI (`KART_ACIKLAMA_ALANLARI`);
   uzunluk kırpılmaz, Logo sınırı BİLMİYORUM. Yalnız kart açılışında gider; ad güncellemesi (`UpdateRich`) açıklamaları taşımaz / gerçek köprüde doğrulanınca.

## Sonra
6. `logo_giden.belge_no` yabancı anahtar taşımaz (belge türü çok olacak); malzeme kartı silinmez (tetikleyici). Belge türü başına ayrı sütun ve
   yabancı anahtar istenirse ayrı göç.
7. Talep fişi gittikten sonraki değişiklikler Logo'ya gitmez: sonradan eklenen kalem, karşılama miktarı değişikliği, gönderilmiş fişin iptali
   (satın alma #790 bunları tutmuyor). İstenirse talep için düzenleme ve iptal kuyruğu, siparişteki gibi ayrı karar.
8. Satış: teklifin bütün satırları siparişe dönünce teklif durumunu 4 yazmak (not 2.7: Logo kendisi değiştirmez), teklif ve satış siparişi
   düzenleme (`PUT /api/SalesOffer/{ref}`, `/order/{ref}`) ve silme yazılmadı; istenirse ayrı karar.

## Ekranı olmayan uçlar (kullanıcı kararı 139 a, 23.10.2026) - bağlamada kapanacak
- Uçlar kalır, bağlamada ekrana bağlanır. Hiçbir ekran çağırmıyor (DOĞRULANDI, `degerlendirme/sistem-uyum/rapor.md` bulgu 8): `GET /logo/birim-setleri`, `POST /logo/birim-setleri/ekle`, `POST /logo/birim-setleri/:kod/kaldir`. Birimin sahibi malzemeler (144 a); bu uçlar malzemelerin Logo ekranına bağlanacak.
