import { z } from 'zod';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { AKSIYON_DURUMLARI, GUNDEM_EN_COK, KATILIMCI_EN_COK, KONU_TURLERI, TOPLANTI_DURUMLARI, TOPLANTI_KAPSAMLARI, TOPLANTI_TURLERI } from './toplanti-sabitleri.ts';

// Toplantılar (3448, onay a): toplantı, katılımcılar, gündem, kararlar ve aksiyonlar. Açma ve değiştirme `toplantilar.yaz`;
// düzenleyen ve katılımcı kendi toplantısını görür, bütün toplantıları `toplantilar.oku` görür (3448-2 a).

export {
  TOPLANTI_TURLERI, TOPLANTI_TUR_ADLARI, TOPLANTI_DURUMLARI, TOPLANTI_DURUM_ADLARI, KONU_TURLERI, KONU_TUR_ADLARI, AKSIYON_DURUMLARI, AKSIYON_DURUM_ADLARI, TOPLANTI_KAPSAMLARI, KATILIMCI_EN_COK, GUNDEM_EN_COK,
} from './toplanti-sabitleri.ts';
export type { ToplantiTuru, ToplantiDurumu, KonuTuru, AksiyonDurumu, ToplantiKapsami } from './toplanti-sabitleri.ts';

const KIMLIK = z.number().int().positive().max(2147483647);
const kimlikParametresi = z.coerce.number<number>().int().positive().max(2147483647);
export const toplantiParametresi = z.object({ id: kimlikParametresi });
export const aksiyonParametresi = z.object({ id: kimlikParametresi, aksiyonId: kimlikParametresi });

const zorunluMetin = (en: number, bos: string) => z.string().trim().min(1, bos).max(en, `En çok ${String(en)} karakter olur.`);
const istegeBagli = (en: number) => z.preprocess(
  (d) => (typeof d === 'string' && d.trim() === '' ? null : d),
  z.string().trim().max(en, `En çok ${String(en)} karakter olur.`).nullable().prefault(null),
);

const konuGovdesi = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('serbest') }),
  z.object({ tur: z.enum(['proje', 'uretim-emri', 'firma']), id: KIMLIK }),
]);
export type KonuGovdesi = z.output<typeof konuGovdesi>;

const katilimciGovdesi = z.object({ kisiId: KIMLIK, zorunlu: z.boolean() });

const toplantiAlanlari = {
  baslik: zorunluMetin(200, 'Başlık zorunlu.'),
  tur: z.enum(TOPLANTI_TURLERI),
  baslangic: zamanSemasi,
  bitis: zamanSemasi,
  yer: istegeBagli(120),
  konu: konuGovdesi,
  katilimcilar: z.array(katilimciGovdesi).max(KATILIMCI_EN_COK, `En çok ${String(KATILIMCI_EN_COK)} katılımcı olur.`)
    .refine((l) => new Set(l.map((k) => k.kisiId)).size === l.length, 'Aynı kişi iki kez eklenemez.'),
  gundem: z.array(zorunluMetin(300, 'Gündem maddesi boş olamaz.')).max(GUNDEM_EN_COK, `En çok ${String(GUNDEM_EN_COK)} gündem maddesi olur.`),
  // E-posta kanalı sistemde kapalıysa yok sayılır (ADR 0015 md 5).
  epostaGonder: z.boolean().prefault(true),
};
const sureDogru = (g: { baslangic: string; bitis: string }) => Date.parse(g.bitis) > Date.parse(g.baslangic);
const SURE_HATASI = { message: 'Bitiş başlangıçtan sonra olmalı.', path: ['bitis'] };
export const toplantiAcGovdesi = z.object(toplantiAlanlari).refine(sureDogru, SURE_HATASI);
export const toplantiDegistirGovdesi = z.object({ ...toplantiAlanlari, ...beklenenSurum }).refine(sureDogru, SURE_HATASI);
export const toplantiIptalGovdesi = z.object({ neden: zorunluMetin(300, 'İptal nedeni zorunlu.'), ...beklenenSurum });
export const toplantiYapildiGovdesi = z.object({ ...beklenenSurum });
export const kararEkleGovdesi = z.object({ metin: zorunluMetin(1000, 'Karar boş olamaz.') });
export const aksiyonEkleGovdesi = z.object({ metin: zorunluMetin(200, 'Aksiyon boş olamaz.'), sorumluKisiId: KIMLIK, sonTarih: tarihSemasi });
export const aksiyonDurumGovdesi = z.object({ durum: z.enum(AKSIYON_DURUMLARI), ...beklenenSurum });
export const aksiyonGorevGovdesi = z.object({ ...beklenenSurum });

