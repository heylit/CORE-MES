// KYS'nin durağan yapısı (prototipten olduğu gibi): yapı taşları, süreç şablonları, kurulum yol haritası, roller ve rutin görevler.
// Kurallar (kurallar/kys.ts) ve KYS ekranı bunları okur. Doküman şablonları ve şemalar yalnız KYS ekranının içeriğidir (kys/).

export type KysGrubuKodu = 'P' | 'U' | 'K' | 'O';
export interface KysGrubu { k: KysGrubuKodu; n: string; d: string }
// z: zorunlu doküman (1), rv: gözden geçirme aralığı (ay), tag: yalnız o programda görünür.
export interface YapiTasi { id: string; g: KysGrubuKodu; c: string; n: string; t: string; z: 0 | 1; rv: number; cr: string; au: string; ct: string; tag: '' | 'AS9100' | 'EYDEP' }
// [tür, ad, sahip, girdi, çıktı, gösterge, birim, hedef, yön, kaynak, kim, nasıl, risk]
export type SurecSablonu = [string, string, string, string, string, string, string, number, 'le' | 'ge', string, string, string, string];
export interface YolAdimi { id: string; t: string; d: string; bl: string[]; ln: string }
export interface YolAsamasi { k: string; n: string; m: number; d: string; steps: YolAdimi[] }
export interface RolTanimi { k: string; n: string; b: string; a: string; s: string[]; y: string[]; c: string }
export type Donem = 'g' | 'h' | 'a' | 'c' | 'y';
export interface RutinGorev { id: string; f: Donem; t: string; r: string; l: string }

const yapiTasi = (id: string, g: KysGrubuKodu, c: string, n: string, t: string, z: 0 | 1, rv: number, cr: string, au: string, ct: string, tag?: 'AS9100' | 'EYDEP'): YapiTasi => ({ id, g, c, n, t, z, rv, cr, au, ct, tag: tag ?? '' });
const yolAdimi = (id: string, t: string, d: string, bl?: string[], ln?: string): YolAdimi => ({ id, t, d, bl: bl ?? [], ln: ln ?? '' });
const rutin = (id: string, f: Donem, t: string, r: string, l?: string): RutinGorev => ({ id, f, t, r, l: l ?? '' });

