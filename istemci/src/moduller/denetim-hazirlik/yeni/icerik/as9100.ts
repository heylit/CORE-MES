import type { AsamaRengi, BelgelendirmeAsamasi, BulguSeviyesiTanimi, Departman, HazirlikDonemi, IzHalkasi, Madde, PuanAciklamasi, Soru, ZorunluDokuman } from '../tipler.ts';
import { DOCS, Q, maddeAnahtari, soru } from './iso9001.ts';

// AS9100D içeriği. ISO 9001 sorularının yedisi çıkar, kalanlar havacılık sorularıyla birleşip madde sırasına dizilir (prototipteki gibi).
export const CL_AS: Record<string, Madde> = {
 "4":{n:"Kuruluşun bağlamı",s:"Bağlam",ic:"globe",ph:0,looks:["Kapsamda tüm sahalar ve ürün grupları","Müşteri ve otorite şartları (ilgili taraflar)","Süreç haritası ve süreç performans göstergeleri","OASIS kaydının sertifika ve kapsamla uyumu"],pit:["Sertifika, OASIS ve kapsam metni arasında fark","Göstergesi olmayan süreç: etkinlik gösterilemez"]},
 "5":{n:"Liderlik",s:"Liderlik",ic:"award",ph:0,looks:["Ürün uygunluğu ve zamanında teslimatın yönetimce izlenmesi","Yönetim temsilcisi ve yetkisi","Politikada ürün güvenliği ve etik vurgusu"],pit:["Zamanında teslimat verisi var, aksiyon yok","Yönetim temsilcisinin yetkisi yazılı değil"]},
 "6":{n:"Planlama",s:"Planlama",ic:"target",ph:0,looks:["Risk ve fırsatlar","Hedeflerde teslimat ve ürün uygunluğu","Değişikliklerin planlanması"],pit:["Hedeflerin müşteri skor kartlarıyla bağlantısız olması"]},
 "7":{n:"Destek",s:"Destek",ic:"layers",ph:1,looks:["Ölçüm cihazı kaydı ve geri çağırma","Yetkinlik, farkındalık: ürün güvenliği, etik, sahte parça","Dokümante bilgi, veri koruma ve saklama"],pit:["Kalibrasyonu geçmiş aletle yapılan ölçümlerin geriye dönük değerlendirilmemesi","Çalışanın ürün güvenliğine katkısını bilmemesi"]},
 "8":{n:"Operasyon",s:"Operasyon",ic:"factory",ph:1,looks:["Operasyonel risk, konfigürasyon, ürün güvenliği, sahte parça önleme","Özel şartlar, kritik kalemler, anahtar karakteristikler","FAI (AS9102), NC program doğrulaması, FOD","Tedarikçi kontrolü ve şart aktarımı","MRB ve uygunsuz ürün"],pit:["Değişiklikten sonra kısmi FAI yapılmaması","Müşteri onayı olmadan tamir veya 'olduğu gibi kullan'"]},
 "9":{n:"Performans değerlendirme",s:"Performans",ic:"chart",ph:2,looks:["Müşteri skor kartları, zamanında teslimat, şikâyetler","Proses yaklaşımlı iç denetim","YGG girdilerinde teslimat ve ürün uygunluğu"],pit:["Madde listesiyle yapılan, proses etkinliğine bakmayan iç denetim"]},
 "10":{n:"İyileştirme",s:"İyileştirme",ic:"repeat",ph:3,looks:["Kök nedende insan faktörleri","Tedarikçiye düzeltici faaliyet aktarımı","Etkin olmayan faaliyet için ek aksiyon"],pit:["'Operatör hatası' ile kapatılan NCR","Tekrarlayan bulgu: sonraki denetimde majöre dönüşür"]}
};
const AS_CIKAN = new Set(['c715', 'c73', 'c92', 'c912', 'c87', 'c841', 'c843']);
const AS_GRUPLARI = ['4', '5', '6', '7', '8', '9', '10'];
export const Q_AS: readonly Soru[] = Q.filter((x) => x.g !== 'S' && !AS_CIKAN.has(x.id)).map((x) => (x.id === 'c851b' ? { ...x, c: '8.5.1.2' } : { ...x })).concat([
 soru("a4o","4","OASIS",1,"OASIS'teki kaydınız (sertifika, sahalar, kapsam) güncel mi? Müşteriniz bunu kontrol edebiliyor mu?","OASIS'te güncel sertifika|Kapsam ve saha bilgisi doğru|OASIS kullanıcı yetkilisi","OASIS kaydınızı kontrol edin; kapsam ve saha bilgisini sertifikayla eşleştirin."),
 soru("a511","5","5.1.1",3,"Ürün uygunluğu ve zamanında teslimat performansını nasıl ölçüyorsunuz? Hedefin altında kalınca ne yaptınız?","Zamanında teslimat ve ürün uygunluğu trendi|Hedef ve sorumlu|Sapmada aksiyon kaydı|YGG'de değerlendirilmesi","Zamanında teslimatı ve müşteriye ulaşan uygunsuzluk oranını aylık izleyin; hedef altındaki aylar için aksiyon açın."),
 soru("a53","5","5.3",1,"Yönetim temsilcisi kim? Yetkisi ve üst yönetime doğrudan erişimi nerede tanımlı?","Atama yazısı|Görev tanımında yetkiler|Üst yönetime doğrudan erişim","Yönetim temsilcisini yazılı atayın; kalite konularını çözme yetkisini görev tanımına yazın."),
 soru("a7152","7","7.1.5.2",3,"Ölçüm cihazı kaydınızda tip, kimlik, yer, kalibrasyon periyodu, yöntem ve kabul kriteri var mı? Geri çağırma nasıl işliyor?","Cihaz kaydı (tip, no, yer, periyot, yöntem, kabul kriteri)|Kalibrasyon dışı cihaz için geri çağırma süreci|Geriye dönük etki değerlendirmesi|Çevre koşullarının kontrolü","Cihaz kaydını AS9100 alanlarıyla tamamlayın; kalibrasyon dışı cihaz için geriye dönük değerlendirme formu kullanın."),
 soru("a73","7","7.3",2,"Çalışanlarınız ürün güvenliğine katkılarını, etik davranışın önemini ve sahte parça riskini biliyor mu?","Farkındalık eğitim kaydı|Çalışanın katkısını anlatabilmesi|Etik bildirim kanalı","Farkındalık eğitimine ürün güvenliği, etik ve sahte parça başlıklarını ekleyin; sahada kısa mülakatla ölçün."),
 soru("a81w","8","8.1",1,"İşi başka bir sahaya veya tedarikçiye (geçici ya da kalıcı) taşıdınız mı? Transfer nasıl planlandı?","İş transferi planı|Risk değerlendirmesi|Müşteri bildirimi veya onayı|Transfer sonrası doğrulama (FAI)","İş transferi için kontrol listesi oluşturun; müşteri bildirimi ve FAI adımlarını ekleyin."),
 soru("a811","8","8.1.1",2,"Operasyonel riskleri (proje, teslimat, üretim, tedarik) nasıl belirliyor, önlemini ve kalan riski nasıl izliyorsunuz?","Operasyonel risk kaydı|Sorumlu ve risk kabul kriteri|Önlem ve kalan risk kararı","Proje veya ürün bazında operasyonel risk kaydı tutun; kabul kriterini ve kalan risk kararını yazın."),
 soru("a812","8","8.1.2",3,"Konfigürasyonu nasıl yönetiyorsunuz? Sevk edilen parçanın hangi revizyon ve onaylı değişikliklerle üretildiğini gösterebilir misiniz?","Konfigürasyon yönetim planı|Onaylı değişiklik kayıtları|Üretildiği / teslim edildiği haliyle konfigürasyon kaydı|Müşteri onayı gereken değişikliklerin tanımı","Ürün bazında konfigürasyon durum kaydı oluşturun; müşteri onayı gereken değişiklikleri tanımlayın."),
 soru("a813","8","8.1.3",2,"Ürün güvenliğini ürünün ömrü boyunca nasıl yönetiyorsunuz? Güvenlik açısından kritik kalemler neler?","Ürün güvenliği süreci|Kritik kalem listesi|Olay bildirimi ve eğitim","Ürün güvenliği açısından kritik kalemleri işaretleyin; olay bildirimi ve eğitim adımlarını tanımlayın."),
 soru("a814","8","8.1.4",3,"Sahte veya şüpheli parçanın ürüne girmesini nasıl önlüyorsunuz?","Sahte parça önleme süreci|Üretici veya yetkili distribütör şartı|Doğrulama ve test|Karantina ve bildirim|Eğitim","Sahte parça önleme sürecini yazın: yetkili kaynak, doğrulama, karantina ve bildirim; satınalma ve depoyu eğitin."),
 soru("a822","8","8.2.2",2,"Özel şartları, kritik kalemleri ve anahtar karakteristikleri teklif aşamasında nasıl belirliyorsunuz?","Sözleşme gözden geçirmede özel şart listesi|Kritik kalem ve anahtar karakteristik işaretleri|Risk değerlendirmesi","Sözleşme gözden geçirme formuna özel şart, kritik kalem ve anahtar karakteristik alanları ekleyin."),
 soru("a841","8","8.4.1",3,"Tedarikçi kaydınızda onay durumu, onay kapsamı ve performans (kalite, teslimat) var mı? Müşterinin belirlediği kaynakları nasıl yönetiyorsunuz?","Tedarikçi kaydı (onay kapsamı, durum)|Periyodik kalite ve teslimat performansı|Riskli tedarikçi için aksiyon|Müşteri onaylı kaynak listesiyle uyum","Tedarikçi kaydına onay kapsamı ve performans alanlarını ekleyin; müşteri onaylı kaynak dışı kullanımı engelleyin."),
 soru("a843","8","8.4.3",3,"Siparişlerde müşteri şartları, özel prosesler, sahte parça önleme, kayıt saklama ve alt tedarikçiye aktarım yazıyor mu?","Sipariş şablonunda 8.4.3 maddeleri|Özel proses ve sertifika şartı|Alt tedarikçiye aktarım|Etik ve ürün güvenliği farkındalık şartı","Satınalma sipariş şablonuna 8.4.3 kontrol listesini ekleyin; müşteri sözleşmesindeki kalite maddelerini aktarın."),
 soru("a851f","8","8.5.1",2,"Yabancı madde hasarı (FOD) önleme programınız nasıl işliyor?","FOD talimatı|Alan kontrolleri ve temizlik|Alet ve küçük parça takibi|FOD eğitimi","Kritik alanlarda FOD kontrol listesi ve alet sayımı başlatın; FOD bulgularını kaydedin."),
 soru("a851k","8","8.5.1",2,"Anahtar karakteristikler ve kritik ölçüler üretimde nasıl izleniyor?","Kontrol planında işaretli anahtar karakteristikler|İstatistiksel kontrol veya %100 kontrol kaydı|Yetersiz proses yeterliliğinde aksiyon","Anahtar karakteristikleri kontrol planında işaretleyin; yeterlilik veya %100 kontrol yöntemini tanımlayın."),
 soru("a8511","8","8.5.1.1",2,"CNC programları ve üretim yazılımları kullanılmadan önce nasıl doğrulanıyor? Takım ve fikstürler nasıl kontrol ediliyor?","NC program doğrulama ve onay kaydı|Program revizyon kontrolü|Takım ve fikstür periyodik kontrol kaydı","NC programlarını revizyonlu arşivleyin; ilk kullanımda doğrulama ve onay kaydını zorunlu yapın."),
 soru("a8513","8","8.5.1.3",3,"Yeni parça veya değişiklik sonrası ilk ürün muayenesi (FAI, AS9102) yapıyor musunuz? Kısmi FAI'yi ne tetikliyor?","AS9102 formatında FAI raporu|Balonlu resim ve tüm karakteristikler|Değişiklik sonrası kısmi FAI kararı|Gerekiyorsa müşteriye sunum","FAI tetikleyicilerini yazılı hale getirin: yeni parça, tasarım, proses, tedarikçi veya saha değişikliği, uzun üretim arası."),
 soru("a854","8","8.5.4",1,"Raf ömürlü malzeme, ESD hassas parça ve koruma şartları nasıl kontrol ediliyor?","Raf ömrü takibi|ESD koruma kayıtları|Ambalaj ve işaretleme şartları","Raf ömürlü malzeme listesi ve ESD alan kontrollerini kayıt altına alın."),
 soru("a855","8","8.5.5",1,"Teslim sonrası saha verisi, teknik doküman ve müşteri desteği nasıl yönetiliyor?","Saha ve servis verisi|Teknik doküman kontrolü|Müşteri geri bildirimi","Teslim sonrası sorunları kayıt altına alıp düzeltici faaliyete bağlayın."),
 soru("a871","8","8.7.1",3,"Uygunsuz ürün için MRB kararlarını kim veriyor? Müşteri onayı olmadan tamir veya 'olduğu gibi kullan' yapıldı mı? Hurda nasıl imha ediliyor?","MRB yetkilileri|Müşteri onayı gereken kararlar|Hurdanın kullanılamaz hale getirilmesi|Sevk edilmiş uygunsuzlukta müşteri bildirimi","MRB yetki listesini yazın; tamir ve 'olduğu gibi kullan' kararlarını müşteri onayına bağlayın; hurdayı işaretleyip imha edin."),
 soru("a912","9","9.1.2",2,"Müşteri skor kartlarınız nasıl? Teslimat ve kalite performansı hedefin altındaysa ne yaptınız?","Müşteri skor kartları|Teslimat ve kalite trendi|Aksiyon planları","Ana müşterilerin skor kartlarını toplayın; hedef altı için aksiyon planı hazırlayın."),
 soru("a92","9","9.2",3,"İç denetimleriniz proses yaklaşımıyla mı yapılıyor? Proseslerin etkinliğini değerlendiriyor musunuz?","Proses bazlı iç denetim programı|Proses performans verisinin incelenmesi|Etkinlik kararı|Bulgu kapanışı","İç denetim raporlarına her proses için performans verisi ve etkinlik kararı ekleyin."),
 soru("a1021","10","10.2.1",3,"Kök neden analizinde insan faktörlerini nasıl ele alıyorsunuz? Tedarikçi kaynaklı uygunsuzlukta faaliyeti tedarikçiye aktarıyor musunuz?","İnsan faktörleri analizi|Tedarikçiye düzeltici faaliyet talebi|Etkinlik doğrulaması|Etkin olmayan faaliyet için ek aksiyon","NCR formuna insan faktörleri kontrol listesi ekleyin; tedarikçi kaynaklı bulgularda tedarikçiden düzeltici faaliyet isteyin.")
]).sort((a, b) => {
  const ga = AS_GRUPLARI.indexOf(a.g), gb = AS_GRUPLARI.indexOf(b.g);
  if (ga !== gb) return ga - gb;
  const ka = maddeAnahtari(a.c), kb = maddeAnahtari(b.c);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
});