export const toplantiListeSorgusu = z.object({ kapsam: z.enum(TOPLANTI_KAPSAMLARI).prefault('yaklasan') });
export const konuAramaSorgusu = z.object({
  tur: z.enum(['proje', 'uretim-emri', 'firma']),
  q: z.string().trim().max(60).prefault(''),
});

const kisiSemasi = z.object({ id: z.number().int(), ad: z.string() });
export const konuSemasi = z.object({
  tur: z.enum(['proje', 'uretim-emri', 'firma']),
  id: z.number().int(),
  // Belge numarası ya da kodu (proje kodu, emir no, firma kodu); kodu olmayan firmada null.
  no: z.string().nullable(),
  ad: z.string().nullable(),
  durum: z.string().nullable(),
  // Emrin teslim tarihi; öteki konularda null.
  tarih: tarihSemasi.nullable(),
});
export type ToplantiKonusu = z.output<typeof konuSemasi>;

export const toplantiOzetiSemasi = z.object({
  id: z.number().int(),
  baslik: z.string(),
  tur: z.enum(TOPLANTI_TURLERI),
  baslangic: zamanSemasi,
  bitis: zamanSemasi,
  yer: z.string().nullable(),
  durum: z.enum(TOPLANTI_DURUMLARI),
  duzenleyen: kisiSemasi,
  konuTuru: z.enum(KONU_TURLERI),
  katilimciSayisi: z.number().int().nonnegative(),
  acikAksiyon: z.number().int().nonnegative(),
});
export type ToplantiOzeti = z.output<typeof toplantiOzetiSemasi>;
// izinler: ekranın düğmeleri; eposta, davet e-postası şu an giderse true (seçenek yalnız o zaman görünür).
export const toplantiListesiCevabi = z.object({
  toplantilar: z.array(toplantiOzetiSemasi),
  izinler: z.object({ yaz: z.boolean(), eposta: z.boolean() }),
});
export type ToplantiListesiCevabi = z.output<typeof toplantiListesiCevabi>;

export const aksiyonSemasi = z.object({
  id: z.number().int(),
  metin: z.string(),
  sorumlu: kisiSemasi,
  sonTarih: tarihSemasi,
  durum: z.enum(AKSIYON_DURUMLARI),
  // Projeli toplantıda aksiyondan açılan proje görevi; yoksa null.
  gorev: z.object({ id: z.number().int(), durum: z.string() }).nullable(),
  surum: surumSemasi,
});
export type ToplantiAksiyonu = z.output<typeof aksiyonSemasi>;

export const toplantiSemasi = z.object({
  id: z.number().int(),
  baslik: z.string(),
  tur: z.enum(TOPLANTI_TURLERI),
  baslangic: zamanSemasi,
  bitis: zamanSemasi,
  yer: z.string().nullable(),
  durum: z.enum(TOPLANTI_DURUMLARI),
  iptalNedeni: z.string().nullable(),
  duzenleyen: kisiSemasi,
  konuTuru: z.enum(KONU_TURLERI),
  konu: konuSemasi.nullable(),
  katilimcilar: z.array(z.object({ kisiId: z.number().int(), ad: z.string(), zorunlu: z.boolean() })),
  gundem: z.array(z.string()),
  kararlar: z.array(z.object({ id: z.number().int(), metin: z.string(), yazan: kisiSemasi, yazildi: zamanSemasi })),
  aksiyonlar: z.array(aksiyonSemasi),
  // Okuyanın yapabildikleri (sunucu kararı; ekran düğmeyi buna göre gösterir). gorevAc: aksiyonu proje görevine çevirme (projeler.gorev-yaz).
  izinler: z.object({ yaz: z.boolean(), gorevAc: z.boolean() }),
  surum: surumSemasi,
});
export type Toplanti = z.output<typeof toplantiSemasi>;

export const konuAramaCevabi = z.object({
  sonuclar: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string(), aktif: z.boolean(), ust: z.null() })),
  dahaVar: z.boolean(),
});

export type ToplantiAcGovdesi = z.input<typeof toplantiAcGovdesi>;
export type ToplantiAcVerisi = z.output<typeof toplantiAcGovdesi>;
export type ToplantiDegistirGovdesi = z.input<typeof toplantiDegistirGovdesi>;
export type ToplantiDegistirVerisi = z.output<typeof toplantiDegistirGovdesi>;
export type ToplantiIptalGovdesi = z.input<typeof toplantiIptalGovdesi>;
export type KararEkleGovdesi = z.input<typeof kararEkleGovdesi>;
export type AksiyonEkleGovdesi = z.input<typeof aksiyonEkleGovdesi>;
export type AksiyonDurumGovdesi = z.input<typeof aksiyonDurumGovdesi>;
