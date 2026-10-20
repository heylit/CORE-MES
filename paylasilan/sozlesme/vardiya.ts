import { z } from 'zod';
import { listeCevapSemasi, listeSorguAlanlari } from '../liste.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;
const saat = z.string().regex(SAAT, 'Saat SS:DD biçiminde olmalı (örnek 08:00).');
const kimlik = z.number().int().positive();
const mola = z.object({ baslangic: saat, bitis: saat });

// Vardiya başına mola sınırı: ekranda tek satırda okunur kalır.
export const AZAMI_MOLA = 10;
// Çalışma takviminin tek okumada en uzun aralığı (gün): planın ufku bunun içinde kalır.
export const AZAMI_TAKVIM_GUNU = 366;

export const vardiyaGovdesi = z.object({
  ad: z.string().trim().min(1, 'Ad zorunlu.').max(40),
  baslangic: saat,
  bitis: saat,
  molalar: z.array(mola).max(AZAMI_MOLA),
  aktif: z.boolean().default(true),
});
// Güncelleme okunan sürümü taşır: arada başkası yazdıysa 409 alır, üstüne yazmaz.
export const vardiyaGuncelleGovdesi = vardiyaGovdesi.extend(beklenenSurum);
export const vardiyaParametresi = z.object({ id: z.coerce.number().pipe(kimlik) });
export const matrisGovdesi = z.object({ isMerkeziId: kimlik, gun: z.number().int().min(1).max(7), vardiyaId: kimlik, acik: z.boolean() });
// Kaynak iş merkezinin haftalık düzeni bütün öbür iş merkezlerine kopyalanır (onları siler, yerine yazar).
export const haftaUygulaGovdesi = z.object({ kaynakIsMerkeziId: kimlik });
// Toplu komutların üst sınırı: tek istekte ekranın bir kerede gösterdiğinden fazlası gelmez.
export const AZAMI_TOPLU_IS_MERKEZI = 200;
export const AZAMI_TOPLU_KISI = 500;
const tekilKimlikler = (enCok: number, ileti: string) => z.array(kimlik).min(1, ileti).max(enCok)
  .refine((d) => new Set(d).size === d.length, 'Aynı kayıt iki kez seçilmiş.');
export const TOPLU_MATRIS_KIPLERI = ['ekle', 'kaldir', 'ayarla'] as const;
// VR-18: seçilen iş merkezlerinin seçilen günlerinde vardiyalar eklenir, kaldırılır ya da gün yalnız seçilenlerden oluşur.
// Tek komuttur: bir iş merkezi reddedilirse hiçbiri yazılmaz. Boş vardiya listesi yalnız "ayarla"da anlamlıdır (günü boşaltır).
export const matrisTopluGovdesi = z.object({
  isMerkeziIdleri: tekilKimlikler(AZAMI_TOPLU_IS_MERKEZI, 'En az bir iş merkezi seç.'),
  gunler: z.array(z.number().int().min(1).max(7)).min(1, 'En az bir gün seç.').max(7).refine((d) => new Set(d).size === d.length, 'Aynı gün iki kez seçilmiş.'),
  vardiyaIdleri: z.array(kimlik).max(50).refine((d) => new Set(d).size === d.length, 'Aynı vardiya iki kez seçilmiş.'),
  kip: z.enum(TOPLU_MATRIS_KIPLERI),
}).refine((g) => g.kip === 'ayarla' || g.vardiyaIdleri.length > 0, { message: 'En az bir vardiya seç.', path: ['vardiyaIdleri'] });
// VR-19: kaynak iş merkezinin haftası yalnız seçilen iş merkezlerine kopyalanır (onların eski düzeni silinir).
export const matrisKopyalaGovdesi = z.object({
  kaynakIsMerkeziId: kimlik,
  hedefIsMerkeziIdleri: tekilKimlikler(AZAMI_TOPLU_IS_MERKEZI, 'En az bir hedef iş merkezi seç.'),
});
// VR-20: seçilen kişilerin vardiyası tek komutla belirlenir; null vardiyayı kaldırır.
export const kisiVardiyasiTopluGovdesi = z.object({
  kisiIdleri: tekilKimlikler(AZAMI_TOPLU_KISI, 'En az bir kişi seç.'),
  vardiyaId: kimlik.nullable(),
});
// Toplu komut kapsam dışı kayıt yüzünden reddedilince 403 gövdesinin ayrıntısı: ekran nedeni ilgili satıra yazar.
export interface TopluRetAyrintisi {
  isMerkeziIdleri?: number[];
  kisiIdleri?: number[];
}
export const takvimGunuGovdesi = z.object({
  tarih: tarihSemasi,
  tur: z.enum(['tatil', 'kapali']),
  ad: z.string().trim().max(80).nullish().transform((a) => (a ? a : null)),
});
export const tarihParametresi = z.object({ tarih: tarihSemasi });
export const resmiTatilGovdesi = z.object({ yil: z.number().int().min(2000).max(2100) });
export const kisiParametresi = z.object({ kisiId: z.coerce.number().pipe(kimlik) });
// null kişinin vardiyasını kaldırır: kişi iş merkezinin bütün açık vardiyalarında sayılır.
export const kisiVardiyasiGovdesi = z.object({ vardiyaId: kimlik.nullable() });

