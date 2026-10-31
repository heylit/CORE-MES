import type { GorunumKodu } from '../tipler.ts';

// Yardım panelinin metinleri (prototip HELP, GLOS, RUBRIC). Metin prototipteki gibidir; örnekler uydurmadır, firma verisi değildir.

// a: ne işe yarar; s: nasıl kullanılır; e: örnek ("rubric" puanlama örneğini gösterir); m: sık yapılan hata.
export interface SayfaYardimi { a: string; s: readonly string[]; e: string; m: string }

// Bugün'ün kendi yardımı yoktur; yardımı olmayan görünüm Genel bakış'ın yardımını gösterir (prototip HELP[v]||HELP.dash).
export const SAYFA_YARDIMI: Partial<Record<GorunumKodu, SayfaYardimi>> = {
  dash: {
    a: 'Seçili programın denetimine ne kadar hazır olduğunuzu ve sıradaki adımları tek ekranda gösterir.',
    s: [
      'Denetim tarihini girin; araç hangi hazırlık aşamasında olmanız gerektiğini hesaplar.',
      'Simülasyonu yapın (ilk kez ise 10 soruluk hızlı turla başlayın); hazırlık puanı ve madde bazında radar dolar.',
      '"Sıradaki adımlar" listesindeki maddelerden başlayın; en kritik açıklar en üsttedir.',
      'Puan hedefe (%85) ulaşana ve majör risk kalmayana kadar açıkları kapatın.',
    ],
    e: 'Denetiminiz 20 Kasım\'da, bugün 1 Ekim. Araç sizi "4–6 hafta önce" aşamasına koyar. Simülasyonda %72 aldıysanız durum "Dikkat" olur ve en zayıf maddeler (örneğin 7.1.5 kalibrasyon) sıradaki adımlarda en üstte görünür.',
    m: 'Puanı yükseltmek için soruları iyimser puanlamak. Denetçi sizin puanınıza değil kanıta bakar.',
  },
  rehber: {
    a: 'Denetimin nasıl yürüdüğünü, her maddede denetçinin neye baktığını ve bulgu türlerini öğrenmek için.',
    s: [
      'Üstteki aşamalara tıklayarak denetim yolculuğunu okuyun.',
      'Çarkta bir maddeye tıklayın: "Denetçi neye bakar" ve "Sık görülen bulgular" görünür.',
      '"Bu maddenin sorularını çöz" ile o maddeyi hemen simülasyonda deneyin.',
      'Zorunlu dokümanlar listesinde elinizde olanları işaretleyin.',
    ],
    e: '8. madde (Operasyon) seçiliyken sık bulgular arasında "Sahada eski revizyon resim" görürsünüz. Atölyede üç tezgâhtaki resimleri doküman ana listesiyle karşılaştırmak, denetçinin yapacağı kontrolün birebir provasıdır.',
    m: 'Rehberi okuyup ölçmeden geçmek. Açıklar ancak simülasyonda puan verince ortaya çıkar.',
  },
  sim: {
    a: 'Denetçinin soracağı her soruyu puanlayarak hazırlığınızı ölçer. Hazırlık puanı, rapor ve aksiyon planı buradaki cevaplardan oluşur.',
    s: [
      'Soruyu okuyun ve kendinize sorun: "Bunu şimdi kayıtla gösterebilir miyim?"',
      'Gösterebildiğiniz kanıtları işaretleyin; araç bir puan önerir.',
      '0–3 arası puan verin (aşağıdaki örnekli puanlama rehberine bakın).',
      'Eksik varsa not alanına sorumlu, kanıtın yeri ve termini yazın.',
      'İlk kez yapıyorsanız 10 soruluk hızlı turla başlayın; tam denetimi parça parça bitirebilirsiniz.',
    ],
    e: 'rubric',
    m: '"Yapıyoruz ama kaydı yok" durumuna 2 vermek. Kayıt yoksa denetçi açısından yapılmamıştır; en fazla 1 verin.',
  },
  kontrol: {
    a: 'Simülasyonun düzenli, kısa hâli. Ayda bir 10 soruluk turla puanınızı güncel tutar; sistemin "sertifika alındı, unutuldu" durumuna düşmesini önler.',
    s: [
      'Sıklığı ve tur büyüklüğünü seçin (önerilen: ayda bir, 10 soru).',
      '"Turu başlat" deyin; araç en uzun süredir bakılmayan ve zayıf soruları seçer.',
      'Puanlayıp turu tamamlayın; not otomatik verilir.',
      'Not eğilimini ve "Son turda gerileyenler" listesini izleyin.',
      'Takvime tekrarlayan hatırlatma ekleyin.',
    ],
    e: 'Ocak turunda 7.5 doküman kontrolüne 3, nisanda 1 verdiniz. "Son turda gerileyenler" bunu gösterir: belki yeni başlayan bir operatör eski revizyonla çalışıyordur. Bunu denetimden önce yakalamak öz değerlendirmenin asıl amacıdır.',
    m: 'Her turu aynı kişiye yaptırmak. Süreç sahibi kendi sürecine yüksek not verme eğilimindedir; değerlendireni dönüşümlü seçin.',
  },
  hazirlik: {
    a: 'Denetim tarihinden geriye doğru hafta hafta ne yapılacağını planlar.',
    s: [
      'Denetim tarihini girin; görevler haftalara kendiliğinden dağılır.',
      'Bu haftanın görevlerini yaptıkça işaretleyin; geçmiş haftalardan kalanlar üstte görünür.',
      'Kendi görevlerinizi ilgili haftaya ekleyin.',
      'Haftalık toplantıları takvime ekleyip gündem olarak kullanın.',
    ],
    e: 'Denetime 6 hafta var. "Kayıtlar, kalibrasyon, yetkinlik" haftasında "Kalibrasyon planı ve etiketleri kontrol et" görevi düşer. Görevi yapınca işaretleyin ve simülasyonda 7.1.5\'i yeniden puanlayın.',
    m: 'Her şeyi son haftaya bırakmak. Kayıtların birikmesi ve DÖF\'lerin etkinliğinin görülmesi zaman ister.',
  },
  sorular: {
    a: 'Çalışanları, denetçinin onlara soracağı sorulara hazırlar. Puan vermez; sözlü provadır.',
    s: [
      'Departmanı seçin.',
      'Kartı ilgili çalışana okuyun ve cevabını dinleyin.',
      'Kartı çevirip iyi cevapla karşılaştırın.',
      '"Hazırım" ya da "Tekrar çalış" olarak işaretleyin.',
    ],
    e: 'Kart: "Kalite politikasını kendi işinizle nasıl ilişkilendiriyorsunuz?" Zayıf cevap: politikayı ezberden okumak. İyi cevap: "Politikamızda zamanında ve doğru teslimat var; ben ilk parçayı ölçtürmeden seriye geçmiyorum, böylece hurdayı ve gecikmeyi önlüyorum."',
    m: 'Çalışana ezber cevap öğretmek. Denetçi takip sorusu sorar; çalışanın kendi işini kendi cümleleriyle anlatabilmesi gerekir.',
  },
  rapor: {
    a: 'Programın puanını, zayıf maddeleri ve denetimden önce kapatılacak açıkları gösterir; yönetime sunulabilir.',
    s: [
      'Durumu ve puanı okuyun; majör risk varsa önce ona odaklanın.',
      'Isı haritasındaki kırmızı hücrelere tıklayarak ilgili soruya gidin.',
      'Aksiyon planındaki açıkları kapattıkça işaretleyin.',
      'Raporu kopyalayın ya da yazdırın.',
    ],
    e: 'Rapor "2 majör risk" gösteriyorsa (örneğin iç denetim hiç yapılmamış), puan %80 olsa bile durum "Hazır değil" olur. Tek bir majör bulgu belgelendirmeyi durdurabilir.',
    m: 'Yalnızca puana bakmak. Majör riskler toplam puandan daha önemlidir.',
  },
  kys: {
    a: 'Firmanın kalite yönetim sistemini kurmak ve yaşatmak için: yol haritası, yapı taşları, süreçler, şemalar, dokümanlar, görevler ve rutinler.',
    s: [
      '"Yol haritası" sekmesiyle başlayın; sıradaki aşama vurgulanır.',
      'Yapı taşlarının durumunu (yok / taslak / yürürlükte) işaretleyin.',
      'Süreçlerinizi ve göstergelerinizi tanımlayın; aylık değer girin.',
      'Doküman üreticide prosedür taslaklarını oluşturup firmanıza uyarlayın, sonra yürürlüğe alın.',
      'Rutin görevleri her dönem işaretleyin.',
    ],
    e: '"Kalite hedefleri" yapı taşı için doküman üreticide "Kalite hedefleri ve izleme tablosu"nu açın: süreç göstergeleriniz tabloya kendiliğinden gelir. Hedefleri gözden geçirip "Yürürlüğe al" deyince yapı taşı yeşile döner ve yol haritasındaki adım tamamlanır.',
    m: 'Doküman üretip uygulamamak. Denetçi yazılanın sahada yapılıp yapılmadığına bakar.',
  },
  kalib: {
    a: 'Ölçüm cihazlarının kalibrasyon durumunu, geri sayımını ve geçmişini takip eder (ISO 9001 madde 7.1.5).',
    s: [
      'Cihazları tek tek ekleyin ya da Excel listenizi yapıştırın.',
      'Son kalibrasyon tarihini ve periyodu girin; sonraki tarih hesaplanır.',
      'Kalibrasyon yapılınca "Kalibre edildi" ile tarihi, sonucu ve sertifikayı kaydedin.',
      'Takvim görünümünden ayın planını görün; tarihleri takviminize ekleyin.',
    ],
    e: 'Kumpas OC-001: son kalibrasyon 10.10.2025, periyot 12 ay, yani sonraki 10.10.2026. 30 gün kala turuncu, 7 gün kala kırmızı olur. Laboratuvardan "uygun değil" gelirse cihaz kullanım dışına alınır ve son uygun kalibrasyondan beri bu cihazla ölçülen ürünler için geriye dönük değerlendirme hatırlatılır.',
    m: 'Operatörlerin kişisel ölçü aletlerini listeye almamak. Ürün kabulünde kullanılan her cihaz takipte olmalıdır.',
  },
  takvim: {
    a: 'Tüm firmaların ve programların denetimlerini, son günlerini ve sonraki denetimleri planlar.',
    s: [
      '"Yeni denetim" ile tarih ve türü girin.',
      'Denetim bitince "Sonucu gir" ile bulguları maddeleriyle birlikte kaydedin.',
      'Araç sonraki denetim için tarih önerir; tek tıkla ekleyin.',
      '"Takvime ekle" ile Outlook, Google veya telefon takviminize aktarın.',
    ],
    e: '14 Ekim\'deki 1. gözetimde 2 minör bulgu girdiniz. Araç DÖF planının son gününü takvime ekler ve 2. gözetim için yaklaşık 12 ay sonrasını önerir.',
    m: 'Denetim sonucunu girmemek. Performans grafiği ve kör nokta analizi bu verilerle çalışır.',
  },
  perf: {
    a: 'İç ve dış denetimleri, EYDEP sonuçlarını ve öz değerlendirmeleri tek grafikte karşılaştırır; kör noktaları bulur.',
    s: [
      'Program, kaynak ve dönem filtrelerini seçin.',
      'Zaman grafiğinde üst şeritte puanları, alt şeritte bulguları izleyin.',
      'Madde tablosunda "Kör nokta" ve "Tekrarlayan" sinyallerine bakın.',
    ],
    e: '7. madde için öz değerlendirmede %100 verdiniz ama iç denetimde 1, dış denetimde 2 minör bulgu var. Tablo bunu "Kör nokta" olarak işaretler: o maddede kendinizi daha sıkı puanlamanız gerekir.',
    m: 'Bulguları madde belirtmeden girmek. Maddesiz bulgular madde tablosuna yansımaz.',
  },
  icd: {
    a: 'ISO 9001 madde 9.2\'nin istediği planlı iç denetimleri yürütmek ve denetimden sonra kuralların sahada sürdüğünü kısa saha turlarıyla kontrol etmek için.',
    s: [
      'Yıllık plan: "Otomatik planla" ile süreçleri aylara dağıtın; ana süreçler yılda iki kez, diğerleri bir kez.',
      'Her süreç için denetçi atayın; denetçi kendi sürecini denetleyemez, sistem uyarır.',
      'Ayı gelen denetimi başlatın: 10 genel süreç maddesi ve sürece özgü ISO soruları gelir. Her maddeye Uygun, Gözlem, Minör, Majör ya da N/A verin, bulgu notu yazın.',
      'Tamamlayınca bulgular takvime ve Performans\'a işlenir; majör ve minör bulgular için DÖF son günü oluşur.',
      'Saha kontrolleri: doküman turu, karantina alanı, kalibrasyon etiketleri gibi 4 maddelik kısa turlar. Uygun olmayan maddeyi düzeltince işaretleyin.',
    ],
    e: 'Üretim süreci Mart ve Eylül\'de planlı. Eylül\'de denetim başlatıldı; 7.5 maddesinde CNC-2\'de rev.B resim bulundu, "Minör" ve not girildi. Tamamlanınca takvimde DÖF planı son günü oluştu, Performans sayfasında 7. madde için bir iç denetim bulgusu göründü.',
    m: 'İç denetimi kâğıt üzerinde yapıp her maddeye "Uygun" vermek. Bulgusuz geçen iç denetimler dış denetçiye inandırıcı gelmez.',
  },
  profil: {
    a: 'Firma bilgileri, birden fazla firma profili, yedekleme ve sıfırlama.',
    s: [
      'Firma bilgilerini girin; dokümanlara ve raporlara işlenir.',
      'Her firma veya saha için ayrı profil açın; profiller birbirini görmez.',
      'Düzenli olarak "Tüm profilleri yedekle" ile .json yedek alın.',
      'Başka bilgisayarda aynı HTML dosyasını açıp "Yedek yükle" deyin.',
    ],
    e: 'Danışmansanız her müşteri için ayrı profil açın. Müşteri ziyaretinden önce yedek alın; dosyayı kendi bilgisayarınızda da açabilirsiniz.',
    m: 'Tarayıcı geçmişini temizlemeden önce yedek almamak. Veriler tarayıcıda saklanır.',
  },
};

