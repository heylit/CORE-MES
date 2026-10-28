import { z } from 'zod';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { zamanSemasi } from '../zaman.ts';

// Gün içi saat "SS:DD"; dakika alanları gün içi dakikadır (0-1440).
const saat = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Saat SS:DD biçiminde girilir.');
const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde girilir.')
  .refine((t) => !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) && new Date(`${t}T00:00:00Z`).toISOString().startsWith(t), 'Geçersiz tarih.');
const kimlik = z.coerce.number().int().positive();
const metinAlani = (azami: number) => z.string().trim().min(1).max(azami);
const bosOlabilir = (azami: number) => z.string().trim().max(azami).nullable().transform((x) => (x === null || x === '' ? null : x));
// Gün başından dakika; uzun elle rotada gece yarısını aşabilir (uyarı olarak gösterilir).
const dakika = z.number().min(0);
// Güncellemede formun açıldığı sürüm: arada başkası değiştirdiyse komut 409 alır.
const surumAlani = z.number().int().positive();

export const NOKTA_TURU = z.enum(['fabrika', 'musteri', 'tedarikci', 'fason', 'kargo', 'diger']);
export const ARAC_TURU = z.enum(['binek', 'kamyonet', 'kamyon']);
export const IS_TURU = z.enum(['teslimat', 'alim', 'aktarma']);
export const AMAC = z.enum(['sure', 'mesafe', 'maliyet']);
// Havuzda: araca verilmemiş (yapılamayıp dönen dahil); planlandı: taslak plandadır; yolda: onaylı plandadır; tamamlandı: teslim edildi ya da alındı.
export const IS_DURUMU = z.enum(['havuzda', 'planlandi', 'yolda', 'tamamlandi']);
export const GUN_TIPI = z.enum(['hafta-ici', 'cuma', 'cumartesi', 'pazar']);

export const idParametresi = z.object({ id: kimlik });
export const tarihParametresi = z.object({ tarih });

// ---------- noktalar ----------
export const noktaSemasi = z.object({
  id: z.number().int(), ad: z.string(), tur: NOKTA_TURU, enlem: z.number(), boylam: z.number(),
  adres: z.string().nullable(), durakSuresiDakika: z.number().int(), aktif: z.boolean(),
  // Bağlı firma (finans); bağlıysa ad firmanın güncel adıdır.
  firmaId: z.number().int().nullable(), surum: z.number().int(),
});
export const noktaGovdesi = z.object({
  ad: metinAlani(120), tur: NOKTA_TURU,
  enlem: z.number().min(-90).max(90), boylam: z.number().min(-180).max(180),
  adres: bosOlabilir(400), durakSuresiDakika: z.number().int().min(0).max(240),
  // Yalnız müşteri, tedarikçi ve fason noktası firmaya bağlanır.
  firmaId: kimlik.nullable().default(null),
});
export const noktaGuncelleGovdesi = noktaGovdesi.extend({ surum: surumAlani });
// Noktaya bağlanacak firma (finansın müşteri ve tedarikçileri); nokta türü önerisi firmanın türünden.
export const FIRMA_TURU = z.enum(['musteri', 'tedarikci', 'ikisi']);
export const firmaAramaSorgusu = z.object({ metin: z.string().trim().max(80).default('') });
export const firmaSecenegi = z.object({
  id: z.number().int(), ad: z.string(), kod: z.string().nullable(), tur: FIRMA_TURU, fason: z.boolean(),
  adres: z.string().nullable(), ilce: z.string().nullable(), il: z.string().nullable(),
  // Firmanın aktif noktası varsa kimliği (ikinci nokta açılmaz).
  noktaId: z.number().int().nullable(),
});
export const firmaAramaCevabi = z.object({ firmalar: z.array(firmaSecenegi) });
// fabrikaAyardan: fabrika noktasının konumu Sistem Ayarları'ndan geliyor (noktada yazılı konum kullanılmaz).
export const noktalarCevabi = z.object({ noktalar: z.array(noktaSemasi), fabrikaAyardan: z.boolean() });
export const noktaCevabi = z.object({ nokta: noktaSemasi });

