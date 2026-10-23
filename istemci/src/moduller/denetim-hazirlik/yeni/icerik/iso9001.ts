import type { AsamaRengi, BelgelendirmeAsamasi, BulguSeviyesiTanimi, Cevap, Departman, HazirlikDonemi, IzHalkasi, Madde, PuanAciklamasi, Soru, ZorunluDokuman } from '../tipler.ts';

// ISO 9001:2015 içeriği. Prototipten olduğu gibi taşındı (metin değişmez); renk yerine ton adı verilir, ekran tasarım değişkenine çevirir.
export const soru = (id: string, g: string, c: string, w: 1 | 2 | 3, q: string, ev: string, fix: string, d?: number): Soru => ({ id, g, c, w, q, ev: ev.split('|'), fix, d: !!d });
// Madde numarasını sıralanabilir anahtara çevirir (8.5.1 -> 008.005.001); numarasız madde sona düşer.
export const maddeAnahtari = (c: string): string => String(c).split(/[^0-9]+/).filter(Boolean).map((n) => ('000' + n).slice(-3)).join('.') || '999';

export const CL: Record<string, Madde> = {
 "4":{n:"Kuruluşun bağlamı",s:"Bağlam",ic:"globe",ph:0,looks:["İç ve dış konular, iklim değişikliği değerlendirmesi","İlgili taraflar ve beklentileri","KYS kapsamı ve uygulanamaz şartların gerekçesi","Süreç haritası, sahipler, göstergeler"],pit:["Bir kez yapılıp güncellenmeyen SWOT","Sertifikayla uyuşmayan kapsam metni"]},
 "5":{n:"Liderlik",s:"Liderlik",ic:"award",ph:0,looks:["Üst yönetimin sisteme aktif katılımı","Kalite politikası ve çalışan farkındalığı","Yetki ve sorumlulukların tanımı"],pit:["Genel müdürün göstergeleri bilmemesi","Sadece panoda asılı duran politika"]},
 "6":{n:"Planlama",s:"Planlama",ic:"target",ph:0,looks:["Risk ve fırsat kaydı, aksiyonlar","Ölçülebilir kalite hedefleri","Değişikliklerin planlanması"],pit:["Aksiyonu ve etkinlik kontrolü olmayan risk tablosu","Sayısal değeri olmayan hedefler"]},
 "7":{n:"Destek",s:"Destek",ic:"layers",ph:1,looks:["Altyapı ve bakım","Ölçüm aletleri ve kalibrasyon","Yetkinlik ve eğitim","Doküman ve kayıt kontrolü"],pit:["Süresi geçmiş ya da etiketsiz ölçüm aleti","Tezgâh başında eski revizyon resim"]},
 "8":{n:"Operasyon",s:"Operasyon",ic:"factory",ph:1,looks:["Sipariş şartlarının gözden geçirilmesi","Tasarım ve geliştirme (varsa)","Tedarikçi ve dış proses kontrolü","Üretim, izlenebilirlik, serbest bırakma","Uygunsuz ürün kontrolü"],pit:["Etiketsiz ya da ayrılmamış red parça","Kopuk izlenebilirlik zinciri"]},
 "9":{n:"Performans değerlendirme",s:"Performans",ic:"chart",ph:2,looks:["Göstergelerin analizi","Müşteri memnuniyeti","İç denetim programı","Yönetimin gözden geçirmesi"],pit:["'Bulgu yok' diyen iç denetim raporları","Zorunlu girdisi eksik YGG tutanağı"]},
 "10":{n:"İyileştirme",s:"İyileştirme",ic:"repeat",ph:3,looks:["Uygunsuzluk ve düzeltici faaliyet","Kök neden analizi","Aksiyon etkinliğinin doğrulanması","Sürekli iyileştirme örnekleri"],pit:["'Eğitim verildi' ile kapatılan DÖF","Tekrar eden aynı hata"]},
 "S":{n:"AS9100 / AQAP 2110 ekleri",s:"Savunma",ic:"shield",ph:1,looks:[],pit:[]}
};
export const PHASES: readonly AsamaRengi[] = [{n:"Planla",ton:"vurgu"},{n:"Uygula",ton:"bilgi"},{n:"Kontrol et",ton:"uyari"},{n:"Önlem al",ton:"iyi"}];
export const GORDER: readonly string[] = ["4","5","6","7","8","9","10","S"];
export const CRIT: Record<number, string> = {1:"Temel",2:"Önemli",3:"Kritik"};

