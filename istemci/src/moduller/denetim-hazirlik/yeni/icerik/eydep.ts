import type { AsamaRengi, BelgelendirmeAsamasi, BulguSeviyesiTanimi, Departman, HazirlikDonemi, IzHalkasi, Madde, Soru, ZorunluDokuman } from '../tipler.ts';

// EYDEP içeriği (hazırlık soruları; resmi soru setinin kopyası değildir, prototipteki not aynen).
export const CL_EY: Record<string, Madde> = {
 "K":{n:"Kurumsallık",s:"Kurumsallık",ic:"brief",ph:0,looks:["Strateji, iş planı ve savunma sanayi hedefleri","Organizasyon, görev tanımları ve vekâlet","Süreçlerin kişilerden bağımsız işlemesi","Yönetim sistemi sertifikaları","ERP ve kayıtların sistemde olması"],pit:["Bilginin birkaç kişide toplanması","Kâğıtta ve dağınık Excel dosyalarında kalan kayıtlar"]},
 "P":{n:"Personel",s:"Personel",ic:"users",ph:0,looks:["Mühendis, teknisyen, operatör dağılımı","Kritik işlerde sertifikalı personel","Eğitim planı ve yetkinlik matrisi","Devir oranı ve yedekleme"],pit:["Kritik işin tek kişiye bağlı olması","Süresi geçmiş personel sertifikaları"]},
 "G":{n:"Emniyet ve güvenlik",s:"Güvenlik",ic:"shield",ph:0,looks:["Tesis güvenliği ve gizli bilgi","Bilgi güvenliği ve teknik verinin korunması","İş sağlığı ve güvenliği","Fiziksel güvenlik ve çevre"],pit:["Teknik veriye kontrolsüz erişim","Yedeklemesi olmayan kayıtlar"]},
 "F":{n:"Finans",s:"Finans",ic:"chart",ph:0,looks:["Son yılların mali tabloları ve eğilim","Vergi ve SGK borç durumu","Maliyet muhasebesi ve fiyatlandırma","Yatırım planı ve finansman"],pit:["Güncel olmayan borç yazıları","İş bazında maliyetin bilinmemesi"]},
 "R":{n:"Ar-Ge",s:"Ar-Ge",ic:"bulb",ph:1,looks:["Proses ve ürün geliştirme faaliyetleri","Destekli projeler","İş birlikleri","Fikri mülkiyet"],pit:["Geliştirme çalışmalarının kayıt altında olmaması"]},
 "A":{n:"Altyapı",s:"Altyapı",ic:"layers",ph:1,looks:["Makine parkı, kapasite ve kullanım oranı","Ölçüm ve test altyapısı","Bakım ve kullanılabilirlik","Tesis düzeni, CAD/CAM"],pit:["Tahmine dayalı kapasite verisi","Kalibrasyonu takip edilmeyen cihazlar"]},
 "J":{n:"Proje yönetimi",s:"Proje",ic:"cal",ph:1,looks:["Sipariş ve proje planları","Zamanında teslimat performansı","Proje riskleri","Kapasite planlama ve değişiklik yönetimi"],pit:["Teslimat verisi var, aksiyon yok","Termin değişikliklerinin kayıtsız yönetilmesi"]},
 "Q":{n:"Kalite yönetimi",s:"Kalite",ic:"clip",ph:1,looks:["İç denetim, YGG ve DÖF etkinliği","İzlenebilirlik","Kontrol planı ve FAI","Tedarikçi ve fason kontrolü","Kalite göstergeleri"],pit:["Sertifikası olan ama sahada yaşamayan sistem","'Eğitim verildi' ile kapatılan DÖF'ler"]},
 "U":{n:"Üretim",s:"Üretim",ic:"factory",ph:1,looks:["İş emri ve rota kartının sistemde izlenmesi","Proses yeterliliği ve istatistiksel kontrol","Özel prosesler","Yalın üretim ve verimlilik"],pit:["Operasyon onaylarının kâğıtta kalması","Ölçülmeyen fire ve verimlilik"]},
 "T":{n:"Teknik alan",s:"Teknik alan",ic:"ruler",ph:1,looks:["İşlenebilen malzemeler","Tolerans ve yüzey kabiliyeti","Parça boyutu ve karmaşıklığı","Savunma ve havacılık standartlarında deneyim"],pit:["Kabiliyet iddiasının ölçüm raporuyla desteklenmemesi"]}
};
export const EY_KEYS: readonly string[] = ["K","P","G","F","R","A","J","Q","U","T"];
export const PHASES_EY: readonly AsamaRengi[] = [{n:"Genel-ortak sorular",ton:"vurgu"},{n:"Üretim yetkinliği",ton:"bilgi"}];
const soruEy = (id: string, g: string, w: 1 | 2 | 3, q: string, ev: string, fix: string): Soru => ({ id, g, c: CL_EY[g]?.s ?? g, w, q, ev: ev.split('|'), fix, d: false });
export const Q_EY: readonly Soru[] = [
 soruEy("k1","K",2,"Savunma sanayine yönelik stratejiniz ve iş planınız nedir? Hedefleriniz ölçülebilir mi?","Yazılı strateji ve iş planı|Savunma sanayi hedefleri (ürün, müşteri, ciro)|Hedeflerin takibi","Savunma sanayine yönelik üç yıllık hedefleri ve yatırım planını tek sayfada yazın."),
 soruEy("k2","K",2,"Organizasyon şemanız ve görev tanımlarınız güncel mi? Kilit bir kişi yokken işler nasıl yürüyor?","Güncel organizasyon şeması|Görev tanımları|Vekâlet ve yedekleme tablosu","Kilit pozisyonlar için vekâlet tablosu hazırlayın; görev tanımlarını şemayla eşleyin."),
 soruEy("k3","K",3,"Süreçleriniz tanımlı mı ve kişilerden bağımsız işliyor mu? Bir süreci kayıtlarıyla baştan sona gösterebilir misiniz?","Süreç haritası ve prosedürler|Süreç sahipleri ve göstergeler|Kayıtların sistemde tutulması","Ana süreçleri akış ve kayıtlarıyla tanımlayın; bilgiyi kişilerden sisteme taşıyın."),
 soruEy("k4","K",3,"Hangi yönetim sistemi belgeleriniz var (ISO 9001, AS9100, AQAP 2110, ISO 27001)? Geçerli ve kapsamı faaliyetinizi karşılıyor mu?","Geçerli sertifikalar|Kapsamın savunma faaliyetiyle uyumu|Son denetim raporları ve bulgu kapanışları","Sertifika kapsamlarını savunma ürünlerinizle karşılaştırın; eksik standart için yol haritası çıkarın."),
 soruEy("k5","K",2,"Sipariş, stok, üretim ve kalite kayıtlarınızı ERP veya benzeri bir sistemden anlık gösterebilir misiniz?","ERP / MRP kullanımı|Sipariş–iş emri–stok bağlantısı|Kalite kayıtlarına dijital erişim|Kullanıcı yetkilendirmesi","Heyete 'sistemden göster' senaryolarını prova edin; kâğıtta kalan kritik kayıtları sisteme taşıyın."),
 soruEy("k6","K",1,"YETEN kaydınız güncel mi? Yetenek, ürün ve tezgâh bilgileri sahadaki durumla örtüşüyor mu?","Güncel YETEN kaydı|Tezgâh ve yetenek listesiyle tutarlılık","YETEN kaydını değerlendirmeden önce makine ve yetenek listenizle eşleştirin."),
 soruEy("k7","K",1,"Savunma sanayi referanslarınızı belgeyle gösterebilir misiniz?","Referans listesi (müşteri, ürün, yıl, adet)|Sipariş veya sözleşme örnekleri|Ana yüklenici onaylı tedarikçi yazıları","Referans dosyası hazırlayın: müşteri, ürün, yıl, miktar ve belge."),
 soruEy("p1","P",2,"Personel yapınız nedir? Mühendis, teknisyen ve operatör sayıları, eğitim düzeyleri ve savunma deneyimi.","Personel listesi ve dağılım|Eğitim düzeyleri|Savunma deneyimi olan personel","Personel dağılımını ve yetkinliklerini tek tabloya dökün."),
 soruEy("p2","P",3,"Kritik işlerde (CNC programlama, ölçüm, özel prosesler) yetkin ve sertifikalı personeliniz kim? Yedeği var mı?","Yetkinlik matrisi|Personel sertifikaları ve geçerlilik tarihleri|Yedek personel","Kritik işler için yetkinlik matrisini güncelleyin; sertifika geçerlilik takibi kurun."),
 soruEy("p3","P",2,"Yıllık eğitim planınız ve gerçekleşme oranı nedir? Eğitimin etkinliğini nasıl ölçüyorsunuz?","Yıllık eğitim planı|Gerçekleşme kayıtları|Etkinlik değerlendirmesi","Eğitim planını gerçekleşmeyle karşılaştırın; etkinliği sınav veya uygulama gözlemiyle ölçün."),
 soruEy("p4","P",1,"Personel devir oranınız nedir? Kilit bir usta ayrılırsa kritik bilgi nasıl korunuyor?","Devir oranı verisi|Bilgi aktarım ve yedekleme planı|Kritik işler için talimatlar","Tek kişiye bağlı kritik bilgileri listeleyin; her biri için talimat veya yedek personel planı yapın."),
 soruEy("p5","P",1,"Çalışanlar gizlilik, konfigürasyon ve FOD gibi savunma sanayi konularında eğitim aldı mı?","Farkındalık eğitim kayıtları|Gizlilik taahhütleri","Savunma sanayi farkındalık eğitimini oryantasyona ekleyin."),
 soruEy("g1","G",2,"Gizlilik dereceli bilgi ve dokümanları nasıl koruyorsunuz? Tesis güvenlik belgeniz var mı ya da süreç ne durumda?","Tesis güvenlik belgesi veya başvuru|Gizlilik sözleşmeleri|Gizli doküman erişim listesi","Gizli bilgi erişim listesini ve gizlilik sözleşmelerini tamamlayın; tesis güvenlik belgesi için yol haritası çıkarın."),
 soruEy("g2","G",3,"Bilgi güvenliği: teknik veriye (resim, NC programı) erişim, yedekleme ve siber güvenlik nasıl sağlanıyor?","Erişim yetkilendirme kaydı|Yedekleme ve geri yükleme testi|Güvenlik duvarı ve antivirüs|Taşınabilir bellek politikası","Teknik veri erişimini rol bazlı yapın; yedeklerin geri yüklenebildiğini test edip kaydedin."),
 soruEy("g3","G",2,"İş sağlığı ve güvenliği: risk değerlendirmesi, eğitimler ve kaza kayıtları güncel mi?","Güncel risk değerlendirmesi|İSG eğitim kayıtları|Kaza ve ramak kala kayıtları","Risk değerlendirmesini güncelleyin; ramak kala bildirimlerini kayıt altına alın."),
 soruEy("g4","G",1,"Fiziksel güvenlik: giriş kontrolü, ziyaretçi kaydı ve müşteri ürünlerinin korunması nasıl?","Giriş kontrol sistemi|Ziyaretçi kaydı|Kamera ve alan kısıtlamaları","Ziyaretçi kaydını ve kısıtlı alanları tanımlayın."),
 soruEy("g5","G",1,"Çevre yönetimi: atık, kimyasal ve çevre izinleri nasıl yönetiliyor?","Atık yönetim kayıtları|Kimyasal listesi ve güvenlik bilgi formları|Gerekli çevre izinleri","Atık ve kimyasal kayıtlarını düzenleyin; izinlerin geçerliliğini kontrol edin."),
 soruEy("f1","F",2,"Son üç yılın bilanço ve gelir tabloları ne gösteriyor? Ciro, kârlılık ve özkaynak eğilimi nasıl?","Son 3 yılın mali tabloları|Ciro ve kârlılık trendi|Özkaynak ve borçluluk oranları","Mali göstergeleri üç yıllık trend olarak tek sayfada özetleyin."),
 soruEy("f2","F",2,"Vergi ve SGK borcunuz yok mu? Güncel yazılar hazır mı?","Vergi borcu yoktur yazısı|SGK borcu yoktur yazısı","Borç yoktur yazılarını değerlendirmeye yakın bir tarihte alın."),
 soruEy("f3","F",1,"Maliyet muhasebesi yapıyor musunuz? İş veya ürün bazında maliyet ve teklif fiyatı nasıl hesaplanıyor?","Maliyet muhasebesi|İş bazında maliyet raporu|Teklif hesaplama yöntemi","Tamamlanan birkaç işin gerçek maliyetini teklifle karşılaştırın."),
 soruEy("f4","F",1,"Savunma sanayi cirosunun toplam ciro içindeki payı ve ihracat oranı nedir?","Savunma cirosu payı|İhracat verisi","Ciroyu sektör ve müşteri bazında raporlayın."),
 soruEy("f5","F",1,"Yatırım planınız ve finansman kaynaklarınız (teşvik, destek, kredi) nedir?","Yatırım planı|Teşvik belgeleri|Destek başvuruları","Önümüzdeki iki yılın yatırım planını tutar ve kaynakla yazın."),
 soruEy("r1","R",2,"Ar-Ge veya proses geliştirme faaliyetiniz var mı? Bütçe ve personel ayrıldı mı?","Ar-Ge ya da tasarım merkezi veya birimi|Ar-Ge bütçesi|Geliştirme proje listesi","Geliştirme çalışmalarını proje olarak kaydedin: hedef, bütçe, sonuç."),
 soruEy("r2","R",1,"Son üç yılda geliştirdiğiniz yeni proses, yöntem veya ürün örneği var mı? Patent veya faydalı model?","Önce/sonra verisiyle geliştirme örneği|Patent, faydalı model veya tescil","En iyi iki geliştirmeyi önce/sonra verisiyle tek sayfada hazırlayın."),
 soruEy("r3","R",1,"Destekli projeleriniz (TÜBİTAK, KOSGEB, SSB, kalkınma ajansı) oldu mu?","Proje sözleşmeleri|Proje çıktıları","Destekli projeleri ve çıktılarını listeleyin."),
 soruEy("r4","R",1,"Üniversite, test merkezi veya ana yüklenicilerle iş birliğiniz var mı?","İş birliği protokolleri|Ortak proje veya test kayıtları","İş birliklerini ve somut çıktılarını belgeleyin."),
 soruEy("a1","A",3,"Makine parkınız nedir (tip, eksen, tabla, hassasiyet, yaş)? Kapasite kullanım oranınızı veriyle gösterebilir misiniz?","Makine listesi (marka, model, eksen, yıl)|Kapasite ve doluluk verisi|Darboğaz analizi","Makine listesini kapasite ve kullanım verisiyle güncelleyin."),
 soruEy("a2","A",3,"Ölçüm ve test altyapınız nedir (CMM, yüzey, sertlik vb.)? Kalibrasyon ve ortam koşulları nasıl?","Ölçüm ve test cihaz listesi|Kalibrasyon sertifikaları|Ölçüm odası ortam koşulları|Ölçüm sistemi analizi","Cihaz listesini kalibrasyon ve izlenebilirlik bilgisiyle güncelleyin; ölçüm odası koşullarını kaydedin."),
 soruEy("a3","A",2,"Önleyici bakım planınız ve gerçekleşme oranı nedir? Plansız duruşları izliyor musunuz?","Önleyici bakım planı|Gerçekleşme oranı|Arıza ve duruş kayıtları","Kritik tezgâhlar için bakım planı ve gerçekleşme takibi kurun."),
 soruEy("a4","A",2,"Tesis düzeni, depolama ve ayrılmış alanlar (karantina, red, müşteri mülkü) nasıl? 5S uygulanıyor mu?","Yerleşim planı|Tanımlı karantina ve red alanları|5S denetim kayıtları","Karantina, red ve müşteri mülkü alanlarını işaretleyin; 5S denetimlerini düzenli yapın."),
 soruEy("a5","A",1,"CAD/CAM yazılımlarınız lisanslı mı? NC programları nasıl yönetiliyor?","Lisanslı CAD/CAM|NC program revizyon kontrolü|Program doğrulama (simülasyon)","NC programlarını revizyonlu arşivleyin; ilk kullanımda doğrulama kaydını zorunlu yapın."),
 soruEy("j1","J",2,"Siparişler proje olarak mı yönetiliyor? Plan, sorumlu ve kilometre taşları var mı?","Sipariş veya proje planı|Sorumlular|İlerleme takibi","Önemli siparişler için basit bir proje planı ve ilerleme takibi kullanın."),
 soruEy("j2","J",3,"Zamanında teslimat oranınız nedir? Gecikmeleri nasıl izliyor ve müşteriye nasıl bildiriyorsunuz?","12 aylık zamanında teslimat verisi|Gecikme nedenleri analizi|Müşteri bildirim kayıtları","Zamanında teslimatı aylık ölçün; gecikme nedenlerini sınıflandırıp aksiyon açın."),
 soruEy("j3","J",2,"Proje risklerini (malzeme, kapasite, tedarikçi) nasıl belirleyip yönetiyorsunuz?","Proje risk listesi|Önlemler ve sorumlular","Kritik siparişler için risk listesi tutun."),
 soruEy("j4","J",1,"Kapasite planlama ve üretim çizelgeleme hangi araçla yapılıyor?","Kapasite planı|Çizelgeleme aracı|Planlanan ve gerçekleşen karşılaştırması","Kapasite planını haftalık güncelleyin; planlanan ve gerçekleşeni karşılaştırın."),
 soruEy("j5","J",1,"Müşteri değişiklik talepleri maliyete ve termine nasıl yansıtılıyor?","Değişiklik talebi kaydı|Maliyet ve termin etkisi|Müşteri onayı","Değişiklik taleplerini kayıt altına alıp maliyet ve termin etkisini müşteriye yazılı bildirin."),
 soruEy("q1","Q",3,"İç denetim ve yönetimin gözden geçirmesi sonuç üretiyor mu? Son kayıtları gösterebilir misiniz?","İç denetim programı ve raporları|YGG tutanağı ve kararları|Kararların takibi","İç denetim ve YGG kararlarını sorumlu ve terminle takip edin."),
 soruEy("q2","Q",3,"Uygunsuzluk ve DÖF sürecinde kök nedeni nasıl buluyor, etkinliği nasıl doğruluyorsunuz?","Kök neden analizleri|Etkinlik doğrulama kayıtları|Tekrar eden hata takibi","'Eğitim verildi' ile kapanan DÖF'leri yeniden açıp sistem kök nedenini arayın."),
 soruEy("q3","Q",3,"Sevk edilmiş bir parçadan hammadde sertifikasına kadar izlenebilirliği ne kadar sürede gösterebilirsiniz?","Seri/lot → iş emri|İş emri → malzeme lotu ve sertifika|Operatör ve cihaz bilgisi|Sistemden dakikalar içinde gösterim","Rastgele üç ürünle izlenebilirlik tatbikatı yapın ve süreyi ölçün."),
 soruEy("q4","Q",2,"Kontrol planları, ilk ürün muayenesi (FAI) ve proses içi kontrol kayıtlarınız var mı?","Kontrol planları|FAI raporları|Proses içi kontrol kayıtları","Ürün aileleri için kontrol planı hazırlayın; yeni parçalarda FAI'yi zorunlu yapın."),
 soruEy("q5","Q",2,"Tedarikçi ve fason proseslerinizi (kaplama, ısıl işlem) nasıl seçiyor ve kontrol ediyorsunuz?","Onaylı tedarikçi listesi|Değerlendirme sonuçları|Fason sertifikaları ve giriş kontrolü","Tedarikçi değerlendirmesini tamamlayın; fason prosesler için kabul kriteri tanımlayın."),
 soruEy("q6","Q",2,"Kalite göstergelerini (iç hata, müşteri iadesi, hurda maliyeti) izliyor musunuz?","Gösterge tablosu ve trend|Hurda ve yeniden işleme maliyeti|Aksiyon kayıtları","Hurda, yeniden işleme ve iade maliyetini aylık raporlayın."),
 soruEy("q7","Q",1,"Resim revizyonları ve müşteri değişiklikleri sahaya nasıl ulaşıyor?","Doküman ana listesi|Revizyon kontrolü|Eski revizyonların toplanması","Sahadaki basılı resimleri ana listeyle karşılaştırın; kontrolsüz kopyaları toplayın."),
 soruEy("u1","U",3,"İş emri, rota kartı ve operasyon onayları sistemde mi? Bir iş emrinin durumunu anlık gösterebilir misiniz?","ERP veya MES'te iş emri|Rota kartı ve operasyon onayları|Anlık durum görünümü","İş emri durumlarını sistemden izleyin; operasyon onaylarını dijitale taşıyın."),
 soruEy("u2","U",3,"Ana proseslerinizde proses yeterliliği (Cp/Cpk) veya istatistiksel kontrol uyguluyor musunuz?","Kritik ölçüler için yeterlilik çalışması|İstatistiksel kontrol kayıtları|Yetersiz proseste aksiyon","Kritik ölçülerde yeterlilik çalışması yapın; yetersiz proseslerde %100 kontrol veya iyileştirme uygulayın."),
 soruEy("u3","U",2,"Özel prosesler (kaynak, kaplama, ısıl işlem, NDT) içeride mi dışarıda mı? Kalifikasyon ve sertifikalar nerede?","Özel proses listesi|Proses kalifikasyonu veya sertifikaları|Sertifikalı operatörler|Parametre kayıtları","Özel proses kalifikasyonlarını ve operatör sertifikalarını dosyalayın."),
 soruEy("u4","U",2,"Yalın üretim uygulamalarınız neler (5S, SMED, değer akışı, kanban)?","Uygulama örnekleri|Önce/sonra verisi","Bir yalın uygulamayı önce/sonra verisiyle belgeleyin."),
 soruEy("u5","U",2,"Verimlilik, fire ve hurda oranlarını ölçüyor musunuz? İyileştirme örneği var mı?","Verimlilik veya OEE verisi|Fire ve hurda oranları|İyileştirme projeleri","Fire ve hurda oranlarını aylık izleyin; en yüksek üç nedene aksiyon açın."),
 soruEy("u6","U",1,"Fikstür, takım ve aparatlar nasıl tasarlanıyor, doğrulanıyor ve saklanıyor?","Fikstür listesi|Doğrulama kayıtları|Tanımlı saklama alanı","Fikstürleri numaralandırıp doğrulama ve saklama kaydı tutun."),
 soruEy("t1","T",3,"Hangi malzemeleri işleyebiliyorsunuz (alüminyum, titanyum, paslanmaz, süper alaşımlar)? Örnek iş gösterebilir misiniz?","Malzeme bazında örnek işler|Malzeme sertifikaları|Takım ve parametre bilgisi","Malzeme bazında yetenek tablosu ve örnek iş dosyası hazırlayın."),
 soruEy("t2","T",3,"Tolerans ve yüzey kalitesi kabiliyetiniz nedir? En hassas işinizin ölçüm raporunu gösterebilir misiniz?","Tolerans ve yüzey kabiliyeti tablosu|Ölçüm raporları|CMM çıktıları","En hassas üç işinizin ölçüm raporlarını dosyalayın."),
 soruEy("t3","T",2,"Parça boyutu ve karmaşıklık aralığınız nedir (5 eksen, ince cidar, derin cep)?","Boyut ve karmaşıklık aralığı|Örnek parça fotoğrafları ve raporları","Kabiliyet aralığınızı örnek parçalarla tek sayfada gösterin."),
 soruEy("t4","T",2,"Savunma ve havacılık standartlarına (MIL, STANAG, AMS, NAS) göre üretim deneyiminiz var mı?","Standart şartlı sipariş örnekleri|İlgili sertifika ve raporlar","Standart şartlı işlerinizi ve kanıtlarını listeleyin."),
 soruEy("t5","T",1,"Montaj, test veya alt sistem seviyesinde kabiliyetiniz var mı?","Montaj ve test örnekleri|Test kayıtları","Montaj ve test kabiliyetini örnek işlerle belgeleyin.")
];

