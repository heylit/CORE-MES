import { z } from 'zod';
import { listeCevapSemasi, listeSorguAlanlari } from '../liste.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';
import { DOSYA_TURLERI, dosyaOzeti } from './dosya.ts';

// Çizim ve Dosya Merkezi (kart #708): belge kartı, revizyonları ve başka modüllerin kayıtlarına bağı. İçerik `dosya`
// modülünde durur (ADR 0009); merkez dosyayı revizyona bağlar ve kendi okuma ucundan verir.

export const BELGE_TURLERI = ['teknik-resim', '3b-model', 'fotograf', 'makine', 'sertifika', 'rapor', 'kroki', 'diger'] as const;
export type BelgeTuru = (typeof BELGE_TURLERI)[number];

export const REVIZYON_DURUMLARI = ['taslak', 'yayinda', 'eski'] as const;
export type RevizyonDurumu = (typeof REVIZYON_DURUMLARI)[number];

// Belgenin bağlanabildiği kayıt sahipleri; hedef kimliği o modülün sayı kimliğidir (malzemelerde kart no). Merkez bu modülleri
// ithal etmez (onlar merkezi ithal eder, ADR 0006): kimliğin varlığı bağlamada yabancı anahtarla denetlenir (UYUM-BORCU).
export const BAG_MODULLERI = ['malzemeler', 'istasyonlar', 'atolye', 'arkon', 'kalibrasyon', 'rota', 'uretim-emirleri', 'stok', 'satin-alma', 'cnc-kurulum'] as const;
export type BagModulu = (typeof BAG_MODULLERI)[number];

const zorunluMetin = (ileti: string, azami: number) => z.string().trim().min(1, ileti).max(azami);
// Boş ya da yalnız boşluk "yok" demektir; boş dizgi saklanmaz.
const istege = (azami: number) =>
  z.string().max(azami).nullish().transform((m) => {
    const kirpik = m?.trim();
    return kirpik ? kirpik : null;
  });

export const idParametresi = z.object({ id: z.coerce.number().int().positive() });
export const revizyonParametresi = z.object({ id: z.coerce.number().int().positive(), revizyonId: z.coerce.number().int().positive() });

// Revizyonun önizleme kareleri: tarayıcı üretir (3B modelde dönen 8 kare, PDF ve fotoda tek kare), dosya deposuna yükler,
// özetlerini sırayla bildirir.
export const ONIZLEME_SINIRLARI = { azamiKare: 16, kareBayt: 64 * 1024, toplamBayt: 512 * 1024 } as const;
export const onizlemeKareParametresi = z.object({
  id: z.coerce.number().int().positive(),
  revizyonId: z.coerce.number().int().positive(),
  kare: z.coerce.number().int().min(0).max(ONIZLEME_SINIRLARI.azamiKare - 1),
});
export const onizlemeGovdesi = z.object({
  kareler: z.array(z.object({ kare: z.number().int().min(0).max(ONIZLEME_SINIRLARI.azamiKare - 1), ozet: dosyaOzeti })).min(1).max(ONIZLEME_SINIRLARI.azamiKare),
});

export const belgeListesiSorgusu = z.object({
  ...listeSorguAlanlari(['ad', 'guncellendi']),
  ara: z.string().trim().max(80).optional(),
  tur: z.enum(BELGE_TURLERI).optional(),
  // 3B listesinin iki sekmesi: makine, bir istasyona (makineye) bağlı belge; malzeme, istasyona bağlı olmayan belge (bağsız dahil).
  makine: z.enum(['evet', 'hayir']).optional(),
  // Arşivdekiler ayrı görünümdür; varsayılan liste etkin belgelerdir.
  arsiv: z.enum(['evet', 'hayir']).default('hayir'),
});

// İlk revizyonun dosyası: istemci önce `/dosyalar/:ozet/parca` ile yükler, sonra özeti burada bağlatır.
const dosyaGirdisi = {
  ozet: dosyaOzeti,
  dosyaAdi: zorunluMetin('Dosya adı zorunlu.', 120),
  not: istege(300),
  // Antetteki revizyon (`00`, `A`); boşsa malzeme eşleşmesinde merkezin harfi kullanılır.
  antetRev: istege(20),
};
// Belgenin teknik resim numarası: malzeme kartındaki "Teknik resim no" ile karşılaştırılır.
const resimNo = istege(60);