export const Q: readonly Soru[] = [
 soru("c41","4","4.1",1,"Şirketinizi etkileyen iç ve dış konuları nasıl belirlediniz? En son ne zaman gözden geçirdiniz?","Bağlam analizi (SWOT, PESTLE vb.)|İklim değişikliğinin değerlendirildiği not|YGG'de güncellendiğine dair kayıt","Bağlam analizini yıllık YGG'ye girdi olarak bağlayın; iklim değişikliği konusunu açıkça değerlendirin."),
 soru("c42","4","4.2",1,"İlgili taraflarınız kimler ve beklentilerini nasıl takip ediyorsunuz?","İlgili taraf listesi|Her tarafın şartları|İzleme yöntemi","İlgili taraf, beklenti ve izleme yöntemini tek tabloda toplayın."),
 soru("c43","4","4.3",2,"KYS kapsamınız nedir? Uygulanamaz dediğiniz bir madde var mı, gerekçesi ne?","Yazılı kapsam|Sertifika kapsamıyla birebir uyum|Hariç tutulan madde için gerekçe","Kapsam metnini sertifikadaki ifadeyle eşitleyin; tasarım yapıyorsanız 8.3'ü uygulanamaz saymayın."),
 soru("c44","4","4.4",2,"Süreçleriniz, girdi-çıktıları ve etkileşimleri nerede tanımlı? Bu sürecin sahibi kim?","Süreç haritası|Süreç sahipleri|Girdi ve çıktılar|Performans göstergeleri","Her ana süreç için tek sayfalık süreç kartı hazırlayın; sahibi ve göstergesi olmayan süreç bırakmayın."),
 soru("c51","5","5.1",2,"KYS'nin işleyip işlemediğini üst yönetim olarak nereden anlıyorsunuz? Son aldığınız kalite kararı neydi?","Üst yönetimin katıldığı YGG tutanağı|Kaynak tahsisi kararları|Yöneticinin göstergeleri bilmesi","Üst yönetime denetim öncesi kısa bilgilendirme yapın: hedefler, riskler, açık DÖF'ler ve alınan kararlar."),
 soru("c52","5","5.2",1,"Kalite politikanız sahaya nasıl iletildi? Bu operatör politikayı kendi işiyle nasıl ilişkilendiriyor?","Politikanın yayınlanması (pano, eğitim)|Çalışanın politikayı işiyle bağlayabilmesi","Politikayı her birim için 'bizim işimizde bu ne demek' açıklamasıyla eğitimlere ekleyin."),
 soru("c53","5","5.3",2,"Uygunsuz ürünü durdurma yetkisi kimde? Yetki ve sorumluluklar nerede yazılı?","Organizasyon şeması|Görev tanımları|Ürünü durdurma yetkisinin yazılı olması","Görev tanımlarına ürünü durdurma, serbest bırakma ve sapma onayı yetkilerini ekleyin."),
 soru("c61","6","6.1",2,"Risk ve fırsatlarınızı nasıl belirlediniz? Bir riskin aksiyonunu ve etkinliğini gösterir misiniz?","Güncel risk kaydı|Aksiyon, sorumlu ve termin|Etkinlik değerlendirmesi","Risk kaydını süreç bazında güncelleyin; en az 3 riskin aksiyonunu ve etkinlik kontrolünü kapatın."),
 soru("c62","6","6.2",2,"Kalite hedefleriniz ölçülebilir mi? Şu an gerçekleşme nedir, sapan hedef için ne yaptınız?","Sayısal hedefler|Sorumlu ve termin|Aylık takip|Sapmada aksiyon kaydı","Her hedefe sayısal değer, sorumlu ve termin atayın; sapan hedef için aksiyon açın."),
 soru("c63","6","6.3",1,"Son dönemde yeni tezgâh, yeni süreç ya da organizasyon değişikliği oldu mu? Nasıl planlandı?","Değişiklik planı|Riske etkisinin değerlendirilmesi|Sorumlular","Basit bir değişiklik planlama formu oluşturun; son büyük değişikliği geriye dönük değerlendirin."),
 soru("c713","7","7.1.3",2,"Kritik tezgâhların bakım planı ve kayıtları nerede? Plansız duruşları nasıl izliyorsunuz?","Kritik ekipman listesi|Önleyici bakım planı|Gerçekleşme ve arıza kayıtları","Kritik ekipman listesi çıkarın; her biri için bakım planını ve gerçekleşme oranını takip edin."),
 soru("c715","7","7.1.5",3,"Bu kumpasın kalibrasyon tarihi ne? Bir cihaz kalibrasyon dışı çıkarsa geriye dönük ne yapıyorsunuz?","Cihaz listesi|Cihaz üzerinde etiket|İzlenebilir kalibrasyon sertifikası|Kabul kriteri|Sapmada geriye dönük değerlendirme kaydı","Tüm ölçüm aletlerini listeyle eşleştirin; kayıtsız ve süresi geçenleri sahadan çekin; geriye dönük değerlendirme adımını yazın."),
 soru("c716","7","7.1.6",1,"Kilit bir usta işten ayrılırsa kritik bilgi nasıl korunuyor?","Kritik bilgi için talimatlar|Yedek personel veya bilgi aktarım planı","Tek kişiye bağlı kritik bilgileri listeleyin; her biri için talimat veya yedek personel planı yapın."),
 soru("c72","7","7.2",3,"Bu operatörün bu işi yapmaya yetkin olduğunu nasıl biliyorsunuz?","Yetkinlik matrisi|Eğitim ve işbaşı eğitim kayıtları|Eğitim etkinliği değerlendirmesi|Özel proses sertifikaları","Yetkinlik matrisini güncelleyin; kritik işlerde kimin tek başına çalışabileceğini işaretleyin."),
 soru("c73","7","7.3",1,"Bu parça hatalı giderse müşteride ne olur, biliyor musunuz?","Çalışanın işinin ürüne etkisini anlatabilmesi|Farkındalık eğitim kaydı","Gerçek bir müşteri şikâyetini örnek alan kısa farkındalık eğitimleri yapın."),
 soru("c75a","7","7.5",3,"Tezgâhtaki bu resmin güncel revizyon olduğunu nereden anlıyorsunuz? Eski revizyonlar nasıl toplanıyor?","Doküman ana listesi|Revizyon ve onay bilgisi|Dağıtım ve geri toplama kaydı|Dış kaynaklı dokümanların kontrolü","Saha turu yapın, basılı resimleri ana listeyle karşılaştırın; kontrolsüz kopyaları toplayın."),
 soru("c75b","7","7.5.3",1,"Kayıtların saklama süresi, erişim yetkisi ve yedeklemesi nasıl tanımlı?","Kayıt listesi (saklama süresi, yer)|Erişim yetkisi|Yedekleme kanıtı","Kayıt listesi hazırlayın; dijital kayıtların yedeklendiğini gösteren kanıtı dosyalayın."),
 soru("c81","8","8.1",2,"Bu ürünün üretimi nasıl planlandı? Kontrol planı nerede?","İş emri ve rota|Kontrol planı|Kabul kriterleri","Kontrol planı olmayan ürün aileleri için şablon hazırlayın; kritik ölçüleri ve kontrol sıklığını yazın."),
 soru("c821","8","8.2.1",2,"Müşteri şikâyeti nasıl alınıyor, kime gidiyor, müşteriye nasıl dönülüyor?","Şikâyet kaydı|Sorumlu ve yanıt süresi|DÖF bağlantısı","Tek giriş noktalı şikâyet kaydı oluşturun; her şikâyeti DÖF'e bağlayın."),
 soru("c823","8","8.2.3",3,"Bu siparişi kabul etmeden önce şartları nasıl gözden geçirdiniz? Şartname değişikliğini nasıl yönettiniz?","Sözleşme gözden geçirme kaydı|Teknik, kapasite ve termin kontrolü|Onaylayan|Değişiklik sonrası güncellenen kayıtlar","Teklif ve sipariş aşamasına imzalı bir sözleşme gözden geçirme kontrol listesi ekleyin."),
 soru("c83","8","8.3",2,"Tasarım yapıyorsanız: bu projenin tasarım girdileri, gözden geçirme, doğrulama ve geçerli kılma kayıtları nerede?","Tasarım planı|Tasarım girdileri|Gözden geçirme tutanakları|Doğrulama ve geçerli kılma sonuçları|Değişiklik kaydı","Aşama kapılı basit bir tasarım takip formu kullanın; her kapıda gözden geçirme kaydı tutun."),
 soru("c841","8","8.4.1",2,"Tedarikçilerinizi nasıl seçip değerlendiriyorsunuz? Kötü performans gösteren tedarikçiye ne yaptınız?","Onaylı tedarikçi listesi|Seçim ve değerlendirme kriterleri|Periyodik skorlar|Düşük performansa aksiyon","Tüm aktif tedarikçilerin yıllık değerlendirmesini tamamlayın; düşük puanlılar için aksiyon yazın."),
 soru("c842","8","8.4.2",3,"Kaplama, ısıl işlem gibi dışarıda yaptırdığınız prosesleri nasıl kontrol ediyorsunuz?","Dış proses listesi|Satınalma şartları|Proses sertifikaları|Giriş kontrol kayıtları","Dış kaynaklı prosesleri listeleyin; her biri için kabul kriteri ve sertifika kontrolü tanımlayın."),
 soru("c843","8","8.4.3",2,"Satınalma siparişinde teknik şartlar, revizyon, sertifika ve muayene gerekleri yazıyor mu?","Resim revizyonu siparişte|Malzeme standardı siparişte|Sertifika ve muayene talebi","Satınalma sipariş şablonuna zorunlu teknik şart alanları ekleyin."),
 soru("c851a","8","8.5.1",3,"Operatör hangi talimata göre çalışıyor? İlk parça onayı nasıl yapılıyor, kaydı nerede?","İş talimatı|Kontrol formu|İlk parça onay kaydı ve onaylayan|Proses içi kontrol kayıtları","İlk parça onay formunu zorunlu yapın; onaysız seri üretime geçilmemesini kural haline getirin."),
 soru("c851b","8","8.5.1 f",2,"Sonradan tam doğrulanamayan prosesleri (kaynak, boya, ısıl işlem) valide ettiniz mi?","Özel proses listesi|Validasyon kaydı|Parametre kayıtları|Yetkin operatör","Özel proses listesini çıkarın; her biri için parametre aralığı ve validasyon kaydı oluşturun."),
 soru("c851g","8","8.5.1 g",2,"İnsan hatasını önlemek için hangi önlemleri aldınız? Bir örnek gösterir misiniz?","Hata önleme düzenekleri (poka-yoke, fikstür, sensör)|Kontrol listeleri veya çift kontrol|İnsan hatası kök nedenli uygunsuzluklarda sistem önlemi","'Operatör hatası' kök nedenli uygunsuzluklar için hata önleme düzeneği, kontrol listesi veya ergonomi iyileştirmesi tanımlayın."),
 soru("c852","8","8.5.2",3,"Bu parçanın hangi hammadde lotundan üretildiğini gösterebilir misiniz?","Ürün / seri no → iş emri|İş emri → malzeme lotu|Lot → malzeme sertifikası|Ürün tanımlama etiketleri","Rastgele 3 ürünle izlenebilirlik tatbikatı yapın; kopan halkayı süreç olarak düzeltin."),
 soru("c853","8","8.5.3",1,"Müşterinin size verdiği malzeme, fikstür veya dokümanı nasıl koruyorsunuz?","Müşteri mülkü listesi|Tanımlama|Hasar veya kayıpta bildirim kaydı","Müşteri mülkü için ayrı etiket ve liste oluşturun."),
 soru("c854","8","8.5.4",1,"Ürün üretim ve sevkiyat boyunca hasara karşı nasıl korunuyor ve tanımlanıyor?","Ambalaj talimatı|Raf ve alan tanımlama|Sahada etiketsiz ürün olmaması","Saha turunda etiketsiz ürün ve malzemeleri tespit edip tanımlayın."),
 soru("c856","8","8.5.6",2,"Üretimde yapılan bir değişikliği (tezgâh, parametre, operatör, malzeme) nasıl kontrol ediyorsunuz?","Değişiklik kaydı|Gözden geçirme ve onay|Gerekirse yeniden ilk parça onayı","Hangi değişikliklerde yeniden ilk parça onayı gerektiğini yazılı hale getirin."),
 soru("c86","8","8.6",3,"Ürünü sevkiyata kim serbest bırakıyor? Final muayene kaydı ve onaylayan nerede?","Final muayene kaydı|Kabul kriterleri|Serbest bırakan yetkilinin adı ve imzası","Serbest bırakma yetkililerini listeleyin; final kayıtlarında isim ve imza eksikliğini kapatın."),
 soru("c87","8","8.7",3,"Red parçalar nerede? Nasıl tanımlanıyor ve ayrılıyor? 'Olduğu gibi kullan' kararını kim veriyor?","Kırmızı etiket|Ayrılmış red alanı|Uygunsuzluk kaydı|Karar ve onaylayan|Gerekirse müşteri onayı","Kilitli veya işaretli red alanı oluşturun; sapma kabul kararını yetkili ve kayıt şartına bağlayın."),
 soru("c911","9","9.1.1",2,"Hangi göstergeleri izliyorsunuz? Son analizin ardından hangi kararı aldınız?","Gösterge tablosu|Trend grafikleri|Analiz yorumu|Alınan kararlar","Her göstergeye hedef ve aylık yorum satırı ekleyin; veri toplayıp karar almamak bulgu sebebidir."),
 soru("c912","9","9.1.2",2,"Müşteri memnuniyetini nasıl ölçüyorsunuz? Sonuçlarla ne yaptınız?","Memnuniyet ölçüm yöntemi|Zamanında teslim ve şikâyet verileri|Sonuçlara göre aksiyon","Anketin yanında müşteri skor kartlarını ve teslim performansını da kullanın."),
 soru("c92","9","9.2",3,"İç denetim programınız nasıl planlandı? Denetçiler kendi alanını mı denetliyor? Son bulgular kapandı mı?","Riske göre planlanmış program|Tüm süreçlerin kapsanması|Denetçi yetkinliği ve bağımsızlığı|Bulgular ve kapanış kayıtları","Tüm süreçleri kapsayan iç denetimi denetimden en az 4 hafta önce tamamlayın."),
 soru("c93","9","9.3",3,"Son yönetimin gözden geçirmesi tutanağını gösterir misiniz? Tüm girdiler var mı, kararlar takip edildi mi?","Tüm zorunlu girdiler|Üst yönetim katılımı|Kararlar, sorumlu ve termin|Önceki kararların takibi","YGG gündemini standardın girdi listesiyle birebir eşleyin; her karara sorumlu ve termin yazın."),
 soru("c102a","10","10.2",3,"Son 3 DÖF'ü açalım. Kök neden nasıl bulundu, aksiyonun etkinliği nasıl doğrulandı?","Düzeltme kaydı|Kök neden analizi (5 neden, balık kılçığı)|Düzeltici faaliyet|Etkinlik doğrulama tarihi ve sonucu","'Operatör dikkatsizliği' ve 'eğitim verildi' ile kapanan DÖF'leri yeniden açın, sistem kök nedenini arayın."),
 soru("c102b","10","10.2",2,"Aynı hata tekrar etti mi? Benzer ürün ve süreçlere yaygınlaştırdınız mı?","Tekrar eden uygunsuzluk analizi|Yaygınlaştırma kaydı","Uygunsuzlukları kategoriye göre sınıflandırın; tekrar edenleri üç ayda bir raporlayın."),
 soru("c103","10","10.3",1,"Son bir yılda kalite yönetim sisteminde somut bir iyileştirme örneği gösterir misiniz?","Önce/sonra verisiyle iyileştirme örneği|Öneri sistemi kayıtları","En iyi 2–3 iyileştirmeyi önce/sonra verisiyle tek sayfada hazırlayın."),
 soru("s1","S","Konfig.",3,"Parçanın konfigürasyonu (revizyon, onaylı değişiklikler) sözleşmedeki konfigürasyonla nasıl eşleştiriliyor?","Konfigürasyon yönetim planı|Onaylı değişiklik kayıtları|Sevk edilen ürünün konfigürasyon kaydı","Ürün bazında konfigürasyon durum kaydı oluşturun; müşteri onaysız değişikliği engelleyin.",1),
 soru("s2","S","FAI",2,"Yeni veya değişen parçalar için ilk ürün muayene (FAI) raporu hazırlıyor musunuz?","Tüm karakteristikleri kapsayan FAI raporu|Balonlu resim|Ölçüm sonuçları","Yeni parça ve tasarım değişikliklerinde tam FAI'yi zorunlu adım yapın.",1),
 soru("s3","S","FOD",2,"Yabancı madde hasarı (FOD) önleme programınız nasıl işliyor?","FOD talimatı|Alan kontrolleri|Alet takibi|Eğitim kayıtları","Kritik montaj alanları için FOD kontrol listesi ve alet sayımı başlatın.",1),
 soru("s4","S","Sahte parça",2,"Sahte veya şüpheli parçanın tedarik zincirine girmesini nasıl önlüyorsunuz?","Yetkili distribütör şartı|Sertifika doğrulama|Şüpheli parça karantina prosedürü","Elektronik ve standart parçalarda yalnızca yetkili kaynaktan alım kuralı koyun.",1),
 soru("s5","S","Özel proses",3,"Özel prosesler için müşteri onaylı tedarikçi ve sertifikalı operatör kullanıldığını gösterebilir misiniz?","Müşteri onaylı özel proses tedarikçi listesi|Operatör sertifikaları|Proses kalifikasyon kayıtları","Özel prosesleri müşteri onay listesiyle eşleştirin; onaysız kaynak kullanımını durdurun.",1),
 soru("s6","S","Aşağı akış",2,"Müşteri ve devlet kalite güvence şartlarını tedarikçilerinize nasıl aktarıyorsunuz?","Satınalma siparişinde aşağı akış maddeleri|Kalite güvence temsilcisi bildirimleri","Sözleşmedeki kalite maddelerini satınalma şablonuna otomatik ekleyin.",1),
 soru("s7","S","Kritik ölçü",1,"Anahtar karakteristikler ve kritik ölçüler nasıl belirlenip izleniyor?","Resimde işaretli kritik ölçüler|İstatistiksel kontrol veya %100 kontrol kayıtları","Kritik ölçüleri kontrol planında ayrı işaretleyin ve kontrol yöntemini tanımlayın.",1)
];