// ---------- araçlar ----------
export const maliyetOranlariSemasi = z.object({ kilometre: z.number(), saat: z.number(), gunluk: z.number() });
export const aracSemasi = z.object({
  id: z.number().int(), ad: z.string(), tur: ARAC_TURU, plaka: z.string().nullable(),
  kapasiteKilogram: ondalikMetinSemasi, kapasitePalet: z.number().int(),
  musaitBaslangic: saat, musaitBitis: saat,
  // Boşsa araç türünün örnek değeri (varsayilanMaliyet) kullanılır.
  kilometreMaliyeti: ondalikMetinSemasi.nullable(), saatMaliyeti: ondalikMetinSemasi.nullable(), gunlukMaliyet: ondalikMetinSemasi.nullable(),
  // finans.maliyet-oku yoksa maliyet alanları null (180, 200 a).
  varsayilanMaliyet: maliyetOranlariSemasi.nullable(), aktif: z.boolean(), surum: z.number().int(),
});
export const aracGovdesi = z.object({
  ad: metinAlani(80), tur: ARAC_TURU, plaka: bosOlabilir(20),
  kapasiteKilogram: z.number().positive().max(100000), kapasitePalet: z.number().int().min(0).max(100),
  musaitBaslangic: saat, musaitBitis: saat,
  kilometreMaliyeti: z.number().min(0).max(100000).nullable(), saatMaliyeti: z.number().min(0).max(100000).nullable(), gunlukMaliyet: z.number().min(0).max(1000000).nullable(),
});
export const aracGuncelleGovdesi = aracGovdesi.extend({ surum: surumAlani });
// ornekMaliyetler: araç kaydında oran girilmezse türe göre kullanılan örnek değerler.
export const araclarCevabi = z.object({
  araclar: z.array(aracSemasi),
  ornekMaliyetler: z.object({ binek: maliyetOranlariSemasi, kamyonet: maliyetOranlariSemasi, kamyon: maliyetOranlariSemasi }).nullable(),
});
export const aracCevabi = z.object({ arac: aracSemasi });

// ---------- işler ----------
export const isSemasi = z.object({
  id: z.number().int(), tarih, tur: IS_TURU,
  alisNoktasiId: z.number().int().nullable(), birakisNoktasiId: z.number().int().nullable(),
  agirlikKilogram: ondalikMetinSemasi, paletSayisi: z.number().int(),
  durakSuresiDakika: z.number().int().nullable(),
  alisEnErken: saat.nullable(), alisEnGec: saat.nullable(), birakisEnErken: saat.nullable(), birakisEnGec: saat.nullable(),
  belgeNo: z.string().nullable(), aciklama: z.string().nullable(), sabitAracId: z.number().int().nullable(),
  // tarih: işin bulunduğu gün (geciken iş plana alınınca o güne taşınır); istenenTarih: işin istendiği gün.
  istenenTarih: tarih, durum: IS_DURUMU,
  // Kaç kez yola çıkıp yapılamadığı ve son yapılamadı notu.
  yapilamadiSayisi: z.number().int(), sonNot: z.string().nullable(), surum: z.number().int(),
});
export const isGovdesi = z.object({
  tarih, tur: IS_TURU,
  alisNoktasiId: z.number().int().positive().nullable(), birakisNoktasiId: z.number().int().positive().nullable(),
  agirlikKilogram: z.number().min(0).max(100000), paletSayisi: z.number().int().min(0).max(100),
  durakSuresiDakika: z.number().int().min(0).max(240).nullable(),
  alisEnErken: saat.nullable(), alisEnGec: saat.nullable(), birakisEnErken: saat.nullable(), birakisEnGec: saat.nullable(),
  belgeNo: bosOlabilir(60), aciklama: bosOlabilir(400), sabitAracId: z.number().int().positive().nullable(),
});
export const isGuncelleGovdesi = isGovdesi.extend({ surum: surumAlani });
// Sevk komutunun stok uyarıları (147 b: kalite durumu red parça uyarıyla sevke çıkar); yalnız durum komutu doldurur.
const sevkUyarilari = z.array(z.string()).optional();
export const isCevabi = z.object({ is: isSemasi, uyarilar: sevkUyarilari });