// [terim, tanım, örnek]
export const TERIMLER: readonly (readonly [string, string, string])[] = [
  ['Majör bulgu', 'Bir şartın hiç karşılanmaması ya da sistemin o noktada çökmesi. Belgelendirmeyi durdurabilir.', 'İç denetim hiç yapılmamış; ya da kalibrasyonu olmayan cihazlarla ürün kabul ediliyor.'],
  ['Minör bulgu', 'Şart karşılanıyor ama tekil bir eksiklik var. Düzeltici faaliyet planı istenir.', '15 cihazdan birinin kalibrasyon süresi 10 gün geçmiş.'],
  ['Gözlem / iyileştirme fırsatı', 'Uygunsuzluk değil; ileride soruna dönüşebilecek bir nokta.', 'Hedefler ölçülüyor ama trend analizi yapılmıyor.'],
  ['DÖF (düzeltici faaliyet)', 'Uygunsuzluğun kök nedenini ortadan kaldırıp tekrarlanmasını önleyen faaliyet.', '"Sahada eski revizyon resim" bulgusunun kök nedeni dağıtım kuralının olmaması; faaliyet: dağıtım ve toplama kuralı yazmak.'],
  ['Düzeltme', 'Uygunsuzluğun kendisini gidermek; kök nedene dokunmaz.', 'Eski revizyon resmi sahadan toplamak.'],
  ['Kök neden', 'Sorunun asıl sebebi. "5 Neden" ya da balık kılçığı ile bulunur. "Operatör hatası" kök neden kabul edilmez; neden hata yapıldığı sorulur.', 'Ölçü hatası → neden? Kumpas yanlış → neden? Kalibrasyonu geçmiş → neden? Takip listesi yok.'],
  ['YGG (yönetimin gözden geçirmesi)', 'Üst yönetimin KYS\'yi en az yılda bir, standardın saydığı girdilerle değerlendirdiği toplantı.', 'Girdiler: denetim sonuçları, müşteri memnuniyeti, hedefler, tedarikçi performansı. Çıktılar: kararlar, kaynak, iyileştirme.'],
  ['Dokümante bilgi', 'Standardın yazılı olmasını istediği bilgi. Kurallar "sürdürülür" (doküman), kanıtlar "saklanır" (kayıt).', 'Kalite politikası bir doküman; imzalı muayene formu bir kayıttır.'],
  ['Kayıt', 'Bir işin yapıldığının kanıtı. Denetçi için kayıt yoksa iş yapılmamıştır.', 'Tarihli ve imzalı ilk ürün muayene raporu.'],
  ['Kapsam', 'KYS\'nin hangi ürün, saha ve faaliyetleri kapsadığı. Sertifikada aynen yazar.', '"Savunma ve havacılık sanayine yönelik hassas talaşlı imalat parçalarının üretimi"'],
  ['Uygulanamaz şart', 'Firmanın faaliyetine uymayan madde; gerekçesi yazılı olmalı.', 'Müşteri resmine göre üreten fason firma için 8.3 tasarım.'],
  ['Süreç sahibi', 'Bir sürecin sonuçlarından ve göstergesinden sorumlu kişi. Denetçi süreci ona sorar.', 'Üretim sürecinin sahibi: üretim müdürü.'],
  ['Kaplumbağa diyagramı', 'Bir süreci altı soruyla özetleyen şema: girdi, çıktı, ne ile, kim ile, nasıl, ne kadar.', 'Üretim: girdi iş emri; çıktı uygun ürün; ne ile CNC; kim ile yetkin operatör; nasıl talimat; ne kadar hurda oranı.'],
  ['PUKÖ', 'Planla, Uygula, Kontrol et, Önlem al döngüsü; her sürece ve KYS\'nin bütününe uygulanır.', 'Hedef koy, uygula, aylık ölç, sapmada aksiyon al.'],
  ['Risk temelli düşünme', 'Ters gidebilecekleri önceden düşünüp önlem almak.', 'Tek tedarikçili kritik malzeme için ikinci bir tedarikçiyi onaylamak.'],
  ['Kalibrasyon', 'Ölçüm cihazının doğruluğunun, ulusal veya uluslararası standartlara izlenebilir bir referansla belirlenmesi.', 'Kumpasın akredite laboratuvarda mastar bloklarıyla karşılaştırılması.'],
  ['Geriye dönük değerlendirme', 'Kalibrasyonda uygun çıkmayan cihazla daha önce ölçülmüş ürünlerin etkilenip etkilenmediğinin incelenmesi (7.1.5.2).', 'Mikrometre 0,03 mm sapmalı çıktı; son 6 ayda bu cihazla kabul edilen dar toleranslı parçalar gözden geçirilir.'],
  ['İzlenebilirlik', 'Bir ürünün hammadde sertifikasına, iş emrine, operatöre ve muayene kaydına kadar geriye doğru takip edilebilmesi.', 'Seri no 2417 → iş emri 3381 → malzeme lotu A12 → sertifika.'],
  ['Hazırlık puanı', 'Simülasyon cevaplarınızın, soruların önemine göre ağırlıklı ortalaması. Hedef %85; majör risk varsa puan yüksek olsa da durum "hazır değil" olur.', 'Kritik bir soruya 0 vermek, birkaç temel soruya 0 vermekten çok daha fazla düşürür.'],
  ['Kör nokta', 'Kendinize yüksek not verdiğiniz ama denetimde bulgu çıkan madde.', 'Öz değerlendirmede 7. maddeye %100, ama dış denetimde 2 minör bulgu.'],
  ['Kontrollü kopya', 'Dağıtımı izlenen, güncelliği garanti edilen basılı doküman. Kontrolsüz kopya ise yalnız bilgi amaçlıdır.', 'Tezgâh başındaki talimat "kontrollü kopya" damgalı ve ana listede kayıtlı.'],
  ['Aşama 1 / Aşama 2', 'İlk belgelendirmede önce dokümantasyon ve hazırlık (Aşama 1), sonra sahada uygulama (Aşama 2) denetlenir.', 'Aşama 1\'de kapsam ve iç denetim kaydı istenir; Aşama 2\'de atölyede uygulama izlenir.'],
  ['Gözetim denetimi', 'Belgelendirmeden sonra yılda bir yapılan, sistemin sürdüğünü doğrulayan denetim.', 'Sertifika Mart 2026\'da verildiyse 1. gözetim Mart 2027 civarı.'],
  ['Yeniden belgelendirme', 'Sertifika süresi (genellikle 3 yıl) dolmadan yapılan kapsamlı denetim.', '3 yıllık döngünün sonunda tüm maddeler yeniden denetlenir.'],
  ['FAI (ilk ürün muayenesi)', 'AS9100\'de yeni parça veya değişiklikte, ilk üretilen parçanın tüm özelliklerinin AS9102 formatında doğrulanması.', 'Resim revizyonu C\'den D\'ye geçti; D\'ye göre ilk parçanın tüm ölçüleri raporlanır.'],
  ['FOD', 'Yabancı madde hasarı. Havacılıkta ürüne giren talaş, vida, bez gibi yabancı maddelerin önlenmesi.', 'Montaj alanında takım sayım panosu ve vardiya sonu kontrolü.'],
  ['Konfigürasyon yönetimi', 'Ürünün değişiklikler boyunca onaylı tasarım bilgisiyle tutarlı kalmasını sağlamak.', 'Müşteri resmi değişince NC programı, kontrol planı ve fikstürün de güncellenmesi.'],
  ['Sahte parça', 'Orijinal olmayan ya da izinsiz değiştirilmiş parça. AS9100 önleme süreci ister.', 'Yetkisiz bir distribütörden alınan bağlantı elemanı.'],
  ['OASIS', 'IAQG\'nin AS9100 sertifikalarını ve denetim sonuçlarını tuttuğu veri tabanı.', 'Müşteriniz sertifikanızı ve bulgularınızı OASIS\'ten görebilir.'],
  ['EYDEP', 'SSB\'nin savunma sanayi firmalarının endüstriyel yetkinliğini değerlendirdiği program. Sonuç A, B veya C seviyesidir.', 'Üretim alanında 81 puan alan firma B seviye sertifika alır.'],
  ['YETEN', 'SSB\'nin yetenek envanteri. EYDEP başvurusunun ön koşulu.', 'Tezgâh listesi ve yetenekler YETEN\'de güncel olmalı.'],
];