export const DEPTS: readonly Departman[] = [
 {k:"yonetim",n:"Üst yönetim",ic:"brief",items:[
  ["Kalite politikanızı kendi cümlelerinizle anlatır mısınız?","Ezberden okumak yerine şirketin gerçek öncelikleriyle bağlayın. Örnek: 'Savunma müşterimiz için sıfır hatalı teslim, bu yüzden final kontrolü iki aşamalı yaptık.'"],
  ["Bu yıl KYS için hangi kaynakları ayırdınız?","Somut örnek verin: yeni ölçüm cihazı, eğitim bütçesi, işe alınan kalite personeli."],
  ["Şirketin en büyük üç riski nedir, nasıl yönetiyorsunuz?","Cevap risk kaydıyla örtüşmeli. Farklı bir cevap denetçi tarafından çelişki olarak not edilir."],
  ["Geride kalan bir kalite hedefi var mı? Ne karar aldınız?","Hedefin tutmaması bulgu değildir. Aksiyon alınmaması bulgudur."],
  ["Son YGG'de hangi kararları aldınız, uygulandı mı?","Kararların sorumlu ve terminle takip edildiğini gösterin."]
 ]},
 {k:"kalite",n:"Kalite birimi",ic:"shield",items:[
  ["Son 12 ayın müşteri şikâyet trendi nasıl?","Grafik ve en sık üç nedeni hazır tutun, her biri için DÖF numarasını söyleyin."],
  ["İç denetim programını neye göre planlıyorsunuz?","Riskli süreçleri ve önceki bulguları neden daha sık denetlediğinizi anlatın."],
  ["En uzun süredir açık DÖF hangisi, neden kapanmadı?","Gecikmenin gerekçesini ve ara kontrolleri gösterin."],
  ["Kalibrasyon dışı çıkan bir cihaz için geriye dönük değerlendirme örneği var mı?","Bu soru çoğu firmayı hazırlıksız yakalar. En az bir örnek kaydı hazır olsun."],
  ["Uygunsuzluk maliyetini izliyor musunuz?","Zorunlu değil ama yönetimin karar alması için güçlü bir kanıttır."]
 ]},
 {k:"uretim",n:"Üretim / operatör",ic:"factory",items:[
  ["Şu an hangi işi yapıyorsun, talimatın nerede?","Talimatı gösterip ne işe yaradığını kısaca anlatabilmek yeterli."],
  ["Ölçtüğün ölçü tolerans dışındaysa ne yaparsın?","Doğru cevap: durdururum, işaretlerim, ustabaşına bildiririm. Kendi başına düzeltip devam etmek kötü cevaptır."],
  ["Bu resmin güncel revizyon olduğunu nereden biliyorsun?","Revizyon kontrol yöntemini (kaşe, dijital ekran, liste) bilmeli."],
  ["İlk parçayı kim onaylıyor?","İsim ve kaydın yeri."],
  ["Bu ölçü aletinin kalibrasyon tarihini gösterir misin?","Etiketi göstermeli. Süresi geçmişse bulgu anında yazılır."]
 ]},
 {k:"planlama",n:"Satış / planlama",ic:"cal",items:[
  ["Bu siparişi kabul etmeden hangi kontroller yapıldı?","Teknik, kapasite ve termin kontrolünün kaydını gösterin."],
  ["Müşteri şartname değişikliği üretime nasıl ulaşıyor?","Değişikliğin iş emrine, resme ve satınalmaya yansıdığını gösterin."],
  ["Termin değişikliği müşteriye nasıl bildiriliyor?","Yazılı bildirim ve müşteri onayı."]
 ]},
 {k:"satinalma",n:"Satınalma",ic:"cart",items:[
  ["Onaylı tedarikçi listesi dışından alım yapılır mı?","Acil durum kuralı yoksa 'hayır'. Yapıldıysa onay kaydını gösterin."],
  ["Tedarikçi değerlendirme kriterleriniz neler?","Kalite, teslimat, fiyat ağırlıkları ve son değerlendirme sonuçları."],
  ["Siparişte teknik şartlar ve sertifika talebi var mı?","Örnek bir sipariş açıp alanları gösterin."],
  ["Dış kaynaklı prosesleri nasıl kontrol ediyorsunuz?","Kaplama ve ısıl işlem sertifikaları, giriş kontrolü."]
 ]},
 {k:"depo",n:"Depo / giriş kontrol",ic:"box",items:[
  ["Gelen malzeme nasıl kabul ediliyor? Karantina alanı nerede?","Kontrol edilmemiş malzemenin kullanılamadığını gösterin."],
  ["Lot ve sertifika eşleşmesi nasıl yapılıyor?","Sertifikadaki lot ile etiketteki lotun aynı olduğunu gösterin."],
  ["Raf ömrü olan malzemeleri (boya, yapıştırıcı) nasıl takip ediyorsunuz?","Son kullanma tarihi etiketi ve ilk giren ilk çıkar kanıtı."]
 ]},
 {k:"ik",n:"İK / eğitim",ic:"grad",items:[
  ["Yeni başlayan personelin oryantasyon ve işbaşı eğitimi kaydı var mı?","Son işe girenin kaydı genelde istenir."],
  ["Eğitimin etkinliğini nasıl ölçüyorsunuz?","Sınav, uygulama gözlemi, hata oranı değişimi."],
  ["Yetkinlik matrisi ne sıklıkla güncelleniyor?","Tarihli güncelleme ve yeni personelin matriste görünmesi."]
 ]},
 {k:"bakim",n:"Bakım",ic:"wrench",items:[
  ["Önleyici bakım planı ve gerçekleşme oranı nedir?","Plan ve gerçekleşme karşılaştırması."],
  ["Arıza sonrası ürün kalitesine etki değerlendiriliyor mu?","Arıza anında üretilen parçaların kontrol edildiğine dair kayıt."],
  ["Kritik yedek parça listesi var mı?","Uzun duruşa sebep olacak parçalar için stok planı."]
 ]}
];

