import { z } from 'zod';
import { ORTAMLAR } from '../ortam.ts';
import { zamanSemasi } from '../zaman.ts';

export const saglikCevabi = z.object({
  durum: z.enum(['ok', 'hata']),
});

export const IS_SONUCLARI = ['tamam', 'hata', 'atlandi', 'bekliyor'] as const;

// Zamanlanmış işin son turu; sunucu yeniden açılınca açılıştan önceki son tur tablodan okunur. Hiç koşmamış işte alanlar null.
export const isDurumuSemasi = z.object({
  ad: z.string(),
  sonBaslama: zamanSemasi.nullable(),
  sonBitis: zamanSemasi.nullable(),
  sonSonuc: z.enum(IS_SONUCLARI).nullable(),
  sonHata: z.string().nullable(),
  // İş koşamayacağını bildirdiyse (ayar kapalı, bağlantı bilgisi yok) nedeni; yalnız son sonuç "bekliyor"ken dolu.
  sonNeden: z.string().nullable(),
});

// Disk boş yeri bayt olarak; `az` eşiği sunucu kuralıdır (5 GB ya da yüzde 10 altı).
export const diskDurumuSemasi = z.object({
  bosBayt: z.number().int().nonnegative(),
  toplamBayt: z.number().int().nonnegative(),
  az: z.boolean(),
});

export const UYARI_TURLERI = ['yedek', 'is', 'disk', 'esik'] as const;

// Sunucunun hesapladığı uyarı: yedek alınmadı, iş asıldı ya da hata verdi, disk az, ölçü eşiği aşıldı (1663). Eşikler sunucu kuralıdır.
export const uyariSemasi = z.object({
  tur: z.enum(UYARI_TURLERI),
  ileti: z.string(),
});

export const OTOMATIK_ACILIS_DURUMLARI = ['kurulu', 'kapali', 'kurulu-degil', 'bilinmiyor'] as const;

// Görev Zamanlayıcı'daki bekçi görevi. "kurulu-degil": görev yok ya da sunucu hesabı göremiyor (Windows ikisini aynı çıkış koduyla verir);
// "kapali": görev var ama kapalı ya da "Başlangıçta" tetikleyicisi yok; "bilinmiyor": sorgu süre aştı ya da çalışmadı.
export const otomatikAcilisSemasi = z.object({
  durum: z.enum(OTOMATIK_ACILIS_DURUMLARI),
  gorevAdi: z.string(),
});

// Yedeğin ayrı veritabanına yüklenerek denenmesi (1670, 1743 a): `npm run geri-yukle-deneme` yedek klasörüne yazar, sunucu son kaydı okur.
export const GERI_YUKLEME_SONUCLARI = ['basarili', 'basarisiz'] as const;
export const geriYuklemeDenemesiSemasi = z.object({
  zaman: zamanSemasi,
  // Denenen yedek dosyasının adı (klasörsüz).
  yedek: z.string(),
  sonuc: z.enum(GERI_YUKLEME_SONUCLARI),
  sureSn: z.number().nonnegative(),
  // Yüklenen veritabanındaki kişi ve göç kaydı sayısı; başarısız denemede null.
  kisiSayisi: z.number().int().nonnegative().nullable(),
  gocSayisi: z.number().int().nonnegative().nullable(),
  hata: z.string().nullable(),
});

// Şifreli dış kopya (2283-2 a, kart 2290): `npm run yedek -- dis-kopya` her çalıştırmada yedek klasöründeki kayda bir satır ekler;
// disk çıkarılınca sunucu son kopyayı yalnız bu kayıttan bilir. Başarısız satırda taban ve sayılar null, hata dolu.
export const DIS_KOPYA_SONUCLARI = ['basarili', 'basarisiz'] as const;
export const disKopyaKaydiSemasi = z.object({
  zaman: zamanSemasi,
  sonuc: z.enum(DIS_KOPYA_SONUCLARI),
  // Hedef diskin yolu (örnek `F:\`).
  hedef: z.string(),
  // Kopyalanan taban yedeğin klasör adı (taban yedek işi: taban-<UTC zaman>; elle alınmışsa onun adı).
  taban: z.string().nullable(),
  tabanBayt: z.number().int().nonnegative().nullable(),
  walAdet: z.number().int().nonnegative().nullable(),
  walBayt: z.number().int().nonnegative().nullable(),
  hata: z.string().nullable(),
});