export const DEPTS_AS: readonly Departman[] = [
 {k:"yonetim",n:"Üst yönetim",ic:"brief",items:[
  ["Zamanında teslimat performansınız nedir, hedefin altındaki aylarda ne karar aldınız?","Son 12 ayın verisini ve aksiyonları gösterin. Veri olup karar olmaması bulgu sebebidir."],
  ["Ürün güvenliği ve etik sizin için ne anlama geliyor, bunu çalışanlara nasıl yansıttınız?","Somut örnek verin: eğitim, bildirim kanalı, bir karar."],
  ["Operasyonel riskleriniz neler, kalan riski kim kabul ediyor?","Risk kaydındaki birkaç maddeyi ve kabul kararını anlatın."],
  ["Yönetim temsilcisinin yetkisi nedir?","Kalite konularını çözmek ve üst yönetime doğrudan ulaşmak için yetkisi olduğunu gösterin."]
 ]},
 {k:"kalite",n:"Kalite",ic:"shield",items:[
  ["Bu parçanın FAI raporunu gösterir misiniz? Son değişiklikten sonra kısmi FAI yapıldı mı?","Balonlu resim, tüm karakteristikler ve kısmi FAI kararının gerekçesi hazır olsun."],
  ["MRB'de 'olduğu gibi kullan' kararını kim veriyor, müşteri onayı nerede?","Yetki listesi ve müşteri onay yazısı."],
  ["İç denetimde proseslerin etkinliğine nasıl karar veriyorsunuz?","Proses göstergesi, hedef ve sonuçla birlikte etkinlik kararı."],
  ["Bir önceki denetimin NCR'leri nasıl kapandı, etkinliği doğrulandı mı?","Tekrarlayan bulgu majöre dönüşür. Kapanış kanıtını ve etkinlik doğrulamasını gösterin."],
  ["OASIS kaydınız güncel mi?","Sertifika, saha ve kapsam bilgisinin doğru olduğunu gösterin."]
 ]},
 {k:"muhendislik",n:"Mühendislik",ic:"ruler",items:[
  ["Sevk edilen bu parçanın konfigürasyonu nedir, hangi değişiklikler onaylı?","Revizyon geçmişi ve onaylı değişiklik kayıtları."],
  ["Anahtar karakteristikler nasıl belirleniyor ve üretime nasıl aktarılıyor?","Resim, kontrol planı ve ölçüm yöntemi arasındaki bağ."],
  ["Hangi değişiklikler müşteri onayı gerektiriyor?","Sözleşmedeki şartı ve bir örnek onayı gösterin."]
 ]},
 {k:"uretim",n:"Üretim / operatör",ic:"factory",items:[
  ["Bu CNC programının onaylı ve güncel olduğunu nereden biliyorsun?","Program revizyonu ve doğrulama kaydı."],
  ["Tezgâh başında FOD için ne yapıyorsun?","Alan temizliği, alet sayımı, küçük parça kontrolü."],
  ["Ölçü tolerans dışıysa ne yaparsın?","Durdururum, işaretlerim, bildiririm. Kendi başına düzeltip devam etmek kötü cevaptır."],
  ["Bu işin anahtar karakteristiği hangisi, nasıl kontrol ediyorsun?","Kontrol planındaki işareti ve kayıt yerini göstermeli."]
 ]},
 {k:"satinalma",n:"Satınalma",ic:"cart",items:[
  ["Sipariş şartlarında AS9100 8.4.3 maddeleri var mı? Örnek bir sipariş açalım.","Özel proses, sertifika, kayıt saklama, alt tedarikçiye aktarım ve farkındalık maddeleri."],
  ["Sahte parça riskini nasıl yönetiyorsunuz?","Yetkili kaynak kuralı, sertifika doğrulama, şüpheli parça karantinası."],
  ["Müşterinin belirlediği kaynak dışında alım yapıldı mı?","Yapılmadıysa kuralı, yapıldıysa müşteri onayını gösterin."],
  ["Tedarikçi performansını nasıl ölçüyorsunuz?","Kalite ve teslimat skorları, düşük performansta aksiyon."]
 ]},
 {k:"depo",n:"Depo / giriş kontrol",ic:"box",items:[
  ["Raf ömürlü malzemeleri nasıl takip ediyorsunuz?","Son kullanma etiketi ve ilk giren ilk çıkar kanıtı."],
  ["Şüpheli sahte parça bulunca ne yaparsınız?","Karantina, kayıt ve bildirim; tedarik zincirine geri göndermemek."],
  ["ESD hassas parçalar nasıl korunuyor?","ESD ambalaj, alan ve bileklik kontrolleri."]
 ]},
 {k:"ik",n:"İK / eğitim",ic:"grad",items:[
  ["Farkındalık eğitiminde ürün güvenliği, etik ve sahte parça var mı?","Eğitim içeriği ve katılım kaydı."],
  ["Özel proses operatörlerinin sertifikaları güncel mi?","Geçerlilik tarihleriyle takip listesi."],
  ["İnsan faktörleri eğitimi veriyor musunuz?","Zorunlu değil ama kök neden analizinde güçlü kanıt."]
 ]}
];

