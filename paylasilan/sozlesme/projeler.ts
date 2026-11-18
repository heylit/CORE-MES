import { z } from 'zod';
import { secilenFirmaKodu } from './ayarlar.ts';
import { listeCevapSemasi, listeSorguAlanlari } from '../liste.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { EMIR_TURLERI } from './emir-turleri.ts';
import { hazirlikMaddeKodu } from './uretim-emirleri.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

// Projeler (kart #803): proje kaydı. Kod üretim emri numarasına girer ve Logo'daki proje koduyla eşleşebilecek biçimdedir.

export const PROJE_DURUMLARI = ['aktif', 'tamamlandi', 'iptal'] as const;
export const projeDurumuSemasi = z.enum(PROJE_DURUMLARI);

// PRJ-01: büyük harf, rakam, nokta, alt çizgi; en çok 24. Tire yok: emir numarasında parçaları tire ayırır.
export const PROJE_KODU_EN_COK = 24;
export const PROJE_KODU_BICIMI = /^[A-Z0-9._]{1,24}$/;
export const projeKoduSemasi = z
  .string()
  .trim()
  .min(1, 'Proje kodu zorunlu.')
  .transform((k) => k.toLocaleUpperCase('tr').replaceAll('İ', 'I'))
  .pipe(z.string().max(PROJE_KODU_EN_COK, `Proje kodu en çok ${PROJE_KODU_EN_COK} karakter olmalı.`)
    .regex(PROJE_KODU_BICIMI, 'Proje kodunda yalnız harf (A-Z), rakam, nokta ve alt çizgi olabilir.'));

// Boş ya da yalnız boşluk "yok" demektir; boş dizgi saklanmaz.
const istege = (azami: number) =>
  z.string().max(azami).nullish().transform((m) => {
    const kirpik = m?.trim();
    return kirpik ? kirpik : null;
  });

// PRJ-09: bütçeyi yalnız `finans.maliyet-oku` olan görür ve yazar; işlemi olmayanın gövdesindeki bütçe yok sayılır. Bütçe en çok iki ondalıklı, eksi olmayan tutardır; para birimi verilmezse TRY.
export const BUTCE_BICIMI = /^\d{1,16}(\.\d{1,2})?$/;
const butceTutariSemasi = z.string().trim().regex(BUTCE_BICIMI, 'Bütçe en çok iki ondalıklı bir tutar olmalı (örnek: 250000.00).');
const paraBirimiSemasi = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Para birimi üç harfli koddur (TRY gibi).');
const butceAlanlari = {
  butceTutari: butceTutariSemasi.nullish().transform((t) => t ?? null),
  butceParaBirimi: paraBirimiSemasi.nullish().transform((p) => p ?? null),
};

const projeAlanlari = {
  ad: z.string().trim().min(1, 'Proje adı zorunlu.').max(200),
  firmaId: z.number().int().positive().nullish().transform((f) => f ?? null),
  baslangic: tarihSemasi.nullish().transform((t) => t ?? null),
  bitis: tarihSemasi.nullish().transform((t) => t ?? null),
  aciklama: istege(1000),
  ...butceAlanlari,
};

// PRJ-04: bitiş başlangıçtan önce olamaz (veritabanında da kısıt).
const tarihSirasi = (g: { baslangic: string | null; bitis: string | null }) => g.baslangic === null || g.bitis === null || g.bitis >= g.baslangic;
const TARIH_SIRASI = { message: 'Bitiş başlangıçtan önce olamaz.', path: ['bitis'] };

export const idParametresi = z.object({ id: z.coerce.number<number>().int().positive() });

// Siparişten açılışta firma siparişten alınır; gövdede firma yoktur (PRJ-07, PRJ-08).
// 3269 a: görev şablonu proje açılınca uygulanır. Alan gönderilmezse varsayılan şablon (varsa), `null` şablonsuz demektir.
const siparistenAlanlar = {
  kod: projeKoduSemasi, ad: projeAlanlari.ad, baslangic: projeAlanlari.baslangic, bitis: projeAlanlari.bitis, aciklama: projeAlanlari.aciklama,
  ...butceAlanlari,
  sablonId: z.number().int().positive().max(2147483647).nullable().optional(),
  // 3399 a: gönderilmezse siparişin firma kodu, o da yoksa varsayılan kod.
  firmaKodu: secilenFirmaKodu.optional(),
};
export const siparistenProjeGovdesi = z.object(siparistenAlanlar).refine(tarihSirasi, TARIH_SIRASI);
// PRJ-10 (224): yeni proje sipariş seçilmeden açılmaz; firma siparişten gelir.
export const projeOlusturGovdesi = z
  .object({
    ...siparistenAlanlar,
    siparisId: z.number({ error: 'Sipariş seçimi zorunlu.' }).int().positive().max(2147483647),
  })
  .refine(tarihSirasi, TARIH_SIRASI);
