import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { eskiOkumalariSil } from './servis.ts';

// 2158-4 a: sınırlı hesabın okuma kaydı 2 yıl saklanır; süresi dolan satır günde bir silinir.
export const isler = [
  isTanimi({
    ad: 'denetim-okuma-saklama',
    aralikMs: 86_400_000,
    calis: async (db) => { await eskiOkumalariSil(db); },
  }),
];
