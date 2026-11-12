import { z } from 'zod';
import { dosyaOzeti } from './dosya.ts';

// Mal kabulün irsaliye belgesi (3063; kararlar 3055 a+b, 3057 a, 3058 c, 3062 a): fotoğraflar istemcide tek PDF olur, `/dosyalar` ile
// yüklenir; Stok belgeyi Çizim ve Dosya Merkezi'nde "irsaliye" türünde açar ve mal kabule bağlar. Kaldırılan belge merkezde arşivde kalır.
const kimlik = z.coerce.number<number>().int().min(1).max(2147483647);

export const irsaliyeParametresi = z.object({ id: kimlik });
export const irsaliyeBelgeParametresi = z.object({ id: kimlik, belgeId: kimlik });

export const irsaliyeEkleGovdesi = z.object({
  ozet: dosyaOzeti,
  dosyaAdi: z.string().trim().min(1, 'Dosya adı zorunlu.').max(120),
}).strict();
export type IrsaliyeEkleGovdesi = z.input<typeof irsaliyeEkleGovdesi>;

export const irsaliyeBelgesi = z.object({ id: z.number().int(), ad: z.string() });
export type IrsaliyeBelgesi = z.output<typeof irsaliyeBelgesi>;

export const irsaliyeBelgeleriCevabi = z.object({ belgeler: z.array(irsaliyeBelgesi) });
export type IrsaliyeBelgeleriCevabi = z.output<typeof irsaliyeBelgeleriCevabi>;