// ---------- bekleme listesi (kart #1310) ----------
// Biten ürün (urun), noktası olmadığı için işe çevrilemeyen fason gönderimi (fason) ve "malzeme alınacak" talep (alim) işe çevrilene kadar
// burada durur; tarih, nokta ve yükü planlayıcı verir.
export const BEKLEYEN_KAYNAGI = z.enum(['urun', 'fason', 'alim']);
export const bekleyenSemasi = z.object({
  id: z.number().int(), kaynak: BEKLEYEN_KAYNAGI,
  uretimEmriId: z.number().int().nullable(), emirNo: z.string().nullable(), talepId: z.string().nullable(), talepNo: z.string().nullable(),
  malzemeNo: z.number().int().nullable(), malzemeAd: z.string().nullable(),
  firmaId: z.number().int().nullable(), firmaAd: z.string().nullable(),
  // Firmanın aktif sevkiyat noktası; yoksa null (işe çevirirken seçilir).
  noktaId: z.number().int().nullable(),
  adet: ondalikMetinSemasi.nullable(), istenenTarih: tarih.nullable(), hazirZamani: zamanSemasi,
});
export const bekleyenlerCevabi = z.object({ bekleyenler: z.array(bekleyenSemasi) });
export const bekleyenKaldirCevabi = z.object({ id: z.number().int() });
// Kısmi sevk (261 a): açık ürün kaydından verilen adet ayrı kayda bölünür; kalan adet eski kayıtta kalır.
export const bekleyenBolGovdesi = z.object({ adet: ondalikMetinSemasi });
export const bekleyenBolCevabi = z.object({ id: z.number().int(), yeniId: z.number().int() });
// Okutulan ürünün sevkleri (kart #96): Malzeme · Teslim panelindeki Sevk bölümü emrin ya da kartın kapanmamış ürün kayıtlarını
// görür; kayıt işe çevrilmemişse is null'dır (işe çevirmek Sevkiyat ekranındadır).
export const urunSevkleriSorgusu = z.object({ uretimEmriId: kimlik.optional(), malzemeNo: kimlik.optional() });
export const urunSevkiSemasi = z.object({
  bekleyenId: z.number().int(), uretimEmriId: z.number().int().nullable(), emirNo: z.string().nullable(), malzemeAd: z.string().nullable(),
  adet: ondalikMetinSemasi.nullable(), firmaAd: z.string().nullable(),
  is: z.object({ id: z.number().int(), tarih, durum: IS_DURUMU, belgeNo: z.string().nullable() }).nullable(),
});
export const urunSevkleriCevabi = z.object({ sevkler: z.array(urunSevkiSemasi) });
// Elle durum: tamamlandı (yoldaki iş teslim edildi ya da havuzdaki iş elle kapatıldı), yapılamadı (yoldaki iş havuza döner),
// havuzda (tamamlanan iş yeniden açılır), yolda (yanlış girilen teslim sonucu geri alınır). tarih: ekranın günü.
export const isDurumuGovdesi = z.object({ durum: z.enum(['tamamlandi', 'yapilamadi', 'havuzda', 'yolda']), tarih, not: bosOlabilir(400) });