// PostgreSQL WAL arşivi (2276-1 a): pg_stat_archiver ve archive_mode. Hiç arşivlenmemiş ya da hiç hata olmamışsa ilgili alanlar null.
export const walArsiviSemasi = z.object({
  acik: z.boolean(),
  sonArsivZamani: zamanSemasi.nullable(),
  sonArsivWal: z.string().nullable(),
  hataSayisi: z.number().int().nonnegative(),
  sonHataZamani: zamanSemasi.nullable(),
  sonHataWal: z.string().nullable(),
});

// Yedekler sekmesindeki "Gün içi koruma" (2282b). Uyarılar sunucu kuralıdır; aynı metinler genel uyarı listesinde de vardır.
export const gunIciKorumaSemasi = z.object({
  // Veritabanı okunamadıysa null.
  walArsivi: walArsiviSemasi.nullable(),
  // Kayıt dosyası okunamadıysa ya da hiç satır yoksa null. Son kayıt başarısız olabilir; son başarılı ayrıca verilir.
  sonDisKopya: disKopyaKaydiSemasi.nullable(),
  sonBasariliDisKopya: disKopyaKaydiSemasi.nullable(),
  // Arşiv takıldı ya da dış kopya eski, başarısız, hiç yok; yoksa null.
  walUyarisi: z.string().nullable(),
  disKopyaUyarisi: z.string().nullable(),
});

// Veritabanı büyümesi (1761): saklama kararı (1764 a) üç ay bu ölçüyle verilecek. Satır sayıları PostgreSQL istatistik
// tahminidir; ölü satır oranı canlı ve ölü toplamı sıfırsa null. Hiç autovacuum ya da autoanalyze koşmamışsa zaman null.
export const tabloBuyukluguSemasi = z.object({
  ad: z.string(),
  toplamBayt: z.number().int().nonnegative(),
  dizinBayt: z.number().int().nonnegative(),
  canliSatir: z.number().int().nonnegative(),
  oluSatir: z.number().int().nonnegative(),
  oluOraniYuzde: z.number().nonnegative().nullable(),
  sonAutovacuum: zamanSemasi.nullable(),
  sonAutoanalyze: zamanSemasi.nullable(),
});

export const veritabaniBuyumesiSemasi = z.object({
  boyutBayt: z.number().int().nonnegative(),
  // Wraparound'a uzaklık (2 milyara yaklaşınca PostgreSQL yazmayı durdurur); okunamazsa null.
  xidYasi: z.number().int().nonnegative().nullable(),
  // Görünen en uzun açık transaction (sn): uzun açık transaction autovacuum'un ölü satırı temizlemesini engeller; yoksa null.
  enUzunTxSn: z.number().nonnegative().nullable(),
  // En büyükten küçüğe, en çok 10 tablo (dizin ve TOAST dahil boyut).
  tablolar: z.array(tabloBuyukluguSemasi),
});

