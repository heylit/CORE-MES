import { z } from 'zod';
import type { PLAN_ISLEMLERI } from '../islemler/plan.ts';
import { IS_EMRI_TURLERI } from './uretim-emirleri.ts';

const KIMLIK = z.number().int().positive().max(2_147_483_647);
const zaman = z.string();
const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı.');
export const kaynakGirdisi = z.object({ tur: z.enum(['makine', 'kisi']), id: KIMLIK });

export const PLAN_KURALLARI = ['oncelik', 'edd', 'cr', 'spt', 'fifo'] as const;
export const KURAL_ADI: Record<(typeof PLAN_KURALLARI)[number], string> = {
  oncelik: 'Öncelik, sonra teslim', edd: 'En erken teslim (EDD)', cr: 'Kritik oran (CR)', spt: 'En kısa iş (SPT)', fifo: 'İlk gelen önce (FIFO)',
};
// PL-07 ve ikinci tarama: sıralama kuralı, yön, tampon, dondurulmuş bölge, personel kısıtı, taslak emirlerin plana girmesi.
export const planAyari = z.object({
  kural: z.enum(PLAN_KURALLARI),
  yon: z.enum(['ileri', 'geri']),
  tamponGun: z.number().min(0, 'Tampon 0-30 gün olmalı.').max(30, 'Tampon 0-30 gün olmalı.')
    .refine((v) => Math.round(v * 10) === v * 10, 'Tampon en çok bir ondalık olmalı.'),
  dondurmaGun: z.number().int('Dondurma tam gün olmalı.').min(0, 'Dondurma 0-30 gün olmalı.').max(30, 'Dondurma 0-30 gün olmalı.'),
  personelKisiti: z.boolean(),
  taslakEmirler: z.boolean(),
});