export const vardiyaSemasi = z.object({
  id: kimlik, ad: z.string(), baslangic: z.string(), bitis: z.string(), aktif: z.boolean(), surum: surumSemasi,
  molalar: z.array(z.object({ baslangic: z.string(), bitis: z.string() })),
  // Molalar düşülmüş net çalışma süresi (dakika).
  netDakika: z.number().int(),
});

export const takvimCevabi = z.object({
  vardiyalar: z.array(vardiyaSemasi),
  matris: z.array(z.object({ isMerkeziId: kimlik, gun: z.number().int(), vardiyaId: kimlik })),
  gunler: z.array(z.object({ tarih: tarihSemasi, tur: z.enum(['tatil', 'kapali']), ad: z.string().nullable() })),
  isMerkezleri: z.array(z.object({ id: kimlik, kod: z.string(), ad: z.string(), aktif: z.boolean(), haftalikDakika: z.number().int() })),
  kisiVardiyalari: z.array(z.object({ kisiId: kimlik, vardiyaId: kimlik })),
  // Vardiya kadrosu (tek tanım): iş merkezi x vardiya kişileri; istasyon, makine ve ekip ataması sayılır, vardiyası seçilmeyen kişi iş merkezinin
  // bütün açık vardiyalarında da sayılır. vardiyaId null satırı vardiyası seçilmeyenlerdir. Kişi sayısı kisiIdleri uzunluğudur.
  kadro: z.array(z.object({ isMerkeziId: kimlik, vardiyaId: kimlik.nullable(), kisiIdleri: z.array(kimlik) })),
  // Sunucunun bugünü: geçmiş tarihli gün ekranda ayrıca işaretlenir.
  bugun: tarihSemasi,
});

// Vardiya başına personel: istasyon ataması olan kişiler, iş merkezleri (en büyük yüzdeli atama) ve vardiyalarıyla; ada göre.
export const vardiyaPersoneliCevabi = z.object({
  personel: z.array(z.object({
    kisiId: kimlik, ad: z.string(), istasyonId: kimlik, isMerkeziId: kimlik.nullable(), vardiyaId: kimlik.nullable(),
  })),
});

export const KAYNAK_TURLERI = ['is-merkezi', 'istasyon', 'makine', 'kisi'] as const;
export const calismaTakvimiSorgusu = z.object({
  tur: z.enum(KAYNAK_TURLERI),
  id: z.coerce.number().pipe(kimlik),
  baslangic: tarihSemasi,
  bitis: tarihSemasi,
});