// ---------- tüm işler (960) ----------
// Tablo kalemi yalnız serbest bırakır; sevkiyat "Sevk et" ya da "Al" ile tetikler; depo son çıkışı ya da kabulü yapar ve stok orada oynar.
// Kalem: serbest bırakılmış ya da bırakılmayı bekleyen kayıt. Aday: başka modülde duran, henüz kalemi olmayan şey (bitmemiş emir,
// sırası gelmemiş fason adımı, gelmemiş sipariş); yalnız okunur.
export const KALEM_KAYNAGI = z.enum(['urun', 'fason', 'fason-donus', 'alim', 'elle']);
export const KALEM_YONU = z.enum(['gidis', 'gelis']);
// biz: sevkiyat aracı götürür ya da alır (Sevk et / Al). firma: firma kendisi alır ya da getirir; iş açılmaz, depo hareketi yine yapılır.
export const TASIMA = z.enum(['biz', 'firma']);
// Taşımayı son yazanın yeri (959 b): Tüm işler, satın alma siparişinin teslim yöntemi, sevkiyat ekranı; göç öncesi kayıtlar otomatik.
export const SON_YAZAN_YERI = z.enum(['tum-isler', 'satin-alma', 'sevkiyat', 'otomatik']);
export const ELLE_TURU = z.enum(['numune', 'tamir', 'kalibrasyon', 'iade', 'diger']);
// hazir-degil: kaynağı bitmedi (erken serbest bırakılabilir); hazir: serbest bırakılabilir; bekliyor: önceden bırakıldı, kaynağı bitince düşer;
// havuzda, planlandi, yolda: sevkiyat işinin durumu; depoda: tetiklendi, depo çıkış ya da kabul bekliyor; tamamlandi: depo yaptı.
export const TUM_IS_ASAMASI = z.enum(['hazir-degil', 'hazir', 'bekliyor', 'havuzda', 'planlandi', 'yolda', 'depoda', 'tamamlandi']);
// Kalemin anahtarı "kalem:<id>"; adayınki kaynağın kaydıdır: "urun:<emir>", "fason:<fason iş emri>", "alim:<sipariş satırı>".
export const TUM_IS_ANAHTARI = /^(kalem|urun|fason|alim):[1-9]\d{0,9}$/;
const anahtar = z.string().regex(TUM_IS_ANAHTARI, 'Kalem anahtarı okunamadı.');

export const tumIslerSorgusu = z.object({ baslangic: tarih, bitis: tarih });
export const tumIsSatiri = z.object({
  anahtar: z.string(), kalemId: z.number().int().nullable(), kaynak: KALEM_KAYNAGI, yon: KALEM_YONU, asama: TUM_IS_ASAMASI,
  // Hazır değilse kaynağın tahmini hazır günü (emrin teslim günü, fason termini, sipariş termini); bilinmiyorsa null.
  hazirTarihi: tarih.nullable(), istenenTarih: tarih.nullable(),
  uretimEmriId: z.number().int().nullable(), emirNo: z.string().nullable(),
  // Fason gidiş ve dönüşte rotadaki adım; ilerleme kaynağın kısa durumudur ("OP 30 bitti", "3/5 adım").
  isEmriId: z.number().int().nullable(), opNo: z.number().int().nullable(), adim: z.string().nullable(), ilerleme: z.string().nullable(),
  siparisNo: z.string().nullable(), malzemeNo: z.number().int().nullable(), malzemeAd: z.string().nullable(), adet: ondalikMetinSemasi.nullable(),
  firmaId: z.number().int().nullable(), firmaAd: z.string().nullable(), noktaId: z.number().int().nullable(),
  tasima: TASIMA.nullable(), elleTuru: ELLE_TURU.nullable(), aciklama: z.string().nullable(),
  is: z.object({ id: z.number().int(), tarih, durum: IS_DURUMU, tetiklendi: zamanSemasi.nullable() }).nullable(),
  // Depo son çıkışı ya da kabulü; kısmi kabulde kabulAdet gelen toplamıdır, kalem açık kalır.
  depo: z.object({ zaman: zamanSemasi.nullable(), kisiAd: z.string().nullable(), kabulAdet: ondalikMetinSemasi.nullable() }).nullable(),
  erken: z.object({ zaman: zamanSemasi, kisiAd: z.string().nullable(), gerekce: z.string() }).nullable(),
  sonYazan: z.object({ zaman: zamanSemasi, kisiAd: z.string().nullable(), yer: SON_YAZAN_YERI }).nullable(),
  // Gidişin dönüşü ya da dönüşün gidişi (fason ve dönüşlü elle iş).
  bagliAnahtar: z.string().nullable(),
});
export const tumIslerCevabi = z.object({ satirlar: z.array(tumIsSatiri) });