export const DEPTS_EY: readonly Departman[] = [
 {k:"yonetim",n:"Genel müdür",ic:"brief",items:[
  ["Firmanızı ve savunma sanayindeki hedefinizi anlatır mısınız?","Veriye dayalı konuşun: savunma cirosu payı, müşteriler, yatırımlar ve üç yıllık hedef."],
  ["Önümüzdeki dönemde hangi yatırımları planlıyorsunuz?","Makine, insan kaynağı, sertifika; tarih ve bütçeyle birlikte."],
  ["Firmada bilgi kişilere mi, sisteme mi bağlı?","Süreçlerin ve kayıtların sistemde olduğunu bir örnekle gösterin."],
  ["En güçlü ve en zayıf alanınız hangisi?","Dürüst olun; zayıf alan için gelişim planını gösterin."]
 ]},
 {k:"mali",n:"Mali işler",ic:"chart",items:[
  ["Son üç yılın ciro ve kârlılık eğilimi nasıl?","Mali tabloları ve özet grafiği hazır tutun."],
  ["Vergi ve SGK borç durumunuz nedir?","Güncel borç yoktur yazılarını gösterin."],
  ["Bir işin maliyetini nasıl hesaplıyorsunuz?","Tamamlanmış bir işin maliyet dökümünü teklifle karşılaştırarak gösterin."]
 ]},
 {k:"kalite",n:"Kalite",ic:"shield",items:[
  ["Son DÖF'lerinizden birinin kök nedenini ve etkinlik doğrulamasını gösterir misiniz?","'Eğitim verildi' ile kapatılmış DÖF zayıf görünür."],
  ["Bu parçanın hammaddesine kadar izini sürebilir misiniz?","Sistemden, dakikalar içinde göstermek güçlü bir kanıttır."],
  ["Kalite maliyetinizi biliyor musunuz?","Hurda, yeniden işleme ve iade: tutar ve trend."]
 ]},
 {k:"uretim",n:"Üretim / planlama",ic:"factory",items:[
  ["Kapasite kullanım oranınız nedir, darboğaz neresi?","Veriyle gösterin; tahmin zayıf kalır."],
  ["Bu iş emrinin durumunu sistemden gösterebilir misiniz?","Anlık gösterim güçlü bir kanıttır."],
  ["Zamanında teslimat oranınız nedir?","12 aylık veri, gecikme nedenleri ve aksiyonlar."],
  ["Kritik ölçülerde proses yeterliliğinizi biliyor musunuz?","Cp/Cpk çalışması veya %100 kontrol kaydı."]
 ]},
 {k:"teknik",n:"Teknik / mühendislik",ic:"ruler",items:[
  ["En zor işlediğiniz malzeme ve en dar toleransınız nedir?","Örnek parça ve ölçüm raporuyla gösterin."],
  ["NC programlarını nasıl doğruluyor ve arşivliyorsunuz?","Simülasyon, onay ve revizyon kaydı."]
 ]},
 {k:"satinalma",n:"Tedarik",ic:"cart",items:[
  ["Fason prosesleri nasıl kontrol ediyorsunuz?","Sertifika, giriş kontrolü, tedarikçi değerlendirmesi."],
  ["Kritik malzemede alternatif kaynağınız var mı?","Tek kaynak riskini ve planınızı gösterin."]
 ]},
 {k:"ik",n:"İnsan kaynakları",ic:"grad",items:[
  ["Kritik işlerde sertifikalı kaç personeliniz var?","Sertifika ve geçerlilik listesiyle."],
  ["Kilit bir personel ayrılırsa ne olur?","Yedekleme ve bilgi aktarım planı."],
  ["Eğitimin etkinliğini nasıl ölçüyorsunuz?","Sınav, uygulama gözlemi, hata oranı değişimi."]
 ]},
 {k:"bilgi",n:"Bilgi işlem / güvenlik",ic:"globe",items:[
  ["Teknik verilere ve NC programlarına kimler erişebiliyor?","Erişim listesi ve yetkilendirme kaydı."],
  ["Kayıtlarınız nasıl yedekleniyor, geri yükleme test edildi mi?","Yedekleme sıklığı ve geri yükleme testi kaydı."]
 ]}
];

