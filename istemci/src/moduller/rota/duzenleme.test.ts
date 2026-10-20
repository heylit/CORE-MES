import { describe, expect, it } from 'vitest';
import { tipDegistir, yeniAdim } from './duzenleme.ts';

const TIP = { id: 1, kod: 'abkant', ad: 'Abkant büküm', kisaltma: 'ABK', grup: 'SKL' as const, grupAdi: 'Şekillendirme', aktif: true, varsayilanAyarDk: null, varsayilanBirimDk: null, kullanim: 0 };
const TORNA = { id: 2, ad: 'Torna (CNC)' };

describe('tipDegistir (demo 2.3)', () => {
  it('adım adı eski tipin adıysa yeni tipin adını alır', () => {
    const [a] = tipDegistir(10, TORNA, 'Abkant büküm')([{ ...yeniAdim(TIP), opNo: 10 }]);
    expect(a).toMatchObject({ operasyonTipiId: 2, ad: 'Torna (CNC)' });
  });

  it('elle değiştirilmiş ad korunur, yalnız tip değişir; başka adım değişmez', () => {
    const liste = [{ ...yeniAdim(TIP), opNo: 10, ad: 'Ön büküm' }, { ...yeniAdim(TIP), opNo: 20 }];
    const [a, b] = tipDegistir(10, TORNA, 'Abkant büküm')(liste);
    expect(a).toMatchObject({ operasyonTipiId: 2, ad: 'Ön büküm' });
    expect(b).toBe(liste[1]);
  });
});