// Serbest bırakma (941 c): kalemin sahibi modülün yazma işlemi ya da sevkiyat.is-yaz. Hazır olmayanı bırakmak erken çıkıştır (945 a, 963 a):
// sevkiyat.onayla ve gerekçe ister. firma taşımasında iş açılmaz, bırakma tetik sayılır.
export const serbestBirakGovdesi = z.object({
  anahtarlar: z.array(anahtar).min(1).max(200), tasima: TASIMA,
  erkenGerekce: z.string().trim().min(10, 'Erken çıkış gerekçesi en az 10 karakterdir.').max(400).nullable().default(null),
});
export const serbestBirakCevabi = z.object({ kalemIdleri: z.array(z.number().int()) });
// Elle iş (958 a): numune, tamir, kalibrasyon gibi gidişler dönüşlü açılabilir; dönüş bağlı geliş kalemidir. İade dönüşsüzdür.
export const elleKalemGovdesi = z.object({
  tur: ELLE_TURU, yon: KALEM_YONU, firmaId: kimlik, malzemeNo: kimlik.nullable(), adet: ondalikMetinSemasi.nullable(),
  istenenTarih: tarih, aciklama: metinAlani(400), tasima: TASIMA, donusTarihi: tarih.nullable(),
});
// Sevkiyatçının taşıma değişimi (Sevk / Al ile sevk yok arası); depo yaptıktan sonra değişmez.
export const tasimaGovdesi = z.object({ tasima: TASIMA });
export const kalemCevabi = z.object({ satir: tumIsSatiri });

// ---------- gün planı ----------
export const rotaOgesiSemasi = z.union([
  z.object({ isId: z.number().int().positive(), alis: z.boolean() }).strict(),
  z.object({ araDonus: z.literal(true) }).strict(),
]);
export const planRotasiGovdesi = z.object({ aracId: z.number().int().positive(), kilitli: z.boolean(), ogeler: z.array(rotaOgesiSemasi).max(200) });
// surum: ekranın gördüğü plan sürümü; plan henüz yoksa null. Başkası arada değiştirdiyse komut reddedilir.
export const dagitGovdesi = z.object({ amac: AMAC, kilitliAraclar: z.array(z.number().int().positive()).max(100), surum: z.number().int().positive().nullable() });
export const kaydetGovdesi = z.object({ amac: AMAC, rotalar: z.array(planRotasiGovdesi).max(100), surum: z.number().int().positive().nullable() });
export const onayGovdesi = z.object({ surum: z.number().int().positive() });