export const PREP: readonly HazirlikDonemi[] = [
 {t:"8–12 hafta",s:"önce",items:[["p1","Denetim tarihini, kapsamı ve denetim planını belgelendirme kuruluşuyla netleştir"],["p2","Önceki denetim bulgularının kapandığını ve etkinliğini kontrol et","10.2"],["p3","Tüm süreçleri kapsayan iç denetimi tamamla","9.2"],["p4","Yönetimin gözden geçirmesini tüm zorunlu girdilerle yap, tutanağı imzala","9.3"]]},
 {t:"4–6 hafta",s:"önce",items:[["p5","Doküman ana listesini güncelle, sahadaki eski revizyonları topla","7.5"],["p6","Kalibrasyon listesini tara; süresi yaklaşanları gönder, listede olmayanları çek","7.1.5"],["p7","Yetkinlik matrisi ve eğitim kayıtlarını güncelle","7.2"],["p8","Tedarikçi değerlendirmesini tamamla","8.4"],["p9","Risk kaydını ve hedef takip tablosunu güncelle","6.1"],["p10","Açık DÖF'leri kapat veya ilerleme kanıtını hazırla","10.2"]]},
 {t:"2 hafta",s:"önce",items:[["p11","Simülasyonu süreç sahipleriyle birlikte yap"],["p12","Rastgele bir siparişle iz sürme tatbikatı yap","8.5.2"],["p13","Saha turu: etiketsiz ürün, red alanı, ölçüm aletleri, 5S","8.7"],["p14","Süreç sahipleriyle soru kartlarından mini mülakat yap"]]},
 {t:"1 hafta",s:"önce",items:[["p15","Denetim odasını ve kanıt klasörlerini (dijital erişim dahil) hazırla"],["p16","Denetçiye eşlik edecek kişileri ve süreç sırasını belirle"],["p17","Çalışanlara denetim günü kurallarını hatırlat"],["p18","Üst yönetimin açılış ve kapanışa katılımını teyit et","5.1"]]},
 {t:"Denetim",s:"günü",items:[["p19","Açılış toplantısında plan, kapsam ve rehberleri teyit et"],["p20","Her günün sonunda bulguları ve açık soruları not al"],["p21","Kapanışta bulguların madde ve kanıtlarını netleştir"]]},
 {t:"Sonrası",s:"denetim",items:[["p22","Her bulgu için kök neden analizi yap, sadece düzeltmeyle kapatma","10.2"],["p23","DÖF planını kuruluşun verdiği süre içinde gönder"],["p24","Aksiyonların etkinliğini doğrula, bir sonraki iç denetime ekle","9.2"]]}
];