export const siparisParametresi = z.object({ siparisId: z.coerce.number<number>().int().positive().max(2147483647) });

// Güncelleme tam kayıttır; kod yoktur (PRJ-03: açıldıktan sonra değişmez). PRJ-16: gönderilmeyen alan sessizce silinmez, gövde reddedilir;
// silmek için alan `null` gönderilir. Bütçe istisnadır: maliyet görmeyen onu hiç göndermez; yoksa var olan kalır, `null` siler.
export const projeGuncelleGovdesi = z
  .object({
    ad: projeAlanlari.ad,
    firmaId: z.number().int().positive().nullable(),
    baslangic: tarihSemasi.nullable(),
    bitis: tarihSemasi.nullable(),
    aciklama: z.string().max(1000).nullable().transform((m) => {
      const kirpik = m?.trim();
      return kirpik ? kirpik : null;
    }),
    butceTutari: butceTutariSemasi.nullable().optional(),
    butceParaBirimi: paraBirimiSemasi.nullable().optional(),
    durum: projeDurumuSemasi,
    // PRJ-17: tamamlanmış ya da iptal projeyi yeniden aktife alırken zorunlu; sunucu denetler ve statü geçmişine yazar.
    yenidenAcmaGerekcesi: istege(500),
    // 3399 a: gönderilmezse kayıtlı kod kalır; null kodu kaldırır.
    firmaKodu: secilenFirmaKodu.optional(),
    ...beklenenSurum,
  })
  .refine(tarihSirasi, TARIH_SIRASI);

export const projeListesiSorgusu = z.object({
  ...listeSorguAlanlari(['kod', 'ad', 'baslangic']),
  ara: z.string().trim().max(80).optional(),
  durum: projeDurumuSemasi.optional(),
  statuId: z.coerce.number<number>().int().positive().max(2147483647).optional(),
});

export const projeSemasi = z.object({
  id: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  durum: projeDurumuSemasi,
  firmaId: z.number().int().nullable(),
  // Firma adı finanstan okunur; bulunamazsa null (uydurulmaz).
  firmaAd: z.string().nullable(),
  // 3399 a: kendi firma kodumuz (Firma kodları); eski projede null.
  firmaKodu: z.string().nullable(),
  // Proje siparişten açıldıysa o sipariş (176 a); elle açılan projede null.
  siparisId: z.number().int().nullable(),
  // Bütçe yalnız `finans.maliyet-oku` olana gelir (180); işlemi olmayana alan hiç gelmez. Girilmediyse null:
  // hedef o zaman plan maliyetidir (198 a).
  butceTutari: z.string().nullable().optional(),
  butceParaBirimi: z.string().nullable().optional(),
  baslangic: tarihSemasi.nullable(),
  bitis: tarihSemasi.nullable(),
  // 3244 b: bitiş siparişin terminine bağlı mı; bağlıysa termin kayınca bitiş de kayar, elle değişen bitiş bağı koparır.
  bitisBagli: z.boolean(),
  aciklama: z.string().nullable(),
  olusturma: zamanSemasi,
  guncelleme: zamanSemasi.nullable(),
  surum: surumSemasi,
  // 890 c: projenin son statü kaydı; hiç yazılmadıysa null.
  statu: z.lazy(() => guncelStatuSemasi).nullable(),
  // PRJ-14: iptal dışındaki görevlerin plan süresiyle ağırlıklı ilerlemesi, yüzde; görev yoksa null (sıfır uydurulmaz).
  ilerleme: z.number().int().min(0).max(100).nullable(),
});

export const projeListesiCevabi = listeCevapSemasi(projeSemasi);

// 3244 b: bitiş yeniden siparişin terminine bağlanır; yalnız siparişten açılan projede.
export const bitisBaglaGovdesi = z.object({ ...beklenenSurum });