export const PREP_AS: readonly HazirlikDonemi[] = [
 {t:"8–12 hafta",s:"önce",items:[["p1","Denetim planını, kapsamı, sahaları ve OASIS bilgisini kuruluşla netleştir","4.3"],["p2","Önceki NCR'lerin kapanışını ve etkinliğini doğrula; tekrar eden bulgu majöre döner","10.2"],["p3","Proses yaklaşımlı iç denetimi tamamla, her proses için etkinlik kararı ver","9.2"],["p4","YGG'yi zamanında teslimat ve ürün uygunluğu girdileriyle yap","9.3"]]},
 {t:"4–6 hafta",s:"önce",items:[["p5","Son 12 ayın teslimat ve kalite performansını, müşteri skor kartlarını hazırla","9.1.2"],["p6","Ölçüm cihazı kaydını ve bir geriye dönük değerlendirme örneğini hazırla","7.1.5.2"],["p7","FAI kayıtlarını ve kısmi FAI kararlarını gözden geçir","8.5.1.3"],["p8","Konfigürasyon kayıtlarını ve onaylı değişiklikleri kontrol et","8.1.2"],["p9","Tedarikçi kaydını, onay kapsamını ve performansı güncelle","8.4.1"],["p10","Siparişlerde 8.4.3 şart aktarımını örneklerle kontrol et","8.4.3"]]},
 {t:"2 hafta",s:"önce",items:[["p11","Simülasyonu proses sahipleriyle birlikte yap"],["p12","Bir sevkiyatla sözleşmeden FAI ve uygunluk belgesine kadar iz sür","8.5.2"],["p13","Saha turu: FOD, raf ömrü, ESD, red alanı, NC program revizyonları","8.5.1"],["p14","MRB kararlarını ve müşteri onaylarını kontrol et","8.7.1"]]},
 {t:"1 hafta",s:"önce",items:[["p15","Proses bazlı kanıt klasörlerini hazırla: girdi, çıktı, gösterge, sonuç"],["p16","Proses sahiplerinin kısa performans sunumlarını hazırla"],["p17","Çalışanlara ürün güvenliği, etik ve sahte parça farkındalığını hatırlat","7.3"],["p18","Üst yönetimin açılış ve kapanışa katılımını teyit et","5.1"]]},
 {t:"Denetim",s:"günü",items:[["p19","Açılışta plan, kapsam, sahalar ve rehberleri teyit et"],["p20","Her gün sonunda bulguları ve açık soruları not al"],["p21","Kapanışta NCR sınıfını, maddeyi ve kanıtı netleştir"]]},
 {t:"Sonrası",s:"denetim",items:[["p22","Acil kapsama gereken bulguları hemen düzelt ve kayda al"],["p23","Düzeltme, kök neden ve düzeltici faaliyet planını en geç 30 gün içinde kuruluşla uzlaş","10.2"],["p24","Etkinliği doğrula, bir sonraki iç denetime ekle","9.2"]]}
];