export const planKaynagi = z.object({
  tur: z.enum(['makine', 'kisi']), id: KIMLIK, kod: z.string().nullable(), ad: z.string(), aktif: z.boolean(),
  istasyon: z.object({ id: KIMLIK, kod: z.string(), ad: z.string() }).nullable(),
});
const isOzeti = {
  isEmriId: KIMLIK, uretimEmriId: KIMLIK, emirNo: z.string(), urunKodu: z.string(), urunAdi: z.string(), opNo: z.number().int(),
  ad: z.string(), adet: z.number().int(), teslim: z.string().nullable(), durum: z.enum(['planli', 'basladi', 'bitti', 'iptal']),
  // Bölünmüş alt partide üst emir (kart #262); ekran alt partiyi üstün altında dal gösterir.
  ustEmirId: KIMLIK.nullable(),
  // Rotadan gelen adım 'rota'dır; kola konan rework, tamir ya da ek adım kartta türüyle etiketlenir.
  tur: z.enum(IS_EMRI_TURLERI),
};
// Elle bölme (kart #1572): bölünmüş işin parçaları; her parça kendi makinesinde ya da kişisinde ayrı yerleşir. Yerleşimin kendi kaynağı ve
// saatleri zarftır (ilk parçanın kaynağı, ilk başlangıç, son bitiş). Bölünmemiş işte alan yoktur.
export const planParcasi = z.object({
  no: z.number().int().positive(), adet: z.number().int().positive(), kaynak: kaynakGirdisi, baslangic: zaman, bitis: zaman, elleKaynak: z.boolean(),
});
// Yerleşim iş emri kimliğiyle anılır (canlıda ve taslakta aynı); eşzamanlılık taslağın sürümüyle denetlenir.
export const planYerlesimi = z.object({
  ...isOzeti, kaynak: kaynakGirdisi, baslangic: zaman, bitis: zaman, kilitli: z.boolean(), dondurulmus: z.boolean(),
  elleSira: z.number().int().nullable(), uyarilar: z.array(z.string()),
  // Makineyi planlamacı elle seçti (toptan hesap taşımaz).
  elleKaynak: z.boolean().optional(),
  parcalar: z.array(planParcasi).optional(),
});
export const planGostergeleri = z.object({
  emirSayisi: z.number().int(), isEmriSayisi: z.number().int(), yerlesen: z.number().int(), geciken: z.number().int(),
  zamanindaYuzde: z.number().nullable(), ortAtolyeGun: z.number().nullable(),
  darbogaz: z.object({ istasyonId: KIMLIK, ad: z.string(), dolulukYuzde: z.number() }).nullable(),
  enDoluKaynak: z.object({ ad: z.string(), dolulukYuzde: z.number() }).nullable(),
  // Personelin sınırladığı gün: istasyon plan ayarı (operatör ihtiyacı) gelince; o zamana dek null.
  personelGun: z.number().int().nullable(),
  // 6c, planın TL toplamı (203 a): yerleşen emirlerin gecikme, ceza, finansman ve kâr riski. Yalnız siparisler.fiyat-oku (180) görür;
  // görmeyene null. Ekranlar okumaya başlayana dek isteğe bağlı.
  maliyetTl: z.number().nullable().optional(),
  // 507 1 a (eski motorun suH ve wT'si, salt okuma): yerleşen işlerin ayar saati toplamı; emir başına teslim günü sonunu aşan saat x öncelik
  // ağırlığı (1: 4, 2: 2, 3: 1, diğer 1) x sipariş satırındaki adet payı. Ekranlar okumaya başlayana dek isteğe bağlı.
  ayarSaat: z.number().optional(),
  agirlikliGecikmeSaat: z.number().optional(),
});
// Taslak (P6): planlamacının kendi senaryosu; bütün planlama işlemleri buna yazılır.
export const taslakOzeti = z.object({
  id: KIMLIK, ad: z.string(), surum: z.number().int(), tabanPlanSurumu: z.number().int(), canliDegisti: z.boolean(), degisiklikSayisi: z.number().int(),
  benim: z.boolean(),
});
export const planEmri = z.object({
  uretimEmriId: KIMLIK, emirNo: z.string(), urunKodu: z.string(), urunAdi: z.string(), adet: z.number().int(), teslim: z.string().nullable(),
  ustEmirId: KIMLIK.nullable(),
  // Emir önceliği (1 acil - 4 düşük); yalnız hızlı denemenin benzettiği emirde null olabilir.
  oncelik: z.number().int().nullable(), baslangic: zaman.nullable(), bitis: zaman.nullable(), tamponGun: z.number().nullable(), engelli: z.boolean(), isSayisi: z.number().int(),
  yerlesen: z.number().int(),
});
// 507 2 a: taslağın (canlıda canlının) ek vardiyaları ve haftalık bütçesi. Hafta pazartesi başlar; sınır plan ayarındadır, boşsa haftada
// 8 saat, 0 ise sınır yok (haftaSiniriSaat 0, hiçbir hafta aşmaz). saat, satır yazıldığı andaki vardiya süresidir (molalar düşülmez). 512 1 a:
// satırlar kabul edilmiş ek vardiyalardır, makinenin kapasitesine girer.
export const planEkMesai = z.object({
  satirlar: z.array(z.object({ makineId: KIMLIK, gun: tarih, vardiyaId: KIMLIK, saat: z.number() })),
  toplamSaat: z.number(),
  haftaSiniriSaat: z.number(),
  haftalar: z.array(z.object({ hafta: tarih, saat: z.number() })),
  asanHaftalar: z.array(z.object({ hafta: tarih, saat: z.number() })),
  asildi: z.boolean(),
});
export const planCevabi = z.object({
  surum: z.number().int(),
  simdi: zaman,
  ayar: planAyari,
  taslak: taslakOzeti.nullable(),
  // Canlıdayken yapılan değişiklik yeni taslağa alındıysa true (ekran "Değişikliğin bir taslağa alındı" der).
  taslakAcildi: z.boolean(),
  gunler: z.array(tarih),
  kaynaklar: z.array(planKaynagi),
  yerlesimler: z.array(planYerlesimi),
  yerlesmemis: z.array(z.object({
    ...isOzeti, kaynak: kaynakGirdisi.nullable(), neden: z.string(),
    // Bölünmüş ama motorun yerleştiremediği iş (kart #1572): bölme planlamacı kaldırana dek durur.
    bolme: z.array(z.object({ no: z.number().int().positive(), adet: z.number().int().positive() })).optional(),
  })),
  emirler: z.array(planEmri),
  // Matris: istasyon x gün dolu dakika ve kapasite (takvim gelene kadar kaynak sayısı x 24 saat).
  istasyonYuku: z.array(z.object({ istasyonId: KIMLIK, kod: z.string(), ad: z.string(), dolu: z.array(z.number()), kapasite: z.array(z.number()) })),
  // PL-09: iş merkezi x gün kişi-dakika ihtiyacı ve kapasitesi; kısıtla bağlı kişisi olan iş merkezleri.
  personelYuku: z.array(z.object({ isMerkeziId: KIMLIK, kod: z.string(), ad: z.string(), ihtiyac: z.array(z.number()), kapasite: z.array(z.number()) })),
  gostergeler: planGostergeleri,
  uyarilar: z.array(z.string()),
  // Düşen elle sıralar (kullanıcı kararı 16.10.2026): adımın rota istasyonu değişti, adım fasona alındı ya da rotadan kalktı. Aynı
  // istasyonda yalnız makine değişince elle sıra korunur. İstasyon adı kod ya da ad; fason ve kalkan adımda yeni istasyon null. Sunucu
  // her okumada doldurur; isteğe bağlılık yalnız eski ekran örnekleri içindir.
  elleSiraDusenler: z.array(z.object({
    // Rotadan kalkan adımın iş emri silindiği için emir no ve op no bilinmez (null).
    isEmriId: KIMLIK, emirNo: z.string().nullable(), opNo: z.number().int().nullable(), neden: z.enum(['istasyon', 'fason', 'rotadan-kalkti']),
    eskiIstasyon: z.string().nullable(), yeniIstasyon: z.string().nullable(),
  })).optional(),
  // Sunucu her okumada doldurur; ekranlar okumaya başlayana dek isteğe bağlı.
  ekMesai: planEkMesai.optional(),
});

