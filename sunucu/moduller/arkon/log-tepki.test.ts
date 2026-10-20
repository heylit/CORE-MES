import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { kayitIlgili, seyrelt } from '../../../arkon/web/src/data/log-tepki.ts';

describe('kayıt olayına tepki', () => {
  it('ekranın okumadığı türdeki kayıt yeniden yükleme istemez', () => {
    assert.equal(kayitIlgili('meas', null, ['events', 'counts'], 'M1'), false);
    assert.equal(kayitIlgili('counts', null, ['events', 'counts'], 'M1'), true);
  });

  it('başka makinenin yerel kaydı yükleme istemez; makinesi bilinmeyen sunucu olayı ister', () => {
    assert.equal(kayitIlgili('events', { machine: 'M2' }, ['events'], 'M1'), false);
    assert.equal(kayitIlgili('events', { machine: 'M1' }, ['events'], 'M1'), true);
    assert.equal(kayitIlgili('events', null, ['events'], 'M1'), true);
    assert.equal(kayitIlgili('events', { machine: 'M2' }, ['events'], null), true);
  });

  it('aynı pencerede gelen çok olay tek yükleme yapar, gecikme aynı kalır', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const yukle = mock.fn();
      const s = seyrelt(yukle, 250);
      for (let i = 0; i < 40; i += 1) s.tetikle();
      mock.timers.tick(249);
      assert.equal(yukle.mock.callCount(), 0);
      mock.timers.tick(1);
      assert.equal(yukle.mock.callCount(), 1);
      s.tetikle();
      mock.timers.tick(250);
      assert.equal(yukle.mock.callCount(), 2);
    } finally { mock.timers.reset(); }
  });

  it('bırakılınca bekleyen yükleme koşmaz', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const yukle = mock.fn();
      const s = seyrelt(yukle, 250);
      s.tetikle();
      s.birak();
      mock.timers.tick(500);
      assert.equal(yukle.mock.callCount(), 0);
    } finally { mock.timers.reset(); }
  });
});
