import type { DokumanSablonu } from './dokuman-metni.ts';

// Prototip DOCT (denetim-hazirlik.html 4052-4205); akis bolumleri prototipteki gibi FLOW_DOC'a gore eklidir.
export const DOCT: readonly DokumanSablonu[] = [
  {
    id: 'elk', type: 'EL', name: 'KYS el kitabı', bl: 'b43', g: 'temel',
    nosec: 1,
    secs: [
      ['firma', 'Firma tanıtımı', '{firma}{tesisSatir} faaliyetlerini ISO 9001:2015 standardına uygun bir kalite yönetim sistemiyle yürütür. Bu el kitabı KYS\'nin kapsamını, politikasını, organizasyonunu, süreçlerini ve bunları tanımlayan dokümanları bir araya getirir.'],
      ['kapsam', 'KYS kapsamı', '**Kapsam:** {kapsam}\n\n**Sahalar:** {tesis}\n\n**Uygulanamaz şartlar:** [Varsa madde numarası ve gerekçesini yazın. Örnek: 8.3 Tasarım ve geliştirme — firma yalnızca müşteri tarafından tasarlanmış ürünleri, müşterinin teknik resim ve şartnamesine göre üretmektedir.]'],
      ['politika', 'Kalite politikası', 'Kalite politikası {ref:pol} numaralı dokümanda yer alır; tüm çalışanlara duyurulur ve yönetimin gözden geçirmesinde uygunluğu değerlendirilir.'],
      ['org', 'Organizasyon ve sorumluluklar', 'KYS ile ilgili görev, yetki ve sorumluluklar görev tanımlarında belirlenmiştir.\n\n{ROLLER}'],
      ['surec', 'Süreçler ve etkileşimleri', 'KYS süreç yaklaşımıyla yönetilir. Her sürecin sahibi, girdileri, çıktıları ve performans göstergesi süreç kartlarında tanımlanmıştır.\n\n{SUREC_TABLOSU}\n\nMüşteri şartları satış süreciyle KYS\'ye girer; ana süreçler bu şartları ürüne dönüştürür; destek süreçler kaynak sağlar; yönetim süreci performansı izler ve kararları verir.'],
      ['madde', 'ISO 9001 maddeleri ve ilgili dokümanlar', '{MADDE_TABLOSU}'],
    ],
  },
  {
    id: 'pol', type: 'EL', name: 'Kalite politikası', bl: 'b52', g: 'temel',
    nosec: 1, hint: 'Politikayı firmanıza göre özelleştirin. Denetçiler kalıp metinleri fark eder ve çalışanlara \'politika sizin işinizle nasıl ilişkili?\' diye sorar.',
    secs: [
      ['metin', '', '{firma} olarak müşterilerimize şartlarına tam uyan ürünleri zamanında teslim etmeyi temel amacımız sayarız. Bu amaçla:\n\n- Müşteri, yasal ve düzenleyici şartları eksiksiz karşılamayı,\n- Süreçlerimizi ölçerek, riskleri önceden yöneterek ve verilerle karar vererek sürekli iyileştirmeyi,\n- Zamanında teslimat ve ilk seferde doğru üretim performansımızı sürekli yükseltmeyi,\n- Çalışanlarımızın yetkinliğini geliştirmeyi ve kaliteye katkılarını görünür kılmayı,\n- Tedarikçilerimizle karşılıklı güvene dayalı, performans odaklı iş birliği kurmayı\n\ntaahhüt ederiz.\n\nBu politika kalite hedeflerimizin çerçevesidir. Tüm çalışanlarımıza duyurulur, ilgili taraflara açıktır ve her yıl yönetimin gözden geçirmesinde uygunluğu değerlendirilir.'],
      ['imza', '', '**{gm}**\nGenel Müdür'],
    ],
  },
  {
    id: 'hedef', type: 'TB', name: 'Kalite hedefleri ve izleme tablosu', bl: 'b62', g: 'temel',
    nosec: 1, land: 1,
    secs: [
      ['giris', '', '{yil} yılı kalite hedefleri kalite politikası çerçevesinde, süreç göstergelerinden belirlenmiştir. Gerçekleşmeler aylık izlenir, sapmalarda aksiyon açılır ve sonuçlar yönetimin gözden geçirmesinde değerlendirilir.'],
      ['tablo', '', '{HEDEF_TABLOSU}'],
      ['eylem', 'Eylem planı', '| Hedef | Ne yapılacak | Kaynak | Sorumlu | Termin | Değerlendirme yöntemi |\n| | | | | | |\n| | | | | | |\n| | | | | | |'],
    ],
  },
  {
    id: 'dok', type: 'PR', name: 'Doküman ve kayıt kontrol prosedürü', bl: 'b75', g: 'pr',
    secs: [
      ['amac', 'Amaç', 'KYS dokümanlarının hazırlanması, onaylanması, dağıtılması, güncellenmesi ve kayıtların saklanması kurallarını belirlemek.'],
      ['kapsam', 'Kapsam', '{firma} bünyesinde kullanılan tüm iç ve dış kaynaklı dokümanları ve KYS kayıtlarını kapsar.'],
      ['sorum', 'Sorumluluklar', '- **{kys}:** Doküman ana listesinin tutulması, yayınlanması ve geçersiz dokümanların toplanması.\n- **Süreç sahipleri:** Kendi süreçlerine ait dokümanların hazırlanması ve güncel tutulması, kayıtların saklanması.\n- **{gm}:** El kitabı, politika ve prosedürlerin onayı.'],
      ['kodlama', 'Doküman kodlama', 'Dokümanlar ÖNEK-TÜR-SIRA biçiminde kodlanır. Revizyon numarası koda dahil değildir, doküman başlığında ayrıca belirtilir.\n\n{KODLAMA}'],
      ['uyg', 'Uygulama', '{KURALLAR}\n\nDokümanlar {firma} ortak klasöründe aşağıdaki yapıda tutulur:\n\n{KLASOR}'],
      ['akis', 'Akış şeması', '[[AKIS:dok]]'],
      ['kayit', 'Kayıtların saklanması', 'Aşağıdaki süreler asgari değerlerdir; müşteri sözleşmesinde veya yasal düzenlemede daha uzun süre istenmişse o süre uygulanır. Süresi dolan kayıtlar {kys} onayıyla imha edilir.\n\n{SAKLAMA}'],
      ['ilgili', 'İlgili dokümanlar', '- {refn:ana}\n- {refn:f_dof}'],
    ],
  },
  {
    id: 'risk', type: 'PR', name: 'Risk ve fırsat yönetimi prosedürü', bl: 'b61', g: 'pr',
    secs: [
      ['amac', 'Amaç', 'KYS\'nin amaçlanan sonuçlarına ulaşmasını etkileyebilecek riskleri ve fırsatları belirlemek, değerlendirmek ve önlemleri planlamak.'],
      ['kapsam', 'Kapsam', 'Tüm KYS süreçlerini, iç ve dış hususlardan ve ilgili tarafların şartlarından kaynaklanan riskleri ve fırsatları kapsar.'],
      ['sorum', 'Sorumluluklar', '- **Süreç sahipleri:** Süreçlerinin risklerini ve fırsatlarını belirlemek, önlemleri uygulamak.\n- **{kys}:** Risk tablosunu koordine etmek, yıllık gözden geçirmeyi organize etmek.\n- **{gm}:** Kabul edilebilir risk seviyesini ve önlemler için kaynakları onaylamak.'],
      ['uyg', 'Uygulama', '1. Süreç sahipleri, bağlam analizi ve ilgili taraf listesini girdi olarak kullanarak süreçlerindeki riskleri ve fırsatları belirler.\n2. Her risk için olasılık (1–5) ve etki (1–5) puanlanır; risk puanı = olasılık × etki.\n3. Risk puanı 12 ve üzeri olan riskler için önlem zorunludur; 6–11 arası riskler için önlem değerlendirilir; 5 ve altı izlenir.\n4. Önlem, sorumlu ve termin risk tablosuna yazılır. Fırsatlar için fayda ve uygulanabilirlik değerlendirilir.\n5. Önlem tamamlandığında risk yeniden puanlanır; önlemin etkinliği kaydedilir.\n6. Risk tablosu yılda en az bir kez ve süreç, ürün, organizasyon veya tedarik zincirinde önemli bir değişiklik olduğunda gözden geçirilir.\n7. Sonuçlar yönetimin gözden geçirmesine girdi olarak sunulur.'],
      ['tablo', 'Risk derecelendirme', '| Puan | Seviye | Karar |\n| 12–25 | Yüksek | Önlem zorunlu, termin ve sorumlu atanır |\n| 6–11 | Orta | Önlem değerlendirilir, izlenir |\n| 1–5 | Düşük | İzlenir |'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| Risk ve fırsat tablosu | Süreç sahipleri | Güncel + 3 yıl |\n| Önlem etkinlik değerlendirmesi | Süreç sahipleri | 3 yıl |'],
    ],
  },
  {
    id: 'egitim', type: 'PR', name: 'Eğitim ve yetkinlik prosedürü', bl: 'b72', g: 'pr',
    secs: [
      ['amac', 'Amaç', 'Ürün ve hizmet uygunluğunu etkileyen işleri yapan personelin yetkin olmasını sağlamak.'],
      ['kapsam', 'Kapsam', 'Tüm çalışanları; işe alım, oryantasyon, görev değişikliği ve periyodik eğitimleri kapsar.'],
      ['sorum', 'Sorumluluklar', '- **Birim yöneticileri:** Yetkinlik şartlarını belirlemek, eğitim ihtiyacını bildirmek, eğitim etkinliğini değerlendirmek.\n- **İnsan kaynakları / {kys}:** Yıllık eğitim planını hazırlamak, eğitimleri organize etmek, kayıtları tutmak.\n- **{gm}:** Eğitim planını ve bütçesini onaylamak.'],
      ['uyg', 'Uygulama', '1. Her görev için eğitim, öğrenim, beceri ve deneyim şartları yetkinlik matrisinde tanımlanır.\n2. Yeni işe başlayan her çalışan oryantasyon eğitimi alır: kalite politikası, kendi işinin kaliteye katkısı, uygunsuzluk bildirimi, iş güvenliği.\n3. Birim yöneticileri yılda bir personelin yetkinliğini matrise göre değerlendirir; eksikler eğitim ihtiyacı olarak yazılır.\n4. Yıllık eğitim planı hazırlanır ve onaylanır; gerçekleşme üç ayda bir izlenir.\n5. Eğitim sonrası etkinlik; sınav, uygulamalı gözlem veya hata oranındaki değişimle değerlendirilir.\n6. Özel prosesler ve muayene gibi kritik işler, yetkinliği onaylanmamış personele verilmez.\n7. Sertifika gerektiren işlerde sertifika geçerlilik tarihleri izlenir.'],
      ['akis', 'Akış şeması', '[[AKIS:egitim]]'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| Yetkinlik matrisi | Birim yöneticileri | Güncel |\n| Yıllık eğitim planı | İK / {kys} | 3 yıl |\n| Eğitim katılım formu ({ref:f_egitim}) | İK | Çalışan firmada olduğu sürece + 2 yıl |\n| Eğitim etkinlik değerlendirmesi | Birim yöneticileri | Çalışan firmada olduğu sürece + 2 yıl |'],
    ],
  },
  {
    id: 'kal', type: 'PR', name: 'İzleme ve ölçme kaynakları (kalibrasyon) prosedürü', bl: 'b715', g: 'pr',
    secs: [
      ['amac', 'Amaç', 'Ürün uygunluğunu doğrulamak için kullanılan ölçüm cihazlarının uygun, kalibre ve güvenilir olmasını sağlamak.'],
      ['kapsam', 'Kapsam', 'Ürün kabulünde ve proses kontrolünde kullanılan tüm ölçme ve test cihazlarını kapsar; personele ait cihazlar dahil.'],
      ['sorum', 'Sorumluluklar', '- **Kalibrasyon sorumlusu:** Cihaz listesini ve kalibrasyon planını tutmak, dış kalibrasyonu organize etmek, sertifikaları değerlendirmek.\n- **Kullanıcılar:** Cihazın kalibrasyon etiketini kullanmadan önce kontrol etmek, hasarlı cihazı bildirmek.\n- **Kalite:** Uygun çıkmayan cihaz için geriye dönük etki değerlendirmesini yapmak.'],
      ['uyg', 'Uygulama', '1. Her cihaz benzersiz bir numarayla tanımlanır ve ölçüm cihazları listesine ({ref:f_kal}) kaydedilir: tip, ölçüm aralığı, çözünürlük, yer, kalibrasyon periyodu, kabul kriteri.\n2. Cihazlar, uluslararası veya ulusal ölçüm standartlarına izlenebilir şekilde, tercihen akredite laboratuvarda kalibre edilir. Standart yoksa kullanılan dayanak kaydedilir.\n3. Kalibrasyon sertifikası kabul kriterine göre değerlendirilir; sonuç ve tarih listeye işlenir.\n4. Cihaz, kalibrasyon durumunu ve bir sonraki kalibrasyon tarihini gösteren etiketle işaretlenir.\n5. Kalibrasyon süresi geçen, hasarlı veya uygun çıkmayan cihaz kullanımdan çekilir ve \'KULLANILMAZ\' etiketiyle ayrılır.\n6. Uygun çıkmayan cihazla son kalibrasyondan bu yana yapılan ölçümlerin geçerliliği değerlendirilir; gerekirse ürün geri çağrılır ve müşteri bilgilendirilir.\n7. Cihazlar ayar bozulmasına, hasara ve bozulmaya karşı korunur; uygun ortam koşullarında saklanır.'],
      ['akis', 'Akış şeması', '[[AKIS:kal]]'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| Ölçüm cihazları ve kalibrasyon takip listesi | Kalibrasyon sorumlusu | Güncel |\n| Kalibrasyon sertifikaları | Kalibrasyon sorumlusu | Cihaz kullanımda olduğu sürece + 2 yıl |\n| Geriye dönük etki değerlendirmesi | Kalite | 5 yıl |'],
    ],
  },
  {
    id: 'satis', type: 'PR', name: 'Teklif ve sözleşme gözden geçirme prosedürü', bl: 'b82', g: 'pr',
    secs: [
      ['amac', 'Amaç', 'Müşteri şartlarının teklif ve sipariş öncesinde eksiksiz belirlenmesini ve karşılanabileceğinin doğrulanmasını sağlamak.'],
      ['kapsam', 'Kapsam', 'Tüm müşteri talepleri, teklifler, siparişler ve sipariş değişikliklerini kapsar.'],
      ['sorum', 'Sorumluluklar', '- **Satış:** Talebin kaydı, gözden geçirmenin koordinasyonu, müşteriyle iletişim.\n- **Üretim planlama ve kalite:** Kapasite, teknik yeterlilik ve özel şartların değerlendirilmesi.'],
      ['uyg', 'Uygulama', '1. Müşteri talebi kaydedilir; teknik resim, şartname, miktar, termin ve özel şartlar (malzeme sertifikası, muayene, ambalaj, izlenebilirlik) belirlenir.\n2. Müşterinin belirtmediği ama amaçlanan kullanım için gerekli şartlar ile yasal şartlar değerlendirilir.\n3. Teknik yeterlilik, kapasite, tedarik ve özel proses ihtiyacı üretim ve kalite ile gözden geçirilir.\n4. Karşılanamayan veya belirsiz şartlar teklif verilmeden önce müşteriyle netleştirilir.\n5. Sipariş teklifle karşılaştırılır; farklılıklar çözülmeden sipariş onaylanmaz.\n6. Sipariş değişikliklerinde aynı gözden geçirme yapılır; ilgili birimler ve dokümanlar güncellenir.\n7. Gözden geçirme sonuçları kaydedilir.'],
      ['akis', 'Akış şeması', '[[AKIS:satis]]'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| Teklif ve gözden geçirme kaydı | Satış | Sözleşme süresi + garanti süresi |\n| Sipariş onayı ve değişiklik kayıtları | Satış | Sözleşme süresi + garanti süresi |'],
    ],
  },
  {
    id: 'satin', type: 'PR', name: 'Satınalma ve tedarikçi değerlendirme prosedürü', bl: 'b84', g: 'pr',
    secs: [
      ['amac', 'Amaç', 'Dışarıdan sağlanan ürün ve hizmetlerin şartlara uygun olmasını, tedarikçilerin seçilmesini, izlenmesini ve yeniden değerlendirilmesini sağlamak.'],
      ['kapsam', 'Kapsam', 'Ürüne giren malzemeler, fason prosesler (kaplama, ısıl işlem vb.), kalibrasyon ve ürün kalitesini etkileyen hizmetleri kapsar.'],
      ['sorum', 'Sorumluluklar', '- **Satınalma:** Tedarikçi seçimi, sipariş, performans verisinin toplanması.\n- **Kalite:** Giriş kontrolü, tedarikçi değerlendirmesine kalite verisinin sağlanması.\n- **{gm}:** Kritik tedarikçi onayı.'],
      ['uyg', 'Uygulama', '1. Yeni tedarikçi; kalite belgesi, referans, numune veya deneme siparişi ve gerektiğinde yerinde denetimle değerlendirilir; uygunsa onaylı tedarikçi listesine alınır.\n2. Satınalma siparişinde ürün tanımı, teknik resim ve revizyonu, malzeme ve sertifika şartları, muayene şartları ve gerekiyorsa personel yeterlilik şartları açıkça yazılır.\n3. Gelen ürün, kontrol planına göre giriş kontrolünden geçer; sertifikalar sipariş şartlarıyla karşılaştırılır.\n4. Tedarikçi performansı kalite (red oranı), zamanında teslimat ve iletişim kriterleriyle izlenir.\n5. Yılda en az bir kez puanlama yapılır: A (85–100) onaylı, B (70–84) izlemeye alınır, C (70 altı) aksiyon istenir veya listeden çıkarılır.\n6. Performansı düşük tedarikçiden düzeltici faaliyet talep edilir.'],
      ['akis', 'Akış şeması', '[[AKIS:satin]]'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| Onaylı tedarikçi listesi | Satınalma | Güncel |\n| Tedarikçi değerlendirme formu ({ref:f_tedarik}) | Satınalma | Tedarikçi aktif olduğu sürece + 3 yıl |\n| Satınalma siparişleri | Satınalma | 10 yıl veya müşteri şartı |\n| Giriş kontrol kayıtları ve sertifikalar | Kalite | 10 yıl veya müşteri şartı |'],
    ],
  },
  {
    id: 'uygun', type: 'PR', name: 'Uygunsuz çıktı kontrolü prosedürü', bl: 'b87', g: 'pr',
    secs: [
      ['amac', 'Amaç', 'Şartlara uymayan ürünlerin istenmeden kullanılmasını veya teslim edilmesini önlemek.'],
      ['kapsam', 'Kapsam', 'Giriş kontrolünde, üretimde, son kontrolde ve müşteride tespit edilen uygunsuz ürünleri kapsar.'],
      ['sorum', 'Sorumluluklar', '- **Tespit eden çalışan:** Ürünü durdurmak, ayırmak ve bildirmek.\n- **Kalite:** Uygunsuzluğu kaydetmek, karar sürecini yürütmek.\n- **Karar yetkilileri (kalite + üretim):** Tamir, yeniden işleme, hurda ve olduğu gibi kullanma kararı.'],
      ['uyg', 'Uygulama', '1. Uygunsuzluk tespit edilen ürün durdurulur, \'UYGUNSUZ\' etiketiyle tanımlanır ve karantina alanına alınır.\n2. Uygunsuzluk, formda ({ref:f_dof}) kaydedilir: ürün, miktar, uygunsuzluğun tanımı, tespit yeri.\n3. Karar verilir: yeniden işleme, tamir, hurda, iade veya müşteri onayıyla olduğu gibi kullanma. Kararı veren kişi kaydedilir.\n4. Yeniden işlenen veya tamir edilen ürün tekrar muayene edilir.\n5. Olduğu gibi kullanma veya tamir için müşteri onayı gerekiyorsa yazılı onay alınmadan ürün sevk edilmez.\n6. Teslimattan sonra fark edilen uygunsuzlukta müşteri bilgilendirilir ve etkilenen ürünler belirlenir.\n7. Tekrarlayan veya önemli uygunsuzluklar için düzeltici faaliyet başlatılır ({ref:dof}).'],
      ['akis', 'Akış şeması', '[[AKIS:dof]]'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| Uygunsuzluk kaydı | Kalite | En az 5 yıl |\n| Müşteri onayları | Kalite | Ürün kayıtlarıyla birlikte |'],
    ],
  },
  {
    id: 'dof', type: 'PR', name: 'Düzeltici faaliyet prosedürü', bl: 'b102', g: 'pr',
    secs: [
      ['amac', 'Amaç', 'Uygunsuzlukların kök nedenlerini ortadan kaldırarak tekrarını önlemek ve alınan faaliyetlerin etkinliğini doğrulamak.'],
      ['kapsam', 'Kapsam', 'Müşteri şikâyetleri, iç ve dış denetim bulguları, tekrarlayan ürün uygunsuzlukları, tedarikçi sorunları ve hedef sapmalarını kapsar.'],
      ['sorum', 'Sorumluluklar', '- **{kys}:** DÖF kaydını açmak, terminleri izlemek, etkinlik doğrulamasını onaylamak.\n- **İlgili süreç sahibi:** Kök neden analizi, faaliyet planı ve uygulama.\n- **{gm}:** Gerekli kaynağı sağlamak.'],
      ['uyg', 'Uygulama', '1. Uygunsuzluk için DÖF kaydı ({ref:f_dof}) açılır; öncelikle yayılmayı önleyen düzeltme (acil önlem) yapılır.\n2. Kök neden; 5 Neden, balık kılçığı veya benzeri bir yöntemle ekip halinde analiz edilir. \'Dikkatsizlik\' veya \'eğitim eksikliği\' tek başına kök neden kabul edilmez; sistemin bu hataya neden izin verdiği sorulur.\n3. Benzer uygunsuzlukların başka yerde olup olmadığı veya olabileceği değerlendirilir.\n4. Kök nedeni ortadan kaldıracak faaliyet, sorumlu ve termin belirlenir.\n5. Faaliyet uygulanır; gerekirse doküman, risk tablosu ve eğitimler güncellenir.\n6. Etkinlik, belirlenen süre sonunda veriyle doğrulanır (ör. üç ay boyunca tekrar yok). Etkin değilse DÖF yeniden açılır.\n7. DÖF\'ler aylık izlenir ve yönetimin gözden geçirmesine raporlanır.'],
      ['akis', 'Akış şeması', '[[AKIS:dof]]'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| DÖF formu | {kys} | En az 5 yıl |\n| Kök neden analizi | Süreç sahibi | En az 5 yıl |\n| Etkinlik doğrulama kaydı | {kys} | En az 5 yıl |'],
    ],
  },
  {
    id: 'icden', type: 'PR', name: 'İç denetim prosedürü', bl: 'b92', g: 'pr',
    secs: [
      ['amac', 'Amaç', 'KYS\'nin standart şartlarına ve firmanın kendi şartlarına uygunluğunu ve etkin uygulanıp uygulanmadığını planlı aralıklarla doğrulamak.'],
      ['kapsam', 'Kapsam', 'KYS kapsamındaki tüm süreçleri, sahaları ve vardiyaları kapsar.'],
      ['sorum', 'Sorumluluklar', '- **{kys}:** Denetim programını hazırlamak, denetçileri görevlendirmek, sonuçları raporlamak.\n- **İç denetçiler:** Denetimi planlamak ve objektif yürütmek, bulguları yazmak.\n- **Süreç sahipleri:** Denetime katılmak, bulgulara düzeltici faaliyet başlatmak.'],
      ['uyg', 'Uygulama', '1. Yıllık iç denetim programı; süreçlerin önemi, önceki denetim sonuçları, müşteri şikâyetleri ve riskler dikkate alınarak hazırlanır. Tüm süreçler yılda en az bir kez denetlenir.\n2. Denetçiler iç denetçi eğitimi almış kişilerden seçilir; kimse kendi işini denetlemez.\n3. Denetçi, denetim planını ve kontrol listesini hazırlar; süreç sahibine önceden bildirir.\n4. Denetim; görüşme, gözlem ve kayıt incelemesiyle, ürün veya sipariş örneği üzerinden süreç izlenerek yapılır.\n5. Bulgular majör uygunsuzluk, minör uygunsuzluk ve gözlem olarak sınıflandırılır; kanıtı ve ilgili madde yazılır.\n6. Denetim raporu ({ref:f_icden}) süreç sahibine ve {gm}\'e iletilir.\n7. Uygunsuzluklar için DÖF açılır ({ref:dof}); kapanışları denetçi veya {kys} tarafından doğrulanır.\n8. Denetim sonuçları yönetimin gözden geçirmesine girdi olur.'],
      ['akis', 'Akış şeması', '[[AKIS:ic]]'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| Yıllık iç denetim programı | {kys} | 4 yıl |\n| Denetim planı, kontrol listesi ve rapor | İç denetçi | 4 yıl |\n| Denetçi yetkinlik kayıtları | {kys} | Görev süresince + 2 yıl |'],
    ],
  },
  {
    id: 'ygg', type: 'PR', name: 'Yönetimin gözden geçirmesi prosedürü', bl: 'b93', g: 'pr',
    secs: [
      ['amac', 'Amaç', 'KYS\'nin sürekli uygunluğunu, yeterliliğini, etkinliğini ve firmanın stratejik yönüyle uyumunu üst yönetim tarafından planlı aralıklarla değerlendirmek.'],
      ['kapsam', 'Kapsam', 'KYS\'nin tamamını kapsar.'],
      ['sorum', 'Sorumluluklar', '- **{gm}:** Toplantıya başkanlık etmek, kararları vermek, kaynak sağlamak.\n- **{kys}:** Girdileri hazırlamak, tutanağı yazmak, kararları takip etmek.\n- **Süreç sahipleri:** Süreç performans verilerini sunmak.'],
      ['uyg', 'Uygulama', '1. Yönetimin gözden geçirmesi yılda en az bir kez yapılır; gerektiğinde ara toplantılar düzenlenir.\n2. Toplantıda en az şu girdiler ele alınır:\n\n- Önceki toplantı kararlarının durumu\n- KYS ile ilgili iç ve dış hususlardaki değişiklikler\n- Müşteri memnuniyeti ve ilgili tarafların geri bildirimleri\n- Kalite hedeflerinin gerçekleşme durumu\n- Süreç performansı ve ürün uygunluğu\n- Uygunsuzluklar ve düzeltici faaliyetler\n- İzleme ve ölçme sonuçları\n- İç ve dış denetim sonuçları\n- Dış tedarikçilerin performansı\n- Kaynakların yeterliliği\n- Risk ve fırsatlar için alınan önlemlerin etkinliği\n- İyileştirme fırsatları\n\n3. Toplantı çıktısı olarak iyileştirme fırsatları, KYS\'de değişiklik ihtiyacı ve kaynak ihtiyacına ilişkin kararlar sorumlu ve terminle yazılır.\n4. Tutanak ({ref:f_ygg}) katılımcılarca imzalanır; kararlar {kys} tarafından izlenir.'],
      ['akis', 'Akış şeması', '[[AKIS:ygg]]'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| YGG tutanağı ve sunumları | {kys} | En az 4 yıl |\n| Karar takip listesi | {kys} | En az 4 yıl |'],
    ],
  },
  {
    id: 'f_dof', type: 'FR', name: 'Uygunsuzluk ve düzeltici faaliyet formu', bl: '', g: 'form',
    nosec: 1,
    secs: [
      ['a', '', '| DÖF No | | Tarih | |\n| Kaynak | [ ] Müşteri şikâyeti  [ ] İç denetim  [ ] Dış denetim  [ ] Üretim  [ ] Tedarikçi  [ ] Diğer | Bildiren | |'],
      ['b', '1. Uygunsuzluğun tanımı', '| Ürün / parça no | | Sipariş / lot | |\n| Miktar | | Tespit yeri | |\n| Tanım | | | |'],
      ['c', '2. Düzeltme (acil önlem) ve ürün kararı', '| Yapılan düzeltme | | | |\n| Karar | [ ] Yeniden işleme  [ ] Tamir  [ ] Hurda  [ ] İade  [ ] Müşteri onayıyla kullanım | Karar veren | |'],
      ['d', '3. Kök neden analizi', '| Neden 1 | |\n| Neden 2 | |\n| Neden 3 | |\n| Neden 4 | |\n| Neden 5 / kök neden | |'],
      ['e', '4. Düzeltici faaliyet', '| Faaliyet | Sorumlu | Termin | Durum |\n| | | | |\n| | | | |\n| | | | |'],
      ['f', '5. Etkinlik doğrulaması', '| Doğrulama yöntemi ve sonucu | | | |\n| [ ] Etkin, DÖF kapatıldı  [ ] Etkin değil, yeniden açıldı | | Doğrulayan / tarih | |'],
    ],
  },
  {
    id: 'f_icden', type: 'FR', name: 'İç denetim raporu', bl: '', g: 'form',
    nosec: 1,
    secs: [
      ['a', '', '| Denetim no | | Tarih | |\n| Denetlenen süreç | | Süreç sahibi | |\n| Denetçi(ler) | | Kapsam / maddeler | |'],
      ['b', 'Denetim bulguları', '| No | Madde | Bulgu ve kanıt | Sınıf (M/m/G) | DÖF no |\n| 1 | | | | |\n| 2 | | | | |\n| 3 | | | | |\n| 4 | | | | |\n| 5 | | | | |'],
      ['c', 'Güçlü yönler', '| |\n| |'],
      ['d', 'Genel sonuç', '| Süreç etkinliği değerlendirmesi | |\n| Denetçi imza | | Süreç sahibi imza | |'],
    ],
  },
  {
    id: 'f_ygg', type: 'FR', name: 'Yönetimin gözden geçirmesi tutanağı', bl: '', g: 'form',
    nosec: 1,
    secs: [
      ['a', '', '| Toplantı tarihi | | Toplantı no | |\n| Başkan | {gm} | Raportör | {kys} |\n| Katılımcılar | | | |'],
      ['b', 'Girdiler ve değerlendirme', '| Girdi | Değerlendirme |\n| Önceki kararların durumu | |\n| İç ve dış hususlardaki değişiklikler | |\n| Müşteri memnuniyeti ve geri bildirimler | |\n| Kalite hedefleri | |\n| Süreç performansı ve ürün uygunluğu | |\n| Uygunsuzluklar ve DÖF | |\n| İzleme ve ölçme sonuçları | |\n| Denetim sonuçları | |\n| Tedarikçi performansı | |\n| Kaynak yeterliliği | |\n| Risk ve fırsat önlemlerinin etkinliği | |\n| İyileştirme fırsatları | |'],
      ['c', 'Kararlar', '| No | Karar | Sorumlu | Termin |\n| 1 | | | |\n| 2 | | | |\n| 3 | | | |\n| 4 | | | |'],
      ['d', 'İmzalar', '| Ad soyad | İmza |\n| | |\n| | |\n| | |'],
    ],
  },
  {
    id: 'f_egitim', type: 'FR', name: 'Eğitim katılım formu', bl: '', g: 'form',
    nosec: 1,
    secs: [
      ['a', '', '| Eğitim konusu | | Tarih / süre | |\n| Eğitmen | | Yer | |\n| Eğitim türü | [ ] İç  [ ] Dış  [ ] İş başı  [ ] Oryantasyon | Etkinlik değerlendirme yöntemi | |'],
      ['b', 'Katılımcılar', '| No | Ad soyad | Görev | İmza |\n| 1 | | | |\n| 2 | | | |\n| 3 | | | |\n| 4 | | | |\n| 5 | | | |\n| 6 | | | |\n| 7 | | | |\n| 8 | | | |\n| 9 | | | |\n| 10 | | | |'],
      ['c', 'Etkinlik değerlendirmesi', '| Sonuç | |\n| Değerlendiren / tarih | |'],
    ],
  },
  {
    id: 'f_tedarik', type: 'FR', name: 'Tedarikçi değerlendirme formu', bl: '', g: 'form',
    nosec: 1,
    secs: [
      ['a', '', '| Tedarikçi | | Değerlendirme dönemi | |\n| Tedarik edilen ürün / hizmet | | Kritiklik | [ ] Kritik  [ ] Standart |'],
      ['b', 'Puanlama', '| Kriter | Ağırlık | Puan (0–100) | Ağırlıklı puan |\n| Kalite (red / iade oranı) | %40 | | |\n| Zamanında teslimat | %30 | | |\n| Kalite belgesi ve sertifika uygunluğu | %15 | | |\n| İletişim ve DÖF\'lere yanıt | %15 | | |\n| **Toplam** | %100 | | |'],
      ['c', 'Sonuç', '| [ ] A (85–100) Onaylı  [ ] B (70–84) İzlemede  [ ] C (70 altı) Aksiyon / listeden çıkar | |\n| Değerlendiren / tarih | |'],
    ],
  },
  {
    id: 'f_kal', type: 'LS', name: 'Ölçüm cihazları ve kalibrasyon takip listesi', bl: '', g: 'form',
    nosec: 1, land: 1,
    secs: [
      ['a', '', '{KAL_LISTE}'],
    ],
  },
  {
    id: 'ana', type: 'LS', name: 'Doküman ana listesi', bl: '', g: 'form',
    nosec: 1, land: 1, dyn: 1,
    secs: [
      ['a', '', '{ANA_LISTE}'],
    ],
  },
  {
    id: 'as_cm', type: 'PR', name: 'Konfigürasyon yönetimi prosedürü', bl: 'a812', g: 'as',
    secs: [
      ['amac', 'Amaç', 'Ürünün fiziksel ve fonksiyonel özelliklerinin, ömrü boyunca onaylı konfigürasyon bilgisiyle tutarlı olmasını sağlamak (AS9100D 8.1.2).'],
      ['kapsam', 'Kapsam', 'Müşteri teknik resimleri, şartnameleri, NC programları, kontrol planları ve bunlardaki değişiklikleri kapsar.'],
      ['sorum', 'Sorumluluklar', '- **Mühendislik / planlama:** Konfigürasyonun tanımlanması, değişikliklerin işlenmesi.\n- **Kalite:** Üretilen ürünün onaylı konfigürasyona uygunluğunun doğrulanması.\n- **{kys}:** Doküman kontrolüyle entegrasyonun sağlanması.'],
      ['uyg', 'Uygulama', '1. **Tanımlama:** Her parça için geçerli resim ve revizyonu, şartname, NC programı ve kontrol planı iş emrinde belirtilir.\n2. **Değişiklik kontrolü:** Müşteri mühendislik değişikliği alındığında etki analizi yapılır: stoktaki ve üretimdeki ürün, fikstür, program, FAI ihtiyacı.\n3. Değişiklik onaylanmadan üretime yansıtılmaz; eski revizyon dokümanlar sahadan toplanır.\n4. **Durum kaydı:** Her ürünün hangi revizyonla üretildiği iş emri ve sevk kayıtlarından izlenebilir.\n5. **Doğrulama:** İlk ürün muayenesi ve son kontrolde ürünün geçerli konfigürasyona uygunluğu doğrulanır.'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| Mühendislik değişiklik kayıtları | Mühendislik | Ürün ömrü veya müşteri şartı |\n| Etki analizi | Mühendislik | Ürün ömrü veya müşteri şartı |'],
    ],
  },
  {
    id: 'as_cfp', type: 'PR', name: 'Sahte parça önleme prosedürü', bl: 'a814', g: 'as',
    secs: [
      ['amac', 'Amaç', 'Sahte veya şüpheli parçaların ürüne girmesini önlemek ve tespit edildiğinde kontrol altına almak (AS9100D 8.1.4).'],
      ['kapsam', 'Kapsam', 'Ürüne giren tüm malzeme, standart parça ve elektronik bileşenleri kapsar.'],
      ['sorum', 'Sorumluluklar', '- **Satınalma:** Yalnızca orijinal üretici veya yetkili distribütörden tedarik.\n- **Kalite:** Doğrulama, şüpheli parçanın karantinası ve raporlama.\n- **{kys}:** Farkındalık eğitimleri.'],
      ['uyg', 'Uygulama', '1. Malzeme ve parçalar orijinal üretici, yetkili distribütör veya müşteri onaylı kaynaktan alınır.\n2. Uygunluk sertifikası ve izlenebilirlik belgeleri giriş kontrolünde doğrulanır.\n3. Şüpheli durumlarda (ambalaj, etiket, işaretleme tutarsızlığı, fiyat anomalisi) ek doğrulama veya test yapılır.\n4. Şüpheli parça karantinaya alınır, tedarik zincirine geri verilmez; müşteri ve gerekirse otoriteler bilgilendirilir.\n5. İlgili personele sahte parça farkındalık eğitimi verilir.'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| Sertifika ve izlenebilirlik belgeleri | Kalite | Ürün kayıtlarıyla birlikte |\n| Şüpheli parça raporları | Kalite | En az 10 yıl |'],
    ],
  },
  {
    id: 'as_fod', type: 'PR', name: 'FOD önleme prosedürü', bl: 'afod', g: 'as',
    secs: [
      ['amac', 'Amaç', 'Ürüne yabancı madde girmesini ve bundan kaynaklanabilecek hasarı önlemek.'],
      ['kapsam', 'Kapsam', 'Üretim, montaj, muayene, paketleme ve sevkiyat alanlarını kapsar.'],
      ['sorum', 'Sorumluluklar', '- **Alan sorumluları:** FOD kontrollerini yapmak ve kaydetmek.\n- **Tüm çalışanlar:** FOD kurallarına uymak, tespit edilen yabancı maddeyi bildirmek.'],
      ['uyg', 'Uygulama', '1. FOD riski taşıyan alanlar belirlenir ve işaretlenir.\n2. Takım kontrolü: vardiya başı ve sonu takımlar sayılır; kayıp takım bulunana kadar ürün serbest bırakılmaz.\n3. Açık kalan boşluk ve delikler kapatılır; talaş ve artıklar operasyon sonunda temizlenir.\n4. Alanlarda periyodik FOD turu yapılır ve kaydedilir.\n5. Çalışanlara FOD farkındalık eğitimi verilir.'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| FOD kontrol listeleri | Alan sorumluları | 3 yıl |\n| FOD olay kayıtları | Kalite | 5 yıl |'],
    ],
  },
  {
    id: 'as_fai', type: 'PR', name: 'İlk ürün muayenesi (FAI) prosedürü', bl: 'a8513', g: 'as',
    secs: [
      ['amac', 'Amaç', 'Üretim prosesinin, teknik dokümandaki tüm şartları karşılayan ürün üretebildiğini doğrulamak (AS9100D 8.5.1.3, AS9102).'],
      ['kapsam', 'Kapsam', 'Yeni parçalar, tasarım değişiklikleri, üretim yeri veya prosesindeki değişiklikler ve iki yıldan uzun üretim aralarını kapsar.'],
      ['sorum', 'Sorumluluklar', '- **Kalite:** FAI planlaması, ölçüm ve rapor.\n- **Üretim:** Temsil edici ilk ürünün üretilmesi.'],
      ['uyg', 'Uygulama', '1. FAI gerektiren durum iş emrinde belirtilir.\n2. İlk ürün, seri üretimde kullanılacak proses, program ve fikstürle üretilir.\n3. Teknik resimdeki tüm karakteristikler numaralandırılır ve ölçülür.\n4. AS9102 formları doldurulur: parça numarası kaydı, ürün hesap kaydı, karakteristik doğrulama kaydı.\n5. Uygunsuz karakteristik varsa neden giderilip kısmi veya tam FAI tekrarlanır.\n6. FAI raporu onaylanmadan seri üretime geçilmez.'],
      ['kayit', 'Kayıtlar', '| Kayıt | Sorumlu | Saklama |\n| AS9102 FAI raporu | Kalite | Parça üretimde olduğu sürece + müşteri şartı |'],
    ],
  },
];

export const FLOW_DOC: Readonly<Record<string, string>> = {
  dok: 'dok', uygun: 'dof', dof: 'dof', icden: 'ic', ygg: 'ygg', satin: 'satin', egitim: 'egitim', kal: 'kal', satis: 'satis',
};