const tarihZaman = z.string().datetime({ offset: true, message: 'Başlangıç ISO tarih-saat olmalı.' });
// Taslak verilmezse kullanıcıya yeni taslak açılır (P6); verilirse okunan sürüm denetlenir.
const taslakGirdisi = z.object({ id: KIMLIK, surum: KIMLIK }).nullable();
export const taslakGovdesi = z.object({ taslak: taslakGirdisi });
// Ekranın okuduğu canlı plan sürümü (GET /plan/surum): verilirse ve plan arada canlıya alındıysa yazma eski sürüm diye reddedilir. Eski
// ekranlar göndermediği için isteğe bağlıdır.
const okunanPlanSurumu = z.number().int().nonnegative().optional();
export const yerlestirGovdesi = taslakGovdesi.extend({
  planSurumu: okunanPlanSurumu, isEmriId: KIMLIK, kaynak: kaynakGirdisi, baslangic: tarihZaman, sureDk: z.number().positive().max(1_000_000).optional(),
});
export const tasiGovdesi = taslakGovdesi.extend({ kaynak: kaynakGirdisi, baslangic: tarihZaman, planSurumu: okunanPlanSurumu });
export const siralaGovdesi = taslakGovdesi.extend({ kaynak: kaynakGirdisi, isEmriIdleri: z.array(KIMLIK).min(1).max(500) });
export const ayarGovdesi = taslakGovdesi.extend({ ayar: planAyari });
export const kuyrukGovdesi = taslakGovdesi.extend({ kaynak: kaynakGirdisi });
export const isEmriParametresi = z.object({ id: z.coerce.number().int().positive() });
export const planSorgusu = z.object({ taslak: z.coerce.number().int().positive().optional() });
// Başka ekran (Üretim Emirleri) iş emirlerinin canlı plandaki yerini okur (kart #522); boş liste boş cevap, taslak görünmez.
export const canliYerlesimSorgusu = z.object({
  isEmirleri: z.string().regex(/^(\d{1,10}(,\d{1,10}){0,499})?$/, 'İş emri kimlikleri virgülle ayrılmış sayılar olmalı (en çok 500).')
    .transform((t) => [...new Set(t.split(',').filter(Boolean).map(Number))]).pipe(z.array(KIMLIK)),
});
export const canliYerlesimCevabi = z.object({
  planSurumu: z.number().int(),
  yerlesimler: z.array(z.object({
    isEmriId: KIMLIK, kaynak: kaynakGirdisi, baslangic: zaman, bitis: zaman, kilitli: z.boolean(), dondurulmus: z.boolean(), elleSira: z.number().int().nullable(),
    // Bölünmüş iş (kart #1572): Terminal her parçayı ayrı iş gösterir.
    parcalar: z.array(planParcasi).optional(),
  })),
});

// 220 a: motorun yerleşimi, yazılmadan (Reçete ve Rota > Plan ekranı bunu çizer). Sabit (kilitli, dondurulmuş, başlamış) işler yerinde,
// öteki işler motorun bugünkü ayarıyla; vardiya takvimi ve elle sıra dahil. Okuma kaynağıdır: plan sayfasını açan herkes aynı yerleşimi görür.
export const motorYerlesimiCevabi = z.object({
  hesaplanma: zaman,
  ayar: z.object({ kural: z.enum(PLAN_KURALLARI), yon: z.enum(['ileri', 'geri']), tamponGun: z.number() }),
  yerlesimler: z.array(z.object({
    isEmriId: KIMLIK, uretimEmriId: KIMLIK, emirNo: z.string(), opNo: z.number().int(), kaynak: kaynakGirdisi, kaynakAdi: z.string().nullable(),
    baslangic: zaman, bitis: zaman, sabit: z.boolean(),
    // 493 1 a: adet parçanın canlıya yazılacak tam sayı adedidir (kayıtlı bölmenin oranı adım adedine dağıtılmış); bölme yazılamıyorsa null.
    parcalar: z.array(z.object({ no: z.number().int().positive(), kaynak: kaynakGirdisi, baslangic: zaman, bitis: zaman, adet: z.number().int().positive().nullable() })).optional(),
  })),
  yerlesmeyen: z.array(z.object({ isEmriId: KIMLIK, emirNo: z.string(), opNo: z.number().int(), neden: z.string() })),
  // Ekranın planRun opts.yerlesim girişi (Reçete ve Rota, #1860): anahtar canlı kuyruktaki gibi `emirNo|opNo`, bölünmüş işte parça başına
  // `emirNo|opNo~parçaNo`; değer makine (kişi kaynağında null) ve ISO başlangıç.
  ekranYerlesimi: z.record(z.string(), z.array(z.object({ makineId: KIMLIK.nullable(), baslangic: zaman }))),
  // 481 a: emir başına teslime kalan bolluk, vardiya kapasitesi günüyle (eski Reçete ve Rota motorunun R.slack'i): teslim günü sonu eksi
  // adımların bitişinin o gün başlayan vardiyalardaki dolan payı. Ekranın tampon rozeti bunu gösterir. Teslimsiz ya da yerleşmemiş işi olan
  // emirde bitis ve bollukGun null. 493 2 a: rotaEski, emir açıldıktan sonra ürünün yürürlükteki rotası değişti (emir açıldığı rotada kaldı);
  // bolmeYazilamaz, bölmesi canlıya yazılamayan adımların OP numaraları (adım adedi tam sayı değil ya da parça bir tam adetten az kalıyor).
  emirler: z.array(z.object({
    uretimEmriId: KIMLIK, emirNo: z.string(), teslim: z.string().nullable(), bitis: zaman.nullable(), bollukGun: z.number().nullable(),
    rotaEski: z.boolean(), bolmeYazilamaz: z.array(z.number().int()),
  })),
  // 307 a: motorun kullanıcıya söylemesi gereken genel durumlar (ör. personel kısıtı açık ama personel tanımsız); yoksa boş dizi.
  uyarilar: z.array(z.string()),
});

// Planlama çerçevesi motorun yerleşimini çizmez, yalnız uyarısını gösterir: motor koşulmadan aynı uyarılar (motorYerlesimiCevabi.uyarilar ile eşit).
export const motorUyarilariCevabi = z.object({ uyarilar: z.array(z.string()) });

