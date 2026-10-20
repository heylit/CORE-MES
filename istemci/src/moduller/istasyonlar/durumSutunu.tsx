import { Rozet } from '../../ortak/arayuz/index.ts';
import type { Sutun } from '../../ortak/arayuz/index.ts';

export const durumSutunu = <S extends { aktif: boolean }>(): Sutun<S> => ({
  anahtar: 'durum',
  baslik: 'Durum',
  hucre: (s) => <Rozet ton={s.aktif ? 'tamam' : 'pasif'}>{s.aktif ? 'Aktif' : 'Pasif'}</Rozet>,
});