export const takvimAraligi = z.object({ baslangic: zamanSemasi, bitis: zamanSemasi });
export const kaynakTakvimiSemasi = z.object({
  // Takvimin okunduğu iş merkezi ve (kişide) vardiya.
  isMerkeziId: kimlik,
  vardiyaId: kimlik.nullable(),
  gunler: z.array(z.object({
    tarih: tarihSemasi,
    // O gün başlayan vardiyaların net dakikası.
    dakika: z.number().int(),
    kapali: z.object({ tur: z.enum(['tatil', 'kapali']), ad: z.string().nullable() }).nullable(),
    // Yalnız kişi takviminde: kişi o gün onaylı izinde (İK); gün 0 dakikadır (VR-25).
    izinli: z.boolean().optional(),
    // Günün dakikasına giren planlı fazla mesai (vardiyayla örtüşmeyen kısım, duruş düşülmüş); yalnız sıfırdan büyükse yazılır.
    // Kişi takviminde İK'nın onaylı fazla mesai saatiyle aynı gün birlikte sayılmamalıdır: plan varsa plan esastır.
    fazlaMesaiDakika: z.number().int().optional(),
  })),
  // Çalışma aralıkları (molalar dışarıda), sıralı ve örtüşmez; aralığın ilk gününden önce başlayan gece vardiyasının taşan kısmı dahil.
  // Kapsamdaki fazla mesai aralıkları eklenmiş, örtüşenler birleşmiştir (VR-24).
  araliklar: z.array(takvimAraligi),
  // Yalnız kişi takviminde: istasyon atama yüzdelerinin toplamı / 100 (1 tam zaman); öbür kaynaklarda ve atama yoksa null.
  yuzde: z.number().nullable().optional(),
});
// Kaynak bir iş merkezine bağlanamıyorsa (makinenin istasyonu yok, kişinin istasyon ataması yok) takvim null'dır; sürekli çalışma uydurulmaz.
export const calismaTakvimiCevabi = z.object({ takvim: kaynakTakvimiSemasi.nullable() });

// Fazla mesai planı (kart #1324): bir gün için vardiya dışı çalışma; istasyon ya da iş merkezi kapsamında, kişi listesiyle.
export const FAZLA_MESAI_KAPSAMLARI = ['is-merkezi', 'istasyon'] as const;
export const fazlaMesaiGovdesi = z.object({
  tarih: tarihSemasi,
  baslangic: saat,
  bitis: saat,
  kapsam: z.enum(FAZLA_MESAI_KAPSAMLARI),
  isMerkeziId: kimlik.nullable().default(null),
  istasyonId: kimlik.nullable().default(null),
  kisiIdleri: z.array(kimlik).max(AZAMI_TOPLU_KISI).refine((d) => new Set(d).size === d.length, 'Aynı kişi iki kez seçilmiş.').default([]),
  aciklama: z.string().trim().max(300, 'Açıklama en çok 300 karakter olur.').nullish().transform((a) => (a ? a : null)),
});
export const fazlaMesaiGuncelleGovdesi = fazlaMesaiGovdesi.extend(beklenenSurum);
export const fazlaMesaiIptalGovdesi = z.object(beklenenSurum);
export const fazlaMesaiParametresi = z.object({ id: z.coerce.number().pipe(kimlik) });
export const fazlaMesaiListeSorgusu = z.object({ baslangic: tarihSemasi, bitis: tarihSemasi });
export const fazlaMesaiSemasi = z.object({
  id: kimlik,
  tarih: tarihSemasi,
  baslangic: z.string(),
  bitis: z.string(),
  kapsam: z.enum(FAZLA_MESAI_KAPSAMLARI),
  isMerkeziId: kimlik.nullable(),
  istasyonId: kimlik.nullable(),
  kisiIdleri: z.array(kimlik),
  aciklama: z.string().nullable(),
  iptal: z.boolean(),
  // Molasız süre (dakika); gece yarısını geçen kayıt ertesi güne uzanır.
  dakika: z.number().int(),
  surum: surumSemasi,
  yazan: z.string().nullable(),
  yazildi: zamanSemasi,
});
export const fazlaMesaiCevabi = z.object({ fazlaMesai: fazlaMesaiSemasi });
// Tarih aralığındaki kayıtlar, iptaller dahil; tarihe ve başlangıca göre.
export const fazlaMesaiListeCevabi = z.object({ fazlaMesailer: z.array(fazlaMesaiSemasi) });