// Veri sağlığı raporu (782): plana giden verinin kaynağında boş olan, motorun ise bir varsayımla doldurduğu yerler. Yalnız okur.
// Sayı null: o dilim okunamadı (örn. maliyet ya da planlama çalışması yok); 0 değildir. Örnekler en çok VERI_SAGLIGI_ORNEK tanedir.
export const VERI_SAGLIGI_ORNEK = 20;
export const VERI_SAGLIGI_KATEGORILERI = [
  'stok-bos', 'sure-bos', 'istasyon-plan-ayari-yok', 'vardiyasiz-istasyon', 'istasyon-maliyet-yok', 'maliyet-doviz', 'terminsiz-emir',
  'arizali-makine', 'elle-tezgah-ucreti',
] as const;
export const veriSagligiCevabi = z.object({
  calismaVar: z.boolean(),
  malzemeKesildi: z.boolean(),
  kategoriler: z.array(z.object({
    anahtar: z.enum(VERI_SAGLIGI_KATEGORILERI),
    baslik: z.string(),
    etki: z.string(),
    sayi: z.number().int().nonnegative().nullable(),
    toplam: z.number().int().nonnegative().nullable(),
    ornekler: z.array(z.object({ kod: z.string(), ad: z.string() })).max(VERI_SAGLIGI_ORNEK),
  })),
});


// Emir önizlemesi (prototip previewNewOrder): yeni emir yazılmadan önce plana etkisi; hiçbir şey kaydedilmez.
// Okuma kaynağıdır (GET): girdiler sorgu dizgesinde; boş tarih verilmez.
export const onizleSorgusu = z.object({
  taslak: z.coerce.number().int().positive().optional(), revizyonId: z.coerce.number().int().positive(),
  adet: z.coerce.number().int().positive('Adet sıfırdan büyük olmalı.').max(1_000_000),
  oncelik: z.coerce.number().int().min(1, 'Öncelik 1-4 olmalı.').max(4, 'Öncelik 1-4 olmalı.'), baslangic: tarih.optional(), teslim: tarih.optional(),
});
const onizlemeOzeti = z.object({
  zamanindaYuzde: z.number().nullable(), geciken: z.number().int(), ortAtolyeGun: z.number().nullable(), sonBitis: zaman.nullable(),
  darbogaz: z.object({ ad: z.string(), dolulukYuzde: z.number() }).nullable(),
});
export const onizlemeCevabi = z.object({
  // Önerilen teslim: plan bitişi artı tampon (takvim gelene kadar takvim günü).
  odak: z.object({ baslangic: zaman.nullable(), bitis: zaman.nullable(), teslim: tarih.nullable(), onerilenTeslim: tarih.nullable(), isSayisi: z.number().int(), yerlesen: z.number().int() }),
  once: onizlemeOzeti,
  sonra: onizlemeOzeti,
  etkilenenEmirler: z.array(z.object({ emirNo: z.string(), once: zaman.nullable(), sonra: zaman.nullable(), teslim: tarih.nullable(), gecikiyor: z.boolean(), yeni: z.boolean() })),
  istasyonYuku: z.array(z.object({ ad: z.string(), onceYuzde: z.number().nullable(), sonraYuzde: z.number().nullable() })),
  yeniUyarilar: z.array(z.string()),
});

export const HIZLI_DENEMELER = ['acil', 'ariza', 'gun', 'oncelik'] as const;

// Plan onay akışı: canlı plana tek kapı. Planı etkileyen her yazma kişinin taslağına (senaryo) gider; taslak onaya gönderilir, onaylayan
// canlıya alır ya da gerekçeyle geri gönderir. onayda senaryo donmuştur: plan yazmaları ona yazılmaz (açık olmayan taslak reddedilir), sahibin
// yeni yazması yeni taslak açar; sahibi değiştirmek isterse önce onaydan çeker.
export const SENARYO_DURUMLARI = ['acik', 'onayda', 'canliya_alindi', 'vazgecildi'] as const;
export type SenaryoDurumu = (typeof SENARYO_DURUMLARI)[number];

// Onaylayan (146): gönderen de onaylayabilir; `plan.dort-goz` ayarı açıksa onaylayan gönderenden başkası olmalıdır (varsayılan kapalı).
export const PLAN_ONAY_SECIMLERI: Readonly<{ arkonSirasiOnayaGider: boolean; bedelTaslagaGirer: boolean }> = {
  // 147 a: Arkon kuyruk sırası taslağa düşer, onayla canlıya geçer.
  arkonSirasiOnayaGider: true,
  // 148 a: bedel ayarı ve sipariş elle çarpanı taslağa girer (bedelAyariTaslakGovdesi, siparisCarpaniTaslakGovdesi).
  bedelTaslagaGirer: true,
};

// Senaryo durum geçişleri: her biri ayrı uç ve ayrı işlem; gövdede okunan senaryo sürümü denetlenir. Kişi yetkisi (sahip mi, onaylayabilir mi)
// sunucuda denetlenir; ekran yalnız cevaptaki `yapabilir` bayraklarına bakar. Yeni işlem adı yoktur: gönderen stüdyo işlemini, onaylayan canlıya
// alma işlemini taşır.
export const PLAN_ONAY_KOMUTLARI = {
  'onaya-gonder': { yol: '/plan/senaryolar/:id/onaya-gonder', islem: 'plan.studyo', durumdan: 'acik', duruma: 'onayda', kim: 'sahip' },
  'onaydan-cek': { yol: '/plan/senaryolar/:id/onaydan-cek', islem: 'plan.studyo', durumdan: 'onayda', duruma: 'acik', kim: 'sahip' },
  'geri-gonder': { yol: '/plan/senaryolar/:id/geri-gonder', islem: 'plan.canliya-al', durumdan: 'onayda', duruma: 'acik', kim: 'onaylayan' },
  'canliya-al': { yol: '/plan/senaryolar/:id/canliya-al', islem: 'plan.canliya-al', durumdan: 'onayda', duruma: 'canliya_alindi', kim: 'onaylayan' },
} as const satisfies Record<string, { yol: string; islem: (typeof PLAN_ISLEMLERI)[number]; durumdan: SenaryoDurumu; duruma: SenaryoDurumu; kim: 'sahip' | 'onaylayan' }>;
export type PlanOnayKomutu = keyof typeof PLAN_ONAY_KOMUTLARI;