export const ayrintiCevabi = z.object({
  // Veritabanının durumu yalnız `/saglik` cevabındadır; yoklama başarısızsa gecikme null.
  veritabaniGecikmeMs: z.number().int().nonnegative().nullable(),
  sonGoc: z.string().nullable(),
  commit: z.string().nullable(),
  // Güncelleyicinin kurduğu yayının adı (`2026.11.01-1`); elle kurulumda ya da güncelleme kanalı kapalıyken null. Ekran
  // okumadığı için isteğe bağlı.
  yayin: z.string().nullable().optional(),
  calismaSuresiSn: z.number().int().nonnegative(),
  ortam: z.enum(ORTAMLAR),
  isler: z.array(isDurumuSemasi),
  // Klasör bilinmiyor ya da okunamadıysa null. Ekran okumadığı için isteğe bağlı: sözleşmeyi kullanan eski istemci kırılmaz.
  yedekDiski: diskDurumuSemasi.nullable().optional(),
  veritabaniDiski: diskDurumuSemasi.nullable().optional(),
  uyarilar: z.array(uyariSemasi),
  // Süreç belleği (bayt), olay döngüsünün son ölçümden beri 99. yüzdelik gecikmesi ve veritabanındaki açık bağlantı sayısı.
  // Ölçülemeyen null; ekran okumadığı için isteğe bağlı.
  bellek: z.object({ rssBayt: z.number().int().nonnegative(), yiginBayt: z.number().int().nonnegative() }).optional(),
  olayDongusuGecikmeMs: z.number().nonnegative().nullable().optional(),
  vtBaglantiSayisi: z.number().int().nonnegative().nullable().optional(),
  // Windows dışında null.
  otomatikAcilis: otomatikAcilisSemasi.nullable().optional(),
  // Son geri yükleme denemesi; hiç yapılmamışsa ya da yedek klasörü okunamazsa null. Eski istemci kırılmasın diye isteğe bağlı.
  geriYuklemeDenemesi: geriYuklemeDenemesiSemasi.nullable().optional(),
  // Veritabanı okunamadıysa null. Eski istemci kırılmasın diye isteğe bağlı.
  veritabaniBuyumesi: veritabaniBuyumesiSemasi.nullable().optional(),
  // Gün içi koruma (2282b): WAL arşivi ve şifreli dış kopya. Eski istemci kırılmasın diye isteğe bağlı.
  gunIciKoruma: gunIciKorumaSemasi.optional(),
});

const sayi = z.number().int().nonnegative();
// Ölçülemeyen ya da o dakikada örneği olmayan değer null'dır; sıfır uydurulmaz.
const sure = z.number().nonnegative().nullable();

// Bir dakikanın istek toplamı. Yüzdelikler süre kovasının üst sınırıdır (gerçek süre ondan kısa ya da eşit); en üst kovada null.
export const istekOzetiSemasi = z.object({
  sayi,
  saniyede: z.number().nonnegative(),
  p50Ms: sure,
  p95Ms: sure,
  p99Ms: sure,
  istemciHatasi: sayi,
  sunucuHatasi: sayi,
  // 503: havuz dolu ya da veritabanına ulaşılamıyor.
  mesgul: sayi,
});

export const ucOzetiSemasi = istekOzetiSemasi.extend({
  yontem: z.string(),
  // Eşleşen uç yoksa (404) null.
  yol: z.string().nullable(),
});

