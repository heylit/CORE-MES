import { describe, expect, it } from 'vitest';
import { HURDA_NEDENI_YOK, hurdaNedeniYokIletisi } from '../../../../arkon/web/src/data/hurda-nedeni.ts';

// Kullanıcı kararı 116 a: hurda yalnız nedenle kaydedilir, "Nedensiz kaydet" yoktur.
describe('hurda nedeni', () => {
  it('neden listesi doluyken ileti yoktur; operatör nedene dokunarak kaydeder', () => {
    expect(hurdaNedeniYokIletisi([{ code: 'H-01' }])).toBeNull();
  });
  it('liste boşsa nedensiz kayıt açılmaz, operatöre nedenin tanımsız olduğu söylenir', () => {
    expect(hurdaNedeniYokIletisi([])).toBe(HURDA_NEDENI_YOK);
  });
});