// Son gönderme ve son geri gönderme; hiç gönderilmemiş senaryoda null. Geri gönderilen senaryo açıktır, neden sahibine görünür.
export const senaryoOnayi = z.object({
  gonderen: z.string().nullable(), gonderme: zaman, not: z.string().nullable(),
  geriGonderen: z.string().nullable(), geriGonderme: zaman.nullable(), geriNeden: z.string().nullable(),
});
// Okuyan kişinin bu senaryoda yapabileceği geçişler (durum, sahiplik, işlem ve dört göz ayarı birlikte); ekran düğmeyi buna göre gösterir.
export const senaryoYapabilir = z.object({ onayaGonder: z.boolean(), onaydanCek: z.boolean(), geriGonder: z.boolean(), canliyaAl: z.boolean() });
export const senaryoDegisikligi = z.object({ id: KIMLIK, tur: z.string(), ozet: z.string(), yazma: zaman });
export const senaryolarCevabi = z.object({
  canli: planGostergeleri, canliSurum: z.number().int(),
  senaryolar: z.array(z.object({
    id: KIMLIK, ad: z.string(), aciklama: z.string().nullable(), durum: z.enum(SENARYO_DURUMLARI), acan: z.string().nullable(),
    benim: z.boolean(), acilma: zaman, surum: z.number().int(), tabanPlanSurumu: z.number().int(), canliDegisti: z.boolean(),
    gostergeler: planGostergeleri.nullable(), degisiklikler: z.array(senaryoDegisikligi),
    // Canlıya göre etkisi: tarihi değişen emirler, yükü değişen istasyonlar, senaryoda yeni uyarılar.
    etki: z.object({
      tarihiDegisenEmirler: z.array(z.object({ emirNo: z.string(), canli: zaman.nullable(), senaryo: zaman.nullable() })),
      yukuDegisenIstasyonlar: z.array(z.object({ ad: z.string(), canliYuzde: z.number().nullable(), senaryoYuzde: z.number().nullable() })),
      yeniUyarilar: z.array(z.string()),
    }).nullable(),
    // Canlıya alınamayan (sahibi modülün komutu bağlanınca yazılacak) değişiklikler.
    bekleyenler: z.array(z.string()),
    // Onay akışı alanları sunucu onay adımını kurana dek gelmez; gelmeyen `yapabilir` hiçbir geçişe izin vermez.
    onay: senaryoOnayi.nullable().optional(),
    yapabilir: senaryoYapabilir.optional(),
  })),
});
export const senaryoGovdesi = z.object({ ad: z.string().trim().min(1, 'Senaryoya ad ver.').max(80), aciklama: z.string().trim().max(500).nullish() });
export const senaryoBilgiGovdesi = senaryoGovdesi.extend({ surum: KIMLIK });
export const senaryoSurumGovdesi = z.object({ surum: KIMLIK });
export const hizliGovdesi = senaryoSurumGovdesi.extend({ tur: z.enum(HIZLI_DENEMELER) });
export const onayaGonderGovdesi = senaryoSurumGovdesi.extend({ not: z.string().trim().max(500).nullish() });
export const geriGonderGovdesi = senaryoSurumGovdesi.extend({ neden: z.string().trim().min(1, 'Geri gönderme nedenini yaz.').max(500) });
export const onaydanCekGovdesi = senaryoSurumGovdesi;
// 507 2 a: taslağın ek vardiyaları baştan yazılır (liste eskisinin yerine geçer). Aynı makine, gün ve vardiya bir kez. 512 1 a: yazılan
// ek vardiya kabul edilmiştir, kapasiteye girer.
const ekMesaiSatirlari = z.array(z.object({ makineId: KIMLIK, gun: tarih, vardiyaId: KIMLIK })).max(500, 'En çok 500 ek vardiya yazılır.')
  .refine((l) => new Set(l.map((x) => `${x.makineId}|${x.gun}|${x.vardiyaId}`)).size === l.length, 'Aynı makine, gün ve vardiya bir kez yazılır.');
