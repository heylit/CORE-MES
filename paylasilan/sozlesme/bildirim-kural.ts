import { z } from 'zod';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';

import { KURALLI_TURLER, KURAL_KARSILASTIRMALARI } from './bildirim-kural-sabitleri.ts';

// 3478-3 a: kural motorunun şemaları; sabitler zod'suz dosyadadır (istemci değer olarak oradan ithal eder).
export * from './bildirim-kural-sabitleri.ts';

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