// 3244 b: projenin siparişinden gelen kalemler, terminleri ve üretim çeşidi partileriyle. Fiyat gelmez.
// Partisiz kalem tek seri parti sayılır; boş dizi öyle okunur.
export const projeSiparisKalemiSemasi = z.object({
  id: z.number().int(),
  sira: z.number().int(),
  malzemeNo: z.number().int(),
  malzemeKodu: z.string().nullable(),
  malzemeAdi: z.string().nullable(),
  birim: z.string().nullable(),
  miktar: z.string(),
  termin: tarihSemasi,
  terminElle: z.boolean(),
  partiler: z.array(z.object({ id: z.number().int(), emirTuru: z.enum(EMIR_TURLERI), adet: z.string() })),
});
export const projeSiparisKalemleriCevabi = z.object({
  siparisNo: z.string().nullable(),
  siparisTermini: tarihSemasi.nullable(),
  kalemler: z.array(projeSiparisKalemiSemasi),
});
export const siparisProjeleriCevabi = z.object({ projeler: z.array(projeSemasi) });

// Proje açarken sipariş seçici: yalnız onaylı siparişler, sipariş no ya da müşteri sipariş no ile aranır.
export const siparisSecenekleriSorgusu = z.object({ ara: z.string().trim().max(80).prefault('') });
export const siparisSecenekleriCevabi = z.object({
  siparisler: z.array(z.object({ id: z.number().int(), no: z.string(), firmaAd: z.string().nullable(), termin: tarihSemasi })),
});

export const firmaSecenekleriSorgusu = z.object({ ara: z.string().trim().max(80).prefault('') });
export const firmaSecenekleriCevabi = z.object({
  firmalar: z.array(z.object({ id: z.number().int(), ad: z.string(), kod: z.string().nullable() })),
});

// --- Proje yönetimi (890 c): statü, kilometre taşı, görev. Görev tutar taşımaz (911 b); plan ve gerçekleşen zaman çizelgesi planlamadadır (908). ---

// Statü rengi ortak rozet tonlarıdır; sabit renk tutulmaz.
export const STATU_TONLARI = ['tamam', 'uyari', 'hata', 'pasif', 'bilgi', 'vurgu'] as const;
export const statuTonuSemasi = z.enum(STATU_TONLARI);
export const STATU_AD_EN_COK = 80;
const zorunluMetin = (azami: number, ileti: string) => z.string().trim().min(1, ileti).max(azami, `En çok ${azami} karakter.`);

export const statuSemasi = z.object({
  id: z.number().int(),
  ad: z.string(),
  ton: statuTonuSemasi,
  sira: z.number().int(),
  etkin: z.boolean(),
  surum: surumSemasi,
});
export const statuListesiCevabi = z.object({
  statuler: z.array(statuSemasi),
  // Listede olmayan statünün elle yazılmasına izin (Projeler ayarı).
  serbestStatu: z.boolean(),
  ayarSurum: surumSemasi,
});
export const statuEkleGovdesi = z.object({
  ad: zorunluMetin(STATU_AD_EN_COK, 'Statü adı zorunlu.'),
  ton: statuTonuSemasi,
  sira: z.number().int().min(0).max(10000),
});
export const statuGuncelleGovdesi = statuEkleGovdesi.extend({ etkin: z.boolean(), ...beklenenSurum });
export const statuAyariGovdesi = z.object({ serbestStatu: z.boolean(), ...beklenenSurum });

// PRJ-11: statü ya listeden seçilir ya da (izin açıksa) elle yazılır; ikisi birden olmaz.
export const statuYazGovdesi = z
  .object({
    statuId: z.number().int().positive().max(2147483647).nullish().transform((v) => v ?? null),
    metin: istege(STATU_AD_EN_COK),
    not: istege(500),
  })
  .refine((g) => (g.statuId === null) !== (g.metin === null), { message: 'Listeden bir statü seçin ya da statüyü yazın.', path: ['statuId'] });

// Güncel statü ve geçmiş satırı. Serbest yazılmış statünün tonu yoktur (ekranda gri ve kesik çerçeve).
export const guncelStatuSemasi = z.object({
  statuId: z.number().int().nullable(),
  ad: z.string(),
  ton: statuTonuSemasi.nullable(),
  serbest: z.boolean(),
  an: zamanSemasi,
});
export const statuKaydiSemasi = guncelStatuSemasi.extend({
  id: z.number().int(),
  not: z.string().nullable(),
  kisiAd: z.string().nullable(),
});

