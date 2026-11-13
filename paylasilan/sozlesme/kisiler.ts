import { z } from 'zod';
import { TOPLU_EN_COK_SATIR } from '../toplu.ts';
import { gizli } from '../gizli.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi } from '../zaman.ts';

const KIMLIK = z.number().int().positive().max(2147483647);

export const rolSemasi = z.object({
  id: KIMLIK,
  ad: z.string(),
  // null: "bütün işlemler" bayrağını görme yetkisi (kisiler.rol-yonet) yok.
  yonetici: z.boolean().nullable(),
});

export const kisiSemasi = z.object({
  id: KIMLIK,
  ad: z.string(),
  aktif: z.boolean(),
  girisVar: z.boolean(),
  // null: giriş hesabı yok ya da görme yetkisi (kisiler.rol-yonet) yok.
  kullaniciAdi: z.string().nullable(),
  pinVar: z.boolean(),
  sicilNo: z.string().nullable(),
  gorev: z.string().nullable(),
  roller: z.array(rolSemasi),
  surum: surumSemasi,
  // true: ad, sicil no ve görev İK personel kartından gelir, burada salt okunur (1302 a).
  ozlukIk: z.boolean(),
  // İK'daki çıkış tarihi (GGGG-AA-GG); yoksa null (1315).
  ozlukCikisTarihi: tarihSemasi.nullable(),
  // true: kişi tüm yetkileri veren role sahip, okuyan değil; kaydına düzenleme ve durum değişikliği yapamaz (sunucu da reddeder).
  korumali: z.boolean(),
  // Sınırlı hesap (kart 2158): yalnız okur, bitişten (son geçerli gün) sonra giremez; iç hesapta null. Sunucu hep gönderir; Personel
  // ekranı (2158 P4) gelene kadar istemci tarafında isteğe bağlıdır.
  sinirli: z.object({ bitis: tarihSemasi, sorumluId: KIMLIK, taahhut: z.boolean() }).nullable().optional(),
});

export const kisilerCevabi = z.object({ kisiler: z.array(kisiSemasi) });
// Ana sayfa kartı: listeyi taşımadan aktif kişilerden sicil no ya da görevi boş olanların sayısı.
export const eksikBilgiOzetiCevabi = z.object({ eksik: z.number().int(), sicilsiz: z.number().int(), gorevsiz: z.number().int() });
export const rollerCevabi = z.object({ roller: z.array(rolSemasi) });

// Yetki matrisi: rolün fiilen verdiği kayıtlı işlemler (bayraklı rol bütün kayıtlı işlemleri verir).
export const rolIslemleriSemasi = rolSemasi.extend({ islemler: z.array(z.string()) });
export const rolIslemleriCevabi = z.object({ islemler: z.array(z.string()), roller: z.array(rolIslemleriSemasi) });

// Kişiye ek işlem (kart #1233): rolden gelenler salt okunur, ek işlemler kişiye ayrıca verilmiştir; ikisinin birleşimi kişinin yetkisidir.
// devredilmez: kişiye ek verilemeyen işlemler (ekran onları kapalı gösterir).
export const kisiEkIslemleriSemasi = z.object({
  id: KIMLIK, ad: z.string(), kullaniciAdi: z.string(), bayrakli: z.boolean(), roldenGelen: z.array(z.string()), ek: z.array(z.string()),
  // Rolden geldiği hâlde bu kişiden alınan işlemler (kart 3166); kişinin yetkisi (roldenGelen + ek) eksi bunlardır.
  alinan: z.array(z.string()),
});
export const kisiEkIslemleriCevabi = z.object({
  islemler: z.array(z.string()), devredilmez: z.array(z.string()), kisiler: z.array(kisiEkIslemleriSemasi),
});

