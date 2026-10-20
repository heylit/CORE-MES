import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tesisGruplari, tmiListesiSaltOkunur } from '../../../arkon/web/src/data/tmi-listeleri.ts';

// Kullanıcı kararı (soru 51/52 b): Arkon Ayarlar'da hazırlık duruş ve hurda nedenleri ile tesisi salt okunur görür; düzenleme TMI'de.
describe('Arkon Ayarlar: TMI listeleri salt okunur', () => {
  it('yalnız sunucuya bağlıyken, hazırlık görebiliyorsa ve düzenleyemiyorsa salt okunur liste açılır', () => {
    assert.equal(tmiListesiSaltOkunur(true, true, false), true);
    assert.equal(tmiListesiSaltOkunur(true, true, true), false);
    assert.equal(tmiListesiSaltOkunur(true, false, false), false);
    assert.equal(tmiListesiSaltOkunur(false, true, false), false);
  });

  it('tesis iş merkezi, istasyon ve makine olarak gruplanır; merkezsiz istasyon sonda ayrı grupta', () => {
    const gruplar = tesisGruplari({
      wcs: [{ id: 'TAL', name: 'Talaşlı' }, { id: 'MON', name: 'Montaj' }],
      sts: [{ id: 'TZG-01', wc: 'TAL' }, { id: 'X-01', wc: 'YOK' }],
      mcs: [{ id: 'M-1', st: 'TZG-01' }, { id: 'M-2', st: 'TZG-01', active: false }, { id: 'M-3', st: 'X-01' }],
    });
    assert.deepEqual(gruplar.map((g) => [g.merkez?.id ?? null, g.istasyonlar.map((i) => [i.istasyon.id, i.makineler.map((m) => m.id)])]), [
      ['TAL', [['TZG-01', ['M-1', 'M-2']]]],
      ['MON', []],
      [null, [['X-01', ['M-3']]]],
    ]);
  });
});
