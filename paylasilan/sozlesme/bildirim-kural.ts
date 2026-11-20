import { z } from 'zod';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';
import type { BildirimTuru } from './bildirim.ts';

// 3478-3 a: sınırlı kural motoru. Kural = olay + basit koşul + alıcı + kanal + şablon. Tetik yalnız kodun yayınladığı olaydır;
// koşul yalnız olayın burada adı geçen alanlarına bakar (başka tablo, formül, VEYA yok). Alanı olmayan olay kurala açılmaz.
export const KURAL_ALAN_TIPLERI = ['sayi', 'metin', 'secim'] as const;
export type KuralAlanTipi = (typeof KURAL_ALAN_TIPLERI)[number];
export interface KuralAlani {
  ad: string;
  etiket: string;
  tip: KuralAlanTipi;
  // Para tutarı: koşulda kullanılır, şablona yazılamaz (alıcının fiyat görme yetkisi bilinmez).
  para?: true;
  secenekler?: readonly { deger: string; etiket: string }[];
}

const firma: KuralAlani = { ad: 'firma', etiket: 'Firma', tip: 'metin' };
const tutar: KuralAlani = { ad: 'tutar', etiket: 'Genel toplam', tip: 'sayi', para: true };
const paraBirimi: KuralAlani = { ad: 'para_birimi', etiket: 'Para birimi', tip: 'metin' };
const termineKalan: KuralAlani = { ad: 'termine_kalan_gun', etiket: 'Termine kalan gün', tip: 'sayi' };
const proje: KuralAlani = { ad: 'proje', etiket: 'Proje kodu', tip: 'metin' };

export const KURAL_ALANLARI = {
  'satin-alma.talep-onay-bekliyor': [
    { ad: 'oncelik', etiket: 'Öncelik', tip: 'secim', secenekler: [{ deger: 'dusuk', etiket: 'Düşük' }, { deger: 'normal', etiket: 'Normal' }, { deger: 'acil', etiket: 'Acil' }] },
    { ad: 'ihtiyaca_kalan_gun', etiket: 'İhtiyaca kalan gün', tip: 'sayi' },
  ],
  'siparisler.onay-bekliyor': [firma, tutar, paraBirimi, termineKalan],
  'siparisler.siparis-onaylandi': [firma, tutar, paraBirimi, termineKalan],
  'siparisler.iskonto-onay-bekliyor': [{ ad: 'iskonto_orani', etiket: 'İskonto oranı (%)', tip: 'sayi' }],
  'siparisler.termin-onay-bekliyor': [termineKalan],
  'istasyonlar.makine-durdu': [{ ad: 'makine', etiket: 'Makine kodu', tip: 'metin' }],
  'projeler.gorev-atandi': [proje],
  'projeler.gorev-kontrol-bekliyor': [proje],
  'malzemeler.kart-onay-bekliyor': [{ ad: 'stok_kodu', etiket: 'Stok kodu', tip: 'metin' }],
  'ik.izin-onay-bekliyor': [{ ad: 'izin_turu', etiket: 'İzin türü', tip: 'metin' }, { ad: 'gun', etiket: 'Gün sayısı', tip: 'sayi' }],
} as const satisfies Partial<Record<BildirimTuru, readonly KuralAlani[]>>;
export type KuralliTur = keyof typeof KURAL_ALANLARI;
export const KURALLI_TURLER = Object.keys(KURAL_ALANLARI) as [KuralliTur, ...KuralliTur[]];
export const kuralliTurMu = (tur: string): tur is KuralliTur => Object.hasOwn(KURAL_ALANLARI, tur);
export const kuralAlanlari = (tur: string): readonly KuralAlani[] => (kuralliTurMu(tur) ? KURAL_ALANLARI[tur] : []);

// Olayı yayan modülün verdiği değerler; tanımsız alan yok sayılır, değeri olmayan alana bakan koşul tutmaz.
export type KuralDegerleri = Readonly<Record<string, string | number | null>>;