export const metrikDakikasiSemasi = z.object({
  // Ölçüm aralığının sonu.
  an: zamanSemasi,
  aralikSn: z.number().positive(),
  istek: istekOzetiSemasi,
  // En çok istek alan uçlar, en çoktan aza; liste kısaltılmıştır.
  uclar: z.array(ucOzetiSemasi),
  // Süreçte uygulama havuzu yoksa null. mesgul: bu aralıkta doluluk yüzünden reddedilen istek.
  havuz: z.object({ boyut: sayi, kullanimda: sayi, bekleyen: sayi, mesgul: sayi }).nullable(),
  // Sürecin ve makinenin işlemci kullanımı (yüzde, bütün çekirdekler 100).
  surecIslemciYuzde: sure,
  makineIslemciYuzde: sure,
  bellek: z.object({ rssBayt: sayi, yiginBayt: sayi, makineBosBayt: sayi, makineToplamBayt: sayi }),
  olayDongusuP99Ms: sure,
  // Ana iş parçacığının dolu geçen payı (olay döngüsü kullanımı, yüzde, tek çekirdek 100). Node istekleri tek iş parçacığında
  // işler; süreç işlemcisi bütün çekirdeklere bölündüğünden bu doluluğu göstermez. Alan eklenmeden önce yazılmış dakikada yoktur.
  anaIsParcacigiYuzde: sure.optional(),
  // Okunamadıysa null. Sayaç alanları bu aralıktaki farktır; boyut ve xid yaşı o anki değerdir.
  veritabani: z.object({
    boyutBayt: sayi,
    // Wraparound'a uzaklık: PostgreSQL 2 milyara yaklaşınca yazmayı durdurur; okunamazsa null.
    xidYasi: z.number().int().nonnegative().nullable(),
    saniyedeIslem: z.number().nonnegative(),
    geriAlma: sayi,
    deadlock: sayi,
    // Okumaların bellekten karşılanan payı; okuma yoksa null.
    onbellekIsabetiYuzde: sure,
    geciciBayt: sayi,
    // Bu veritabanının istemci bağlantıları. Başka rolün bağlantısının durumu yetkisiz görünmez: "gorunmeyen".
    baglanti: z.object({ toplam: sayi, aktif: sayi, bosta: sayi, bosTx: sayi, kilitBekleyen: sayi, gorunmeyen: sayi }),
    // Görünen en uzun açık transaction (sn); yoksa null.
    enUzunTxSn: sure,
  }).nullable(),
});

export const metriklerCevabi = z.object({ dakikalar: z.array(metrikDakikasiSemasi) });

// Saatlik özet (1662): dakikalardan çıkar; yüzdelikler birleştirilemediği için saatin en kötü dakikası yazılır.
const ortVeEnCok = z.object({ ort: z.number().nonnegative(), enCok: z.number().nonnegative() }).nullable();
export const saatOzetiSemasi = z.object({
  saat: zamanSemasi,
  // Saatte ölçülen dakika; sunucu kapalıyken eksilir.
  dakikaSayisi: sayi,
  istek: z.object({
    sayi, saniyede: sure, p95MsEnCok: sure, p99MsEnCok: sure, istemciHatasi: sayi, sunucuHatasi: sayi, mesgul: sayi,
  }),
  havuz: z.object({ kullanimdaEnCok: sayi, bekleyenEnCok: sayi, mesgul: sayi }).nullable(),
  surecIslemciYuzde: ortVeEnCok,
  makineIslemciYuzde: ortVeEnCok,
  bellek: z.object({ rssBaytEnCok: sayi, makineBosBaytEnAz: sayi }),
  olayDongusuP99MsEnCok: sure,
  anaIsParcacigiYuzde: ortVeEnCok.optional(),
  veritabani: z.object({
    boyutBayt: sayi, xidYasi: z.number().int().nonnegative().nullable(), saniyedeIslem: z.number().nonnegative(), geriAlma: sayi, deadlock: sayi,
    onbellekIsabetiYuzdeEnAz: sure, geciciBayt: sayi, baglantiEnCok: sayi, kilitBekleyenEnCok: sayi, enUzunTxSnEnCok: sure,
  }).nullable(),
});

// Sistem durumu grafiklerinin aralıkları: 24 saat, 7 gün, 13 ay (saatlik özetin saklama süresi, 1619 a).
export const SAATLIK_ARALIKLAR = ['gun', 'hafta', 'yil'] as const;
export const saatlikSorgusu = z.object({ aralik: z.enum(SAATLIK_ARALIKLAR) });
export const saatlikCevabi = z.object({ saatler: z.array(saatOzetiSemasi) });

// Kapanmalar ve günlük (kart 3668, dilim A).
export const KAPANMA_NEDENLERI = ['bellek-tasmasi', 'yakalanmamis-hata', 'donma', 'ekrandan-yeniden-baslatma', 'guncelleme', 'bilinmiyor'] as const;
export const kapanmaNedeniSemasi = z.enum(KAPANMA_NEDENLERI);