export const STAGES: readonly BelgelendirmeAsamasi[] = [
 {n:"Aşama 1",w:"Başlangıç",ic:"file",d:"Doküman ve hazırlık incelemesi. Denetçi, sistemin sahada denetlenmeye hazır olup olmadığına bakar.",f:["Kapsam ve süreç haritası","Kalite politikası ve hedefler","Tamamlanmış bir iç denetim döngüsü","Yönetimin gözden geçirmesi tutanağı"],t:"Aşama 1'de görülen eksikler Aşama 2'ye kadar kapatılmazsa bulguya dönüşür."},
 {n:"Aşama 2",w:"Birkaç hafta sonra",ic:"eye",d:"Sahada uygulama denetimi: kayıtlar, mülakatlar ve saha gözlemi.",f:["Sipariş bazlı uçtan uca iz sürme","Operatör ve yönetici mülakatları","Saha turu: etiketleme, kalibrasyon, red alanı","DÖF ve iç denetim kayıtları"],t:"Sertifika kararı bu denetime bağlıdır. Majör bulgu kapanmadan karar verilmez."},
 {n:"Gözetim",w:"1. ve 2. yıl",ic:"cal",d:"Yıllık, daha kısa denetim. Sistemin işlemeye devam ettiği örneklenir.",f:["Önceki bulguların kapanışı","Kritik süreçler ve değişiklikler","İç denetim ve YGG","Müşteri şikâyetleri"],t:"Geçen yılın bulgusu tekrar ederse genelde bir üst seviyeden yazılır."},
 {n:"Yeniden belgelendirme",w:"3. yıl",ic:"reset",d:"Sistemin tamamı yeniden denetlenir, sertifika üç yıl daha uzar.",f:["Üç yıllık performans trendi","Sistemin olgunluğu","Tüm maddeler"],t:"Sertifikanın süresi dolmadan tamamlanması gerekir."}
];