export const KURAL_KARSILASTIRMALARI = ['=', '!=', '>', '>=', '<', '<=', 'icinde'] as const;
export type KuralKarsilastirmasi = (typeof KURAL_KARSILASTIRMALARI)[number];
export const KARSILASTIRMA_ADI: Record<KuralKarsilastirmasi, string> = {
  '=': 'eşit', '!=': 'eşit değil', '>': 'büyük', '>=': 'büyük ya da eşit', '<': 'küçük', '<=': 'küçük ya da eşit', icinde: 'şunlardan biri',
};
// Kural başına kişi başına günde en çok bu kadar bildirim: yanlış kurulan kural bildirim yağdırmasın.
export const KURAL_GUNLUK_EN_COK = 20;
export const KURAL_ON_IZLEME_GUN = 7;

export const kuralKosulu = z.object({
  alan: z.string().min(1).max(60),
  karsilastirma: z.enum(KURAL_KARSILASTIRMALARI),
  deger: z.union([z.number().finite(), z.string().trim().min(1).max(200), z.array(z.string().trim().min(1).max(200)).min(1).max(50)]),
}).strict();
export type KuralKosulu = z.output<typeof kuralKosulu>;

const kuralAlanlariGovdesi = {
  ad: z.string().trim().min(1, 'Kural adı zorunlu.').max(80),
  acik: z.boolean(),
  kosullar: z.array(kuralKosulu).max(10),
  rolIdleri: z.array(z.number().int().positive()).max(50),
  kisiIdleri: z.array(z.number().int().positive()).max(100),
  ortada: z.boolean(),
  eposta: z.boolean(),
  telefon: z.boolean(),
  sablonBaslik: z.string().trim().min(1, 'Başlık zorunlu.').max(200),
  sablonMetin: z.string().trim().max(1000).nullable(),
};
export const bildirimKuralEkleGovdesi = z.object({ tur: z.enum(KURALLI_TURLER), ...kuralAlanlariGovdesi }).strict();
export type BildirimKuralEkleGovdesi = z.output<typeof bildirimKuralEkleGovdesi>;
export const bildirimKuralDegistirGovdesi = z.object({ ...kuralAlanlariGovdesi, ...beklenenSurum }).strict();
export type BildirimKuralDegistirGovdesi = z.output<typeof bildirimKuralDegistirGovdesi>;
export const bildirimKuralSilGovdesi = z.object(beklenenSurum).strict();
export const bildirimKuralParametresi = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
export const bildirimKuralSorgusu = z.object({ tur: z.enum(KURALLI_TURLER).optional() }).strict();

export const bildirimKuralSatiri = z.object({
  id: z.number().int(),
  tur: z.enum(KURALLI_TURLER),
  ad: z.string(),
  acik: z.boolean(),
  kosullar: z.array(kuralKosulu),
  rolIdleri: z.array(z.number().int()),
  kisiIdleri: z.array(z.number().int()),
  ortada: z.boolean(),
  eposta: z.boolean(),
  telefon: z.boolean(),
  sablonBaslik: z.string(),
  sablonMetin: z.string().nullable(),
  surum: surumSemasi,
  degisti: zamanSemasi,
  // Kuralın baktığı alan olaydan kalktıysa kural çalışmaz; neden burada yazar. Geçerli kuralda null.
  gecersiz: z.string().nullable(),
});
export type BildirimKuralSatiri = z.output<typeof bildirimKuralSatiri>;
export const bildirimKurallariCevabi = z.object({ kurallar: z.array(bildirimKuralSatiri) });
export type BildirimKurallariCevabi = z.output<typeof bildirimKurallariCevabi>;

export const bildirimKuralOnIzlemeCevabi = z.object({
  gun: z.number().int(),
  // Son günlerde bu olaydan kaç tane oldu, kaçı koşula uydu; uyanlarda kaç ayrı kişiye giderdi, kaç kişi olayı görme yetkisi
  // olmadığı için almazdı.
  olay: z.number().int(),
  uyan: z.number().int(),
  kisi: z.number().int(),
  yetkisiz: z.number().int(),
});
export type BildirimKuralOnIzlemeCevabi = z.output<typeof bildirimKuralOnIzlemeCevabi>;
