import { describe, expect, it } from 'vitest';
import { kayitGecerli, tabletIstasyonu } from './tesis.ts';
import type { Plant } from './tipler.ts';

// 3568: istasyon yönetimi olmayan kişide cihaz kaydı yalnız kendi istasyonuysa geçerlidir. İstasyon kodları uydurmadır.
const TESIS: Plant = {
  wcs: [{ id: 'ORN-TAL', name: 'ORN talaşlı' }, { id: 'ORN-DEP', name: 'ORN depo' }],
  sts: [{ id: 'ORN-TAL-1', name: 'ORN tezgah', wc: 'ORN-TAL', t: 'cnc' }, { id: 'ORN-DEPO-1', name: 'ORN depo', wc: 'ORN-DEP', t: 'depo' }],
  mcs: [],
} as unknown as Plant;
const DEPOCU = { st: 'ORN-DEPO-1', sts: ['ORN-DEPO-1'] };

describe('tabletin istasyonu (3568)', () => {
  it('yönetimsiz kişide başka istasyonun kaydı atlanır, kişinin istasyonu açılır', () => {
    expect(tabletIstasyonu(TESIS, 'ORN-TAL-1', DEPOCU, false)).toBe('ORN-DEPO-1');
    expect(kayitGecerli('ORN-TAL-1', DEPOCU, false)).toBe(false);
  });

  it('yönetimsiz kişide kendi istasyonunun kaydı kullanılır (atanan dışındaki yetkili istasyon da)', () => {
    expect(tabletIstasyonu(TESIS, 'ORN-TAL-1', { st: 'ORN-DEPO-1', sts: ['ORN-DEPO-1', 'ORN-TAL-1'] }, false)).toBe('ORN-TAL-1');
    expect(tabletIstasyonu(TESIS, 'ORN-DEPO-1', DEPOCU, false)).toBe('ORN-DEPO-1');
  });

  it('istasyon yönetimi olan kişide kayıt bugünkü gibi önce gelir', () => {
    expect(tabletIstasyonu(TESIS, 'ORN-TAL-1', DEPOCU, true)).toBe('ORN-TAL-1');
    expect(tabletIstasyonu(TESIS, 'ORN-TAL-1', DEPOCU)).toBe('ORN-TAL-1');
  });

  it('hiç istasyonu olmayan kişide ortak tabletin kaydı geçerli kalır', () => {
    expect(tabletIstasyonu(TESIS, 'ORN-TAL-1', { st: null, sts: [] }, false)).toBe('ORN-TAL-1');
    expect(tabletIstasyonu(TESIS, 'ORN-TAL-1', null, false)).toBe('ORN-TAL-1');
  });
});