export const planDuragiSemasi = z.object({
  // null: fabrikaya ara dönüş
  isId: z.number().int().nullable(), alis: z.boolean(), noktaId: z.number().int(),
  varis: dakika, bekleme: z.number(), baslama: dakika, ayrilis: dakika,
  yukKilogram: z.number(), yukPalet: z.number(), uyarilar: z.array(z.string()),
});
// baslangic: fabrikada yüklemenin başı; cikis: fabrikadan ayrılış. Ardışık aynı nokta tek satırdır; durakSureleri onunla hizalı.
export const seferSemasi = z.object({
  baslangic: dakika, cikis: dakika, bitis: dakika, noktaIdleri: z.array(z.number().int()), durakSureleri: z.array(z.number()),
  yukKilogram: z.number(), yukPalet: z.number(), google: z.string(), yandex: z.string(),
});
export const rotaHesabiSemasi = z.object({
  cikis: dakika, donus: dakika, kilometre: z.number(), surusDakika: z.number(), beklemeDakika: z.number(), maliyet: z.number().nullable(),
  enCokKilogram: z.number(), enCokPalet: z.number(), kesin: z.boolean(), kurallaraUygun: z.boolean(), uyarilar: z.array(z.string()),
  duraklar: z.array(planDuragiSemasi), seferler: z.array(seferSemasi),
  // Ayak başına [boylam, enlem] çizgisi.
  cizgi: z.array(z.array(z.tuple([z.number(), z.number()]))),
});
export const planRotasiSemasi = z.object({
  aracId: z.number().int(), kilitli: z.boolean(), ogeler: z.array(rotaOgesiSemasi), hesap: rotaHesabiSemasi.nullable(),
  // Onaylı planda onay anında kaydedilen saatler (dakika, gün başından; gece yarısını aşabilir), ogeler ile hizalı; taslakta null.
  onaySaatleri: z.array(z.object({ varis: z.number(), ayrilis: z.number() }).nullable()).nullable(),
});
export const planToplamiSemasi = z.object({ toplamDakika: z.number(), surusDakika: z.number(), kilometre: z.number(), maliyet: z.number().nullable(), kullanilanArac: z.number().int() });
export const gunPlaniCevabi = z.object({
  // Plan onayı ve onay kaldırmanın stok uyarıları (147 b); okumada yoktur.
  uyarilar: sevkUyarilari,
  tarih, gunTipi: GUN_TIPI, amac: AMAC,
  // Plan kaydı yoksa surum null.
  surum: z.number().int().nullable(), onaylandi: z.string().nullable(),
  fabrika: noktaSemasi.nullable(), haritaVar: z.boolean(),
  isler: z.array(isSemasi), noktalar: z.array(noktaSemasi), araclar: z.array(aracSemasi),
  // Aktif araçların hepsi; rotası olmayanın ogeler'i boştur.
  rotalar: z.array(planRotasiSemasi),
  bekleyen: z.array(z.number().int()),
  // Planda olup noktası pasifleşen işler.
  atanamayan: z.array(z.object({ isId: z.number().int(), neden: z.string() })),
  // Yalnız dağıt ve yerleştir cevabında dolu: bekleyende kalan işler ve nedeni (kaydedilmez).
  yerlesemeyen: z.array(z.object({ isId: z.number().int(), neden: z.string() })),
  // Hesap yapılamadıysa (fabrika ya da yol ağı yok) null.
  toplam: planToplamiSemasi.nullable(),
  // Aynı araç ve sırayla öteki amaçların yol seçimi.
  karsilastirma: z.array(z.object({ amac: AMAC, kilometre: z.number(), surusDakika: z.number(), maliyet: z.number().nullable() })),
  onayEngelleri: z.array(z.string()),
  // Onaylı planda durakların sonucu (iş başına).
  sonuclar: z.array(z.object({ isId: z.number().int(), sonuc: z.enum(['tamamlandi', 'yapilamadi']), not: z.string().nullable() })),
});

// ---------- harita ve trafik ----------
// Dış veri paketinden: koordinatlar tam sayıdır, gerçek değer = deger / olcek + sinir başı (boylam, enlem).
const halka = z.array(z.number());
export const haritaSemasi = z.object({
  sinir: z.tuple([z.number(), z.number(), z.number(), z.number()]), olcek: z.number(),
  kentsel: z.array(z.array(halka)), sanayi: z.array(z.array(halka)), yesil: z.array(z.array(halka)), su: z.array(z.array(halka)), havalimani: z.array(z.array(halka)),
  demiryolu: z.array(halka), araSokaklar: z.array(halka),
  // [ad, boylam, enlem, tür, önem]
  yerler: z.array(z.tuple([z.string(), z.number(), z.number(), z.string(), z.number()])),
  // Trafik renklendirmesi için yol ağı: kenar başına sınıf ve geometri dilimi; koordinatları kendi sınır ve ölçeğiyle.
  yolSinir: z.tuple([z.number(), z.number(), z.number(), z.number()]), yolOlcek: z.number(),
  yolSiniflari: z.array(z.string()), kenarSinifi: z.array(z.number().int()),
  geometriBaslangici: z.array(z.number().int()), geometriUzunlugu: z.array(z.number().int()), geometri: z.array(z.number()),
});
export const haritaCevabi = z.object({ harita: haritaSemasi.nullable() });
// Ana sayfa kartı: bugüne kadar araca verilmemiş iş ve istenen günü geçmiş açık iş sayısı.
export const ozetCevabi = z.object({ bekleyen: z.number().int(), gecikmis: z.number().int() });
export const trafikSorgusu = z.object({ tarih, dakika: z.coerce.number().int().min(0).max(1440) });
// Kenar başına 0 akıcı, 1 yoğun, 2 yavaş, 3 tıkalı; yol ağı yoksa null.
export const trafikCevabi = z.object({ gunTipi: GUN_TIPI, dakika: z.number().int(), seviyeler: z.array(z.number().int().min(0).max(3)).nullable() });

