import type { AyarSecenegi, AyarTanimi } from '../ayar-tanimi.ts';
import { siklikSecenekleri } from '../okuma-sikligi.ts';

const FIS_GONDERIM_SECENEKLERI: readonly AyarSecenegi[] = [
  { deger: 'kapali', etiket: 'Kapalı' },
  { deger: 'otomatik', etiket: 'Otomatik' },
  { deger: 'elle', etiket: 'Elle' },
];

export const LOGO_AYARLARI = {
  'logo.baglanti': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo bağlantısı',
    aciklama: 'Kurum içindeki Logo köprüsüyle bütün alışverişin ana anahtarı; her gönderim ve okuma ayrıca kendi anahtarıyla açılır. Köprü adresi ve anahtarı sunucunun ortam değişkenlerinde yoksa açık olsa da istek çıkmaz.',
  },
  // Kart gönderimi Logo'ya yazar: öteki yazmalar gibi kendi anahtarıyla açılır, kapalı gelir.
  'logo.malzeme-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: malzeme kartı gönderimi',
    aciklama: 'Açıkken aktif olan malzeme kartları Logo\'da açılır (önce Logo\'da var mı diye bakılır). "Logo bağlantısı" da açık olmalı. Kapalıyken kartlar "bekliyor" olarak birikir, açılınca sırayla gider.',
  },
  // Kullanıcı kararı 08.10.2026: atölyede KDV genellikle %20; varsayılan 20 (LB3 değişti, boş gelmez).
  'logo.kdv-orani': {
    modul: 'logo',
    tur: 'sayi',
    varsayilan: 20,
    enAz: 0,
    enCok: 100,
    ondalik: 2,
    baslik: 'Logo KDV oranı (%)',
    aciklama: 'Logo\'da açılan malzeme kartının alış ve satış KDV oranı; ikisine aynı oran gider.',
  },
  // Kullanıcı kararı KH3 b (09.10.2026): hizmet kartı için ayrı oran; boş varsayılan, boşken VAT_PERC gönderilmez.
  'logo.hizmet-kdv-orani': {
    modul: 'logo',
    tur: 'sayi',
    varsayilan: null,
    enAz: 0,
    enCok: 100,
    ondalik: 2,
    baslik: 'Logo: hizmet KDV oranı (%)',
    aciklama: 'Logo\'da açılan hizmet kartının KDV oranı; boşsa gönderilmez.',
  },
  // Sipariş ve talep gövdesinin JSON alan adları köprü notunda yok (VARSAYIM): kapalı gelir, deneme firmasında denenince açılır.
  'logo.satin-alma-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: satın alma gönderimi',
    aciklama: 'Açıkken onaylı satın alma talepleri talep fişi, verilen siparişler satın alma siparişi olarak Logo\'ya gider; düzenleme, kapatma, iptal ve talep karşılaması da gider. Sipariş bekletme ve talep fişi iptali ayrı anahtarla açılır. "Logo bağlantısı" da açık olmalı. Kapalıyken "bekliyor" olarak birikir.',
  },
  // Kart 3698 (kullanıcı kararı): satın alma siparişinin Logo'daki ORDER_STATUS değeri. Yalnız Logo'da yeni sipariş açılırken uygulanır;
  // ayar değişince yalnız sonraki yeni siparişler etkilenir, Logo'daki siparişlere ve güncelleme gönderimlerine dokunulmaz.
  'logo.satin-alma-siparis-durumu': {
    modul: 'logo',
    tur: 'secim',
    varsayilan: '4',
    secenekler: [
      { deger: '1', etiket: 'Öneri (onay Logo\'da verilir)' },
      { deger: '4', etiket: 'Sevk edilebilir' },
    ],
    baslik: 'Logo satın alma siparişi durumu',
    aciklama: 'CORE\'dan Logo\'da yeni açılan satın alma siparişinin durumu. Öneri: sipariş Logo\'da öneri olarak açılır, onayı Logo\'da verilir. Sevk edilebilir: sipariş doğrudan kesinleşmiş açılır. Yalnız ilk gönderimde uygulanır; Logo\'da açılmış siparişlere ve sonraki güncellemelere dokunulmaz. "Logo bağlantısı" ve "Logo: satın alma gönderimi" da açık olmalı.',
  },
  // Kart 3665 ve 3684: irsaliye yazma kapalı gelir; ölçüm kapısı (irsaliye-yazma-kapisi) tamamlanmadan Logo modülünün komutu da açmaz,
  // bu yüzden genel ayar ucu yazmaz (degistirenEkran).
  'logo.satin-alma-irsaliyesi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: "Logo: satın alma irsaliyesi gönderimi",
    aciklama: "Açıkken mal kabul kayıtları Logo'ya satın alma irsaliyesi olarak gider. Logo etiketleri ölçülmeden açılmaz. \"Logo bağlantısı\" da açık olmalı.",
    degistirenEkran: 'Logo > Irsaliye ayarları',
  },
  'logo.sevk-irsaliyesi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: "Logo: sevk (satış ve konsinye) irsaliyesi gönderimi",
    aciklama: "Açıkken sevk kayıtları Logo'ya toptan satış ya da konsinye çıkış irsaliyesi olarak gider. Logo etiketleri, durum kodu kümesi ve e-irsaliye üreticisi belli olmadan açılmaz. \"Logo bağlantısı\" da açık olmalı.",
    degistirenEkran: 'Logo > Irsaliye ayarları',
  },
  // 3315 c, 3315 a: proje kartı Logo Objects nesnesi gerçek Logo'da ölçülmedi; kapalı gelir. Kapalıyken belgeler proje kodu olmadan gider.
  'logo.proje-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: proje kartı gönderimi',
    aciklama: 'Açıkken aktif projeler Logo\'da aynı kodla açılır (önce Logo\'da var mı diye bakılır, varsa bağlanır) ve belgeler proje koduyla gider; projesi Logo\'ya gitmemiş belge "Proje bekliyor" olarak bekler. Kapalıyken proje gönderilmez, belgeler proje kodu olmadan gider. "Logo bağlantısı" da açık olmalı. Logo yardımcısında proje nesnesi (proje_nesnesi) ölçülüp yazılmadan açmayın: açılırsa projeli belgeler bekler.',
  },
  // Satış teklifi gövdesinin adları köprü notunda (2.6), tekliften sipariş ucu notta (2.7); gerçek köprüyle denenince açılır.
  'logo.satis-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: satış gönderimi',
    aciklama: 'Açıkken Siparişler\'de müşteriye verilen teklif sürümleri Logo\'ya satış teklifi, onaylanan siparişler kabul edilen sürümün teklifinden satış siparişi olarak gider. Teklif kapatma ayrı anahtarla açılır. "Logo bağlantısı" da açık olmalı. Kapalıyken "bekliyor" olarak birikir.',
  },
  // Kullanıcı kararı 12.10.2026 (#777): hizmet kartı hazır dursun, gerçek köprüyle denenince açılır.
  'logo.hizmet-alinan-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: alınan hizmet kartı gönderimi',
    aciklama: 'Açıkken aktif olan alınan hizmet kartları Logo\'ya gönderilir. Logo\'da hizmet için "var mı" okuması yok; sonucu bilinmeyen gönderim tekrarlanmaz, Logo\'da kontrol istenir.',
  },
  'logo.hizmet-verilen-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: verilen hizmet kartı gönderimi',
    aciklama: 'Açıkken aktif olan verilen hizmet kartları Logo\'ya gönderilir. Logo\'da hizmet için "var mı" okuması yok; sonucu bilinmeyen gönderim tekrarlanmaz, Logo\'da kontrol istenir.',
  },
  // Okuma akışları (logo -> TMI): yalnız GET, okunan yalnız saklanır; TMI kayıtlarına işlenmez (UYUM-BORCU "bağlamada kapanacak").
  // Cevap biçimleri köprü notunda doğrulanmadı (VARSAYIM): gerçek köprüyle denenince açılır.
  'logo.mal-kabul-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: mal kabul okuması',
    aciklama: 'Açıkken seçilen sıklıkla Logo\'dan satın alma irsaliyesi satırları okunur ve yalnız saklanır; stoka ya da satın almaya işlenmez. "Logo bağlantısı" da açık olmalı.',
  },
  // 3345 a: alış ve satış irsaliyeleri yalnız okunur ve CORE karşılığıyla gösterilir; Logo'ya yazılmaz, stok değişmez.
  'logo.irsaliye-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: irsaliye okuması',
    aciklama: 'Açıkken seçilen sıklıkla Logo\'dan alış ve satış irsaliyeleri (son 90 gün) okunur ve Logo İrsaliyeleri sayfasında gösterilir; hiçbir kayıt değişmez. "Logo bağlantısı" da açık olmalı.',
  },
  'logo.liste-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: cari ve ambar listesi okuması',
    aciklama: 'Açıkken seçilen sıklıkla (en sık saatte bir) Logo\'dan cari ve ambar listeleri okunur ve önbelleğe (kod, ad) yazılır. "Logo bağlantısı" da açık olmalı.',
  },
  'logo.fatura-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: fatura okuması',
    aciklama: 'Açıkken Logo\'ya gitmiş satın alma siparişlerinin faturaları sırayla okunur ve yalnız saklanır (turda en çok birkaç sipariş). "Logo bağlantısı" da açık olmalı.',
  },
  // 2116, 2118 (kullanıcı onayı 05.11 "ayarlara ekle bağlantılar"): Logo'dan okuma, yalnız GET; varsayılan kapalı.
  'logo.malzeme-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: malzeme kartı okuması',
    aciklama: 'Açıkken Logo\'daki malzeme kartları saatte bir okunur; Malzemeler\'de "Logo\'dan gelenler" listesinde görünür. TMI kartı kendiliğinden değişmez, Logo\'ya yazılmaz. "Logo bağlantısı" da açık olmalı.',
  },
  'logo.stok-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: stok okuması',
    aciklama: 'Açıkken Logo\'daki ambar başına stok miktarı saatte bir okunur; malzeme kartının "Logo\'da" bölümünde CORE miktarıyla yan yana görünür. CORE stoğuna kendiliğinden yazılmaz. "Logo bağlantısı" da açık olmalı.',
  },
  // 3079 a: Logo geçişinin "Kullanılanlar" süzgeci; yalnız GET, varsayılan kapalı. "Şimdi oku" bunu açmaz, açıksa birlikte okur.
  'logo.kullanim-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: malzeme kullanım okuması',
    aciklama: 'Açıkken Logo geçişinde "Şimdi oku" malzeme kartlarının son hareket tarihini ve açık sipariş bilgisini de okur; "Kullanılanlar" süzgeci buradan beslenir. Logo\'ya yazılmaz. "Logo bağlantısı" da açık olmalı.',
  },
  // 3080 a: Logo geçişinde tek kart canlı araması; yalnız GET, varsayılan kapalı.
  'logo.malzeme-aramasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: malzeme araması',
    aciklama: 'Açıkken Logo geçişinde okunan listede olmayan kart Logo\'da kod ya da adla aranabilir (en çok 20 sonuç); bulunan kart listeye eklenir. Yalnız okur, Logo\'ya yazmaz. "Logo bağlantısı" da açık olmalı.',
  },
  // 3384-c a: Logo alış faturası satırlarının CORE kopyası; yalnız GET, varsayılan kapalı. Öneri hesaba girmez.
  'logo.son-alis-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: son alış fiyatı kopyası',
    aciklama: 'Açıkken Logo\'daki alış faturası satırları okunup CORE\'da kopyalanır (önce bütün geçmiş sayfa sayfa, sonra seçilen sıklıkla yenileri). Teklifte ve proje maliyetinde fiyatı bilinmeyen malzemenin yanında "Logo son alış" önerisi olarak görünür, hesaba girmez. Logo yardımcısının bu sürümü gerekir; Logo\'ya yazılmaz. "Logo bağlantısı" da açık olmalı.',
  },
  // 3675 D1: Logo fatura başlığı ve cari hareket aynası; yalnız GET, varsayılan kapalı. Yardımcının bu uçları hazır olmadan açılmaz.
  'logo.fatura-listesi-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: fatura listesi okuması',
    aciklama: 'Açıkken Logo\'daki satış ve alış faturaları ile iadelerin başlığı (numara, tarih, cari, net, KDV, toplam, iptal) okunup CORE\'da kopyalanır. Hiçbir kayıt değişmez, finans belgesine işlenmez. Logo yardımcısının bu sürümü gerekir. "Logo bağlantısı" da açık olmalı.',
  },
  'logo.cari-hareket-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: cari hareket okuması',
    aciklama: 'Açıkken Logo\'daki cari borç ve alacak hareketleri (tahsilat ve ödeme dahil) okunup CORE\'da kopyalanır. Hiçbir kayıt değişmez. Logo yardımcısının bu sürümü gerekir. "Logo bağlantısı" da açık olmalı.',
  },
  'logo.cari-aramasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: cari arama',
    aciklama: 'Açıkken Müşteri-Tedarikçi\'de yeni firma açarken Logo carisi aranıp forma doldurulabilir. Yalnız okur, Logo\'ya yazmaz. "Logo bağlantısı" da açık olmalı.',
  },
  // 3360 a: beş listede "Logo'da ara"; yalnız GET, varsayılan kapalı.
  'logo.belge-aramasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: belge araması',
    aciklama: 'Açıkken Projeler, Satış siparişleri, Teklifler, Satın alma talepleri ve Satın alma siparişleri listelerinde "Logo\'da ara" belgeyi no, cari, proje, açıklama ya da satırdaki malzemeyle Logo\'da arar (son 1 yıl, en çok 50). Yalnız okur, Logo\'ya yazmaz. "Logo bağlantısı" da açık olmalı.',
  },
  // Malzeme fişlerinin ana anahtarı; tür başına gönderim şekli aşağıda (298 a).
  'logo.malzeme-fisi-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: malzeme fişi gönderimi',
    aciklama: 'Açıkken Stok\'taki malzeme fişleri, türünün gönderim şekline göre Logo\'ya gider. Logo\'da fişi numarayla arama ucu yok; sonucu bilinmeyen gönderim tekrarlanmaz, Logo\'da kontrol istenir. "Logo bağlantısı" da açık olmalı.',
  },
  // 298 a (kullanıcı teyidi 24.10.2026): tür başına kapalı, otomatik ya da elle. Sarf ve üretimden giriş otomatik; yeni dört türün Logo
  // tür kodu gerçek Logo'da doğrulanana kadar kapalı.
  'logo.malzeme-fisi-sarf': {
    modul: 'logo', tur: 'secim', varsayilan: 'otomatik', secenekler: FIS_GONDERIM_SECENEKLERI,
    baslik: 'Logo: sarf fişi gönderimi',
    aciklama: 'Otomatik: fiş değişince Logo\'ya gider. Elle: Stok\'taki Malzeme fişleri sayfasında "Gönder" ile gider. Kapalı: gitmez.',
  },
  'logo.malzeme-fisi-uretim-girisi': {
    modul: 'logo', tur: 'secim', varsayilan: 'otomatik', secenekler: FIS_GONDERIM_SECENEKLERI,
    baslik: 'Logo: üretimden giriş fişi gönderimi',
    aciklama: 'Otomatik: fiş değişince Logo\'ya gider. Elle: Stok\'taki Malzeme fişleri sayfasında "Gönder" ile gider. Kapalı: gitmez.',
  },
  'logo.malzeme-fisi-fire': {
    modul: 'logo', tur: 'secim', varsayilan: 'kapali', secenekler: FIS_GONDERIM_SECENEKLERI,
    baslik: 'Logo: fire fişi gönderimi',
    aciklama: 'Kapalıyken fire satırları emrin sarf fişiyle gider. Açarken dikkat: daha önce Logo\'ya gitmiş sarf fişleri fireyi içerir; o emirlerin sarf fişi değişince fire ondan çıkar.',
  },
  'logo.malzeme-fisi-sayim-fazlasi': {
    modul: 'logo', tur: 'secim', varsayilan: 'kapali', secenekler: FIS_GONDERIM_SECENEKLERI,
    baslik: 'Logo: sayım fazlası fişi gönderimi',
    aciklama: 'Sayımda bulunan fazlanın fişi. Logo tür kodu gerçek Logo\'da doğrulanana kadar kapalı tutun.',
  },
  'logo.malzeme-fisi-sayim-eksigi': {
    modul: 'logo', tur: 'secim', varsayilan: 'kapali', secenekler: FIS_GONDERIM_SECENEKLERI,
    baslik: 'Logo: sayım eksiği fişi gönderimi',
    aciklama: 'Sayımda çıkan eksiğin fişi. Logo tür kodu gerçek Logo\'da doğrulanana kadar kapalı tutun.',
  },
  'logo.malzeme-fisi-ambar': {
    modul: 'logo', tur: 'secim', varsayilan: 'kapali', secenekler: FIS_GONDERIM_SECENEKLERI,
    baslik: 'Logo: ambar transfer fişi gönderimi',
    aciklama: 'Logo ambarı farklı depolar arası taşımanın fişi. Logo tür kodu ve ambar alanları gerçek Logo\'da doğrulanana kadar kapalı tutun.',
  },
  'logo.malzeme-guncelleme-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: malzeme adı güncellemesi',
    aciklama: 'Açıkken Logo\'ya gitmiş malzeme ve hizmet kartlarının değişen adı Logo\'ya gönderilir. Kapalıyken güncellemeler "bekliyor" olarak birikir; kart açma etkilenmez. "Logo bağlantısı" da açık olmalı.',
  },
  // 2971 (kullanıcı 11.11.2026 14:47Z): yeni eklenen her Logo işi kendi anahtarıyla, varsayılan kapalı gelir; gönderim anahtarı açık olsa da kendiliğinden başlamaz.
  'logo.siparis-bekletme-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: sipariş bekletme gönderimi',
    aciklama: 'Açıkken satın alma siparişindeki "Logo\'da beklet" ve "Logo\'da serbest bırak" Logo\'daki sipariş durumunu değiştirir. "Logo: satın alma gönderimi" ve "Logo bağlantısı" da açık olmalı.',
  },
  'logo.talep-iptali-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: talep fişi iptali gönderimi',
    aciklama: 'Açıkken CORE\'da iptal edilen talebin Logo\'daki fişi öneriye geri alınır (Logo\'da iptal durumu yok), iptal geri alınınca yeniden onaylanır. "Logo: satın alma gönderimi" ve "Logo bağlantısı" da açık olmalı.',
  },
  'logo.teklif-kapatma-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: satış teklifi kapatma gönderimi',
    aciklama: 'Açıkken reddedilen teklif ve yeni sürümü gelen teklifin eskisi Logo\'da kapanır. "Logo: satış gönderimi" ve "Logo bağlantısı" da açık olmalı.',
  },
  'logo.malzeme-pasif-gonderimi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: silinen kartı Logo\'da kullanım dışı bırakma',
    aciklama: 'Açıkken CORE\'un Logo\'ya gönderdiği malzeme ve hizmet kartı silinince Logo\'daki kart kullanım dışı bırakılır (Logo\'dan silinmez). Kapalıyken böyle kart silinemez; CORE\'da pasife alınabilir. Logo\'dan alınan ya da bağlanan kart her durumda yalnız CORE\'da silinir. "Logo bağlantısı" da açık olmalı.',
  },
  'logo.malzeme-hareketleri-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: malzeme hareketleri okuması',
    aciklama: 'Açıkken malzeme kartında Logo\'daki giriş ve çıkışlar istenince okunur. "Logo bağlantısı" da açık olmalı.',
  },
  'logo.son-alis-fiyatlari-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: son alış fiyatları okuması',
    aciklama: 'Açıkken malzemenin son alış faturası fiyatları istenince okunur; yalnız fiyat görene açılır. "Logo bağlantısı" da açık olmalı.',
  },
  'logo.sozluk-okumasi': {
    modul: 'logo',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Logo: ödeme planı, masraf merkezi, proje, kur okuması',
    aciklama: 'Açıkken formlardaki seçim listeleri ve günün kurları Logo\'dan okunur. "Logo bağlantısı" da açık olmalı.',
  },
  // 3445 a: zamanlanmış okumaların sıklığı (Logo sayfası). Dakikalık okumalar varsayılan 15 dakikaya iner; saatte bir tazelenen
  // listeler saatten sık okunamaz. "Yalnız elle" yalnız "Şimdi oku" ile okur.
  'logo.mal-kabul-sikligi': {
    modul: 'logo', tur: 'secim', varsayilan: '15dk', secenekler: siklikSecenekleri(['elle', '1dk', '5dk', '15dk', '60dk', 'gunluk']),
    baslik: 'Logo: mal kabul okuma sıklığı',
    aciklama: 'Mal kabul satırlarının Logo\'dan ne sıklıkla okunacağı. Yeni kayıt en çok bu süre kadar geç gelir; Logo sayfasındaki "Şimdi oku" hemen okur.',
  },
  'logo.irsaliye-sikligi': {
    modul: 'logo', tur: 'secim', varsayilan: '15dk', secenekler: siklikSecenekleri(['elle', '1dk', '5dk', '15dk', '60dk', 'gunluk']),
    baslik: 'Logo: irsaliye okuma sıklığı',
    aciklama: 'Alış ve satış irsaliyelerinin Logo\'dan ne sıklıkla okunacağı. Yeni kayıt en çok bu süre kadar geç gelir; "Şimdi oku" hemen okur.',
  },
  'logo.fatura-sikligi': {
    modul: 'logo', tur: 'secim', varsayilan: '15dk', secenekler: siklikSecenekleri(['elle', '1dk', '5dk', '15dk', '60dk', 'gunluk']),
    baslik: 'Logo: fatura okuma sıklığı',
    aciklama: 'Siparişe bağlı faturaların Logo\'dan ne sıklıkla okunacağı (bir sipariş en erken saatte bir yeniden okunur). "Şimdi oku" hemen okur.',
  },
  'logo.liste-sikligi': {
    modul: 'logo', tur: 'secim', varsayilan: '60dk', secenekler: siklikSecenekleri(['elle', '60dk', 'gunluk']),
    baslik: 'Logo: cari ve ambar listesi okuma sıklığı',
    aciklama: 'Cari ve ambar listelerinin Logo\'dan ne sıklıkla okunacağı. "Şimdi oku" hemen okur.',
  },
  'logo.malzeme-kodu-sikligi': {
    modul: 'logo', tur: 'secim', varsayilan: '60dk', secenekler: siklikSecenekleri(['elle', '60dk', 'gunluk']),
    baslik: 'Logo: malzeme kodu listesi okuma sıklığı',
    aciklama: 'Logo\'da kullanılan malzeme kodlarının ne sıklıkla okunacağı (yeni stok kodu bunları atlar). "Şimdi oku" hemen okur.',
  },
  'logo.son-alis-sikligi': {
    modul: 'logo', tur: 'secim', varsayilan: '60dk', secenekler: siklikSecenekleri(['elle', '60dk', 'gunluk']),
    baslik: 'Logo: son alış kopyası okuma sıklığı',
    aciklama: 'Logo alış faturası satırlarının ne sıklıkla okunacağı; geçmiş okunurken sayfalar arka arkaya gelir. "Şimdi oku" hemen okur.',
  },
  'logo.fatura-listesi-sikligi': {
    modul: 'logo', tur: 'secim', varsayilan: '60dk', secenekler: siklikSecenekleri(['elle', '60dk', 'gunluk']),
    baslik: 'Logo: fatura listesi okuma sıklığı',
    aciklama: 'Logo fatura başlıklarının ne sıklıkla okunacağı; geçmiş okunurken sayfalar arka arkaya gelir. "Şimdi oku" hemen okur.',
  },
  'logo.cari-hareket-sikligi': {
    modul: 'logo', tur: 'secim', varsayilan: '60dk', secenekler: siklikSecenekleri(['elle', '60dk', 'gunluk']),
    baslik: 'Logo: cari hareket okuma sıklığı',
    aciklama: 'Logo cari hareketlerinin ne sıklıkla okunacağı; geçmiş okunurken sayfalar arka arkaya gelir. "Şimdi oku" hemen okur.',
  },
} as const satisfies Record<string, AyarTanimi>;
