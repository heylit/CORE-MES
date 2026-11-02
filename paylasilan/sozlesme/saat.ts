import { z } from 'zod';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { durdurGovdesi } from './uretim-emirleri.ts';
import { KATEGORILER } from './durus-nedenleri.ts';
import { ONIZLEME_SINIRLARI } from './belge-merkezi.ts';

// Akıllı saat (kart #1631): saat yalnız okur. Cevaplar küçük tutulur; saatin pili her sorguda ağdan geçen bayta bağlıdır.
// Süreler saniyedir; ölçülemeyen değer null döner (sıfır uydurulmaz).

const TAM_SAYI_UST = 2147483647;
const KIMLIK = z.number().int().positive().max(TAM_SAYI_UST);
const adet = z.number().int().nonnegative();
const saniye = z.number().int().nonnegative();

export const emirParametresi = z.object({ id: z.coerce.number().pipe(KIMLIK) });

// Makine arızası ve bakımı emrin çalışma durumundan önce gelir: arızalı tezgâhta emir "çalışıyor" görünse de iş durmuştur.
export const ISTASYON_DURUMLARI = ['ariza', 'bakim', 'durdu', 'durakli', 'calisiyor', 'bekliyor', 'bos'] as const;
export type IstasyonDurumu = (typeof ISTASYON_DURUMLARI)[number];

// Sayaç emir başlayınca açılır: başlamamış emirde sağlam ve hurda null'dır (sıfır "sayıldı, yok" demektir).
export const emirOzetiSemasi = z.object({
  id: KIMLIK,
  emirNo: z.string(),
  saglam: adet.nullable(),
  hedef: z.number().int().positive(),
});

// İstasyonun makinesi; birden çok aktif makine varsa koda göre ilki. Makinesi olmayan istasyonda null.
export const tezgahSemasi = z.object({ ad: z.string(), tur: z.string().nullable() });

export const saatIstasyonuSemasi = z.object({
  id: KIMLIK,
  // İstasyon kodu (istasyonlar modülünün Istasyon.kod); saat NFC etiketinden okuduğu kodla istasyonu bulur.
  kod: z.string(),
  ad: z.string(),
  durum: z.enum(ISTASYON_DURUMLARI),
  // Arıza ya da bakımda makine durumunun değiştiği an (birden çok makinede en eskisi); durdu ve durakli'de duruşun başladığı an;
  // calisiyor'da emrin çalışmaya son geçiş anı (başlatma ya da duruştan devam). Öbür durumlarda null.
  durumBaslangic: zamanSemasi.nullable(),
  tezgah: tezgahSemasi.nullable(),
  // İstasyonda birden çok açık emir varsa önce başlamış olan; açık emri yoksa null.
  emir: emirOzetiSemasi.nullable(),
  // Penceredeki (pencere.baslangic ile şimdi arası) duruş süresi, saniye; yalnız "durdur" sayılır, duraklatma sayılmaz.
  // Pencerede duruş kaydı olmayan istasyonda null (sıfır uydurulmaz).
  durusSaniye: saniye.nullable(),
  // Penceredeki net sayım (düzeltme dahil); yönetici özeti bunları toplar. Pencerede sayımı olmayan istasyonda null.
  bugun: z.object({ saglam: z.number().int(), hurda: adet }).nullable(),
});

export const saatIstasyonlariCevabi = z.object({
  zaman: zamanSemasi,
  // Duruş saniyesinin sayıldığı pencere: tesis gününün başından şimdiye (vardiya başlangıcını veren işlev yoktur).
  pencere: z.object({ baslangic: zamanSemasi }),
  istasyonlar: z.array(saatIstasyonuSemasi),
});

