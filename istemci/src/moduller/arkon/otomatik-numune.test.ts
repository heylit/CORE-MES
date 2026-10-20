import { describe, expect, it } from 'vitest';
import { otomatikNumuneOlculeri } from '../../../../arkon/web/src/data/otomatik-numune.ts';

// Kullanıcı kararı 17.10: kalite reddedince ölçü kendiliğinden yeniden kaliteye gönderilmez; operatör nedeni görür, düzeltip kendisi gönderir.
const b = (id: number) => ({ id });

describe('otomatik numune', () => {
  it('yalnız retten sonra yeniden ölçülecek ölçü varsa kendiliğinden gitmez', () => {
    expect(otomatikNumuneOlculeri([b(1)], { 1: 'Tekrar ölçüm' })).toEqual([]);
  });
  it('zamanı gelen numune kendiliğinden gider', () => {
    expect(otomatikNumuneOlculeri([b(1), b(2)], { 1: 'Saatlik', 2: '50 parçada bir · 1. numune' })).toEqual([b(1), b(2)]);
  });
  it('zamanı gelen numuneye reddedilen ölçü katılmaz', () => {
    expect(otomatikNumuneOlculeri([b(1), b(2)], { 1: 'Tekrar ölçüm', 2: 'Saatlik' })).toEqual([b(2)]);
  });
  it('ret kararı ekrandayken zamanı gelen başka ölçü de kendiliğinden gitmez; operatör kendisi gönderir', () => {
    const ret = { status: 'rejected' };
    expect(otomatikNumuneOlculeri([b(1), b(2)], { 1: 'Tekrar ölçüm', 2: 'İlk parça' }, ret)).toEqual([]);
    expect(otomatikNumuneOlculeri([b(2)], { 2: 'Saatlik' }, ret)).toEqual([]);
  });
  it('onay ya da sapma kararından sonra ya da karar yokken zamanı gelen numune gider', () => {
    expect(otomatikNumuneOlculeri([b(2)], { 2: 'Saatlik' }, { status: 'approved' })).toEqual([b(2)]);
    expect(otomatikNumuneOlculeri([b(2)], { 2: 'Saatlik' }, { status: 'deviation' })).toEqual([b(2)]);
    expect(otomatikNumuneOlculeri([b(2)], { 2: 'Saatlik' }, null)).toEqual([b(2)]);
  });
});