export const STAGES_AS: readonly BelgelendirmeAsamasi[] = [
 {n:"Aşama 1",w:"Başlangıç",ic:"file",d:"Doküman ve hazırlık incelemesi: kapsam, sahalar, süreçler ve AS9100'e özgü süreçlerin varlığı.",f:["Kapsam, sahalar ve süreç haritası","Süreç göstergeleri","Tamamlanmış iç denetim ve YGG","Konfigürasyon, sahte parça, FAI süreçleri"],t:"Aşama 1'de görülen eksikler Aşama 2'ye kadar kapatılmazsa bulguya dönüşür."},
 {n:"Aşama 2",w:"Birkaç hafta sonra",ic:"eye",d:"Proses yaklaşımlı saha denetimi. Denetçi her prosesin etkinliğine karar verir ve bunu raporlar.",f:["Proses performansı ve etkinliği","Sözleşmeden sevke iz sürme","FAI, MRB, tedarikçi kontrolü","Müşteri skor kartları"],t:"Uygunsuzluklar için düzeltme ve faaliyet planı en geç 30 gün içinde kuruluşla uzlaşılmalı."},
 {n:"Gözetim",w:"Yıllık",ic:"cal",d:"Yıllık denetim. Önceki bulgular, müşteri performansı ve kritik süreçler örneklenir.",f:["Önceki NCR'lerin etkinliği","Teslimat ve kalite performansı","Değişiklikler, yeni ürünler","İç denetim ve YGG"],t:"Aynı ya da benzer bulgunun ardışık denetimde tekrarı majör olarak yazılabilir."},
 {n:"Yeniden belgelendirme",w:"3. yıl",ic:"reset",d:"Tüm sistem yeniden denetlenir; sertifika üç yıl daha uzar ve OASIS güncellenir.",f:["Üç yıllık performans","Tüm prosesler ve sahalar","OASIS kaydı"],t:"Sertifikanın süresi dolmadan tamamlanmalı."}
];