export const ekMesaiGovdesi = senaryoSurumGovdesi.extend({ satirlar: ekMesaiSatirlari });
// Taslakta acil sipariş denemesi varsa her biri için müşteri seçilir; canlıya alınca taslak sipariş açılır (286 b, 287 b).
export const canliyaAlGovdesi = z.object({
  surum: KIMLIK, cakismalariKabul: z.boolean().default(false),
  acilMusteriler: z.array(z.object({ degisiklikId: KIMLIK, firmaId: KIMLIK })).max(50).default([]),
});
export const musteriSecenekleriSorgusu = z.object({ ara: z.string().max(100).default('') });
export const musteriSecenekleriCevabi = z.object({ firmalar: z.array(z.object({ id: z.number().int(), ad: z.string(), kod: z.string().nullable() })) });
export type MusteriSecenekleriCevabi = z.output<typeof musteriSecenekleriCevabi>;
// Reçete ve Rota'nın tarayıcıdaki motorunun hesapladığı kuyruk sırası, atama ve dondurma plana yazılır (kart #1186). İş emri (emirNo, opNo) ile
// anılır; süreleri ve saatleri plan modülü kaynağın verimi ve takvimiyle kendisi kurar (kuyruk `baslangic`ten arka arkaya dizilir).
// Yalnız kişinin taslağına yazılır; ayar `/plan/ayar` ile, yayın taslağın "canlıya al"ı ile olur (plan değiştiren yollar teke iner, Y1-Y3).
// `elle`: planlamacı bu işi kuyrukta elle yerine koydu; yalnız o iş elle sıra alır, ötekiler toptan hesapta kurala göre yeniden dizilir.
// Göndermeyen eski ekranın bütün işleri eskisi gibi elle sayılır.
// `elleKaynak`: planlamacı bu işin makinesini elle seçti; toptan hesap işi başka makineye taşımaz, yalnız saatini ayarlar.
// `parca`: elle bölünen işin parçası (kart #1572); bütün parçaları aynı yazımda, adetleri toplamı adım adedi. Parçasız yazılan iş birleşir.
export const kuyrukYazIsi = z.object({
  emirNo: z.string().trim().min(1).max(60), opNo: z.number().int().positive().max(100_000), dondurulmus: z.boolean(), elle: z.boolean().default(true),
  elleKaynak: z.boolean().default(false),
  parca: z.object({ no: z.number().int().positive().max(100), adet: z.number().int().positive().max(1_000_000) }).optional(),
  // ADR 0018: tarayıcının önizlediği saat; sunucu motoru kayıtlıyken cevabın motorFarki'si bununla karşılaştırır.
  onizleme: z.object({ baslangic: tarihZaman, bitis: tarihZaman }).optional(),
});
export const kuyrukYazKuyrugu = z.object({ kaynak: kaynakGirdisi, baslangic: tarihZaman, isler: z.array(kuyrukYazIsi).min(1).max(500) });
export const kuyrukYazGovdesi = z.object({
  kuyruklar: z.array(kuyrukYazKuyrugu).min(1, 'Yazılacak kuyruk yok.').max(200),
  planSurumu: okunanPlanSurumu,
  // Verilirse kişinin açık taslağına (okunan sürümde) yazılır; verilmezse yeni taslak açılır (stüdyo aynı taslakta kalır).
  taslak: taslakGirdisi.optional(),
  // 512 1 a: kabul edilen ek vardiyalar ("Uygula", "Plana işle") kuyruklarla aynı işlemde taslağa yazılır ve kapasiteye girer; liste
  // taslağınkinin yerine geçer. Verilmezse taslağın ek vardiyası değişmez. Önerilen ek vardiya burada yoktur (motorun önizlemesidir).
  ekMesai: ekMesaiSatirlari.optional(),
});
// ADR 0018 (son söz sunucuda): sunucu motoru önizlemeden 1 dakikadan çok ayrılan işler; anahtar `emirNo|opNo`. Önizleme yoksa null.
export const motorFarki = z.array(z.object({
  anahtar: z.string(), onizleme: z.object({ baslangic: zaman, bitis: zaman }).nullable(), sunucu: z.object({ baslangic: zaman, bitis: zaman }),
}));
export const kuyrukYazCevabi = z.object({
  taslak: KIMLIK, canli: z.boolean(),
  // Yazılan iş sayısı; atlanan: başlamış ya da bitmiş, kilitli ya da dondurulmuş iş (plan modülünün durumu geçerlidir).
  yazilan: z.number().int(), atlanan: z.number().int(),
  // Yalnız sunucu motoru kayıtlıyken (ADR 0018).
  motorFarki: motorFarki.optional(),
});
export const canliyaAlCevabi = senaryolarCevabi.extend({ motorFarki: motorFarki.optional() });
// Canlı planın özeti: son canlıya alma ve makine kuyrukları. Reçete ve Rota bunu kendi hesapladığı kuyrukla karşılaştırıp canlıya
// alınmamış değişikliği gösterir. Kuyruk yalnız planlanacak iş emirlerinindir, başlangıç sırasıyla; anahtar `emirNo|opNo`. sabit: kilitli ya da
// dondurulmuş (Reçete ve Rota'nın yazması onu taşımaz).
export const planCanliOzeti = z.object({
  planSurumu: z.number().int(),
  sonCanliyaAlma: z.object({ zaman, kisi: z.string().nullable() }).nullable(),
  // elle: iş canlıda elle sıralı ve elle sıra düşmemiş (rota istasyonu aynı); ekran qorder'ını açılışta buradan kurar (plan ekranı verisi kararı, 16.10.2026).
  // baslangic, bitis: işin canlı plandaki saati (K1, kullanıcı kararı 16.10.2026: canlı planın saatini sunucu kurar; ekran "PLAN CANLI"
  // durumunda çubukları bu saatlerle çizer). Sunucu her zaman doldurur; isteğe bağlılık yalnız eski ekran örnekleri içindir.
  kuyruklar: z.array(z.object({
    makineId: KIMLIK, isler: z.array(z.object({
      anahtar: z.string(), dondurulmus: z.boolean(), sabit: z.boolean(), elle: z.boolean().optional(), elleKaynak: z.boolean().optional(), baslangic: zaman.optional(), bitis: zaman.optional(),
      // Bölünmüş işin parçası (kart #1572): aynı anahtar her parçası için kendi makinesinin kuyruğunda ayrı görünür.
      parca: z.object({ no: z.number().int().positive(), adet: z.number().int().positive() }).optional(),
    })),
  })),
  // Planlanacak bütün iş emirlerinin anahtarı: ekran, sunucuda karşılığı olmayan adımı (emir açıldıktan sonra rotaya eklenen) yazmaz.
  planlanacak: z.array(z.string()),
  // Planlanacak işlerin adım adedi (anahtar -> adet): elle bölmede parça adetlerinin toplamı buna eşit olmalı (kart #1572).
  adetler: z.record(z.string(), z.number().int().nonnegative()).optional(),
  // Canlıda bölmesi duran ama motorun yerleştiremediği işler (kart #1572): ekran bölmeyi ve "yerleştirilemedi" uyarısını gösterir.
  yersizBolmeler: z.array(z.object({
    anahtar: z.string(), parcalar: z.array(z.object({ no: z.number().int().positive(), adet: z.number().int().positive() })),
  })).optional(),
});
// Açık plan ekranlarının kısa aralıkla sorduğu hafif okuma: canlı plan sürümü değiştiyse ekran "plan değişti" der.
export const planSurumCevabi = planCanliOzeti.pick({ planSurumu: true, sonCanliyaAlma: true });
// 510 a: eski "Plan değişikliği" kutusu. Taban planın ilk yazılışından (ilk canlıya alma) sonraki canlıya almalar: toplam, kişi başına sayı
// (kutunun alt satırı) ve en son 20'si (yeniden eskiye). Taban yoksa tabanZamani null, sayılar boş. Kişi adı okunamazsa null.
export const canliyaAlmaGecmisiCevabi = z.object({
  tabanZamani: zaman.nullable(),
  toplam: z.number().int(),
  kisiler: z.array(z.object({ kisi: z.string().nullable(), sayi: z.number().int() })),
  son: z.array(z.object({ senaryoId: KIMLIK, ad: z.string(), kisi: z.string().nullable(), zaman })),
});
export const senaryoParametresi = z.object({ id: z.coerce.number().int().positive() });
export const degisiklikParametresi = z.object({ id: z.coerce.number().int().positive(), degisiklikId: z.coerce.number().int().positive() });