export const GUNLUK_DUZEYLERI = ['bilgi', 'uyari', 'hata', 'olumcul'] as const;
export const gunlukDuzeyiSemasi = z.enum(GUNLUK_DUZEYLERI);
export const GUNLUK_EN_COK_SATIR = 500;

export const kapanmaSatiriSemasi = z.object({
  id: z.number().int().positive(),
  kapandiAn: zamanSemasi,
  acildiAn: zamanSemasi,
  kapaliSn: sayi,
  // Bekçi sinyalle kapanışı çıkış kodu yerine bildirir; ikisi de bilinmiyorsa null (sıfır uydurulmaz).
  cikisKodu: z.number().int().nullable(),
  sinyal: z.string().nullable(),
  neden: kapanmaNedeniSemasi,
});

export const kapanmaHataSatiriSemasi = z.object({
  zaman: zamanSemasi,
  duzey: gunlukDuzeyiSemasi,
  ileti: z.string(),
  // Ekranda görünen "Hata kodu"; günlükte reqId.
  hataKodu: z.string().nullable(),
  hata: z.string().nullable(),
});

export const kapanmaSurenIstegiSemasi = z.object({
  yontem: z.string(),
  adres: z.string(),
  kisiId: z.number().int().nullable(),
  sureSn: z.number().nonnegative(),
});

export const kapanmaAyrintisiSemasi = kapanmaSatiriSemasi.extend({
  // Nedenin dayandığı kanıt; neden bilinmiyorsa null.
  kanit: z.string().nullable(),
  yigin: z.string().nullable(),
  hataSatirlari: z.array(kapanmaHataSatiriSemasi),
  surenIstekler: z.array(kapanmaSurenIstegiSemasi),
  bellek: z.object({ rssBayt: sayi, yiginBayt: sayi }).nullable(),
  dakikalar: z.array(metrikDakikasiSemasi),
});

export const kapanmalarCevabi = z.object({ kapanmalar: z.array(kapanmaSatiriSemasi) });
export const kapanmaParametresi = z.object({ id: z.coerce.number<number>().int().positive() });

export const gunlukSatiriSemasi = z.object({
  zaman: zamanSemasi,
  duzey: gunlukDuzeyiSemasi,
  ileti: z.string(),
  yontem: z.string().nullable(),
  uc: z.string().nullable(),
  kisiId: z.number().int().nullable(),
  durum: z.number().int().nullable(),
  sureMs: z.number().nullable(),
  hataKodu: z.string().nullable(),
  hata: z.string().nullable(),
});

export const gunlukSorgusu = z.object({
  // Seçilen düzey ve üstü.
  duzey: gunlukDuzeyiSemasi.default('hata'),
  // Uç kalıbında geçen metin (büyük/küçük harf ayrımsız).
  uc: z.string().trim().min(1).max(200).optional(),
  kisi: z.coerce.number<number>().int().positive().optional(),
  baslangic: zamanSemasi.optional(),
  bitis: zamanSemasi.optional(),
  hataKodu: z.string().trim().regex(/^[0-9a-f]{8}$/i, 'Hata kodu 8 haneli olmalı').optional(),
  // Verilirse yalnız o günün dosyası okunur (YYYY-AA-GG, günlük dosyası adındaki yerel tarih); verilmezse bugünkü ve önceki dosya.
  gun: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gün YYYY-AA-GG biçiminde olmalı').optional(),
  // Önceki cevabın `sonraki` değeri: o noktadan geriye doğru okunur.
  imlec: z.string().max(100).optional(),
  adet: z.coerce.number<number>().int().min(1).max(GUNLUK_EN_COK_SATIR).default(200),
});

export const gunlukCevabi = z.object({
  satirlar: z.array(gunlukSatiriSemasi),
  // Daha eski satır varsa sonraki sayfanın imleci; yoksa null.
  sonraki: z.string().nullable(),
  // Okunan dosyalar (en yeniden eskiye); günlük kapalıysa ya da dosya yoksa boş.
  dosyalar: z.array(z.string()),
  // Klasörde bulunan bütün günlük günleri (YYYY-AA-GG, en yeniden eskiye); ekran gün seçimi bunu kullanır.
  gunler: z.array(z.string()),
});