export const DOCS_AS: readonly ZorunluDokuman[] = DOCS.concat([
 ["a1","4.4","KYS'nin genel tanımı, ilgili taraflar, süreçler ve etkileşimleri","Doküman"],
 ["a2","7.1.5.2","Ölçüm cihazı kaydı ve geri çağırma süreci","Kayıt"],
 ["a3","8.1.2","Konfigürasyon yönetimi süreci ve kayıtları","Doküman"],
 ["a4","8.1.4","Sahte parça önleme süreci","Doküman"],
 ["a5","8.1","İş transferi planı ve kayıtları","Kayıt"],
 ["a6","8.4.1","Tedarikçi kaydı: onay durumu ve kapsamı","Kayıt"],
 ["a7","8.5.1.1","NC program ve takım doğrulama kayıtları","Kayıt"],
 ["a8","8.5.1.2","Özel proses kalifikasyon kayıtları","Kayıt"],
 ["a9","8.5.1.3","FAI raporları (AS9102)","Kayıt"],
 ["a10","8.7.1","MRB kararları ve müşteri onayları","Kayıt"],
 ["a11","10.2.1","NCR, kök neden, düzeltici faaliyet ve etkinlik","Kayıt"]
]);

export const CHAIN_AS: readonly IzHalkasi[] = [
 {k:"t1",n:"Sözleşme",c:"8.2.2",ic:"file",s:"Sözleşme gözden geçirme, özel şartlar, kritik kalemler, anahtar karakteristikler."},
 {k:"t2",n:"Konfigürasyon",c:"8.1.2",ic:"layers",s:"Geçerli revizyon, onaylı değişiklikler, müşteri onayları."},
 {k:"t3",n:"Satınalma",c:"8.4",ic:"cart",s:"Onaylı veya müşteri onaylı kaynak, 8.4.3 şartları, sertifika, giriş kontrolü, sahte parça kontrolü."},
 {k:"t4",n:"Üretim",c:"8.5.1",ic:"factory",s:"Talimat, onaylı NC program, FOD, özel proses, yetkin operatör, kalibreli alet."},
 {k:"t5",n:"FAI",c:"8.5.1.3",ic:"clip",s:"AS9102 raporu veya kısmi FAI gerekçesi."},
 {k:"t6",n:"İzlenebilirlik",c:"8.5.2",ic:"link",s:"Seri/lot → iş emri → malzeme sertifikası; üretildiği haliyle konfigürasyon."},
 {k:"t7",n:"Serbest bırakma",c:"8.6",ic:"award",s:"Final muayene, yetkili imza, uygunluk belgesi."},
 {k:"t8",n:"MRB",c:"8.7.1",ic:"alert",s:"Varsa uygunsuzluk kaydı, MRB kararı, müşteri onayı."},
 {k:"t9",n:"Müşteri",c:"9.1.2",ic:"users",s:"Zamanında teslimat, skor kartı, geri bildirim."}
];