export const kilometreTasiParametresi = z.object({ tasId: z.coerce.number<number>().int().positive().max(2147483647) });
export const kilometreTasiEkleGovdesi = z.object({
  ad: zorunluMetin(200, 'Kilometre taşı adı zorunlu.'),
  sira: z.number().int().min(0).max(10000),
  tabanTarih: tarihSemasi,
});
export const kilometreTasiGuncelleGovdesi = z.object({
  ad: zorunluMetin(200, 'Kilometre taşı adı zorunlu.'),
  sira: z.number().int().min(0).max(10000),
  gercekTarih: tarihSemasi.nullish().transform((t) => t ?? null),
  etkin: z.boolean(),
  ...beklenenSurum,
});
// PRJ-13: taban tarih yalnız gerekçeyle yenilenir; eski değer geçmişte kalır.
export const tabanYenileGovdesi = z.object({
  yeniTarih: tarihSemasi,
  gerekce: zorunluMetin(500, 'Taban tarihi neden değişiyor? Gerekçe zorunlu.'),
  ...beklenenSurum,
});
export const tabanKaydiSemasi = z.object({
  eskiTarih: tarihSemasi, yeniTarih: tarihSemasi, gerekce: z.string(), kisiAd: z.string().nullable(), an: zamanSemasi,
});
export const kilometreTasiSemasi = z.object({
  id: z.number().int(),
  ad: z.string(),
  sira: z.number().int(),
  tabanTarih: tarihSemasi,
  gercekTarih: tarihSemasi.nullable(),
  etkin: z.boolean(),
  tabanGecmisi: z.array(tabanKaydiSemasi),
  surum: surumSemasi,
});

// 3269: "kontrolde" yalnız kontrol edeni olan görevdedir; yapan bitirince görev kontrole geçer, onayla biter.
export const GOREV_DURUMLARI = ['yapilacak', 'suruyor', 'bekliyor', 'kontrolde', 'bitti', 'iptal'] as const;
export const gorevDurumuSemasi = z.enum(GOREV_DURUMLARI);
export const gorevParametresi = z.object({ gorevId: z.coerce.number<number>().int().positive().max(2147483647) });
const kimlikYaDaYok = z.number().int().positive().max(2147483647).nullish().transform((v) => v ?? null);
const gorevPlanAlanlari = {
  kilometreTasiId: kimlikYaDaYok,
  ad: zorunluMetin(200, 'Görev adı zorunlu.'),
  aciklama: istege(1000),
  sorumluKisiId: kimlikYaDaYok,
  planBaslangic: tarihSemasi,
  planBitis: tarihSemasi,
  oncekiGorevId: kimlikYaDaYok,
  // 3269: yapan kişi (sorumluKisiId) ya da rol; kontrol eden ve yedeği kişi ya da rol. Aşama görevlerin gruplandığı addır.
  asama: istege(80),
  yapanRolId: kimlikYaDaYok,
  kontrolKisiId: kimlikYaDaYok,
  kontrolRolId: kimlikYaDaYok,
  yedekKontrolKisiId: kimlikYaDaYok,
  yedekKontrolRolId: kimlikYaDaYok,
};
const planSirasi = (g: { planBaslangic: string; planBitis: string }) => g.planBitis >= g.planBaslangic;
const PLAN_SIRASI = { message: 'Plan bitişi başlangıçtan önce olamaz.', path: ['planBitis'] };
const TEK_YAPAN = { message: 'Görev ya bir kişiye ya da bir role atanır.', path: ['yapanRolId'] };
const TEK_KONTROL = { message: 'Kontrol eden ya bir kişi ya da bir roldür.', path: ['kontrolRolId'] };
const TEK_YEDEK = { message: 'Yedek kontrol eden ya bir kişi ya da bir roldür.', path: ['yedekKontrolRolId'] };
const YEDEK_KONTROLLU = { message: 'Yedek kontrol eden yalnız kontrol edeni olan görevde seçilir.', path: ['yedekKontrolKisiId'] };
type Kontrol = { kontrolKisiId: number | null; kontrolRolId: number | null };
type Yedek = Kontrol & { yedekKontrolKisiId: number | null; yedekKontrolRolId: number | null };
const tekYapan = (g: { sorumluKisiId: number | null; yapanRolId: number | null }) => g.sorumluKisiId === null || g.yapanRolId === null;
const tekKontrol = (g: Kontrol) => g.kontrolKisiId === null || g.kontrolRolId === null;
const tekYedek = (g: Yedek) => g.yedekKontrolKisiId === null || g.yedekKontrolRolId === null;
const yedekKontrollu = (g: Yedek) => (g.yedekKontrolKisiId === null && g.yedekKontrolRolId === null) || g.kontrolKisiId !== null || g.kontrolRolId !== null;
export const gorevEkleGovdesi = z.object(gorevPlanAlanlari).refine(planSirasi, PLAN_SIRASI)
  .refine(tekYapan, TEK_YAPAN).refine(tekKontrol, TEK_KONTROL).refine(tekYedek, TEK_YEDEK).refine(yedekKontrollu, YEDEK_KONTROLLU);