// ---------- arama ----------
export const aramaSorgusu = z.object({ metin: z.string().trim().min(1).max(200) });
export const aramaSonucuSemasi = z.object({
  ad: z.string(), boylam: z.number(), enlem: z.number(), kategori: z.string(), baglam: z.string().nullable(),
  tur: z.enum(['yer', 'koordinat', 'nokta']), noktaId: z.number().int().nullable(),
});
// kisaBaglanti: kısa harita bağlantısı ağa çıkmadan çözülemez; açık adres ya da koordinat istenir.
export const aramaCevabi = z.object({ sonuclar: z.array(aramaSonucuSemasi), kisaBaglanti: z.boolean(), dizinVar: z.boolean() });

// ---------- tek rota ----------
// duraklar: virgülle ayrılmış "<noktaId>[s<durak dk>][a|b<çift no>]"; a alış, b bırakış (ör. "12s20a1,15,7b1").
const DURAK = /^(\d{1,9})(?:s(\d{1,3}))?(?:([ab])(\d{1,2}))?$/;
export const tekRotaSorgusu = z.object({
  tarih, cikis: saat, arac: ARAC_TURU, amac: AMAC,
  fabrikayaDon: z.enum(['0', '1']).transform((x) => x === '1'),
  siraKorunur: z.enum(['0', '1']).transform((x) => x === '1'),
  duraklar: z.string().max(400).transform((metin, baglam) => {
    const sonuc: { noktaId: number; durakSuresiDakika: number | null; rol: 'al' | 'birak' | null; cift: number | null }[] = [];
    for (const parca of metin.split(',').filter(Boolean)) {
      const eslesme = DURAK.exec(parca);
      if (!eslesme) { baglam.addIssue({ code: z.ZodIssueCode.custom, message: `Durak okunamadı: ${parca}` }); return z.NEVER; }
      sonuc.push({ noktaId: Number(eslesme[1]), durakSuresiDakika: eslesme[2] === undefined ? null : Number(eslesme[2]), rol: eslesme[3] === 'a' ? 'al' : eslesme[3] === 'b' ? 'birak' : null, cift: eslesme[4] === undefined ? null : Number(eslesme[4]) });
    }
    return sonuc;
  }),
});
// girisSirasi: durağın istekteki sırası (0'dan); sonuç sırası en iyi sıradır.
export const tekRotaDuragiSemasi = z.object({
  girisSirasi: z.number().int(), noktaId: z.number().int(), ad: z.string(), rol: z.enum(['al', 'birak']).nullable(), cift: z.number().int().nullable(),
  durakSuresiDakika: z.number().int(), varis: dakika, ayrilis: dakika,
});
export const tekRotaPlaniSemasi = z.object({
  duraklar: z.array(tekRotaDuragiSemasi), donus: dakika.nullable(),
  toplamDakika: z.number(), surusDakika: z.number(), kilometre: z.number(), maliyet: z.number().nullable(), oranlar: maliyetOranlariSemasi.nullable(),
  uyarilar: z.array(z.string()), cizgi: z.array(z.array(z.tuple([z.number(), z.number()]))),
  yolOzeti: z.array(z.object({ ad: z.string(), metre: z.number() })),
  cikisTaramasi: z.array(z.object({ cikis: z.number().int(), toplam: z.number() })),
  // Aynı duraklar, öteki amaçlarla.
  karsilastirma: z.array(z.object({ amac: AMAC, kilometre: z.number(), toplamDakika: z.number(), maliyet: z.number().nullable() })),
  google: z.string(), yandex: z.string(),
});
// plan null: durak yok, fabrika ya da yol ağı yok veya noktaya yol ağından ulaşılamadı (neden yazılır).
export const tekRotaCevabi = z.object({ plan: tekRotaPlaniSemasi.nullable(), neden: z.string().nullable() });