export const KYSG: readonly KysGrubu[] = [{k:"P",n:"Planla",d:"Bağlam, liderlik, planlama"},{k:"U",n:"Uygula",d:"Destek ve operasyon"},{k:"K",n:"Kontrol et",d:"İzleme, ölçme, denetim"},{k:"O",n:"Önlem al",d:"Düzeltici faaliyet ve iyileştirme"}];
export const KYSB: readonly YapiTasi[] = [
 yapiTasi("b41","P","4.1","İç ve dış hususlar (bağlam analizi)","Doküman",0,12,"Firmanın amacını ve KYS sonuçlarını etkileyen iç ve dış konuların listesi (ör. GZFT).","Hususlar güncel mi, riskler ve hedeflerle bağlantılı mı?","Yılda bir ve büyük değişikliklerde YGG'de gözden geçirilir."),
 yapiTasi("b42","P","4.2","İlgili taraflar ve beklentileri","Doküman",0,12,"Müşteri, tedarikçi, çalışan, otorite gibi ilgili tarafların ve şartlarının listesi.","Müşteri ve yasal şartlar tanımlı mı, izleniyor mu?","Yılda bir ve yeni müşteri veya mevzuat değişikliğinde güncellenir."),
 yapiTasi("b43","P","4.3","KYS kapsamı","Doküman",1,12,"Kapsam ifadesi, sahalar ve uygulanamaz şartların gerekçesi.","Kapsam sertifikayla ve sahadaki faaliyetlerle uyumlu mu? Uygulanamaz şart gerekçeli mi?","Yeni ürün, saha veya faaliyette; en az yılda bir YGG'de."),
 yapiTasi("b44","P","4.4","Süreç haritası ve süreç kartları","Doküman",1,12,"Süreçler, sahipleri, girdi-çıktıları, etkileşimleri, göstergeleri ve riskleri.","Her sürecin sahibi ve göstergesi var mı? Harita sahadaki gerçeği yansıtıyor mu?","Süreç değiştiğinde güncellenir; göstergeler aylık izlenir."),
 yapiTasi("b52","P","5.2","Kalite politikası","Doküman",1,24,"Üst yönetimin onayladığı, firmanın amacına uygun politika metni.","Duyuruldu mu? Çalışan kendi işiyle ilişkisini anlatabiliyor mu?","YGG'de uygunluğu gözden geçirilir; değişince tekrar duyurulur."),
 yapiTasi("b53","P","5.3","Organizasyon, görev, yetki ve sorumluluklar","Doküman",0,12,"Organizasyon şeması, görev tanımları, vekâlet düzeni.","Uygunsuz ürünü durdurma yetkisi kimde? Görev tanımı sahayla uyumlu mu?","Organizasyon değiştiğinde güncellenir."),
 yapiTasi("b61","P","6.1","Risk ve fırsat değerlendirmesi","Kayıt",0,12,"Süreç bazında riskler, fırsatlar, önlemler ve etkinlik değerlendirmesi.","Önlemler uygulanmış ve etkinliği değerlendirilmiş mi?","Yılda bir ve süreç, ürün veya organizasyon değişikliğinde gözden geçirilir."),
 yapiTasi("b62","P","6.2","Kalite hedefleri ve eylem planları","Kayıt",1,3,"Ölçülebilir hedefler; ne yapılacak, kaynak, sorumlu, termin, değerlendirme yöntemi.","Hedef ölçülebilir mi? Sapmada ne yapıldı?","Aylık veya çeyreklik izlenir, YGG'de değerlendirilir."),
 yapiTasi("b63","P","6.3","Değişikliklerin planlanması","Kayıt",0,12,"KYS'yi etkileyen değişikliklerin amacı, riski, kaynakları ve sorumluları.","Son büyük değişiklik planlı yapıldı mı?","Her önemli değişiklikte kayıt açılır."),
 yapiTasi("b713","U","7.1.3","Altyapı ve bakım planı","Kayıt",0,12,"Tezgâh, ekipman ve tesis listesi; önleyici bakım planı ve kayıtları.","Bakım plana göre yapılıyor mu, arızalar kayıt altında mı?","Bakım planı aylık takip edilir."),
 yapiTasi("b715","U","7.1.5","Ölçüm cihazları ve kalibrasyon planı","Kayıt",1,12,"Cihaz listesi, kalibrasyon planı, sertifikalar, uygun olmayan cihaz için geriye dönük değerlendirme.","Cihaz kalibreli mi, etiketli mi? Uygun çıkmayan cihazla ölçülen ürünlere ne yapıldı?","Plan aylık takip edilir; süresi geçen cihaz kullanımdan çekilir."),
 yapiTasi("b716","U","7.1.6","Kurumsal bilgi","Doküman",0,24,"Kritik bilgi ve tecrübenin talimat, ders çıkarılan konular ve eğitimlerle korunması.","Kilit kişi ayrılırsa kritik bilgi nasıl korunur?","Kilit personel değişiminde ve yılda bir gözden geçirilir."),
 yapiTasi("b72","U","7.2","Yetkinlik matrisi ve eğitim planı","Kayıt",1,12,"Görev bazlı yetkinlik şartları, personel yetkinlik durumu, eğitim planı ve etkinlik değerlendirmesi.","Bu operatör bu işe yetkin mi, kanıtı ne? Eğitim etkinliği nasıl ölçüldü?","Eğitim planı yıllık yapılır, gerçekleşme çeyreklik izlenir."),
 yapiTasi("b74","U","7.4","İletişim planı","Doküman",0,24,"Neyin, ne zaman, kime, nasıl ve kim tarafından iletileceği.","Kalite hedefleri ve performans çalışanlara ulaşıyor mu?","İletişim ihtiyacı değiştiğinde güncellenir."),
 yapiTasi("b75","U","7.5","Doküman ana listesi ve kayıt kontrolü","Doküman",0,12,"Doküman kodlama, onay, revizyon, dağıtım ve kayıt saklama kuralları; ana liste.","Sahadaki doküman güncel revizyon mu? Kayıtlar ne kadar süre saklanıyor?","Her revizyonda ana liste güncellenir; sahada periyodik kontrol yapılır."),
 yapiTasi("b82","U","8.2","Teklif ve sözleşme gözden geçirme","Kayıt",1,12,"Müşteri şartlarının, yeteneğin ve değişikliklerin teklif ve sipariş öncesi gözden geçirme kayıtları.","Siparişten önce şartlar ve kapasite gözden geçirildi mi? Değişiklik nasıl yönetildi?","Her teklif ve siparişte kayıt oluşturulur."),
 yapiTasi("b83","U","8.3","Tasarım ve geliştirme (varsa)","Kayıt",1,12,"Tasarım planı, girdiler, gözden geçirme, doğrulama, geçerli kılma ve değişiklik kayıtları.","Tasarım yapılıyorsa aşamalar kayıtlı mı? Yapılmıyorsa uygulanamaz gerekçesi ne?","Her tasarım projesinde kayıt açılır."),
 yapiTasi("b84","U","8.4","Onaylı tedarikçi listesi ve değerlendirme","Kayıt",1,12,"Tedarikçi seçim, değerlendirme ve yeniden değerlendirme kriterleri ve sonuçları; satınalma şartları.","Kritik tedarikçi nasıl seçildi, performansı nasıl izleniyor?","Tedarikçi performansı yılda en az bir kez değerlendirilir."),
 yapiTasi("b851","U","8.5.1","Üretim planı, talimatlar ve kontrol planları","Doküman",0,12,"İş emri, rota kartı, iş talimatları, kontrol planları, özel proses geçerli kılma.","Operatör talimata ve güncel resme göre mi çalışıyor? Özel prosesler geçerli kılınmış mı?","Ürün veya proses değişikliğinde güncellenir."),
 yapiTasi("b852","U","8.5.2","Tanımlama ve izlenebilirlik","Kayıt",1,24,"Ürün tanımlama kuralı; şart varsa seri/lot izlenebilirlik kayıtları.","Bu parçadan hammadde sertifikasına kadar iz sürülebiliyor mu?","Periyodik izlenebilirlik tatbikatıyla doğrulanır."),
 yapiTasi("b86","U","8.6","Muayene ve serbest bırakma","Kayıt",1,12,"Kabul kriterleri, muayene kayıtları ve serbest bırakma yetkisi.","Ürünü kim serbest bıraktı, kabul kriteri neydi?","Her sevkiyatta kayıt oluşturulur."),
 yapiTasi("b87","U","8.7","Uygunsuz çıktı kontrolü","Kayıt",1,12,"Uygunsuzluk tanımı, alınan karar (hurda, tamir, olduğu gibi kullan), karar yetkisi.","Uygunsuz ürün ayrılmış ve etiketli mi? Kararı kim verdi?","Her uygunsuzlukta kayıt; aylık trend analizi."),
 yapiTasi("b91","K","9.1","Süreç göstergeleri ve analiz","Kayıt",1,3,"İzleme ölçme planı, gösterge sonuçları, trend analizi.","Göstergeler hedefle karşılaştırılıyor mu, sapmada aksiyon var mı?","Aylık izlenir, çeyreklik analiz edilir."),
 yapiTasi("b912","K","9.1.2","Müşteri memnuniyeti","Kayıt",0,12,"Memnuniyet ölçüm yöntemi ve sonuçları (anket, şikâyet, skor kartı, iade).","Müşterinin algısı nasıl izleniyor, sonuçlara göre ne yapıldı?","Yılda en az bir kez ölçülür, şikâyetler sürekli izlenir."),
 yapiTasi("b92","K","9.2","İç denetim programı ve raporları","Kayıt",1,12,"Risk ve önceki sonuçlara göre planlanmış program, bağımsız denetçiler, raporlar ve bulgu takibi.","Tüm süreçler denetlendi mi? Denetçi kendi işini denetlemiş mi?","Yıllık program yapılır, gerçekleşme izlenir."),
 yapiTasi("b93","K","9.3","Yönetimin gözden geçirmesi","Kayıt",1,12,"Standardın istediği tüm girdileri kapsayan tutanak ve kararlar.","Girdilerin hepsi ele alınmış mı, kararlar takip edilmiş mi?","En az yılda bir yapılır; kararlar sorumlu ve terminle izlenir."),
 yapiTasi("b102","O","10.2","Uygunsuzluk ve düzeltici faaliyet (DÖF)","Kayıt",1,12,"Kök neden analizi, düzeltici faaliyet, etkinlik doğrulaması.","Kök neden bulunmuş mu? Etkinlik nasıl doğrulandı?","Her DÖF'te etkinlik doğrulaması; açık DÖF'ler aylık izlenir."),
 yapiTasi("b103","O","10.3","Sürekli iyileştirme","Kayıt",0,12,"İyileştirme projeleri, öneri sistemi, önce/sonra verisi.","Son dönemde veriyle kanıtlanmış bir iyileştirme var mı?","YGG'de değerlendirilir."),
 yapiTasi("a811","P","8.1.1","Operasyonel risk yönetimi","Kayıt",0,12,"Operasyonel risklerin tanımlanması, değerlendirilmesi, azaltılması ve kabulü.","Operasyonel risk süreci tanımlı ve uygulanıyor mu?","Yılda bir ve yeni programlarda.","AS9100"),
 yapiTasi("a812","U","8.1.2","Konfigürasyon yönetimi","Doküman",0,12,"Konfigürasyon tanımlama, değişiklik kontrolü, durum kaydı ve doğrulama.","Üretilen ürün onaylı konfigürasyona uygun mu?","Her mühendislik değişikliğinde.","AS9100"),
 yapiTasi("a813","U","8.1.3","Ürün güvenliği","Doküman",0,12,"Güvenlik açısından kritik ürünler, olay raporlama, farkındalık.","Kritik ürünler belirlenmiş mi, çalışanlar farkında mı?","Yılda bir ve yeni ürünlerde.","AS9100"),
 yapiTasi("a814","U","8.1.4","Sahte parça önleme","Doküman",0,12,"Onaylı kaynak, doğrulama, şüpheli parça karantinası ve raporlama.","Şüpheli parça bulunursa ne yapılır?","Tedarik zinciri değişikliklerinde ve yılda bir.","AS9100"),
 yapiTasi("a8513","U","8.5.1.3","İlk ürün muayenesi (FAI, AS9102)","Kayıt",0,12,"Yeni ürün ve değişikliklerde FAI raporları.","Yeni parça veya revizyonda FAI yapıldı mı?","Her yeni parça ve değişiklikte.","AS9100"),
 yapiTasi("afod","U","8.5.1","FOD önleme programı","Kayıt",0,12,"FOD alanları, kontrol listeleri, takım kontrolü, eğitim.","FOD alanlarında kontrol kayıtları tutuluyor mu?","Aylık saha kontrolü.","AS9100"),
 yapiTasi("eyet","P","EYDEP","YETEN kaydı","Kayıt",0,12,"Güncel firma, yetenek, ürün ve tezgâh bilgisi.","YETEN'deki bilgi sahadaki durumla örtüşüyor mu?","Yılda bir ve yatırımlardan sonra güncellenir.","EYDEP"),
 yapiTasi("eybg","U","EYDEP","Bilgi güvenliği ve gizlilik","Doküman",0,12,"Teknik veri erişimi, yedekleme, gizlilik sözleşmeleri.","Teknik veriye kim erişiyor, yedekler test edildi mi?","Yetki gözden geçirmesi yılda bir; yedekleme testi periyodik.","EYDEP"),
 yapiTasi("eyfin","K","EYDEP","Mali tablolar ve maliyet takibi","Kayıt",0,12,"Son 3 yılın mali tabloları, vergi ve SGK yazıları, iş bazlı maliyet.","Mali eğilim ve borç durumu nasıl, iş maliyetleri biliniyor mu?","Yılda bir ve değerlendirme öncesi güncellenir.","EYDEP")
];
export const KST: readonly string[] = ["Yok","Taslak","Yürürlükte"];
export const PROC_TPL: readonly SurecSablonu[] = [
 ["y","Stratejik planlama ve YGG","Genel müdür","Bağlam, hedefler, performans verileri","Kararlar, kaynak planı","Hedeflere ulaşma oranı","%",80,"ge","Yönetim bilgi sistemi, KYS panosu","Üst yönetim, KYS sorumlusu","Kalite el kitabı, YGG prosedürü","Hedeflerin kaynakla desteklenmemesi"],
 ["a","Satış ve teklif","Satış","Müşteri talebi, teknik şartname","Onaylı sipariş","Teklif dönüş süresi","gün",3,"le","ERP teklif modülü, CAD görüntüleyici","Teknik resim okuma, maliyet hesaplama","Teklif ve sözleşme gözden geçirme prosedürü","Müşteri şartının gözden kaçması"],
 ["a","Üretim planlama","Planlama","Sipariş, kapasite, stok","İş emirleri, termin planı","Zamanında teslimat","%",95,"ge","ERP / MRP, kapasite planı","Planlama ve kapasite bilgisi","İş emri akışı, termin planı","Kapasite aşımı ve termin kaçması"],
 ["a","Satınalma","Satınalma","Malzeme ihtiyacı","Uygun malzeme ve hizmet","Tedarikçi zamanında teslimat","%",95,"ge","ERP satınalma modülü, onaylı tedarikçi listesi","Malzeme ve tedarikçi bilgisi","Satınalma ve tedarikçi değerlendirme prosedürü","Uygunsuz veya sahte malzeme"],
 ["a","Üretim","Üretim","İş emri, malzeme, talimat","Uygun ürün","Hurda ve yeniden işleme oranı","%",2,"le","CNC tezgâhlar, fikstür ve takımlar, CAM yazılımı","Yetkin CNC operatörü, programcı","İş talimatları, kontrol planı, rota kartı","Tezgâh arızası, yanlış revizyon resim"],
 ["a","Kalite kontrol ve serbest bırakma","Kalite","Ürün, kontrol planı","Muayene kaydı, serbest bırakma","Müşteri iade oranı","ppm",500,"le","CMM, el ölçü aletleri, ölçüm odası","Ölçüm tekniği, teknik resim okuma","Kontrol planı, muayene talimatları, uygunsuz çıktı prosedürü","Kalibrasyonsuz cihazla ölçüm"],
 ["a","Sevkiyat","Lojistik","Serbest bırakılmış ürün","Teslim edilmiş ürün","Hatalı sevkiyat sayısı","adet",0,"le","Ambalaj malzemeleri, sevk alanı","Paketleme ve sevk bilgisi","Sevkiyat talimatı, ürün koruma kuralları","Taşımada hasar, yanlış sevk"],
 ["d","İnsan kaynakları ve eğitim","İK","Yetkinlik ihtiyacı","Yetkin personel","Eğitim planı gerçekleşme","%",90,"ge","Eğitim planı, yetkinlik matrisi","İK ve eğitim planlama","Eğitim ve yetkinlik prosedürü","Kritik yetkinliğin tek kişide olması"],
 ["d","Bakım","Bakım","Bakım planı, arıza bildirimi","Kullanılabilir tezgâh","Plansız duruş","saat",10,"le","Bakım planı, yedek parça stoğu","Mekanik ve elektrik bakım bilgisi","Önleyici bakım planı ve talimatları","Plansız duruş"],
 ["d","Kalibrasyon","Kalite","Cihaz listesi","Kalibre cihaz","Kalibrasyon planı uyumu","%",100,"ge","Referans cihazlar, akredite laboratuvar","Ölçüm ve kalibrasyon bilgisi","Kalibrasyon prosedürü, cihaz listesi","Kalibrasyonu geçmiş cihaz kullanımı"],
 ["d","Doküman ve kayıt yönetimi","KYS sorumlusu","Doküman talepleri","Güncel, kontrollü doküman","Gecikmiş gözden geçirme","adet",0,"le","Ortak klasör, doküman ana listesi, yedekleme","Doküman kontrol kuralları bilgisi","Doküman ve kayıt kontrol prosedürü","Sahada eski revizyon kullanımı"]
];