export const PREP_EY: readonly HazirlikDonemi[] = [
 {t:"3+ ay",s:"önce",items:[["p1","YETEN kaydını güncelle: yetenekler, ürünler, tezgâhlar","YETEN"],["p2","Öz değerlendirmeyi (bu simülasyon) alan sorumlularıyla yap"],["p3","Gelişim alanları için aksiyon planı ve sorumlular belirle"],["p4","Resmi talep yazısını SSB Sanayileşme Dairesi Başkanlığı'na gönder","Başvuru"]]},
 {t:"1–3 ay",s:"önce",items:[["p5","Sertifikaları ve kapsamlarını kontrol et","Kurumsallık"],["p6","Makine, ölçüm cihazı ve personel listelerini güncelle","Altyapı"],["p7","Savunma referans dosyasını hazırla","Kurumsallık"],["p8","Dağınık kayıtları sisteme taşı; 'sistemden göster' senaryolarını prova et","Kurumsallık"],["p9","Rastgele üç ürünle izlenebilirlik tatbikatı yap","Kalite"],["p9b","Zamanında teslimat ve kalite göstergelerini 12 aylık hazırla","Proje"]]},
 {t:"15–30 gün",s:"önce",items:[["p10","SSB'nin resmi yazıyla istediği belgeleri derle ve kontrol et"],["p10b","Vergi ve SGK borç yoktur yazılarını güncel al","Finans"],["p11","Belgeleri en geç değerlendirmeden 15 gün önce SSB'ye ilet","Kritik"],["p12","Firma tanıtım sunumunu hazırla"],["p13","Saha turu güzergâhını ve düzenini hazırla"]]},
 {t:"Son 15",s:"gün",items:[["p14","Alan sorumlularıyla prova yap"],["p15","Soru kartlarıyla mini mülakat yap"],["p16","Heyet için toplantı odası ve sistemlere erişimi hazırla"],["p17","Üst yönetimin katılımını teyit et"]]},
 {t:"Değerlendirme",s:"günü",items:[["p18","Açılışta firma sunumunu yap, programı teyit et"],["p19","Her alan için bir sorumlu refakat etsin"],["p20","Gün sonunda soruları ve gelişim alanlarını not al"]]},
 {t:"Sonrası",s:"değerlendirme",items:[["p21","Raporu ve puanı incele, gelişim alanlarını aksiyona çevir"],["p22","Destek programlarını değerlendir (bazıları EYDEP sertifikası şartı arar)"],["p23","Yeniden değerlendirme tarihini takvime ekle"]]}
];