// ---- Şu an, Yük ve davranış, Dış bağlantılar (3668 B) ----
export const planHesapTuruSemasi = z.object({
  tur: z.enum(['motor', 'degerlendirme', 'teklif', 'yillik']),
  calisan: sayi,
  biten: sayi,
  zamanAsimi: sayi,
  // Bellek sınırını aşıp düşen hesap sayısı.
  bellekAsimi: sayi,
  hata: sayi,
  sonSureMs: z.number().nonnegative().nullable(),
  enUzunSureMs: z.number().nonnegative().nullable(),
});

export const suAnKilidiSemasi = z.object({
  // Parametresiz, değerleri maskelenmiş, kısaltılmış sorgu metni.
  sorgu: z.string(),
  // Bekleten veritabanı işleminin numarası; kişi bilinmez.
  bekletenIslem: z.number().int(),
  beklemeSn: z.number().nonnegative(),
});

export const suAnCevabi = z.object({
  an: zamanSemasi,
  surenIstekler: z.array(kapanmaSurenIstegiSemasi),
  planHesaplari: z.array(planHesapTuruSemasi),
  // Geçerli (kapanmamış, süresi dolmamış) oturum sayısı; okunamadıysa null.
  acikOturum: sayi.nullable(),
  // Okunamadıysa null: sıfır uydurulmaz.
  veritabani: z.object({ baglanti: sayi, azami: sayi, kilitBekleyen: sayi }).nullable(),
  kilitler: z.array(suAnKilidiSemasi),
  bellek: z.object({ yiginBayt: sayi, yiginSiniriBayt: sayi, rssBayt: sayi }),
  sunucuAcilis: zamanSemasi,
});

export const YUK_DONEMLERI = ['1s', '24s'] as const;
export const yukSorgusu = z.object({ donem: z.enum(YUK_DONEMLERI).default('24s') });

export const tekrarSerisiSemasi = z.object({
  kisiId: z.number().int(),
  yontem: z.string(),
  adres: z.string(),
  kez: sayi,
  hatali: sayi,
  sonDurum: z.number().int(),
  sonHata: z.string().nullable(),
  sonAn: zamanSemasi,
});

export const mesguUcSemasi = z.object({
  yontem: z.string(),
  yol: z.string().nullable(),
  istek: sayi,
  toplamMs: z.number().nonnegative(),
  ortMs: z.number().nonnegative(),
  // Bu uçtaki istek başına ortalama sorgu; hiç istek ölçülmediyse null.
  sorguIstekBasina: z.number().nonnegative().nullable(),
  // Content-Length başlığı olan cevapların ortalaması; hiçbirinde başlık yoksa null (akışla giden cevap sayılmaz).
  ortCevapBayt: z.number().nonnegative().nullable(),
  cakisma409: sayi,
});

export const takilmaKaydiSemasi = z.object({
  an: zamanSemasi,
  takilmaMs: z.number().nonnegative(),
  suren: z.array(kapanmaSurenIstegiSemasi),
  sonBiten: z.object({ yontem: z.string(), adres: z.string(), kisiId: z.number().int().nullable(), sureMs: z.number().nonnegative() }).nullable(),
});

export const ekranYukuSemasi = z.object({ ekran: z.string(), istekDk: sayi, kisiSayisi: sayi });

export const yukCevabi = z.object({
  donem: z.enum(YUK_DONEMLERI),
  // Ölçümün başladığı an: dönem sunucunun açılışından kısaysa açılış, yoksa dönemin başı.
  baslangic: zamanSemasi,
  tekrarEsik: z.object({ kez: sayi, saniye: sayi }),
  tekrarlar: z.array(tekrarSerisiSemasi),
  mesguUclar: z.array(mesguUcSemasi),
  takilmalar: z.array(takilmaKaydiSemasi),
  takilmaEsikMs: sayi,
  ekranlar: z.array(ekranYukuSemasi),
});