export const ROAD: readonly YolAsamasi[] = [
 {k:"f1",n:"Karar ve hazırlık",m:0,d:"Üst yönetim kararı verir, ekip kurulur, mevcut durum ölçülür.",steps:[
  yolAdimi("r11","Üst yönetim KYS kararını ve hedef belgelendirme tarihini yazılı verir","Karar tutanağı; kaynak, bütçe ve zaman planı onayı. KYS'nin sahibi üst yönetimdir."),
  yolAdimi("r12","KYS sorumlusunu atayın, proje ekibini kurun","Atama yazısı; her ana süreçten bir temsilci. Görev tanımları sekmesindeki tanımları kullanın.",[],"gorev"),
  yolAdimi("r13","Ekibe ISO 9001 temel ve farkındalık eğitimi verin","Eğitim kaydı yetkinlik matrisinin ilk girdisi olur."),
  yolAdimi("r14","Mevcut durumu ölçün (boşluk analizi)","Öz değerlendirmede tam tur yapın; düşük puanlı maddeler yol haritanızın önceliğidir.",[],"go:kontrol")]},
 {k:"f2",n:"Temel tanımlar",m:1,d:"KYS'nin sınırı, yönü ve sorumlulukları belirlenir.",steps:[
  yolAdimi("r21","Bağlam analizini ve ilgili tarafları çıkarın","GZFT ve ilgili taraf listesi; riskler bunlardan beslenir.",["b41","b42"]),
  yolAdimi("r22","KYS kapsamını ve uygulanamaz şartları belirleyin","Kapsam ifadesi sertifikada aynen yer alır; tasarım yapıyorsanız 8.3 uygulanamaz sayılmaz.",["b43"]),
  yolAdimi("r23","Kalite politikasını yazın ve onaylatın","Kısa, firmaya özgü; hedeflere çerçeve olacak bir metin. Genel kalıp cümlelerden kaçının.",["b52"]),
  yolAdimi("r24","Organizasyon şemasını ve görev tanımlarını hazırlayın","Yetki, sorumluluk ve vekâlet düzeni.",["b53"],"gorev")]},
 {k:"f3",n:"Süreç tasarımı",m:2,d:"İş süreçlere bölünür, ölçülür, riskleri görülür.",steps:[
  yolAdimi("r31","Süreç haritasını ve süreç kartlarını oluşturun","Her sürecin sahibi, girdi-çıktısı ve en az bir göstergesi olmalı.",["b44"],"surec"),
  yolAdimi("r32","Dosyalama sistemini ve doküman kontrol kuralını kurun","Kodlama, klasör yapısı, onay-revizyon kuralları ve saklama süreleri.",["b75"],"dosya"),
  yolAdimi("r33","Riskleri ve fırsatları süreç bazında değerlendirin","Önlem, sorumlu, termin; etkinliği sonra değerlendirilir.",["b61"]),
  yolAdimi("r34","Ölçülebilir kalite hedeflerini belirleyin","Hedef, eylem planı, kaynak, sorumlu, termin, değerlendirme yöntemi.",["b62"])]},
 {k:"f4",n:"Dokümanlar ve kayıt altyapısı",m:3,d:"Sahanın ihtiyaç duyduğu talimat, form ve listeler hazırlanır.",steps:[
  yolAdimi("r41","Teklif ve sözleşme gözden geçirme kaydını tanımlayın","",["b82"]),
  yolAdimi("r42","Tedarikçi seçim ve değerlendirme kriterlerini oluşturun","Onaylı tedarikçi listesi ve satınalma şartları.",["b84"]),
  yolAdimi("r43","Üretim talimatlarını, kontrol planlarını ve izlenebilirliği düzenleyin","İş emri, rota kartı, muayene ve serbest bırakma kayıtları.",["b851","b852","b86"]),
  yolAdimi("r44","Uygunsuz çıktı ve DÖF formlarını hazırlayın","",["b87","b102"]),
  yolAdimi("r45","Kalibrasyon, bakım ve yetkinlik altyapısını kurun","Cihaz listesi ve planı, bakım planı, yetkinlik matrisi.",["b715","b713","b72"]),
  yolAdimi("r46","Tasarım yapıyorsanız tasarım sürecini tanımlayın","Yapmıyorsanız kapsamda gerekçesini yazın.",["b83"])]},
 {k:"f5",n:"Uygulama ve kayıt birikimi",m:4,d:"Sistem en az 2–3 ay çalıştırılır, kayıt birikir.",steps:[
  yolAdimi("r51","Tüm çalışanlara KYS ve politika eğitimi verin","Çalışan, kendi işinin kaliteye katkısını anlatabilmeli.",["b74"]),
  yolAdimi("r52","Süreç göstergelerini her ay toplayın","Süreçler sekmesine aylık değer girin.",["b91"],"surec"),
  yolAdimi("r53","Müşteri memnuniyetini ölçün","Anket, şikâyet, iade ve müşteri skor kartı.",["b912"]),
  yolAdimi("r54","Rutin KYS görevlerini düzenli yürütün","Rutin görevler sekmesini kullanın.",[],"rutin"),
  yolAdimi("r55","Kurumsal bilgiyi ve değişiklik yönetimini tamamlayın","",["b716","b63"])]},
 {k:"f6",n:"Doğrulama",m:5,d:"Sistem kendi içinde denetlenir, yönetim değerlendirir.",steps:[
  yolAdimi("r61","İç denetçileri eğitin, bağımsızlıklarını planlayın","Denetçi kendi işini denetlemez.",[],"gorev"),
  yolAdimi("r62","Tüm süreçleri kapsayan iç denetimi yapın","İç denetim kaydını Performans sayfasına da girin.",["b92"]),
  yolAdimi("r63","İç denetim bulgularına DÖF açıp kapatın","Kök neden ve etkinlik doğrulaması şart.",["b102"]),
  yolAdimi("r64","Yönetimin gözden geçirmesini yapın","Standardın tüm girdileri; kararlar sorumlu ve terminle.",["b93"])]},
 {k:"f7",n:"Belgelendirme ve sürdürme",m:6,d:"Kuruluş seçilir, denetime girilir, sistem yaşatılır.",steps:[
  yolAdimi("r71","Akredite belgelendirme kuruluşlarından teklif alın","Akreditasyonu (TÜRKAK veya IAF üyesi kurum) ve kapsamı kontrol edin."),
  yolAdimi("r72","Aşama 1 ve Aşama 2 tarihlerini takvime ekleyin","",[],"go:takvim"),
  yolAdimi("r73","Haftalık hazırlık programını ve simülasyonu uygulayın","",[],"go:hazirlik"),
  yolAdimi("r74","Belgelendirmeden sonra iyileştirmeyi ve gözetim döngüsünü sürdürün","",["b103"])]}
];

