import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MakineDurumu, SurumluMakine } from '#paylasilan/sozlesme/istasyonlar.ts';
import { MakineEtiketi } from './GenelBakis.tsx';

const makine = { id: 1, kod: 'M-1', ad: 'Makine' } as SurumluMakine;
const durum = (d: MakineDurumu['durum']) => ({ makineId: 1, durum: d, aciklama: null }) as MakineDurumu;
const isik = (d: MakineDurumu | undefined) => render(<MakineEtiketi makine={makine} durum={d} />).container.querySelector('.tc-ist-led');

describe('genel bakis makine etiketi (kart 1929)', () => {
  it('isik makinenin durumunu tasir; durum satiri yoksa girilmemis, calisir sayilmaz', () => {
    expect(isik(undefined)?.getAttribute('data-durum')).toBe('girilmemis');
    expect(isik(durum('ariza'))?.getAttribute('data-durum')).toBe('ariza');
    expect(isik(durum('bakim'))?.getAttribute('data-durum')).toBe('bakim');
    expect(isik(durum('calisir'))?.getAttribute('data-durum')).toBe('calisir');
  });
});