export const SEV_AS: readonly BulguSeviyesiTanimi[] = [
 {k:"major",n:"Majör",d:"Bir sürecin ya da şartın hiç olmaması veya tamamen çökmesi; uygunsuz ürünün müşteriye gitmesi; aynı bulgunun ardışık denetimde tekrarı.",ex:["Konfigürasyon kaydı yok","FAI hiç yapılmıyor","Aynı minörün bir sonraki denetimde tekrarı"],cons:"Acil kapsama istenebilir; kapanmadan sertifika kararı verilmez, askı riski doğar."},
 {k:"minor",n:"Minör",d:"Tekil sapma; süreç genel olarak çalışıyor.",ex:["Bir FAI raporunda eksik karakteristik","Bir tedarikçinin performans değerlendirmesi yapılmamış","Bir NC programın onay kaydı eksik"],cons:"Düzeltme ve faaliyet planı denetimin bitiminden en geç 30 gün içinde kuruluşla uzlaşılır."},
 {k:"obs",n:"İyileştirme fırsatı",d:"Uygunsuzluk değil; zayıf nokta veya ileride sapma riski.",ex:["Skor kartları izleniyor ama aksiyon yüzeysel"],cons:"Zorunlu aksiyon yok, sonraki denetimde bakılabilir."}
];

