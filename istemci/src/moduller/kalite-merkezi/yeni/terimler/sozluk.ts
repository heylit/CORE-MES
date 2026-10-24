// Uygulamanın terim sözlüğü (GLOSS) olduğu gibi; sıra uygulamadakidir, ekran alfabetik dizer.
export const TERIMLER: Readonly<Record<string, string>> = {
  AQL: 'Kabul edilebilir kalite seviyesi. Numune planının, partide bu orandaki hatayı çoğunlukla kabul edecek şekilde kurulduğu hata yüzdesi (ISO 2859-1).',
  Ac: 'Kabul sayısı. Numunede bu sayıda veya daha az uygunsuz birim bulunursa parti kabul edilir.',
  Re: 'Ret sayısı. Numunede bu sayıda veya daha fazla uygunsuz birim bulunursa parti reddedilir.',
  'Kod harfi': 'Parti büyüklüğü ve muayene seviyesinden ISO 2859-1 Tablo 1 ile bulunan harf; numune büyüklüğünü belirler.',
  'Muayene seviyesi': 'Numunenin partiye göre ne kadar büyük olacağı. II varsayılandır; I daha az, III daha ayırt edicidir; S-1…S-4 tahribatlı veya pahalı testler içindir.',
  'Sıkılaştırılmış': 'Kalite kötüleştiğinde (5 lot içinde 2 ret) geçilen, daha sıkı kabul planı. 5 ardışık kabulde normale dönülür.',
  LTPD: 'Plan tarafından yalnızca %10 olasılıkla kabul edilen hata oranı (tüketici riski noktası).',
  AOQL: 'Reddedilen partiler ayıklandığında, uzun vadede müşteriye çıkan en kötü ortalama hata oranı.',
  'OC eğrisi': 'İşletim karakteristiği eğrisi: partideki gerçek hata oranına göre kabul olasılığı.',
  Cpk: 'Süreç yeteneği: ortalamanın en yakın tolerans sınırına uzaklığının 3σ\'ya oranı. 1,33 ve üzeri yetenekli kabul edilir.',
  Cp: 'Potansiyel süreç yeteneği: tolerans genişliğinin 6σ\'ya oranı. Süreç merkezlenirse ulaşılabilecek Cpk.',
  Ppk: 'Uzun dönem (toplam standart sapma ile) süreç performansı.',
  NCR: 'Uygunsuzluk raporu (Nonconformance Report). Şartı karşılamayan ürünün kaydı.',
  MRB: 'Malzeme inceleme kurulu. Uygun olmayan ürün için kullanım kararını (olduğu gibi kullan, tamir, yeniden işle, hurda, iade) verir.',
  'DÖF': 'Düzeltici ve önleyici faaliyet. Uygunsuzluğun kök nedenini gideren ve tekrarını önleyen faaliyet.',
  '8D': 'Sekiz adımlı problem çözme yöntemi: ekip, tanım, geçici önlem, kök neden, çözüm, uygulama, önleme, kapanış.',
  FAI: 'İlk parça muayenesi (AS9102). Yeni parça, revizyon veya proses değişikliğinde tüm karakteristiklerin ölçülüp belgelendiği muayene.',
  AS9102: 'Havacılık ve savunmada ilk parça muayenesinin içeriğini ve formlarını (Form 1, 2, 3) tanımlayan standart.',
  PMI: 'Ürün imalat bilgisi: 3D modele eklenmiş ölçü, tolerans, GD&T ve notlar.',
  AP242: 'STEP standardının, 3D model ile birlikte anlamsal PMI taşıyabilen sürümü (ISO 10303-242).',
  'GD&T': 'Geometrik ölçülendirme ve toleranslandırma: konum, profil, diklik, düzlemsellik gibi biçim ve konum toleransları.',
  Datum: 'Geometrik toleransların ölçüldüğü referans yüzey, eksen veya düzlem (A, B, C…).',
  'Temel ölçü': 'Teorik olarak kesin ölçü (basic). Kendisi toleranssızdır; özelliğin yeri geometrik toleransla kontrol edilir.',
  'ISO 2768': 'Toleransı yazılmamış ölçüler için genel tolerans standardı (f, m, c, v sınıfları).',
  'ISO 286': 'Delik ve mil uyum toleransları standardı (H7, g6 gibi kodlar).',
  PPM: 'Milyonda parça: uygunsuz adet / alınan adet × 1.000.000.',
  'İlk geçiş oranı': 'İlk muayenede kabul edilen kayıtların oranı; yeniden işleme ve tekrar muayene öncesi kaliteyi gösterir.',
  CoC: 'Uygunluk sertifikası (Certificate of Conformance). Tedarikçinin, ürünün şartlara uygun olduğunu beyan ettiği belge.',
  FOD: 'Yabancı madde hasarı. Ürüne giren alet, talaş, bağlantı elemanı gibi yabancı maddelerin yol açtığı hasar.',
  Karantina: 'Kullanım kararı verilene kadar ayrılmış ve etiketlenmiş ürün.',
  'İzlenebilirlik': 'Bir ölçümün ulusal veya uluslararası referanslara kesintisiz kalibrasyon zinciriyle bağlanması; ürün için de hammaddeden sevkiyata kayıt zinciri.',
  Balon: 'Teknik resimde her karakteristiğe verilen numaralı işaret; muayene kayıtlarıyla eşleştirmeyi sağlar.',
  Nominal: 'Ölçünün tasarım değeri; toleranslar bu değere göre verilir.',
  Sapma: 'Üretim öncesi, şarttan sapma için alınan izin (deviation).',
  Feragat: 'Üretim sonrası, şartı karşılamayan ürünün kullanımı için alınan izin (waiver).',
  Kalibrasyon: 'Ölçüm cihazının referans standartla karşılaştırılarak doğruluğunun belirlenmesi ve belgelenmesi.',
  QIF: 'Kalite bilgisi çerçevesi (ISO 23952). Ölçüm planı ve sonuçlarını CMM yazılımları arasında taşıyan standart dosya biçimi.',
};

// Arama terimde ve açıklamada, Türkçe küçük harfle yapılır; sonuç terim adına göre alfabetiktir.
export function terimAra(sorgu: string): [string, string][] {
  const q = sorgu.trim().toLocaleLowerCase('tr');
  return Object.entries(TERIMLER)
    .filter(([k, v]) => !q || `${k} ${v}`.toLocaleLowerCase('tr').includes(q))
    .sort((a, b) => a[0].localeCompare(b[0], 'tr'));
}
