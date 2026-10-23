import { describe, expect, it, vi } from 'vitest';
import { KILIT_BETIGI } from './acilis.ts';

// 258 a, B16: kapanmış NCR ve DÖF, sonuçlanmış muayene ve kararı verilmiş lot kabul kaydı sunucuda kilitlidir; uygulamanın "kilidi aç" yolu sunucuda 409 alacağı için açılmaz.
describe('Kalite Merkezi kilitli kayıt', () => {
  function kur() {
    const asil = vi.fn();
    const toast = vi.fn();
    const g: { guardEdit: (col: string, rec: unknown, cb: () => void) => unknown } = { guardEdit: asil };
    new Function('g', 'toast', `var guardEdit = g.guardEdit; ${KILIT_BETIGI}; g.guardEdit = guardEdit;`)(g, toast);
    return { g, asil, toast };
  }

  it('kapalı NCR ve DÖF, Kabul ya da Ret sonuçlu muayene ve kararlı lot kaydında kilit açılmaz, düzeltmenin yeni kayıtla yapılacağı söylenir', () => {
    for (const [col, rec] of [['ncr', { durum: 'Kapalı' }], ['ncr', { durum: ' Kapalı ' }], ['insp', { sonuc: 'Kabul' }], ['insp', { sonuc: 'Ret' }],
      ['capa', { durum: 'Kapalı' }], ['lot', { karar: 'Kabul' }], ['lot', { karar: 'Ret' }]] as const) {
      const { g, asil, toast } = kur();
      const cb = vi.fn();
      g.guardEdit(col, rec, cb);
      expect([asil.mock.calls.length, cb.mock.calls.length], `${col} ${JSON.stringify(rec)}`).toEqual([0, 0]);
      expect(toast).toHaveBeenCalledWith('Kapanmış uygunsuzluk ve DÖF, sonuçlanmış muayene ve lot kabul kaydı değiştirilemez; düzeltme yeni kayıtla yapılır.', 'bad');
    }
  });

  it('öteki kayıtlar uygulamanın kendi kilidine gider', () => {
    for (const [col, rec] of [['ncr', { durum: 'Açık' }], ['insp', { sonuc: 'Beklemede' }], ['capa', { durum: 'Açık' }], ['lot', { karar: '' }], ['lot', { tip: 'reset', karar: 'Kabul' }], ['ncr', null]] as const) {
      const { g, asil, toast } = kur();
      const cb = vi.fn();
      g.guardEdit(col, rec, cb);
      expect(asil).toHaveBeenCalledWith(col, rec, cb);
      expect(toast).not.toHaveBeenCalled();
    }
  });
});