export const DOCS: readonly ZorunluDokuman[] = [
 ["d1","4.3","KYS kapsamı ve uygulanamayan şartların gerekçesi","Doküman"],["d2","4.4","Süreçlerin işletilmesini destekleyen bilgiler","Doküman"],["d3","5.2","Kalite politikası","Doküman"],["d4","6.2","Kalite hedefleri","Doküman"],
 ["d19","7.1.5.2","Ulusal/uluslararası standart yoksa kalibrasyon dayanağı","Kayıt"],["d5","7.1.5","Ölçüm cihazlarının uygunluk kanıtı, kalibrasyon kayıtları","Kayıt"],["d6","7.2","Yetkinlik kanıtı (eğitim, sertifika, deneyim)","Kayıt"],["d7","8.2.3","Müşteri şartlarının gözden geçirme sonuçları","Kayıt"],["d8","8.3","Tasarım girdileri, kontrolleri, çıktıları, değişiklikleri","Kayıt"],
 ["d20","8.1 e","Proseslerin planlandığı gibi yürütüldüğüne ve ürün uygunluğuna güven veren bilgiler","Doküman"],["d21","8.5.1 a","Ürün özellikleri ve elde edilecek sonuçlar","Doküman"],["d9","8.4.1","Tedarikçi seçim, değerlendirme ve izleme sonuçları","Kayıt"],["d10","8.5.2","İzlenebilirlik (benzersiz tanımlama)","Kayıt"],["d11","8.5.3","Kaybolan veya hasar gören müşteri mülkü","Kayıt"],["d12","8.5.6","Üretim değişikliklerinin gözden geçirilmesi","Kayıt"],
 ["d13","8.6","Ürün serbest bırakma ve yetkili kişi","Kayıt"],["d14","8.7.2","Uygunsuz çıktılar, kararlar, onaylayan","Kayıt"],["d15","9.1.1","İzleme ve ölçme sonuçları","Kayıt"],["d16","9.2.2","İç denetim programı ve sonuçları","Kayıt"],
 ["d17","9.3.3","Yönetimin gözden geçirmesi sonuçları","Kayıt"],["d18","10.2.2","Uygunsuzluklar ve düzeltici faaliyetler","Kayıt"]
];