export const belgeOlusturGovdesi = z.object({
  ad: zorunluMetin('Belge adı zorunlu.', 120),
  tur: z.enum(BELGE_TURLERI),
  aciklama: istege(500),
  resimNo,
  ...dosyaGirdisi,
});
export const belgeGuncelleGovdesi = z.object({ ad: zorunluMetin('Belge adı zorunlu.', 120), aciklama: istege(500), resimNo, ...beklenenSurum });
export const revizyonEkleGovdesi = z.object({ ...dosyaGirdisi, ...beklenenSurum });
export const surumGovdesi = z.object({ ...beklenenSurum });
export const bagGovdesi = z.object({ hedefModul: z.enum(BAG_MODULLERI), hedefId: z.number().int().positive(), ...beklenenSurum });

export const belgeSatiri = z.object({
  id: z.number().int(),
  ad: z.string(),
  tur: z.enum(BELGE_TURLERI),
  aktif: z.boolean(),
  // Yayındaki revizyon yoksa (yalnız taslak) null.
  yayindakiHarf: z.string().nullable(),
  sonHarf: z.string(),
  dosyaTuru: z.enum(DOSYA_TURLERI),
  bagSayisi: z.number().int().min(0),
  guncellendi: zamanSemasi,
  surum: surumSemasi,
});

export const revizyonSemasi = z.object({
  id: z.number().int(),
  sira: z.number().int().min(1),
  harf: z.string(),
  durum: z.enum(REVIZYON_DURUMLARI),
  ozet: dosyaOzeti,
  dosyaAdi: z.string(),
  dosyaTuru: z.enum(DOSYA_TURLERI),
  boyut: z.number().int().positive(),
  not: z.string().nullable(),
  yukleyenAd: z.string().nullable(),
  yuklendi: zamanSemasi,
  yayinlayanAd: z.string().nullable(),
  yayinlandi: zamanSemasi.nullable(),
  onizlemeKareSayisi: z.number().int().min(0),
  antetRev: z.string().nullable(),
});

export const bagSemasi = z.object({
  hedefModul: z.enum(BAG_MODULLERI),
  hedefId: z.number().int(),
  // Kaydın okunur adı (malzemede stok kodu ve adı, makinede istasyon adı); sahibi adı vermeyen ya da silinmiş kayıtta null, ekran kimliği yazar.
  hedefAdi: z.string().nullable(),
  ekleyenAd: z.string().nullable(),
  eklendi: zamanSemasi,
  kapak: z.boolean(),
});

export const belgeAyrintisi = z.object({
  id: z.number().int(),
  ad: z.string(),
  tur: z.enum(BELGE_TURLERI),
  aciklama: z.string().nullable(),
  resimNo: z.string().nullable(),
  aktif: z.boolean(),
  olusturanAd: z.string().nullable(),
  olusturuldu: zamanSemasi,
  guncellendi: zamanSemasi,
  surum: surumSemasi,
  revizyonlar: z.array(revizyonSemasi),
  baglar: z.array(bagSemasi),
});

export const belgeListesiCevabi = listeCevapSemasi(belgeSatiri);

// "Malzeme kartına bağla" seçicisi: stok kodu, ad ya da kart no ile aranır; yalnız aktif kartlar döner.
export const malzemeSecimiSorgusu = z.object({ ara: z.string().trim().max(80).default('') });
export const malzemeSecimiCevabi = z.object({
  malzemeler: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string().nullable(), birim: z.string().nullable() })),
});

/* ---------------- Malzeme kartından yükleme ve küçük resim (kart #688) ---------------- */

// Malzeme kartından açılan belge türleri. Foto doğrudan yayına girer; teknik resim ve 3B model taslak girer, yayını merkez yapar
// (yayındaki çizim atölyeye gider).
export const MALZEME_BELGE_TURLERI = ['fotograf', 'teknik-resim', '3b-model'] as const;
export type MalzemeBelgeTuru = (typeof MALZEME_BELGE_TURLERI)[number];

export const malzemeParametresi = z.object({ no: z.coerce.number().int().positive() });
export const malzemeBelgeParametresi = z.object({ no: z.coerce.number().int().positive(), id: z.coerce.number().int().positive() });
export const malzemeRevizyonParametresi = z.object({
  no: z.coerce.number().int().positive(), id: z.coerce.number().int().positive(), revizyonId: z.coerce.number().int().positive(),
});

export const malzemeBelgeEkleGovdesi = z.object({
  ad: zorunluMetin('Belge adı zorunlu.', 120),
  tur: z.enum(MALZEME_BELGE_TURLERI),
  resimNo,
  ...dosyaGirdisi,
});
export const malzemeRevizyonEkleGovdesi = z.object({ ...dosyaGirdisi, ...beklenenSurum });
// Kapak ve öneriden bağlama belgenin beklenen sürümüyle yapılır.
export const malzemeBelgeSurumGovdesi = z.object({ ...beklenenSurum });