export const gorevGuncelleGovdesi = z
  .object({
    ...gorevPlanAlanlari,
    gercekBaslangic: tarihSemasi.nullish().transform((t) => t ?? null),
    gercekBitis: tarihSemasi.nullish().transform((t) => t ?? null),
    ilerleme: z.number().int().min(0).max(100),
    durum: gorevDurumuSemasi,
    ...beklenenSurum,
  })
  .refine(planSirasi, PLAN_SIRASI)
  .refine(tekYapan, TEK_YAPAN).refine(tekKontrol, TEK_KONTROL).refine(tekYedek, TEK_YEDEK).refine(yedekKontrollu, YEDEK_KONTROLLU);
export const gorevSemasi = z.object({
  id: z.number().int(),
  kilometreTasiId: z.number().int().nullable(),
  ad: z.string(),
  aciklama: z.string().nullable(),
  sorumluKisiId: z.number().int().nullable(),
  sorumluAd: z.string().nullable(),
  planBaslangic: tarihSemasi,
  planBitis: tarihSemasi,
  gercekBaslangic: tarihSemasi.nullable(),
  gercekBitis: tarihSemasi.nullable(),
  ilerleme: z.number().int(),
  durum: gorevDurumuSemasi,
  oncekiGorevId: z.number().int().nullable(),
  asama: z.string().nullable(),
  yapanRolId: z.number().int().nullable(),
  yapanRolAd: z.string().nullable(),
  kontrolKisiId: z.number().int().nullable(),
  kontrolKisiAd: z.string().nullable(),
  kontrolRolId: z.number().int().nullable(),
  kontrolRolAd: z.string().nullable(),
  yedekKontrolKisiId: z.number().int().nullable(),
  yedekKontrolKisiAd: z.string().nullable(),
  yedekKontrolRolId: z.number().int().nullable(),
  yedekKontrolRolAd: z.string().nullable(),
  // Kontrollü görev onayla bitti: ekranda "Onaylandı". Kontrolsüz görevde hep false.
  onaylandi: z.boolean(),
  // 3430 a: hazırlık görevi (maddeye ve emre bağlı) listede "Hazırlık" rozetiyle ayrılır; proje görevinde null.
  hazirlikMaddesi: z.string().nullable(),
  surum: surumSemasi,
});

// Proje ayrıntısının yönetim bölümleri tek okumada: güncel statü, geçmiş, kilometre taşları, görevler ve statü seçenekleri.
export const projeYonetimiCevabi = z.object({
  statu: guncelStatuSemasi.nullable(),
  statuGecmisi: z.array(statuKaydiSemasi),
  kilometreTaslari: z.array(kilometreTasiSemasi),
  gorevler: z.array(gorevSemasi),
  ilerleme: z.number().int().nullable(),
  // Statü penceresi için: yalnız etkin statüler ve serbest yazı izni.
  statuler: z.array(statuSemasi),
  serbestStatu: z.boolean(),
});
export const kisiSecenekleriCevabi = z.object({ kisiler: z.array(z.object({ id: z.number().int(), ad: z.string() })) });
export const rolSecenekleriCevabi = z.object({ roller: z.array(z.object({ id: z.number().int(), ad: z.string() })) });

// --- 3269: görev akışı (üstlen, başla, bitir, onayla, geri gönder) ---
// Kişi yalnız kendisine ya da rolüne atanan görevi işler, yalnız kendisine ya da rolüne atanan kontrolü onaylar (sunucuda).
export const gorevKomutuGovdesi = z.object({ ...beklenenSurum });
// 3396 a: hazırlık görevinin yapanı kişi ya da rol olarak değişir (Proje > Hazırlık yan paneli); ikisi birden değil.
export const hazirlikAtaGovdesi = z.object({ sorumluKisiId: kimlikYaDaYok, yapanRolId: kimlikYaDaYok, ...beklenenSurum })
  .refine((g) => g.sorumluKisiId === null || g.yapanRolId === null, { message: 'Yapan kişi ya da rol olur, ikisi birden değil.', path: ['yapanRolId'] });