export const STAGES_EY: readonly BelgelendirmeAsamasi[] = [
 {n:"YETEN kaydı",w:"Ön koşul",ic:"file",d:"Firma, SSB'nin yetenek envanterine (YETEN) kayıtlı olmalı; başvuruda bu kayıt kontrol edilir.",f:["Güncel firma bilgileri","Yetenek ve ürün listesi","Tezgâh ve altyapı bilgisi"],t:"YETEN'deki bilgi ile sahada görülen arasındaki fark güven kaybettirir."},
 {n:"Resmi başvuru",w:"Talep yazısı",ic:"msg",d:"EYDEP Değerlendirme Resmi Talep Yazısı SSB Sanayileşme Dairesi Başkanlığı'na gönderilir; firma sıraya alınır ve tarih resmi yazıyla bildirilir.",f:["Talep yazısı","YETEN kontrolü","Değerlendirme tarihinin bildirimi"],t:"Tarih yazısı gelince takvime hemen ekleyin; belge teslim günü de otomatik eklenir."},
 {n:"Belge teslimi",w:"En geç 15 gün önce",ic:"clip",d:"İstenen bilgi ve belgeler değerlendirme tarihinden en geç 15 gün önce SSB'ye iletilir.",f:["Resmi yazıdaki belge listesi","Eksiksiz ve güncel belgeler"],t:"Danışman kaynaklarına göre geciken teslim değerlendirmeyi iptal ettirebilir; tekrarı ileriki dönemlere erteleme sebebi olabilir."},
 {n:"Saha değerlendirmesi",w:"Değerlendirme heyeti",ic:"eye",d:"SSB ve sektördeki öncü firmalardan değerlendiricilerin yer aldığı heyet firmayı alan alan inceler.",f:["Firma sunumu","Alan bazlı mülakatlar","Saha turu","Kayıtların sistemde gösterilmesi"],t:"Heyet 'belgeniz var mı' yerine 'sistemde gösterin' der. Anlık gösterim puanı yükseltir."},
 {n:"Rapor ve sertifika",w:"Puan ve seviye",ic:"award",d:"Heyet puanlar ve rapor hazırlar; puana göre A, B veya C seviyesinde sertifika verilir.",f:["85–100: A","70–84: B","50–69: C"],t:"C ve üzeri puan sertifika için yeterlidir."},
 {n:"Gelişim ve destek",w:"Sonrası",ic:"repeat",d:"Rapordaki gelişim alanları iyileştirilir; bazı destek programları EYDEP sertifikası şartı arar.",f:["Gelişim planı","Destek başvuruları","Yeniden değerlendirme planı"],t:"Sertifika süresi ve yeniden değerlendirme kuralını SSB'den teyit edin."}
];

