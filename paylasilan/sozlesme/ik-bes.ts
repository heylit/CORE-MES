import { z } from 'zod';
import { surumSemasi } from '../surum.ts';
import { tarihSemasi } from '../zaman.ts';
import { ikKimligi } from './ik.ts';

/* İK BES takibi (kart 1939): personelin Bireysel Emeklilik Sistemi'ne giriş ve çıkış hareketleri. Okuma `GET /ik/bes` (ik.oku,
   kişinin İK kapsamına göre süzülür); yazma `POST /ik/bes/hareket` ve `POST /ik/bes/hareket/:id/iptal` (ik.ucret-yaz).
   Durum son geçerli hareketten çıkar; hareket silinmez, iptal edilir. Zaman ve yazan sunucudan gelir. */

export const BES_GIRIS_TURLERI = ['otomatik_katilim', 'gonullu_katilim'] as const;
export const BES_CIKIS_TURLERI = ['cayma', 'ayrilma', 'isten_cikis'] as const;
export const BES_TURLERI = [...BES_GIRIS_TURLERI, ...BES_CIKIS_TURLERI] as const;
export type BesTuru = (typeof BES_TURLERI)[number];

const besHareketi = z.object({
  id: z.number().int().positive(),
  personel: ikKimligi,
  tur: z.enum(BES_TURLERI),
  tarih: tarihSemasi,
  // Yüzde; yalnız girişte. Yazılmamışsa null.
  oran: z.number().nullable(),
  sirket: z.string().nullable(),
  aciklama: z.string().nullable(),
  iptal: z.boolean(),
  surum: surumSemasi,
  yazan: z.string().nullable(),
});
export const ikBesCevabi = z.object({ hareketler: z.array(besHareketi) });

const bosMetin = (en: number) => z.string().trim().max(en).nullable().transform((a) => (a ? a : null));
export const ikBesHareketGirdisi = z.object({
  personel: ikKimligi,
  tur: z.enum(BES_TURLERI),
  tarih: tarihSemasi,
  oran: z.number().gt(0).max(100).multipleOf(0.01).nullable(),
  sirket: bosMetin(120),
  aciklama: bosMetin(300),
}).strict();
export const ikBesIptalGovdesi = z.object({ surum: surumSemasi }).strict();
export const ikBesIptalParametresi = z.object({ id: z.coerce.number<number>().int().positive() });
export const ikBesYazCevabi = z.object({ hareket: besHareketi });

export type IkBesHareketi = z.output<typeof besHareketi>;
export type IkBesCevabi = z.output<typeof ikBesCevabi>;
export type IkBesHareketGirdisi = z.input<typeof ikBesHareketGirdisi>;
export type IkBesYazCevabi = z.output<typeof ikBesYazCevabi>;