export type HazirlikAtaGovdesi = z.input<typeof hazirlikAtaGovdesi>;
export const hazirlikAtaCevabi = z.object({ id: z.number().int(), surum: z.number().int() });

// 3396 a: hazırlık görevinin kademe geçmişi (ortak kademeli uyarı defteri, 3405).
export const kademeGecmisiCevabi = z.object({
  kademeler: z.array(z.object({ kademe: z.number().int(), an: zamanSemasi, bildirildi: z.boolean(), aliciSayisi: z.number().int() })),
});
export type KademeGecmisiCevabi = z.output<typeof kademeGecmisiCevabi>;
export const geriGonderGovdesi = z.object({
  gerekce: zorunluMetin(500, 'Neden geri gönderiyorsun? Gerekçe zorunlu.'),
  ...beklenenSurum,
});
export const GOREV_OLAYLARI = ['ustlen', 'basla', 'bitti', 'onay', 'geri'] as const;
export const gorevOlayiSemasi = z.object({
  olay: z.enum(GOREV_OLAYLARI), kisiAd: z.string().nullable(), gerekce: z.string().nullable(), an: zamanSemasi,
});
// Ekranın göstereceği düğmeler: sunucu aynı kuralla yazmayı da denetler.
export const gorevIzinleriSemasi = z.object({
  ustlenebilir: z.boolean(), baslayabilir: z.boolean(), bitirebilir: z.boolean(), onaylayabilir: z.boolean(),
});
export const gorevAyrintisiCevabi = z.object({
  gorev: gorevSemasi,
  proje: z.object({ id: z.number().int(), kod: z.string(), ad: z.string() }),
  olaylar: z.array(gorevOlayiSemasi),
  izinler: gorevIzinleriSemasi,
});
// Proje görevlerim: kişinin açık görevleri. "bana" kişiye atanan, "rolume" rolüne açık (üstlenilmemiş), "kontrolumde" onayını
// bekleyen, "yaptim" kişinin bitirip kontrolde bekleyen görevi.
export const GOREVLERIM_TURLERI = ['bana', 'rolume', 'kontrolumde', 'yaptim'] as const;
export const gorevlerimSatiri = gorevSemasi.extend({
  tur: z.enum(GOREVLERIM_TURLERI),
  projeId: z.number().int(),
  projeKod: z.string(),
  projeAd: z.string(),
  izinler: gorevIzinleriSemasi,
  // 3396 a: hazırlık görevinin ulaştığı en yüksek kademe (1-5); hazırlık görevi değilse ya da kademe yoksa null.
  kademe: z.number().int().nullable(),
});
export const gorevlerimCevabi = z.object({ gorevler: z.array(gorevlerimSatiri) });

// --- 3269: görev şablonu ---
export const SABLON_DAYANAKLARI = ['baslangic', 'termin'] as const;
export const KONTROL_KOSULLARI = ['her-zaman', 'yeni-revize'] as const;
export const SABLON_KALEMI_EN_COK = 100;
export const sablonKalemiGovdesi = z.object({
  // Kalemler sırayla gönderilir; önceki kalem bu listedeki sıra numarasıdır (0'dan), kimlik değil.
  ad: zorunluMetin(200, 'Görev adı zorunlu.'),
  aciklama: istege(1000),
  asama: istege(80),
  dayanak: z.enum(SABLON_DAYANAKLARI),
  gun: z.number().int().min(-365).max(365),
  sureGun: z.number().int().min(1, 'Süre en az 1 gün.').max(365),
  yapanKisiId: kimlikYaDaYok,
  yapanRolId: kimlikYaDaYok,
  kontrolKisiId: kimlikYaDaYok,
  kontrolRolId: kimlikYaDaYok,
  yedekKontrolKisiId: kimlikYaDaYok,
  yedekKontrolRolId: kimlikYaDaYok,
  oncekiSira: z.number().int().min(0).max(SABLON_KALEMI_EN_COK - 1).nullish().transform((v) => v ?? null),
  hazirlikMaddesi: hazirlikMaddeKodu.nullish().transform((v) => v ?? null),
  kontrolKosulu: z.enum(KONTROL_KOSULLARI).default('her-zaman'),
})
  .refine((k) => k.yapanKisiId === null || k.yapanRolId === null, { message: TEK_YAPAN.message, path: ['yapanRolId'] })
  .refine((k) => tekKontrol(k), TEK_KONTROL).refine((k) => tekYedek(k), TEK_YEDEK).refine((k) => yedekKontrollu(k), YEDEK_KONTROLLU);