export const DOCS_EY: readonly ZorunluDokuman[] = [
 ["y1","Kurumsallık","YETEN kaydı çıktısı","Belge"],["y2","Kurumsallık","Firma tanıtım sunumu","Sunum"],["y3","Kurumsallık","Organizasyon şeması ve görev tanımları","Doküman"],["y4","Kurumsallık","Yönetim sistemi sertifikaları ve son denetim raporları","Belge"],
 ["y5","Kurumsallık","Süreç haritası ve prosedür listesi","Doküman"],["y6","Kurumsallık","Savunma referans ve sipariş listesi","Liste"],["y7","Personel","Personel listesi: eğitim düzeyi ve sertifikalar","Liste"],["y8","Personel","Eğitim planı ve yetkinlik matrisi","Doküman"],
 ["y9","Güvenlik","Tesis ve bilgi güvenliği belgeleri (varsa)","Belge"],["y10","Finans","Son 3 yılın bilanço ve gelir tabloları","Belge"],["y11","Finans","Vergi ve SGK borcu yoktur yazıları","Belge"],["y12","Ar-Ge","Ar-Ge ve geliştirme proje listesi","Liste"],
 ["y13","Altyapı","Makine ve teçhizat listesi (kapasite bilgisiyle)","Liste"],["y14","Altyapı","Ölçüm ve test cihaz listesi, kalibrasyon kayıtları","Liste"],["y15","Altyapı","Tesis yerleşim planı","Doküman"],["y16","Proje","Zamanında teslimat verisi (12 ay)","Kayıt"],
 ["y17","Kalite","Son iç denetim ve YGG çıktıları","Kayıt"],["y18","Kalite","Onaylı tedarikçi ve fason listesi","Liste"],["y19","Kalite","Örnek izlenebilirlik dosyası","Kayıt"],["y20","Teknik alan","Örnek işler ve ölçüm raporları","Kayıt"]
];