export type Nokta = z.output<typeof noktaSemasi>;
export type NoktaGovdesi = z.input<typeof noktaGovdesi>;
export type NoktaGuncelleGovdesi = z.input<typeof noktaGuncelleGovdesi>;
export type NoktalarCevabi = z.output<typeof noktalarCevabi>;
export type FirmaSecenegi = z.output<typeof firmaSecenegi>;
export type FirmaAramaCevabi = z.output<typeof firmaAramaCevabi>;
export type NoktaCevabi = z.output<typeof noktaCevabi>;
export type Arac = z.output<typeof aracSemasi>;
export type AracGovdesi = z.input<typeof aracGovdesi>;
export type AracGuncelleGovdesi = z.input<typeof aracGuncelleGovdesi>;
export type AraclarCevabi = z.output<typeof araclarCevabi>;
export type AracCevabi = z.output<typeof aracCevabi>;
export type Is = z.output<typeof isSemasi>;
export type IsGovdesi = z.input<typeof isGovdesi>;
export type IsGuncelleGovdesi = z.input<typeof isGuncelleGovdesi>;
export type IsCevabi = z.output<typeof isCevabi>;
export type Bekleyen = z.output<typeof bekleyenSemasi>;
export type BekleyenlerCevabi = z.output<typeof bekleyenlerCevabi>;
export type UrunSevki = z.output<typeof urunSevkiSemasi>;
export type UrunSevkleriCevabi = z.output<typeof urunSevkleriCevabi>;
export type BekleyenKaynagi = z.output<typeof BEKLEYEN_KAYNAGI>;
export type BekleyenBolGovdesi = z.output<typeof bekleyenBolGovdesi>;
export type BekleyenBolCevabi = z.output<typeof bekleyenBolCevabi>;
export type IsDurumuGovdesi = z.output<typeof isDurumuGovdesi>;
export type IsDurumu = z.output<typeof IS_DURUMU>;
export type KalemKaynagi = z.output<typeof KALEM_KAYNAGI>;
export type KalemYonu = z.output<typeof KALEM_YONU>;
export type Tasima = z.output<typeof TASIMA>;
export type SonYazanYeri = z.output<typeof SON_YAZAN_YERI>;
export type ElleTuru = z.output<typeof ELLE_TURU>;
export type TumIsAsamasi = z.output<typeof TUM_IS_ASAMASI>;
export type TumIslerSorgusu = z.input<typeof tumIslerSorgusu>;
export type TumIsSatiri = z.output<typeof tumIsSatiri>;
export type TumIslerCevabi = z.output<typeof tumIslerCevabi>;
export type SerbestBirakGovdesi = z.input<typeof serbestBirakGovdesi>;
export type SerbestBirakCevabi = z.output<typeof serbestBirakCevabi>;
export type ElleKalemGovdesi = z.input<typeof elleKalemGovdesi>;
export type TasimaGovdesi = z.input<typeof tasimaGovdesi>;
export type KalemCevabi = z.output<typeof kalemCevabi>;
export type RotaOgesi = z.output<typeof rotaOgesiSemasi>;
export type DagitGovdesi = z.input<typeof dagitGovdesi>;
export type KaydetGovdesi = z.input<typeof kaydetGovdesi>;
export type OnayGovdesi = z.input<typeof onayGovdesi>;
export type PlanRotasi = z.output<typeof planRotasiSemasi>;
export type RotaHesabi = z.output<typeof rotaHesabiSemasi>;
export type GunPlaniCevabi = z.output<typeof gunPlaniCevabi>;
export type OzetCevabi = z.output<typeof ozetCevabi>;
export type Harita = z.output<typeof haritaSemasi>;
export type HaritaCevabi = z.output<typeof haritaCevabi>;
export type TrafikCevabi = z.output<typeof trafikCevabi>;
export type AramaSonucu = z.output<typeof aramaSonucuSemasi>;
export type AramaCevabi = z.output<typeof aramaCevabi>;
export type TekRotaSorgusu = z.input<typeof tekRotaSorgusu>;
export type TekRotaPlani = z.output<typeof tekRotaPlaniSemasi>;
export type TekRotaCevabi = z.output<typeof tekRotaCevabi>;
export type Amac = z.output<typeof AMAC>;
export type AracTuru = z.output<typeof ARAC_TURU>;
export type IsTuru = z.output<typeof IS_TURU>;
export type NoktaTuru = z.output<typeof NOKTA_TURU>;
export type GunTipi = z.output<typeof GUN_TIPI>;