export const BAGLANTI_DURUMLARI = ['calisiyor', 'kapali', 'bilinmiyor'] as const;
export const disBaglantiSemasi = z.object({
  anahtar: z.enum(['smartes', 'logo', 'tezgah', 'eposta', 'etiket-yazicisi']),
  durum: z.enum(BAGLANTI_DURUMLARI),
  // Modül bildirmiyorsa null (ekranda "—"): son başarı, son hata ve kayıt sayıları ilgili modülün disari.ts isteğidir.
  sonBasari: zamanSemasi.nullable(),
  sonHata: z.object({ an: zamanSemasi, mesaj: z.string() }).nullable(),
  bekleyen: sayi.nullable(),
  yenidenDenenen: sayi.nullable(),
});
export const disBaglantilarCevabi = z.object({ baglantilar: z.array(disBaglantiSemasi) });

export type SuAnCevabi = z.output<typeof suAnCevabi>;
export type PlanHesapTuruDurumu = z.output<typeof planHesapTuruSemasi>;
export type YukCevabi = z.output<typeof yukCevabi>;
export type YukDonemi = (typeof YUK_DONEMLERI)[number];
export type TekrarSerisiKaydi = z.output<typeof tekrarSerisiSemasi>;
export type MesguUc = z.output<typeof mesguUcSemasi>;
export type TakilmaKaydi = z.output<typeof takilmaKaydiSemasi>;
export type EkranYuku = z.output<typeof ekranYukuSemasi>;
export type DisBaglanti = z.output<typeof disBaglantiSemasi>;
export type DisBaglantilarCevabi = z.output<typeof disBaglantilarCevabi>;

// ---- Ekran hataları ve Veritabanı (3668 C) ----
export const EKRAN_HATASI_DONEMLERI = ['24s', '7g', '90g'] as const;
export const ekranHatalariSorgusu = z.object({ donem: z.enum(EKRAN_HATASI_DONEMLERI).default('7g') });

// Kişi istemciden gelmez: sunucu oturumdan alır. Sınırlar istemcininkiyle aynıdır (ekran-hatasi.ts).
export const ekranHatasiGovdesi = z.object({
  sayfa: z.string().max(200),
  hata: z.string().trim().min(1).max(300),
  yigin: z.string().max(2000).nullable(),
  surum: z.string().max(64).nullable(),
});
export const ekranHatasiYazildiCevabi = z.object({ kaydedildi: z.literal(true) });

export const ekranHatasiSatiriSemasi = z.object({
  id: z.number().int().positive(),
  hata: z.string(),
  sayfa: z.string(),
  yigin: z.string().nullable(),
  surum: z.string().nullable(),
  kez: sayi,
  kisiSayisi: sayi,
  sonKisiId: z.number().int().nullable(),
  ilkAn: zamanSemasi,
  sonAn: zamanSemasi,
});
export const ekranHatalariCevabi = z.object({
  donem: z.enum(EKRAN_HATASI_DONEMLERI),
  // Seçili dönemden bağımsız: son 24 saatte görülen ayrı hata sayısı (sekme rozeti).
  son24Saat: sayi,
  // Seçili dönemdeki ayrı hata sayısı: liste en çok `enCok` satır taşır, kesilmişse ekran bunu söyler.
  toplam: sayi,
  enCok: sayi,
  // En son hata bildiriminin anı (90 gün içinde); hiç gelmediyse null. Boş listenin "hata yok" mu "bildirim yok" mu olduğunu ayırır.
  sonBildirim: zamanSemasi.nullable(),
  satirlar: z.array(ekranHatasiSatiriSemasi),
});