export const CHAIN_EY: readonly IzHalkasi[] = [
 {k:"t1",n:"Sözleşme",c:"Kurumsallık",ic:"file",s:"Teklif, sipariş veya sözleşme; teknik şartname ve revizyonu."},
 {k:"t2",n:"Planlama",c:"Proje",ic:"cal",s:"İş emri, rota ve termin; sistemdeki güncel durum."},
 {k:"t3",n:"Tedarik",c:"Kalite",ic:"cart",s:"Onaylı tedarikçi, fason kontrolü, malzeme sertifikası, giriş kontrolü."},
 {k:"t4",n:"Üretim",c:"Üretim",ic:"factory",s:"Talimat, güncel resim, doğrulanmış NC programı, yetkin personel, bakımlı tezgâh."},
 {k:"t5",n:"Ölçüm",c:"Altyapı",ic:"ruler",s:"Kontrol planı, FAI ve ölçüm kaydı; kalibreli cihaz."},
 {k:"t6",n:"İzlenebilirlik",c:"Kalite",ic:"link",s:"Seri/lot → iş emri → malzeme lotu → sertifika; sistemde dakikalar içinde."},
 {k:"t7",n:"Teslim",c:"Proje",ic:"clip",s:"Serbest bırakma, sevk kaydı ve zamanında teslimat."},
 {k:"t8",n:"Geri bildirim",c:"Kalite",ic:"users",s:"Müşteri geri bildirimi, şikâyet ve varsa DÖF."}
];