export const kisiParametresi = z.object({ id: z.coerce.number<number>().pipe(KIMLIK) });
export const rolParametresi = z.object({ id: z.coerce.number<number>().pipe(KIMLIK) });
// Hedef durumu söyler (ver ya da al): aynı komut ikinci kez gelirse sonuç değişmez, sürüm gerekmez.
export const rolIslemiGovdesi = z.object({ islem: z.string().max(100), verildi: z.boolean() });
// Hedef durumu söyler (al ya da geri ver); rolIslemiGovdesi gibi yinelenebilir.
export const kisiIslemKisitiGovdesi = z.object({ islem: z.string().max(100), alindi: z.boolean() });
// Kişi satırını ya da rollerini değiştiren her komut istemcinin okuduğu sürümü taşır; eskiyse 409.
export const surumGovdesi = z.object(beklenenSurum);
export const rolGovdesi = z.object({ ...beklenenSurum, rolId: KIMLIK });

export const kisiGovdesi = z.object({
  ad: z.string().max(200),
  sicilNo: z.string().max(200).nullish(),
  gorev: z.string().max(200).nullish(),
});

// Kişi ekleme sürüm taşımaz (kayıt yeni açılır); düzenleme taşır. Düzenleme kaydı bütünüyle yeniden yazar: gönderilmeyen alan
// boşaltılırdı, bu yüzden sicil no ve görev açıkça gelir (boşaltmak için null ya da boş metin).
export const kisiDuzenleGovdesi = z.object({
  ...beklenenSurum,
  ad: z.string().max(200),
  sicilNo: z.string().max(200).nullable(),
  gorev: z.string().max(200).nullable(),
});

// Excel ile toplu giriş (2627): satırlar tek işlemde yazılır, biri reddedilirse hiçbiri kalmaz. Ekleme tek kişi ekleme gövdesidir;
// güncellemede gönderilmeyen alan değişmez (boş Excel hücresi "dokunma" demektir), bu yüzden alanlar burada boş metin ya da null almaz.
// Rol, hesap, parola ve PIN toplu girişe girmez (yetki modeli; sayfada tek tek yapılır).
export const KISI_TOPLU_EN_COK = TOPLU_EN_COK_SATIR;
const kisiTopluSatirNo = z.number().int().min(1).max(1_048_576);
const kisiTopluMetin = z.string().trim().min(1).max(200);
export const kisiTopluSatiri = z.discriminatedUnion('islem', [
  z.object({ islem: z.literal('ekle'), satir: kisiTopluSatirNo, ...kisiGovdesi.shape }).strict(),
  z.object({
    islem: z.literal('guncelle'), satir: kisiTopluSatirNo, id: KIMLIK, ...beklenenSurum,
    ad: kisiTopluMetin.optional(), sicilNo: kisiTopluMetin.optional(), gorev: kisiTopluMetin.optional(),
  }).strict(),
]);
export const kisiTopluKaydetGovdesi = z.object({
  satirlar: z.array(kisiTopluSatiri).min(1).max(KISI_TOPLU_EN_COK)
    .refine((s) => { const id = s.flatMap((x) => (x.islem === 'guncelle' ? [x.id] : [])); return new Set(id).size === id.length; }, 'Aynı kişi dosyada iki kez var.')
    .refine((s) => new Set(s.map((x) => x.satir)).size === s.length, 'Satır numarası iki kez var.')
    // Sicil harf farksız tekildir (kisi_sicil_no_tek, lower()); dosyada iki kez gelen sicil veritabanına varmadan reddedilir. Yerel
    // olmayan küçültme: tr-TR 'I'yı 'ı' yapar, veritabanının lower()'ı 'i' yapar.
    .refine((s) => {
      const sicil = s.flatMap((x) => (typeof x.sicilNo === 'string' && x.sicilNo.trim() !== '' ? [x.sicilNo.trim().toLowerCase()] : []));
      return new Set(sicil).size === sicil.length;
    }, 'Aynı sicil numarası dosyada iki kez var.'),
}).strict();
export const kisiTopluKaydetCevabi = z.object({ eklenen: z.number().int().min(0), guncellenen: z.number().int().min(0) });