// Puanlama örneği: [puan, ad, açıklama].
export const PUANLAMA_ORNEGI = {
  q: '7.1.5 · Ölçüm cihazlarınız kalibre mi, nasıl takip ediyorsunuz?',
  rows: [
    ['0', 'Kanıt yok', 'Cihaz listesi yok, kalibrasyon takibi yapılmıyor ya da gösterilemiyor.'],
    ['1', 'Kısmen', 'Liste var ama iki kumpasın süresi geçmiş ve hâlâ kullanılıyor. Ya da "yaptırıyoruz" deniyor ama sertifika bulunamıyor.'],
    ['2', 'Uygun', 'Tüm cihazlar kalibre ve etiketli; ama uygun çıkmayan cihaz için geriye dönük değerlendirme kuralı yok.'],
    ['3', 'Tam uygun', 'Liste güncel, tüm cihazlar kalibre ve etiketli, sertifikalar kabul kriterine göre değerlendirilmiş; geçen yıl uygun çıkmayan cihaz için geriye dönük değerlendirme kaydı var.'],
    ['N/A', 'Uygulanmaz', 'Bu firmada ürün ölçümü yapılmıyor (örneğin yalnız tasarım ofisi). Gerekçesi kapsamda yazılı olmalı.'],
  ] as readonly (readonly [string, string, string])[],
  tip: 'Kural: kayıt yoksa en fazla 1. Kanıtın tamamı var ama bir zayıflık varsa 2. Denetçi her şeyi görse bile bulgu yazamıyorsa 3.',
};