// Günlük mesai (sayfa.mesai): seçilen gün istasyona atanmış her kişinin planlı çalışması. Gerçek giriş-çıkış kaydı tutulmaz;
// satır plandır (kişinin vardiyası ya da vardiyası yoksa iş merkezinin açık vardiyaları, planlı duruşlar düşülmüş).
export const gunlukMesaiSorgusu = z.object({ tarih: tarihSemasi });
export const gunlukMesaiCevabi = z.object({
  tarih: tarihSemasi,
  satirlar: z.array(z.object({
    kisiId: kimlik, ad: z.string(), isMerkeziId: kimlik.nullable(), vardiyaId: kimlik.nullable(),
    // Seçilen gün başlayan vardiyaların planı; iş merkezine bağlanamayan kişide null.
    plan: z.object({
      dakika: z.number().int(),
      kapali: z.object({ tur: z.enum(['tatil', 'kapali']), ad: z.string().nullable() }).nullable(),
      // Molalar ve planlı duruşlar dışarıda; gece yarısını geçen vardiya ertesi sabaha uzanır. Önceki günün taşan vardiyası girmez.
      araliklar: z.array(takvimAraligi),
    }).nullable(),
  })),
});

// Planlı duruş (kart #519, yol haritası A6): tesis, iş merkezi ya da istasyon için saatli duruş; tekrar edebilir. Çalışma takviminden
// düşülür; Arkon planlı duruş takvimi bu kayıtları okur ve yazar.
export const PLANLI_DURUS_KAPSAMLARI = ['tesis', 'is-merkezi', 'istasyon'] as const;
export const PLANLI_DURUS_TEKRARLARI = ['yok', 'gunluk', 'haftalik'] as const;
export const planliDurusGovdesi = z.object({
  baslik: z.string().trim().min(1, 'Başlık zorunlu.').max(80, 'Başlık en çok 80 karakter olur.'),
  durusNedeniId: kimlik.nullable().default(null),
  kapsam: z.enum(PLANLI_DURUS_KAPSAMLARI),
  isMerkeziId: kimlik.nullable().default(null),
  istasyonId: kimlik.nullable().default(null),
  baslangic: zamanSemasi,
  bitis: zamanSemasi,
  tekrar: z.enum(PLANLI_DURUS_TEKRARLARI).default('yok'),
  // Haftalık tekrarda ISO günler: 1 pazartesi ... 7 pazar.
  gunler: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  // Tekrar bu andan sonra başlamaz; null süresizdir.
  tekrarBitis: zamanSemasi.nullable().default(null),
  aciklama: z.string().trim().max(300, 'Açıklama en çok 300 karakter olur.').nullish().transform((n) => (n ? n : null)),
  aktif: z.boolean().default(true),
});
export const planliDurusGuncelleGovdesi = planliDurusGovdesi.extend(beklenenSurum);
export const planliDurusKaldirGovdesi = z.object(beklenenSurum);
export const planliDurusParametresi = z.object({ id: z.coerce.number().pipe(kimlik) });
export const planliDurusListeSorgusu = z.object({
  ...listeSorguAlanlari(['baslangic', 'baslik']),
  yalnizAktif: z.enum(['true', 'false']).optional().transform((d) => d === 'true'),
});
export const planliDurusSemasi = z.object({
  id: kimlik,
  baslik: z.string(),
  durusNedeniId: kimlik.nullable(),
  kapsam: z.enum(PLANLI_DURUS_KAPSAMLARI),
  isMerkeziId: kimlik.nullable(),
  istasyonId: kimlik.nullable(),
  baslangic: zamanSemasi,
  bitis: zamanSemasi,
  tekrar: z.enum(PLANLI_DURUS_TEKRARLARI),
  gunler: z.array(z.number().int()),
  tekrarBitis: zamanSemasi.nullable(),
  aciklama: z.string().nullable(),
  aktif: z.boolean(),
  surum: surumSemasi,
  // Yazan kişinin adı ve yazma anı sunucudan; kişi silinemez, ad yoksa null.
  yazan: z.string().nullable(),
  yazildi: zamanSemasi,
});
export const planliDurusCevabi = z.object({ durus: planliDurusSemasi });
export const planliDurusListeCevabi = listeCevapSemasi(planliDurusSemasi);
export const planliDurusKaldirCevabi = z.object({ kaldirildi: z.literal(true) });