const sablonAlanlari = {
  ad: zorunluMetin(120, 'Şablon adı zorunlu.'),
  varsayilan: z.boolean(),
  etkin: z.boolean(),
  kalemler: z.array(sablonKalemiGovdesi).max(SABLON_KALEMI_EN_COK, `Şablonda en çok ${SABLON_KALEMI_EN_COK} görev olur.`),
};
const ONCEKI_SIRASI = { message: 'Önceki görev listede bu görevden önce olmalı.', path: ['kalemler'] };
const oncekiOnde = (g: { kalemler: readonly { oncekiSira: number | null }[] }) => g.kalemler.every((k, i) => k.oncekiSira === null || k.oncekiSira < i);
const VARSAYILAN_ETKIN = { message: 'Varsayılan şablon kapatılamaz.', path: ['etkin'] };
const varsayilanEtkin = (g: { varsayilan: boolean; etkin: boolean }) => !g.varsayilan || g.etkin;
export const sablonEkleGovdesi = z.object(sablonAlanlari).refine(oncekiOnde, ONCEKI_SIRASI).refine(varsayilanEtkin, VARSAYILAN_ETKIN);
export const sablonGuncelleGovdesi = z.object({ ...sablonAlanlari, ...beklenenSurum }).refine(oncekiOnde, ONCEKI_SIRASI).refine(varsayilanEtkin, VARSAYILAN_ETKIN);
export const sablonKalemiSemasi = z.object({
  id: z.number().int(),
  ad: z.string(), aciklama: z.string().nullable(), asama: z.string().nullable(),
  dayanak: z.enum(SABLON_DAYANAKLARI), gun: z.number().int(), sureGun: z.number().int(),
  yapanKisiId: z.number().int().nullable(), yapanKisiAd: z.string().nullable(),
  yapanRolId: z.number().int().nullable(), yapanRolAd: z.string().nullable(),
  kontrolKisiId: z.number().int().nullable(), kontrolKisiAd: z.string().nullable(),
  kontrolRolId: z.number().int().nullable(), kontrolRolAd: z.string().nullable(),
  yedekKontrolKisiId: z.number().int().nullable(), yedekKontrolKisiAd: z.string().nullable(),
  yedekKontrolRolId: z.number().int().nullable(), yedekKontrolRolAd: z.string().nullable(),
  oncekiSira: z.number().int().nullable(),
  hazirlikMaddesi: hazirlikMaddeKodu.nullable(),
  kontrolKosulu: z.enum(KONTROL_KOSULLARI),
});
export const sablonSemasi = z.object({
  id: z.number().int(), ad: z.string(), varsayilan: z.boolean(), etkin: z.boolean(),
  kalemler: z.array(sablonKalemiSemasi), guncelleme: zamanSemasi.nullable(), surum: surumSemasi,
});
export const sablonListesiCevabi = z.object({ sablonlar: z.array(sablonSemasi) });
// Proje açılış formu için: etkin şablonların adı ve ne kadar görev doğuracağı.
export const sablonSecenekleriCevabi = z.object({
  sablonlar: z.array(z.object({ id: z.number().int(), ad: z.string(), varsayilan: z.boolean(), gorevSayisi: z.number().int(), hazirlikSayisi: z.number().int() })),
});
export const sablondanEkleGovdesi = z.object({ sablonId: z.number().int().positive().max(2147483647) });