export const saatEmriCevabi = z.object({
  zaman: zamanSemasi,
  id: KIMLIK,
  emirNo: z.string(),
  parcaAd: z.string(),
  istasyon: z.object({ id: KIMLIK, ad: z.string() }),
  // null: emir henüz başlamadı.
  calisma: z.enum(['calisiyor', 'durakli', 'durdu']).nullable(),
  saglam: adet.nullable(),
  hurda: adet.nullable(),
  hedef: z.number().int().positive(),
  // Çalışan iş emrinin birim süresi; iş emirsiz emirde ya da süresi girilmemiş adımda null.
  birimSaniye: saniye.nullable(),
  // Kalan sağlam adet x birim süre; birim süre yoksa null. Başlamamış emirde kalan bütün adettir.
  kalanSaniye: saniye.nullable(),
  durusNedeni: z.string().nullable(),
  durusBaslangic: zamanSemasi.nullable(),
  // Çalışan iş emrinin adımı; iş emri çalışmıyorsa (başlamamış, adımlar arası, iş emirsiz emir) null.
  op: z.object({ opNo: z.number().int().positive(), ad: z.string() }).nullable(),
  // Çalışan iş emrinin makinesi; yoksa istasyonun ilk makinesi; ikisi de yoksa null.
  tezgah: tezgahSemasi.nullable(),
  // Bitmemiş ilk iş emri; adet emrin adedidir. Hepsi bitmişse ve iş emirsiz emirde null.
  siradaki: z.object({ opNo: z.number().int(), ad: z.string(), adet: z.number().int().positive() }).nullable(),
  // Emrin kalan malzeme ihtiyacı kullanılabilir stokla karşılanıyor mu; ihtiyaç verisi yoksa null (hazır diye uydurulmaz).
  malzemeHazir: z.boolean().nullable(),
  // İstasyondaki durumun başlangıcı (saatIstasyonuSemasi.durumBaslangic ile aynı kural).
  durumBaslangic: zamanSemasi.nullable(),
  // Çalışan iş emrine tezgâhta girilen son üretim sayımının anı; saat parça geri sayımını buradan başlatır. Giriş yoksa null.
  sonUretimAni: zamanSemasi.nullable(),
});

// Emrin 3B önizlemesi: Çizim Merkezi'nin yayındaki modelden ürettiği PNG kareler (saat 3B çözmez). Emre bağlı model önce,
// yoksa ürünün malzeme kartına bağlı model. revizyonId yalnız saatin önbellek anahtarıdır: kare ucu revizyonu sunucuda yeniden bulur.
export const saatOnizlemesiCevabi = z.object({
  onizleme: z.object({ revizyonId: KIMLIK, kareler: z.array(z.number().int().nonnegative()) }).nullable(),
});
export const onizlemeKaresiParametresi = z.object({
  id: z.coerce.number().pipe(KIMLIK),
  kare: z.coerce.number().int().min(0).max(ONIZLEME_SINIRLARI.azamiKare - 1),
});

export const UYARI_TURLERI = ['ariza', 'bakim', 'bitti', 'durus', 'kalibrasyon', 'kalite', 'malzeme'] as const;

// Kalibrasyon uyarısı istasyona bağlı değildir: istasyon null, alet dolu. Öbür türlerde alet null'dır.
export const uyariAletiSemasi = z.object({
  id: KIMLIK,
  no: z.string(),
  // Aletin adı; girilmemişse türünün adı.
  ad: z.string(),
  // Vade tarihi (GGGG-AA-GG); son kalibrasyonu olmayan aletin vadesi yoktur.
  vade: tarihSemasi.nullable(),
});

export const saatUyarisiSemasi = z.object({
  tur: z.enum(UYARI_TURLERI),
  // Kalibrasyon uyarısında null (alet istasyona bağlı değildir).
  istasyon: z.object({ id: KIMLIK, ad: z.string() }).nullable(),
  alet: uyariAletiSemasi.nullable(),
  // Duruşta, kalitede, malzemede ve bittide emrin numarası; makine ve kalibrasyon uyarısında null.
  emirNo: z.string().nullable(),
  // Duruş nedeni, makine durumunun açıklaması, kalite kararı bekleyen adet ya da kalibrasyon durumu; yoksa (bittide hep) null.
  aciklama: z.string().nullable(),
  // Bittide emrin bitiş anı.
  baslangic: zamanSemasi.nullable(),
  // Uyarının kimliği (tür, istasyon, alet ve vadesi, emir, başlangıç); üstlenme ucu bununla çağrılır. Sunucu kurar, saat çözmez.
  kimlik: z.string(),
  // Geçerli üstlenme (son 12 saat); yoksa null.
  ustlenen: z.object({ ad: z.string(), an: zamanSemasi }).nullable(),
});