export type VardiyaGovdesi = z.input<typeof vardiyaGovdesi>;
export type VardiyaGuncelleGovdesi = z.input<typeof vardiyaGuncelleGovdesi>;
export type MatrisGovdesi = z.input<typeof matrisGovdesi>;
export type HaftaUygulaGovdesi = z.input<typeof haftaUygulaGovdesi>;
export type TakvimGunuGovdesi = z.input<typeof takvimGunuGovdesi>;
export type KisiVardiyasiGovdesi = z.input<typeof kisiVardiyasiGovdesi>;
export type MatrisTopluGovdesi = z.output<typeof matrisTopluGovdesi>;
export type MatrisKopyalaGovdesi = z.output<typeof matrisKopyalaGovdesi>;
export type KisiVardiyasiTopluGovdesi = z.output<typeof kisiVardiyasiTopluGovdesi>;
export type VardiyaGirdisi = z.output<typeof vardiyaGovdesi>;
export type VardiyaGuncelleGirdisi = z.output<typeof vardiyaGuncelleGovdesi>;
export type Vardiya = z.output<typeof vardiyaSemasi>;
export type TakvimCevabi = z.output<typeof takvimCevabi>;
export type VardiyaPersoneliCevabi = z.output<typeof vardiyaPersoneliCevabi>;
export type KaynakTuru = (typeof KAYNAK_TURLERI)[number];
export type CalismaTakvimiSorgusu = z.input<typeof calismaTakvimiSorgusu>;
export type KaynakTakvimi = z.output<typeof kaynakTakvimiSemasi>;
export type CalismaTakvimiCevabi = z.output<typeof calismaTakvimiCevabi>;
export type TakvimAraligi = z.output<typeof takvimAraligi>;
export type GunlukMesaiCevabi = z.output<typeof gunlukMesaiCevabi>;
export type PlanliDurusKapsami = (typeof PLANLI_DURUS_KAPSAMLARI)[number];
export type PlanliDurusTekrari = (typeof PLANLI_DURUS_TEKRARLARI)[number];
export type PlanliDurusGovdesi = z.input<typeof planliDurusGovdesi>;
export type PlanliDurusGuncelleGovdesi = z.input<typeof planliDurusGuncelleGovdesi>;
export type PlanliDurusGirdisi = z.output<typeof planliDurusGovdesi>;
export type PlanliDurusGuncelleGirdisi = z.output<typeof planliDurusGuncelleGovdesi>;
export type PlanliDurusListeSorgusu = z.input<typeof planliDurusListeSorgusu>;
export type PlanliDurus = z.output<typeof planliDurusSemasi>;
export type PlanliDurusCevabi = z.output<typeof planliDurusCevabi>;
export type PlanliDurusListeCevabi = z.output<typeof planliDurusListeCevabi>;
export type FazlaMesaiKapsami = (typeof FAZLA_MESAI_KAPSAMLARI)[number];
export type FazlaMesaiGovdesi = z.input<typeof fazlaMesaiGovdesi>;
export type FazlaMesaiGirdisi = z.output<typeof fazlaMesaiGovdesi>;
export type FazlaMesai = z.output<typeof fazlaMesaiSemasi>;
export type FazlaMesaiCevabi = z.output<typeof fazlaMesaiCevabi>;
export type FazlaMesaiListeCevabi = z.output<typeof fazlaMesaiListeCevabi>;