export type StatuTonu = z.output<typeof statuTonuSemasi>;
export type Statu = z.output<typeof statuSemasi>;
export type StatuListesiCevabi = z.output<typeof statuListesiCevabi>;
export type StatuEkleGovdesi = z.input<typeof statuEkleGovdesi>;
export type StatuGuncelleGovdesi = z.input<typeof statuGuncelleGovdesi>;
export type StatuAyariGovdesi = z.input<typeof statuAyariGovdesi>;
export type StatuYazGovdesi = z.input<typeof statuYazGovdesi>;
export type StatuYazVerisi = z.output<typeof statuYazGovdesi>;
export type GuncelStatu = z.output<typeof guncelStatuSemasi>;
export type StatuKaydi = z.output<typeof statuKaydiSemasi>;
export type KilometreTasi = z.output<typeof kilometreTasiSemasi>;
export type KilometreTasiEkleGovdesi = z.input<typeof kilometreTasiEkleGovdesi>;
export type KilometreTasiGuncelleGovdesi = z.input<typeof kilometreTasiGuncelleGovdesi>;
export type KilometreTasiGuncelleVerisi = z.output<typeof kilometreTasiGuncelleGovdesi>;
export type TabanYenileGovdesi = z.input<typeof tabanYenileGovdesi>;
export type GorevDurumu = z.output<typeof gorevDurumuSemasi>;
export type Gorev = z.output<typeof gorevSemasi>;
export type GorevEkleGovdesi = z.input<typeof gorevEkleGovdesi>;
export type GorevEkleVerisi = z.output<typeof gorevEkleGovdesi>;
export type GorevGuncelleGovdesi = z.input<typeof gorevGuncelleGovdesi>;
export type GorevGuncelleVerisi = z.output<typeof gorevGuncelleGovdesi>;
export type ProjeYonetimiCevabi = z.output<typeof projeYonetimiCevabi>;
export type KisiSecenekleriCevabi = z.output<typeof kisiSecenekleriCevabi>;
export type RolSecenekleriCevabi = z.output<typeof rolSecenekleriCevabi>;
export type GorevKomutuGovdesi = z.input<typeof gorevKomutuGovdesi>;
export type GeriGonderGovdesi = z.input<typeof geriGonderGovdesi>;
export type GorevOlayi = z.output<typeof gorevOlayiSemasi>;
export type GorevIzinleri = z.output<typeof gorevIzinleriSemasi>;
export type GorevAyrintisiCevabi = z.output<typeof gorevAyrintisiCevabi>;
export type GorevlerimTuru = (typeof GOREVLERIM_TURLERI)[number];
export type GorevlerimSatiri = z.output<typeof gorevlerimSatiri>;
export type GorevlerimCevabi = z.output<typeof gorevlerimCevabi>;
export type SablonDayanagi = (typeof SABLON_DAYANAKLARI)[number];
export type KontrolKosulu = (typeof KONTROL_KOSULLARI)[number];
export type SablonKalemiGovdesi = z.input<typeof sablonKalemiGovdesi>;
export type SablonKalemiVerisi = z.output<typeof sablonKalemiGovdesi>;
export type SablonEkleGovdesi = z.input<typeof sablonEkleGovdesi>;
export type SablonEkleVerisi = z.output<typeof sablonEkleGovdesi>;
export type SablonGuncelleGovdesi = z.input<typeof sablonGuncelleGovdesi>;
export type SablonGuncelleVerisi = z.output<typeof sablonGuncelleGovdesi>;
export type SablonKalemi = z.output<typeof sablonKalemiSemasi>;
export type Sablon = z.output<typeof sablonSemasi>;
export type SablonListesiCevabi = z.output<typeof sablonListesiCevabi>;
export type SablonSecenekleriCevabi = z.output<typeof sablonSecenekleriCevabi>;
export type SablondanEkleGovdesi = z.input<typeof sablondanEkleGovdesi>;

export type ProjeDurumu = z.output<typeof projeDurumuSemasi>;
export type ProjeOlusturGovdesi = z.input<typeof projeOlusturGovdesi>;
export type ProjeOlusturVerisi = z.output<typeof projeOlusturGovdesi>;
export type SiparistenProjeGovdesi = z.input<typeof siparistenProjeGovdesi>;
export type SiparistenProjeVerisi = z.output<typeof siparistenProjeGovdesi>;
export type SiparisProjeleriCevabi = z.output<typeof siparisProjeleriCevabi>;
export type ProjeGuncelleGovdesi = z.input<typeof projeGuncelleGovdesi>;
export type BitisBaglaGovdesi = z.input<typeof bitisBaglaGovdesi>;
export type ProjeSiparisKalemi = z.output<typeof projeSiparisKalemiSemasi>;
export type ProjeSiparisKalemleriCevabi = z.output<typeof projeSiparisKalemleriCevabi>;
export type ProjeGuncelleVerisi = z.output<typeof projeGuncelleGovdesi>;
export type ProjeListesiSorgusu = z.input<typeof projeListesiSorgusu>;
export type ProjeListesiSuzgeci = z.output<typeof projeListesiSorgusu>;
export type Proje = z.output<typeof projeSemasi>;
export type ProjeListesiCevabi = z.output<typeof projeListesiCevabi>;
export type SiparisSecenekleriCevabi = z.output<typeof siparisSecenekleriCevabi>;
export type FirmaSecenekleriCevabi = z.output<typeof firmaSecenekleriCevabi>;