export const vtSorguSatiriSemasi = z.object({
  sorgu: z.string(), cagri: sayi, toplamMs: z.number().nonnegative(), ortMs: z.number().nonnegative(), satir: sayi,
});
export const vtTabloSatiriSemasi = z.object({
  ad: z.string(), okunanSatir: sayi, tamTarama: sayi,
  // Tablonun hiç dizini yoksa PostgreSQL null verir.
  dizinTaramasi: sayi.nullable(), yazma: sayi, dizinEksikOlabilir: z.boolean(),
});
// eklenti: 'yok' = pg_stat_statements kurulu değil; 'yetkisiz' = kurulu ama sorgu metnini okuyacak yetki yok (sayı uydurulmaz).
export const VT_EKLENTI_DURUMLARI = ['var', 'yok', 'yetkisiz'] as const;
export const veritabaniCevabi = z.object({
  eklenti: z.enum(VT_EKLENTI_DURUMLARI),
  sorgular: z.array(vtSorguSatiriSemasi),
  tablolar: z.array(vtTabloSatiriSemasi),
  // Her listenin en çok kaç satır taşıdığı (sessiz kesme olmasın).
  enCok: sayi,
});

export type EkranHatasiGovdesi = z.output<typeof ekranHatasiGovdesi>;
export type EkranHatasiSatiri = z.output<typeof ekranHatasiSatiriSemasi>;
export type EkranHatalariCevabi = z.output<typeof ekranHatalariCevabi>;
export type EkranHatasiDonemi = (typeof EKRAN_HATASI_DONEMLERI)[number];
export type VtSorguSatiri = z.output<typeof vtSorguSatiriSemasi>;
export type VtTabloSatiri = z.output<typeof vtTabloSatiriSemasi>;
export type VeritabaniCevabi = z.output<typeof veritabaniCevabi>;

export type SaglikCevabi = z.output<typeof saglikCevabi>;
export type Ayrinti = z.output<typeof ayrintiCevabi>;
export type DiskDurumu = z.output<typeof diskDurumuSemasi>;
export type IsDurumuOzeti = z.output<typeof isDurumuSemasi>;
export type Uyari = z.output<typeof uyariSemasi>;
export type OtomatikAcilis = z.output<typeof otomatikAcilisSemasi>;
export type IstekOzeti = z.output<typeof istekOzetiSemasi>;
export type UcOzeti = z.output<typeof ucOzetiSemasi>;
export type SaatOzeti = z.output<typeof saatOzetiSemasi>;
export type TabloBuyuklugu = z.output<typeof tabloBuyukluguSemasi>;
export type VeritabaniBuyumesi = z.output<typeof veritabaniBuyumesiSemasi>;
export type GeriYuklemeDenemesi = z.output<typeof geriYuklemeDenemesiSemasi>;
export type DisKopyaKaydi = z.output<typeof disKopyaKaydiSemasi>;
export type WalArsivi = z.output<typeof walArsiviSemasi>;
export type GunIciKoruma = z.output<typeof gunIciKorumaSemasi>;
export type SaatlikAralik = (typeof SAATLIK_ARALIKLAR)[number];
export type SaatlikCevabi = z.output<typeof saatlikCevabi>;
export type MetrikDakikasi = z.output<typeof metrikDakikasiSemasi>;
export type MetriklerCevabi = z.output<typeof metriklerCevabi>;
export type KapanmaNedeni = z.output<typeof kapanmaNedeniSemasi>;
export type KapanmaSatiri = z.output<typeof kapanmaSatiriSemasi>;
export type KapanmaAyrintisi = z.output<typeof kapanmaAyrintisiSemasi>;
export type KapanmaHataSatiri = z.output<typeof kapanmaHataSatiriSemasi>;
export type KapanmaSurenIstegi = z.output<typeof kapanmaSurenIstegiSemasi>;
export type KapanmalarCevabi = z.output<typeof kapanmalarCevabi>;
export type GunlukDuzeyi = z.output<typeof gunlukDuzeyiSemasi>;
export type GunlukSatiri = z.output<typeof gunlukSatiriSemasi>;
export type GunlukSorgusu = z.output<typeof gunlukSorgusu>;
export type GunlukCevabi = z.output<typeof gunlukCevabi>;