export const SEV_EY: readonly BulguSeviyesiTanimi[] = [
 {k:"good",n:"A seviyesi",d:"85–100 puan. EYDEP'in en yüksek seviyesi.",ex:["Öncü firmaların doğrudan onaylı tedarikçisi olma","SSB projelerine ana firma olarak teklif verebilme"],cons:"Süreçler ve veriler sistemde, anlık gösterilebilir durumda."},
 {k:"obs",n:"B seviyesi",d:"70–84 puan. Orta seviye.",ex:["Ana yüklenicilerin onaylı tedarikçisi olabilme","Alt yüklenici olarak gösterilebilme"],cons:"Sistematik çalışma var; bazı alanlar olgunlaşmalı."},
 {k:"minor",n:"C seviyesi",d:"50–69 puan.",ex:["EYDEP değerlendirmesinden geçmiş sayılır","SSB gelişim desteklerinden yararlanma"],cons:"Temel yetkinlik var; kritik gelişim alanları bulunur."},
 {k:"major",n:"50 puan altı",d:"Sertifika verilmez.",ex:["Gelişim planı uygulanır","Değerlendirmeden 1 yıl sonra yeniden başvuru"],cons:"Olumsuz sonuçta 1 yıl geçmeden yeniden başvurulamaz."}
];