export const ROLES: readonly RolTanimi[] = [
 {k:"ust",n:"Genel Müdür (üst yönetim)",b:"Yönetim kurulu / ortaklar",a:"KYS'nin sahibidir; etkinliğinden hesap verir.",
  s:["Kalite politikasını ve hedeflerini onaylar","KYS için kaynak sağlar","Yönetimin gözden geçirmesine başkanlık eder","Müşteri odağını ve yasal şartlara uyumu sağlar","Süreç yaklaşımını ve risk temelli düşünmeyi destekler","KYS sorumlusunu atar ve yetkilendirir"],
  y:["Kaynak ve bütçe onayı","Politika, hedef ve organizasyon onayı","Görevlendirme ve atama"],c:"Standardın liderlik şartlarını bilir; denetimde liderlik ve YGG sorularını kendisi cevaplar."},
 {k:"kys",n:"KYS sorumlusu (yönetim temsilcisi)",b:"Genel Müdür. AS9100'de KYS konularında üst yönetime doğrudan erişim ve örgütsel bağımsızlık gerekir.",a:"KYS'nin kurulmasını, sürdürülmesini ve raporlanmasını koordine eder.",
  s:["Doküman kontrolünü ve ana listeyi yürütür","İç denetim programını hazırlar ve yönetir","DÖF'lerin açılmasını, takibini ve etkinlik doğrulamasını izler","KYS performansını üst yönetime raporlar, YGG'yi hazırlar","Belgelendirme kuruluşuyla iletişimi yürütür","Farkındalık eğitimlerini organize eder","Rutin KYS görevlerini yürütür"],
  y:["Doküman yayınlama ve geçersiz kılma","DÖF açma ve kapatma onayı","İç denetçi görevlendirme","KYS'ye aykırı uygulamada durdurma önerisi"],c:"ISO 9001 (gerekirse AS9100) eğitimi, iç denetçi eğitimi, üretim veya kalite deneyimi, raporlama ve analiz becerisi."},
 {k:"surec",n:"Süreç sahibi",b:"Genel Müdür",a:"Kendi sürecinin sonuç vermesinden sorumludur.",
  s:["Süreç kartını, talimatları ve formları günceller","Süreç göstergesini ölçer, hedefle karşılaştırır","Sürecin risklerini ve fırsatlarını yönetir","Süreç kayıtlarının tutulmasını sağlar","Uygunsuzluklarda kök neden analizi yapar","Ekibinin yetkinliğini ve eğitim ihtiyacını belirler","Denetimde süreci anlatır"],
  y:["Süreç içi doküman hazırlama ve revizyon talebi","Süreç kaynaklarını yönlendirme"],c:"Sürecin teknik bilgisi, süreç yaklaşımı ve temel problem çözme eğitimi."},
 {k:"ic",n:"İç denetçi",b:"Denetim görevinde KYS sorumlusu",a:"KYS'nin şartlara uygunluğunu ve etkinliğini bağımsız olarak doğrular.",
  s:["Denetim planı ve kontrol listesi hazırlar","Kanıta dayalı ve objektif denetler","Kendi işini ve sorumluluk alanını denetlemez","Bulguları açık ve madde referanslı yazar","Denetim raporunu hazırlar","DÖF'lerin etkinliğini doğrulamaya katılır"],
  y:["Denetim sırasında tüm alan ve kayıtlara erişim"],c:"İç denetçi eğitimi (ISO 19011 ilkeleri), standart bilgisi, denetlediği sürece genel hakimiyet."},
 {k:"kk",n:"Kalite kontrol / muayene sorumlusu",b:"Kalite yöneticisi",a:"Ürünün şartlara uygun olduğunu doğrular ve serbest bırakır.",
  s:["Kontrol planına göre giriş, ara ve son muayeneyi yapar","Serbest bırakma kararını verir ve kaydeder","Uygunsuz ürünü ayırır, etiketler ve kaydeder","Ölçüm cihazının kalibre olduğunu kullanmadan önce kontrol eder","Yeni parçalarda ilk ürün muayenesini yapar (AS9100: FAI)","Muayene kayıtlarını tutar"],
  y:["Ürünü serbest bırakma veya durdurma","Uygunsuz ürünü karantinaya alma"],c:"Ölçüm teknikleri, teknik resim okuma ve geometrik toleranslar, ölçüm cihazı kullanımı."},
 {k:"kal",n:"Kalibrasyon sorumlusu",b:"Kalite yöneticisi",a:"Ölçüm sonuçlarının güvenilirliğini sağlar.",
  s:["Ölçüm cihazları listesini tutar","Kalibrasyon planını hazırlar ve uygular","Cihazları etiketler","Dış kalibrasyon hizmetlerini seçer ve sertifikaları değerlendirir","Uygun çıkmayan cihazda geriye dönük etki değerlendirmesi başlatır"],
  y:["Cihazı kullanımdan çekme"],c:"Ölçüm bilgisi, kalibrasyon sertifikası değerlendirme."},
 {k:"cal",n:"Tüm çalışanlar",b:"Birim yöneticisi",a:"İşini tanımlı kurallara göre yapar, kalitenin sahibidir.",
  s:["Kalite politikasını ve kendi işinin kaliteye katkısını bilir","Talimata ve güncel dokümana göre çalışır","Kayıtları eksiksiz ve zamanında tutar","Uygunsuzluğu fark ettiğinde bildirir","İyileştirme önerisinde bulunur"],
  y:["Şüpheli durumda işi durdurup amirine bildirme"],c:"Görevi için tanımlı yetkinlik ve oryantasyon eğitimi."}
];