export const hesapGovdesi = z.object({
  ...beklenenSurum,
  kullaniciAdi: z.string().max(80),
  parola: gizli(z.string().max(200)),
  rolId: KIMLIK,
});

// Sınırlı hesap aç ya da uzat: bitiş en çok 90 gün sonrası (2158-5 a), sorumlu aktif iç hesap.
export const sinirliHesapGovdesi = z.object({ ...beklenenSurum, bitis: tarihSemasi, sorumluId: KIMLIK });

export const parolaGovdesi = z.object({ ...beklenenSurum, yeniParola: gizli(z.string().max(200)) });
// Verilen PIN geçicidir: kişi ilk girişte kendi PIN'ini belirler.
export const pinVerGovdesi = z.object({ ...beklenenSurum, pin: gizli(z.string().max(20)) });
export const tamamCevabi = z.object({ tamam: z.literal(true) });

export type RolOzeti = z.output<typeof rolSemasi>;
export type KisiOzeti = z.output<typeof kisiSemasi>;
export type PersonelCevabi = z.output<typeof kisilerCevabi>;
export type EksikBilgiOzetiCevabi = z.output<typeof eksikBilgiOzetiCevabi>;
// Başka modülün okuduğu görünüm: sürüm yalnız Personel ekranının komutları içindir, okuyan modül onu taşımak zorunda değildir.
export type KisilerCevabi = { kisiler: Omit<KisiOzeti, 'surum'>[] };
export type RollerCevabi = z.output<typeof rollerCevabi>;
export type RolIslemleriCevabi = z.output<typeof rolIslemleriCevabi>;
export type RolGovdesi = z.input<typeof rolGovdesi>;
export type RolIslemiGovdesi = z.input<typeof rolIslemiGovdesi>;
export type KisiEkIslemleriCevabi = z.output<typeof kisiEkIslemleriCevabi>;
export type KisiEkIslemleri = z.output<typeof kisiEkIslemleriSemasi>;
export type KisiGovdesi = z.input<typeof kisiGovdesi>;
export type KisiDuzenleGovdesi = z.input<typeof kisiDuzenleGovdesi>;
export type SurumGovdesi = z.input<typeof surumGovdesi>;
export type HesapGovdesi = z.input<typeof hesapGovdesi>;
export type ParolaGovdesi = z.input<typeof parolaGovdesi>;
export type PinVerGovdesi = z.input<typeof pinVerGovdesi>;
export type SinirliHesapGovdesi = z.input<typeof sinirliHesapGovdesi>;
export type KisiTopluSatiri = z.input<typeof kisiTopluSatiri>;
export type KisiTopluKaydetGirdisi = z.output<typeof kisiTopluKaydetGovdesi>;
export type KisiTopluKaydetCevabi = z.output<typeof kisiTopluKaydetCevabi>;

// Ortak seçicinin (KisiSecici) arama ucu (kart #1320): adda ya da sicil no'da arar; sayfa başına KISI_SECIM_SAYFA_BOYU kişi.
// Cevap ortak seçici biçimindedir: `kod` sicil no'dur (yoksa boş), `ust` yok. Varsayılan yalnız aktif kişiler.
export const KISI_SECIM_SAYFA_BOYU = 30;
export const kisiSecimSorgusu = z.object({
  q: z.string().trim().max(80).prefault(''),
  pasifler: z.enum(['true', 'false']).optional().transform((d) => d === 'true'),
  sayfa: z.coerce.number<number>().int().min(1).max(1000).prefault(1),
});
export const kisiSecimCevabi = z.object({
  sonuclar: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string(), aktif: z.boolean(), ust: z.null() })),
  dahaVar: z.boolean(),
});
export type KisiSecimSorgusu = z.input<typeof kisiSecimSorgusu>;
export type KisiSecimCevabi = z.output<typeof kisiSecimCevabi>;