// Listelerin küçük resmi: kayıt başına seçilmiş revizyon ve kare sayısı. revUyumu: true kartın revizyonuna uyuyor, false uymuyor
// (resim yine gösterilir, uyarıyla), null karşılaştırılacak bilgi yok.
export const kucukResim = z.object({
  hedefId: z.number().int(),
  belgeId: z.number().int(),
  revizyonId: z.number().int(),
  harf: z.string(),
  kareSayisi: z.number().int().min(1),
  revUyumu: z.boolean().nullable(),
});

export const malzemeBelgesi = z.object({
  id: z.number().int(),
  ad: z.string(),
  tur: z.enum(BELGE_TURLERI),
  resimNo: z.string().nullable(),
  surum: surumSemasi,
  kapak: z.boolean(),
  revizyonlar: z.array(revizyonSemasi),
});
export const malzemeBelgeleriCevabi = z.object({
  belgeler: z.array(malzemeBelgesi),
  // Kartın "Teknik resim no"suna uyan ama bu karta bağlı olmayan etkin belgeler (bağlama önerisi).
  oneriler: z.array(z.object({ id: z.number().int(), ad: z.string(), tur: z.enum(BELGE_TURLERI), surum: surumSemasi })),
  // Kart başına seçilen küçük resim; yoksa null.
  kucukResim: kucukResim.nullable(),
});

export const KUCUK_RESIM_AZAMI_KAYIT = 200;
export const kucukResimSorgusu = z.object({
  hedefModul: z.enum(BAG_MODULLERI),
  // Virgülle ayrılmış kimlikler: `?idler=3,7,12`.
  idler: z.string().trim().min(1).max(2000).transform((m, ctx) => {
    const idler = [...new Set(m.split(',').map((p) => Number(p.trim())))];
    if (idler.length > KUCUK_RESIM_AZAMI_KAYIT || idler.some((n) => !Number.isSafeInteger(n) || n < 1)) {
      ctx.addIssue({ code: 'custom', message: `En çok ${KUCUK_RESIM_AZAMI_KAYIT} pozitif kimlik.` });
      return z.NEVER;
    }
    return idler;
  }),
});
export const kucukResimlerCevabi = z.object({ resimler: z.array(kucukResim) });
export const kucukResimKareParametresi = z.object({
  revizyonId: z.coerce.number().int().positive(),
  kare: z.coerce.number().int().min(0).max(ONIZLEME_SINIRLARI.azamiKare - 1),
});

export type MalzemeBelgeEkleGovdesi = z.input<typeof malzemeBelgeEkleGovdesi>;
export type MalzemeRevizyonEkleGovdesi = z.input<typeof malzemeRevizyonEkleGovdesi>;
export type MalzemeBelgesi = z.output<typeof malzemeBelgesi>;
export type MalzemeBelgeleriCevabi = z.output<typeof malzemeBelgeleriCevabi>;
export type KucukResim = z.output<typeof kucukResim>;
export type KucukResimSorgusu = z.input<typeof kucukResimSorgusu>;
export type KucukResimlerCevabi = z.output<typeof kucukResimlerCevabi>;

export type BelgeListesiSorgusu = z.input<typeof belgeListesiSorgusu>;
export type BelgeListesiSuzgeci = z.output<typeof belgeListesiSorgusu>;
export type BelgeOlusturGovdesi = z.input<typeof belgeOlusturGovdesi>;
export type BelgeGuncelleGovdesi = z.input<typeof belgeGuncelleGovdesi>;
export type RevizyonEkleGovdesi = z.input<typeof revizyonEkleGovdesi>;
export type SurumGovdesi = z.input<typeof surumGovdesi>;
export type OnizlemeGovdesi = z.input<typeof onizlemeGovdesi>;
export type BagGovdesi = z.input<typeof bagGovdesi>;
export type BelgeSatiri = z.output<typeof belgeSatiri>;
export type Revizyon = z.output<typeof revizyonSemasi>;
export type Bag = z.output<typeof bagSemasi>;
export type BelgeAyrintisi = z.output<typeof belgeAyrintisi>;
export type BelgeListesiCevabi = z.output<typeof belgeListesiCevabi>;
export type MalzemeSecimiCevabi = z.output<typeof malzemeSecimiCevabi>;