// Bedel ayarı (209 a): gecikme bedelinin tabanı (TL/saat), finansman ve kâr riski oranları (%/gün, finansman boşsa bedele girmez) ve öncelik
// sınıfı eşikleri (ortanca bedelin katı).
// Öncelik çarpanları (195 a: Yüksek, Normal, Düşük) ve müşteri sınıfı çarpanları (265 a: A, B, C) da buradadır (denetim #21). Yazarken
// verilmeyen çarpan değişmez: çarpanları göstermeyen ekran eski gövdeyle yazabilsin.
const carpan = z.number().gt(0).max(5);
export const bedelAyari = z.object({
  tabanBedelSaat: z.number().positive(), finansmanOraniGun: z.number().min(0).max(5).nullable(), karRiskiOraniGun: z.number().min(0).max(5),
  yuksekEsigi: z.number().gt(1), dusukEsigi: z.number().gt(0).lt(1),
  yuksekCarpani: carpan, normalCarpani: carpan, dusukCarpani: carpan, sinifACarpani: carpan, sinifBCarpani: carpan, sinifCCarpani: carpan,
});
export const bedelAyariGovdesi = bedelAyari.partial({
  yuksekCarpani: true, normalCarpani: true, dusukCarpani: true, sinifACarpani: true, sinifBCarpani: true, sinifCCarpani: true,
});

// Plan motoru ayarları (kart 811; 771 a, 772 a, 776 b): amaç (sıralı ya da TL), stoku bilinmeyen malzemede davranış (dur ya da varsay) ve
// sıralama kuralı (motorun kuralları; varsayılan ATCS). Her değişiklik yeni sürümdür; taslak kendi sürümünde kalır (774 a). Değiştirmek
// plan.motor-ayari (775 b).
export const MOTOR_AMACLARI = ['sirali', 'tl'] as const;
export const EKSIK_STOK_DAVRANISLARI = ['dur', 'varsay'] as const;
export const MOTOR_KURALLARI = ['atcs', 'edd', 'cr', 'kar'] as const;
export const motorAyarlari = z.object({
  amac: z.enum(MOTOR_AMACLARI), eksikStok: z.enum(EKSIK_STOK_DAVRANISLARI), kural: z.enum(MOTOR_KURALLARI),
});
export const MOTOR_AYARI_VARSAYILAN: MotorAyarlari = { amac: 'sirali', eksikStok: 'dur', kural: 'atcs' };
// Yazarken verilmeyen alan güncel sürümdekinden kalır.
export const motorAyariGovdesi = motorAyarlari.partial();
// Sürüm kimliği boşsa koddaki varsayılandır (henüz sürüm yazılmamış).
const motorAyarSurumu = z.object({ surumId: KIMLIK.nullable(), degerler: motorAyarlari, yazan: z.string().nullable(), zaman: zaman.nullable() });
// Taslak verilirse taslağın sürümü ve güncelden farklı mı; verilmezse taslak boş.
export const motorAyarlariCevabi = z.object({
  guncel: motorAyarSurumu,
  taslak: z.object({ id: KIMLIK, surum: motorAyarSurumu, farkli: z.boolean() }).nullable(),
});