export const saatUyarilariCevabi = z.object({
  zaman: zamanSemasi,
  // Kişide üstlenme işlemi var mı; saat düğmeyi buna göre gösterir (yetki sunucuda yeniden denetlenir).
  ustlenebilir: z.boolean(),
  uyarilar: z.array(saatUyarisiSemasi),
});

// Üstlenme (karar 79 a): yalnız üstlenir, kapatmaz. Cevap güncel uyarı listesidir.
export const saatUstlenGovdesi = z.object({ kimlik: z.string().min(1).max(300) });

// Saatin yazdığı tek komut duruştur (onaylı kapsam: terminal.uret); gövde ve cevap emir ucuyla aynı şekilde kalır.
export const saatDurdurGovdesi = durdurGovdesi;
export const saatDurusNedeniSemasi = z.object({ id: KIMLIK, ad: z.string(), simge: z.string().nullable(), kategori: z.enum(KATEGORILER) });
export const saatDurusNedenleriCevabi = z.object({ nedenler: z.array(saatDurusNedeniSemasi) });

// Kişinin vardiyası ve bugünkü üretim (karar 81 a: hedef verisi yoktur, saat hedef yerine vardiya bitişine geri sayar).
// Vardiya Vardiya modülünün kişi takviminden gelir (tatil, izin, planlı duruş ve fazla mesai düşülmüş); kişinin o an içinde
// olduğu çalışma günü yoksa (vardiya dışı, takvimsiz kişi) null. bitis fazla mesai dahil o günkü son çalışma anıdır.
export const saatVardiyasiSemasi = z.object({ ad: z.string().nullable(), baslangic: zamanSemasi, bitis: zamanSemasi });
export const saatVardiyaCevabi = z.object({
  zaman: zamanSemasi,
  vardiya: saatVardiyasiSemasi.nullable(),
  // Sayımın penceresi: tesis gününün başından şimdiye (istasyon ucuyla aynı pencere).
  pencere: z.object({ baslangic: zamanSemasi }),
  // Kapsamdaki istasyonların penceredeki net sayımı; hiç sayım yoksa null.
  bugun: z.object({ saglam: z.number().int(), hurda: adet }).nullable(),
  // Son sekiz saat, saat başından saat başına (sonuncusu şimdiye kadar); sayımı olmayan saatte null.
  saatlik: z.array(z.object({ baslangic: zamanSemasi, saglam: z.number().int().nullable() })),
});

// İstasyonun makinelerinde canlı planda sıradaki iş (karar 84 a: yalnız plan okuyan rol görür). Çalışan ve biten adım sayılmaz;
// canlı planda yerleşmiş iş yoksa null.
export const saatSiradakiCevabi = z.object({
  zaman: zamanSemasi,
  siradaki: z.object({
    emirNo: z.string(),
    opNo: z.number().int(),
    ad: z.string(),
    adet: z.number().int().positive(),
    baslangic: zamanSemasi,
    tezgah: z.string().nullable(),
  }).nullable(),
});

export type SaatDurusNedenleriCevabi = z.output<typeof saatDurusNedenleriCevabi>;
export type SaatIstasyonu = z.output<typeof saatIstasyonuSemasi>;
export type SaatIstasyonlariCevabi = z.output<typeof saatIstasyonlariCevabi>;
export type SaatEmriCevabi = z.output<typeof saatEmriCevabi>;
export type SaatUyarisi = z.output<typeof saatUyarisiSemasi>;
export type SaatUyarilariCevabi = z.output<typeof saatUyarilariCevabi>;
export type SaatOnizlemesiCevabi = z.output<typeof saatOnizlemesiCevabi>;
export type SaatVardiyaCevabi = z.output<typeof saatVardiyaCevabi>;
export type SaatSiradakiCevabi = z.output<typeof saatSiradakiCevabi>;
