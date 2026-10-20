// @ts-nocheck
// Ekrandaki (çerçevedeki uygulama) hesap motorunun aynısıdır: bordro, izin, tazminat ve parametre dönemi hesapları
// sunucuda da aynı sonucu versin diye tek kaynaktan kopyalanır (kaynak: ik-modulu src/core). Tipler arayuz.ts'tedir;
// bu dosyada tip denetimi kapalıdır (UYUM-BORCU.md).
/**
 * İK Modülü – sabitler, varsayılan ayarlar, soru setleri ve yaka/kademe çıkarımı.
 */
const QSETS = [
  {id:'q-genel', ad:'Genel ve davranışsal', kategori:'Tüm pozisyonlar', odak:'Motivasyon, öğrenme, ekip çalışması, önceliklendirme', sorular:'Kendinizi ve kariyer yolculuğunuzu kısaca anlatır mısınız?\nNeden bu pozisyona ve şirketimize başvurdunuz?\nSon işinizde en çok gurur duyduğunuz başarı neydi, sizin katkınız neydi?\nBir hata yaptığınız ve bundan ders çıkardığınız bir durumu anlatır mısınız?\nBir ekip arkadaşınızla anlaşmazlık yaşadığınız bir örneği ve nasıl çözdüğünüzü anlatır mısınız?\nAynı anda birden fazla acil işiniz olduğunda nasıl önceliklendirirsiniz?\nÖnümüzdeki üç yılda kendinizi nerede görüyorsunuz?\nBize sormak istediğiniz bir şey var mı?'},
  {id:'q-satis', ad:'Satış ve müşteri ilişkileri', kategori:'Satış', odak:'İkna, hedef odaklılık, portföy yönetimi', sorular:'Kapattığınız en zor satışı adım adım anlatır mısınız?\nFiyat itirazı gelen bir müşteriye nasıl yaklaşırsınız?\nYeni müşteri bulmak için hangi yöntemleri kullanıyorsunuz?\nHedefinizin gerisinde kaldığınız bir dönemde neler yaptınız?\nKaybettiğiniz bir müşteriyi geri kazandığınız bir örnek var mı?\nSatış süreçlerinizi hangi araçlarla (CRM vb.) takip ediyorsunuz?\nBu masadaki bir ürünü bize satar mısınız? (canlandırma)'},
  {id:'q-finans', ad:'Muhasebe ve finans', kategori:'Finans', odak:'Mevzuat bilgisi, doğruluk, kapanış süreçleri', sorular:'Ay sonu kapanışında hangi adımları hangi sırayla yaparsınız?\nKDV, muhtasar ve SGK beyannamelerinde deneyiminiz nedir?\nBir cari hesap mutabakatsızlığını nasıl çözümlersiniz?\nHangi ERP programlarını ve Excel işlevlerini kullanıyorsunuz?\nBir denetimde tespit edilen hatayı nasıl yönettiniz?\nGecikmiş bir tahsilat için nasıl bir süreç izlersiniz?\nKur farkı ve reeskont kayıtlarını nasıl yaparsınız?'},
  {id:'q-uretim', ad:'Üretim ve operasyon', kategori:'Mavi yaka', odak:'İş güvenliği, kalite, vardiya uyumu', sorular:'Daha önce hangi makine veya tezgâhlarda çalıştınız?\nVardiyalı çalışmayla ilgili deneyiminiz nedir?\nÇalıştığınız makinede bir arıza fark ettiğinizde ne yaparsınız?\nİş güvenliği kurallarına uyulmadığını gördüğünüzde nasıl davranırsınız?\nKalite hatası olan bir parçayı fark ettiğinizde ne yaparsınız?\nEkipten biri işe gelmediğinde artan iş yüküyle nasıl başa çıkarsınız?\nİşe ulaşımınızı nasıl sağlayacaksınız?'},
  {id:'q-bt', ad:'Yazılım ve bilgi teknolojileri', kategori:'BT', odak:'Teknik derinlik, problem çözme, iletişim', sorular:'Son çalıştığınız projenin mimarisini ve sizin rolünüzü anlatır mısınız?\nCanlı ortamda yaşanan bir hatayı nasıl tespit edip çözdünüz?\nKod incelemesinde neye dikkat edersiniz?\nTeknik borcu nasıl yönetirsiniz?\nYeni bir teknolojiyi öğrenmeniz gerektiğinde nasıl ilerlersiniz?\nGüvenlik açısından dikkat ettiğiniz temel uygulamalar nelerdir?\nTeknik olmayan birine karmaşık bir konuyu nasıl anlatırsınız?'},
  {id:'q-yonetici', ad:'Yöneticilik ve liderlik', kategori:'Yönetici', odak:'Ekip yönetimi, karar verme, değişim', sorular:'Yönettiğiniz en büyük ekip neydi ve yönetim tarzınızı nasıl tanımlarsınız?\nDüşük performans gösteren bir ekip üyesiyle nasıl çalıştınız?\nEkibinize zor bir kararı nasıl ilettiğinizi anlatır mısınız?\nHedef koyma ve takip için hangi yöntemleri kullanıyorsunuz?\nEkibinizden birini terfiye hazırladığınız bir örnek var mı?\nBütçe veya kaynak kısıtı altında nasıl önceliklendirme yaptınız?\nDeğişime direnç gösteren bir ekibi nasıl yönettiniz?'},
  {id:'q-musteri', ad:'Müşteri hizmetleri ve destek', kategori:'Destek', odak:'Empati, sakinlik, çözüm odaklılık', sorular:'Öfkeli bir müşteriyle yaşadığınız bir görüşmeyi ve sonucunu anlatır mısınız?\nÇözemediğiniz bir talebi müşteriye nasıl iletirsiniz?\nYoğun dönemlerde verimliliğinizi nasıl korursunuz?\nMüşteri memnuniyetini artırmak için önerdiğiniz bir iyileştirme oldu mu?\nHangi destek veya talep yönetim sistemlerini kullandınız?\nKuralların dışına çıkmanız gereken bir durumda nasıl karar verdiniz?'},
  {id:'q-yenimezun', ad:'Yeni mezun ve stajyer', kategori:'Giriş seviyesi', odak:'Öğrenme isteği, potansiyel, takım çalışması', sorular:'Okulda veya stajda yaptığınız ve gurur duyduğunuz bir projeyi anlatır mısınız?\nBu alanı neden seçtiniz?\nBir grup çalışmasında üstlendiğiniz rol neydi?\nBilmediğiniz bir konuyla karşılaştığınızda nasıl öğrenirsiniz?\nZaman yönetiminde zorlandığınız bir örnek ve çözümünüz nedir?\nİlk altı ayda burada ne öğrenmeyi bekliyorsunuz?'},
  {id:'q-lojistik', ad:'Lojistik ve depo', kategori:'Mavi yaka', odak:'Doğruluk, düzen, güvenli çalışma', sorular:'Hangi depo yönetim sistemlerini veya el terminallerini kullandınız?\nMal kabulde eksik veya hasarlı ürün geldiğinde ne yaparsınız?\nSayım farklarını nasıl tespit edip raporlarsınız?\nForklift veya istif makinesi belgeniz ve deneyiminiz nedir?\nSevkiyat yoğunluğunda işleri nasıl planlarsınız?\nDepoda güvenli çalışma için dikkat ettiğiniz kurallar nelerdir?'},
  {id:'q-ik', ad:'İnsan kaynakları', kategori:'İK', odak:'Mevzuat, süreç yönetimi, gizlilik', sorular:'İşe alım sürecini baştan sona nasıl yürütürsünüz?\nBordro ve SGK süreçlerindeki deneyiminiz nedir?\nZor bir disiplin görüşmesini nasıl yönettiniz?\nÇalışan bağlılığını artırmak için uyguladığınız bir çalışma var mı?\nİş Kanunu’nda en sık karşılaştığınız konular nelerdir?\nKişisel verilerin korunması için İK süreçlerinde nelere dikkat edersiniz?'}
];
/* ===================== Sabitler ===================== */
const DEFAULT_DOCS = ['Nüfus cüzdanı fotokopisi','İkametgâh belgesi','Adli sicil kaydı','Diploma / mezuniyet belgesi','İşe giriş sağlık raporu','Vesikalık fotoğraf','İmzalı iş sözleşmesi','SGK işe giriş bildirgesi','KVKK aydınlatma metni onayı','İSG eğitim belgesi','Askerlik durum belgesi','Banka hesap bilgisi','Aile durum bildirimi','Özgeçmiş'];
const DEFAULT_SETTINGS = {
  sirket:'İnsan Kaynakları',
  cumartesiIsGunu:false,
  tatiller:['01-01 Yılbaşı','04-23 Ulusal Egemenlik ve Çocuk Bayramı','05-01 Emek ve Dayanışma Günü','05-19 Atatürk\'ü Anma, Gençlik ve Spor Bayramı','07-15 Demokrasi ve Millî Birlik Günü','08-30 Zafer Bayramı','10-29 Cumhuriyet Bayramı','2026-03-20 Ramazan Bayramı','2026-03-21 Ramazan Bayramı','2026-03-22 Ramazan Bayramı','2026-05-27 Kurban Bayramı','2026-05-28 Kurban Bayramı','2026-05-29 Kurban Bayramı','2026-05-30 Kurban Bayramı'].join('\n'),
  asgariBrut:33030, sgkTavan:297270, sgkIsciOran:14, issizlikIsciOran:1, sgkIsverenOran:21.75, issizlikIsverenOran:2, damgaOran:0.759,
  dilimler:'190000:15\n400000:20\n1500000:27\n5300000:35\n:40',
  kidemTavan:73729.84, mesaiCarpan:1.5, aylikSaat:225, yillikMesaiLimit:270,
  sgkTesvikPuan:0, fazlaSurelerCarpan:1.25, haftaTatiliCarpan:1.5, ubgtCarpan:1, haftalikSaat:45,
  yemekYontem:'Yok', yemekHesap:'Günlük tutar × fiili gün', yemekDeger:300, yemekGvKart:330, yemekGvNakit:300, yemekSgkKart:'tamami', yemekSgkLimit:300, yemekSgkNakit:300,
  yolYontem:'Yok', yolHesap:'Günlük tutar × fiili gün', yolDeger:158, yolGvKart:158, yolSgkKart:'tabi',
  primler:[{id:'p1', ad:'Performans primi', tur:'oran', deger:10, siklik:'ceyrek', aylar:'', atama:'yok', kidem:false},{id:'p2', ad:'İkramiye', tur:'maas', deger:1, siklik:'yarim', aylar:'', atama:'yok', kidem:true},{id:'p3', ad:'Bayram harçlığı', tur:'sabit', deger:5000, siklik:'ozel', aylar:'3,5', atama:'yok', kidem:false},{id:'p4', ad:'Vardiya primi', tur:'sabit', deger:2000, siklik:'her', aylar:'', atama:'yok', kidem:true}],
  tesvikler:[{id:'t0', ad:'Teşvik yok', tur:'yok', deger:0},{id:'t5', ad:'5510 md. 81/ı hazine desteği (5 puan)', tur:'puan', deger:5},{id:'t2', ad:'5510 md. 81/ı hazine desteği (2 puan)', tur:'puan', deger:2},{id:'t6111', ad:'4447 geçici md. 10 / 6111 – kadın, genç, mesleki belgeli', tur:'asgari', deger:0},{id:'tilave', ad:'4447 geçici md. 19 – ilave istihdam', tur:'asgari', deger:0},{id:'tengelli', ad:'4857 md. 30 – engelli istihdamı', tur:'asgari', deger:0}],
  varsayilanTesvik:'t0',
  sirketTanitim:'', kariyerEposta:'', kariyerSayfasi:'', ilanLokasyon:'', kvkkLink:'', ilanYanHaklar:'',
  ilanKanallari:[{id:'k1', ad:'Kariyer sayfası', url:'', kod:'WEB', aktif:true},{id:'k2', ad:'Kariyer.net', url:'https://www.kariyer.net', kod:'KN', aktif:true},{id:'k3', ad:'LinkedIn', url:'https://www.linkedin.com', kod:'LI', aktif:true},{id:'k4', ad:'Indeed', url:'https://tr.indeed.com', kod:'IN', aktif:true},{id:'k5', ad:'Eleman.net', url:'https://www.eleman.net', kod:'EN', aktif:true},{id:'k6', ad:'Secretcv', url:'https://www.secretcv.com', kod:'SC', aktif:false},{id:'k7', ad:'Yenibiriş', url:'https://www.yenibiris.com', kod:'YB', aktif:false},{id:'k8', ad:'İŞKUR', url:'https://esube.iskur.gov.tr', kod:'IS', aktif:true},{id:'k9', ad:'İç ilan', url:'', kod:'IC', aktif:true}],
  hesapGider:'770', hesapPersonel:'335', hesapVergi:'360', hesapSgk:'361', hesapDiger:'369',
  besOran:3, raporKesinti:true, engelliInd1:0, engelliInd2:0, engelliInd3:0,
  ihbar1:2, ihbar2:4, ihbar3:6, ihbar4:8, izin1:14, izin2:20, izin3:26, izinYasMin:20, denemeAy:2, engelliEsik:50, engelliOran:3,
  belgeler:DEFAULT_DOCS.join('\n'), soruSetleri:QSETS,
  mulakatKriterler:'Mesleki bilgi ve deneyim\nİletişim becerisi\nProblem çözme ve analitik düşünme\nTakım çalışmasına yatkınlık\nMotivasyon ve istek\nŞirket kültürüne uyum',
  perfKriterler:'İş kalitesi\nVerimlilik\nTakım çalışması\nİletişim\nİnisiyatif ve sorumluluk\nHedef gerçekleştirme'
};
const LEAVE_TYPES = ['Yıllık izin','Mazeret izni','Hastalık / rapor','Ücretsiz izin','Doğum izni','Babalık izni','Evlilik izni','Ölüm izni','Süt izni','Resmi görev','Diğer'];
const WORKDAY_LEAVES = ['Yıllık izin','Mazeret izni'];
const LEAVE_STATES = ['Beklemede','Onaylandı','Reddedildi','İptal'];
const ATT_TYPES = ['Fazla mesai','Hafta tatili çalışması','Resmi tatil çalışması','Geç kalma','Erken çıkış','Devamsızlık','Görevlendirme'];
const EXIT_CODES = ['01 Deneme süreli sözleşmenin işverence feshi','02 Deneme süreli sözleşmenin işçi tarafından feshi','03 Belirsiz süreli sözleşmenin işçi tarafından feshi (istifa)','04 Belirsiz süreli sözleşmenin işveren tarafından haklı sebep bildirilmeden feshi','05 Belirli süreli sözleşmenin sona ermesi','08 Emeklilik (yaşlılık) veya toptan ödeme','09 Malulen emeklilik','10 Ölüm','12 Askerlik','13 Kadın işçinin evlenmesi','14 Emeklilik için yaş dışındaki şartların tamamlanması','22 Diğer nedenler','25 İşçi tarafından ahlak ve iyi niyet kurallarına aykırılık nedeniyle fesih','29 İşveren tarafından ahlak ve iyi niyet kurallarına aykırılık nedeniyle fesih'];
const KIDEM_CODES = ['04','05','08','09','10','12','13','14','25'];
const STAGES = ['Başvuru','Ön görüşme','Mülakat','Teklif','İşe alındı','Reddedildi'];
const TRAIN_TYPES = ['İSG (zorunlu)','Oryantasyon','Teknik','Kişisel gelişim','Yönetim / liderlik','Mevzuat','Diğer'];
const INTV_TYPES = ['Telefon ön görüşmesi','İK mülakatı','Teknik mülakat','Yönetici mülakatı','Panel mülakat','Vaka çalışması / test','Referans kontrolü'];
const INTV_STATES = ['Planlandı','Tamamlandı','Aday gelmedi','İptal'];
const RECS = ['Kesinlikle alınsın','Alınsın','Kararsız','Alınmasın'];
const REC_CLS = {'Kesinlikle alınsın':'ok','Alınsın':'ok','Kararsız':'warn','Alınmasın':'bad'};
const REJECT_REASONS = ['Yetkinlikler yetersiz','Deneyim yetersiz','Ücret beklentisi uyuşmadı','Aday teklifi reddetti','Aday süreçten çekildi','Kültürel uyum','Referans kontrolü olumsuz','Pozisyon kapandı / donduruldu','Diğer'];
const DAYS_FULL = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const YEMEK_YONTEM = ['Yok','Yemek kartı / çeki','Nakit','İşyerinde yemek'];
const YOL_YONTEM = ['Yok','Toplu taşıma kartı / bilet','Nakit','Servis'];
const HESAP_OPTS = ['Günlük tutar × fiili gün','Aylık sabit tutar','Brüt ücretin yüzdesi'];
const SIKLIK = [['her','Her ay'],['ceyrek','3 ayda bir (Mar, Haz, Eyl, Ara)'],['yarim','6 ayda bir (Haz, Ara)'],['yillik','Yılda bir'],['ozel','Belirli aylar']];
const PRIM_TUR = [['sabit','Sabit tutar (₺)'],['oran','Brüt ücretin %’si'],['maas','Brüt ücretin katı']];
const ATAMA = [['yok','Kimseye (kişide seçilir)'],['herkes','Herkese'],['beyaz','Beyaz yakaya'],['mavi','Mavi yakaya']];
const TESVIK_TUR = [['yok','Teşvik yok'],['puan','İşveren payından puan indirimi'],['asgari','Asgari ücret üzerinden işveren payının tamamı'],['sabit','Aylık sabit tutar indirimi']];
const COLLARS = ['Beyaz yaka','Mavi yaka'];
const LEVELS = ['Üst yönetim','Yönetici','Takım lideri / şef','Uzman','Asistan / yardımcı','Operasyon / teknik personel','Stajyer'];
const BLUE_KW = ['operatör','operator','teknisyen','tekniker','usta','şoför','sofor','depo','forklift','montaj','kaynak','paketleme','işçi','bakım','temizlik','güvenlik görevlisi','vardiya','elektrikçi','tornacı','boyacı','kalıp','sevkiyat','kurye','aşçı','garson','mekanik','istifçi','hamal','bekçi','bahçıvan'];
function inferCollar(poz){ const p = String(poz || '').toLocaleLowerCase('tr'); if(!p) return 'Beyaz yaka'; if(/müdür|mühendis|uzman|şef|planlama|yönetici|direktör/.test(p)) return 'Beyaz yaka'; return BLUE_KW.some(k => p.includes(k)) ? 'Mavi yaka' : 'Beyaz yaka'; }
function inferLevel(poz){
  const p = String(poz || '').toLocaleLowerCase('tr');
  if(/genel müdür|ceo|cfo|cto|coo|direktör|direktor|başkan|ortak/.test(p)) return 'Üst yönetim';
  if(/asistan|sekreter/.test(p)) return 'Asistan / yardımcı';
  if(/müdür|yönetici|manager/.test(p)) return 'Yönetici';
  if(/şef|lider|sorumlu|amir|ustabaşı|usta başı|koordinatör|süpervizör/.test(p)) return 'Takım lideri / şef';
  if(/stajyer|intern|çırak/.test(p)) return 'Stajyer';
  if(inferCollar(poz) === 'Mavi yaka') return 'Operasyon / teknik personel';
  if(/asistan|yardımcı|eleman|sekreter/.test(p)) return 'Asistan / yardımcı';
  return 'Uzman';
}
const collarOf = e => COLLARS.includes(e?.yakaTipi) ? e.yakaTipi : inferCollar(e?.pozisyon);
const levelOf = e => LEVELS.includes(e?.kademe) ? e.kademe : inferLevel(e?.pozisyon);
const ASSET_TYPES = ['Dizüstü bilgisayar','Masaüstü bilgisayar','Monitör','Cep telefonu','Hat / SIM','Araç','Giriş kartı','Anahtar','İş kıyafeti / KKD','Diğer'];
const PERIOD_KEYS = ['asgariBrut','sgkTavan','sgkIsciOran','issizlikIsciOran','sgkIsverenOran','issizlikIsverenOran','damgaOran','dilimler','kidemTavan','mesaiCarpan','aylikSaat','yillikMesaiLimit','fazlaSurelerCarpan','haftaTatiliCarpan','ubgtCarpan','haftalikSaat','besOran','raporKesinti','engelliInd1','engelliInd2','engelliInd3','yemekYontem','yemekHesap','yemekDeger','yemekGvKart','yemekGvNakit','yemekSgkKart','yemekSgkLimit','yemekSgkNakit','yolYontem','yolHesap','yolDeger','yolGvKart','yolSgkKart','primler','tesvikler','varsayilanTesvik','ihbar1','ihbar2','ihbar3','ihbar4','izin1','izin2','izin3','izinYasMin'];

export { QSETS, DEFAULT_DOCS, DEFAULT_SETTINGS, LEAVE_TYPES, WORKDAY_LEAVES, LEAVE_STATES, ATT_TYPES, EXIT_CODES, KIDEM_CODES, STAGES, TRAIN_TYPES, INTV_TYPES, INTV_STATES, RECS, REC_CLS, REJECT_REASONS, DAYS_FULL, YEMEK_YONTEM, YOL_YONTEM, HESAP_OPTS, SIKLIK, PRIM_TUR, ATAMA, TESVIK_TUR, COLLARS, LEVELS, BLUE_KW, inferCollar, inferLevel, collarOf, levelOf, ASSET_TYPES, PERIOD_KEYS };