export const CHAIN: readonly IzHalkasi[] = [
 {k:"t1",n:"Teklif / sipariş",c:"8.2",ic:"file",s:"Sözleşme gözden geçirme kaydı, teknik şartname ve revizyonu, termin teyidi."},
 {k:"t2",n:"Planlama",c:"8.1",ic:"cal",s:"İş emri, rota, kontrol planı."},
 {k:"t3",n:"Satınalma",c:"8.4",ic:"cart",s:"Onaylı tedarikçi, sipariş şartları, malzeme sertifikası, giriş kontrolü."},
 {k:"t4",n:"Üretim",c:"8.5",ic:"factory",s:"Talimat, güncel resim, ilk parça onayı, operatörün yetkinliği, kullanılan aletin kalibrasyonu."},
 {k:"t5",n:"İzlenebilirlik",c:"8.5.2",ic:"link",s:"Ürün veya seri no → iş emri → hammadde lotu → sertifika."},
 {k:"t6",n:"Final kontrol",c:"8.6",ic:"clip",s:"Muayene kaydı ve serbest bırakan yetkili."},
 {k:"t7",n:"Uygunsuzluk",c:"8.7",ic:"alert",s:"Varsa red kaydı, karar, onay ve ilgili DÖF."},
 {k:"t8",n:"Müşteri",c:"9.1.2",ic:"users",s:"Sevk, geri bildirim veya şikâyet kaydı."}
];