// Elle çarpan (195 a): siparişin gecikme bedelini gerekçeyle çarpar; 0,5-2 plan.yaz, 3'e kadar siparisler.onayla (sunucu denetler).
export const ELLE_CARPAN = { enAz: 0.5, planlama: 2, enCok: 3 } as const;
export const siparisParametresi = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) });
export const siparisCarpaniGovdesi = z.object({
  carpan: z.number().min(ELLE_CARPAN.enAz, 'Çarpan 0,5-3 olmalı.').max(ELLE_CARPAN.enCok, 'Çarpan 0,5-3 olmalı.')
    .refine((v) => Math.round(v * 100) === v * 100, 'Çarpan en çok iki ondalık olmalı.'),
  gerekce: z.string().trim().min(1, 'Gerekçe yaz.').max(500),
});
// 148 a: bedel ayarı ve elle çarpan da taslağa yazılır; taslak null ise kişiye yeni taslak açılır (taslakGovdesi gibi). Alanı göndermeyen
// eski ekran 400 almasın diye isteğe bağlıdır; gönderilmeyen alanın nereye yazılacağını sunucu belirler.
export const bedelAyariTaslakGovdesi = bedelAyariGovdesi.extend({ taslak: taslakGirdisi.optional() });
export const siparisCarpaniTaslakGovdesi = siparisCarpaniGovdesi.extend({ taslak: taslakGirdisi.optional() });
const siparisCarpani = z.object({ carpan: z.number(), gerekce: z.string(), kisiId: KIMLIK, kisiAdi: z.string().nullable(), zaman });
// Geçmiş yeniden eskiye; geçerli çarpan ilk satırdır, kayıt yoksa null.
export const siparisCarpaniCevabi = z.object({ siparisId: KIMLIK, gecerli: siparisCarpani.nullable(), gecmis: z.array(siparisCarpani) });
// 306 a: siparişin plandaki emirlerinin gecikme bedeli (TL/saat) ve öncelik bandı; sınırlar bütün plan emirlerinin ortancasından: bedel
// yuksekSiniri ve üstü Yüksek, dusukSiniri ve altı Düşük. Planda emri olmayan siparişte bant null.
export const siparisBandiCevabi = z.object({
  siparisId: KIMLIK,
  bant: z.object({
    yuksekSiniri: z.number(), dusukSiniri: z.number(),
    emirler: z.array(z.object({ uretimEmriId: KIMLIK, emirNo: z.string(), bedel: z.number(), sinif: z.enum(['yuksek', 'normal', 'dusuk']) })),
  }).nullable(),
});

export type SiparisBandiCevabi = z.output<typeof siparisBandiCevabi>;
export type PlanCanliOzeti = z.output<typeof planCanliOzeti>;
export type PlanSurumCevabi = z.output<typeof planSurumCevabi>;
export type KuyrukYazGovdesi = z.output<typeof kuyrukYazGovdesi>;
export type KuyrukYazCevabi = z.output<typeof kuyrukYazCevabi>;
export type MotorFarki = z.output<typeof motorFarki>;
export type CanliyaAlCevabi = z.output<typeof canliyaAlCevabi>;
export type PlanAyari = z.output<typeof planAyari>;
export type PlanCevabi = z.output<typeof planCevabi>;
export type PlanEkMesai = z.output<typeof planEkMesai>;
export type CanliyaAlmaGecmisiCevabi = z.output<typeof canliyaAlmaGecmisiCevabi>;
export type EkMesaiGovdesi = z.output<typeof ekMesaiGovdesi>;
export type PlanYerlesimi = z.output<typeof planYerlesimi>;
export type PlanParcasi = z.output<typeof planParcasi>;
export type PlanKaynagi = z.output<typeof planKaynagi>;
export type PlanEmri = z.output<typeof planEmri>;
export type PlanGostergeleri = z.output<typeof planGostergeleri>;
export type SenaryolarCevabi = z.output<typeof senaryolarCevabi>;
export type MotorYerlesimiCevabi = z.output<typeof motorYerlesimiCevabi>;
export type MotorUyarilariCevabi = z.output<typeof motorUyarilariCevabi>;
export type VeriSagligiCevabi = z.output<typeof veriSagligiCevabi>;
export type KaynakGirdisi = z.input<typeof kaynakGirdisi>;
export type TaslakGirdisi = z.input<typeof taslakGirdisi>;
export type OnizlemeCevabi = z.output<typeof onizlemeCevabi>;
export type OnizleSorgusu = z.input<typeof onizleSorgusu>;
export type CanliYerlesimCevabi = z.output<typeof canliYerlesimCevabi>;
export type BedelAyari = z.output<typeof bedelAyari>;
export type BedelAyariGovdesi = z.output<typeof bedelAyariGovdesi>;
export type MotorAyarlari = z.output<typeof motorAyarlari>;
export type MotorAyariGovdesi = z.output<typeof motorAyariGovdesi>;
export type MotorAyarlariCevabi = z.output<typeof motorAyarlariCevabi>;
export type SiparisCarpaniCevabi = z.output<typeof siparisCarpaniCevabi>;
export type HizliDeneme = (typeof HIZLI_DENEMELER)[number];
export type SenaryoOnayi = z.output<typeof senaryoOnayi>;
export type SenaryoYapabilir = z.output<typeof senaryoYapabilir>;
export type OnayaGonderGovdesi = z.output<typeof onayaGonderGovdesi>;
export type GeriGonderGovdesi = z.output<typeof geriGonderGovdesi>;