export const RTF: Record<Donem, string> = {g:"Günlük",h:"Haftalık",a:"Aylık",c:"Üç aylık",y:"Yıllık"};
export const RTN: Record<Donem, number> = {g:10,h:8,a:6,c:4,y:2};
export const RT: readonly RutinGorev[] = [
 rutin("g1","g","Uygunsuzluk bildirimlerini gözden geçir, kayıt altına al","kys"),
 rutin("g2","g","Karantina / red alanını kontrol et: her ürün etiketli ve kayıtlı mı","kk"),
 rutin("g3","g","Müşteri şikâyeti ve iade girişlerini kontrol et","kys"),
 rutin("g4","g","Sahadan gelen doküman ve talimat taleplerini yanıtla","kys","dosya"),
 rutin("h1","h","Açık DÖF'lerin terminlerini takip et","kys"),
 rutin("h2","h","Önümüzdeki iki hafta kalibrasyonu dolacak cihazları kontrol et","kal","go:kalib"),
 rutin("h3","h","Üretim ve kalite ile haftalık kalite toplantısı yap","kys","go:hazirlik"),
 rutin("h4","h","Sahada doküman revizyon turu: eski revizyon var mı","kys","dosya"),
 rutin("h5","h","Yeni veya revize dokümanları dağıt, eskilerini topla","kys","dosya"),
 rutin("a1","a","Süreç göstergelerini topla ve hedefle karşılaştır","surec","surec"),
 rutin("a2","a","Kalite hedeflerinin gerçekleşmesini raporla","kys"),
 rutin("a3","a","Uygunsuzluk, hurda ve iade trendini analiz et","kk"),
 rutin("a4","a","Tedarikçi performansını güncelle","surec"),
 rutin("a5","a","Eğitim planı gerçekleşmesini kontrol et","kys"),
 rutin("a6","a","Öz değerlendirme turu yap","kys","go:kontrol"),
 rutin("c1","c","İç denetim programındaki denetimleri gerçekleştir","ic"),
 rutin("c2","c","Risk ve fırsat tablosunu gözden geçir","surec"),
 rutin("c3","c","Yapı taşlarının gözden geçirme durumunu kontrol et","kys","blok"),
 rutin("c4","c","Yedekleme ve arşiv kontrolü; geri yükleme testi","kys"),
 rutin("c5","c","Üst yönetime KYS performans özeti sun","kys"),
 rutin("y1","y","Yönetimin gözden geçirmesini yap","ust"),
 rutin("y2","y","Yıllık iç denetim programını hazırla","kys"),
 rutin("y3","y","Yıllık eğitim planını hazırla","kys"),
 rutin("y4","y","Kalite hedeflerini belirle","ust"),
 rutin("y5","y","Bağlam, ilgili taraflar ve politikayı gözden geçir","ust","blok"),
 rutin("y6","y","Tedarikçileri yeniden değerlendir","surec"),
 rutin("y7","y","Müşteri memnuniyetini ölç","kys"),
 rutin("y8","y","Kalibrasyon ve bakım planlarını güncelle","kal"),
 rutin("y9","y","Belgelendirme gözetim denetimini planla","kys","go:takvim")
];