export const SCALE: readonly PuanAciklamasi[] = [{v:"0",t:"Kanıt yok",d:"Uygulanmıyor ya da gösteremiyoruz"},{v:"1",t:"Kısmen",d:"Var ama eksik veya tutarsız"},{v:"2",t:"Uygun",d:"Çalışıyor, zayıf noktaları var"},{v:"3",t:"Tam uygun",d:"Kayıtlarla kanıtlanıyor"},{v:"na",t:"N/A",d:"Bizde uygulanmıyor"}];
export const EXAMPLE: Record<string, Cevap> = {c41:"2",c42:"1",c43:"3",c44:"2",c51:"2",c52:"2",c53:"3",c61:"1",c62:"2",c63:"1",c713:"2",c715:"1",c716:"2",c72:"2",c73:"3",c75a:"1",c75b:"2",c81:"3",c821:"3",c823:"2",c83:"na",c841:"1",c842:"2",c843:"2",c851a:"3",c851b:"2",c851g:"1",c852:"2",c853:"3",c854:"2",c856:"1",c86:"3",c87:"2",c911:"2",c912:"2",c92:"2",c93:"1",c102a:"1",c102b:"2",c103:"2"};

export const TYPES_ISO: readonly string[] = ["Aşama 1","Aşama 2 (ilk belgelendirme)","1. gözetim","2. gözetim","Yeniden belgelendirme","2026 geçiş denetimi","Müşteri / ikinci taraf denetimi","İç denetim / ön denetim"];
export const TYPES_AS: readonly string[] = ["Aşama 1","Aşama 2 (ilk belgelendirme)","1. gözetim","2. gözetim","Yeniden belgelendirme","IA9100 geçiş denetimi","Müşteri / ikinci taraf denetimi","İç denetim / ön denetim"];
export const TYPES_EY: readonly string[] = ["Ön değerlendirme (iç / danışman)","EYDEP saha değerlendirmesi","EYDEP yeniden değerlendirme"];

export const SEV_ISO: readonly BulguSeviyesiTanimi[] = [
 {k:"major",n:"Majör",d:"Bir şart hiç karşılanmıyor ya da uygun olmayan ürün müşteriye gidebilir.",ex:["Kalibrasyon sistemi hiç yok","İç denetim hiç yapılmamış","Uygunsuz ürünün müşteriye gittiği kanıtlanmış","Aynı minör bulgunun tekrarı"],cons:"Kapanmadan sertifika kararı verilmez."},
 {k:"minor",n:"Minör",d:"Tekil, sistemik olmayan sapma. Şart genel olarak karşılanıyor.",ex:["20 cihazdan birinin kalibrasyonu geçmiş","Bir personelin eğitim kaydı eksik","Bir DÖF'ün etkinlik kontrolü yapılmamış"],cons:"Düzeltici faaliyet planı istenir, sonraki denetimde bakılır."},
 {k:"obs",n:"Gözlem",d:"Şart karşılanıyor ama zayıf ya da ileride sapmaya dönebilir.",ex:["Risk tablosu güncel ama aksiyonlar yüzeysel","Göstergeler izleniyor ama yorum zayıf"],cons:"Zorunlu aksiyon yok, sonraki denetimde tekrar bakılır."}
];
