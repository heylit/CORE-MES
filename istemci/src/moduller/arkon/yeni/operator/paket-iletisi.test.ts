import { describe, expect, it } from 'vitest';
import { paketIletisiYenilemeIster } from './kurallar.ts';

// 3777: başka istasyonun paket iletisinde terminal bütün paketleri yeniden çekmez; paket önceden bu istasyonunsa çeker.
describe('paket iletisinde liste yenileme', () => {
  const bilinen = { 'tmi-ie-1': { machine: 'ORN-M1' }, 'tmi-ie-2': { machine: 'ORN-M2' } };

  it('bu istasyonun paketi listeyi yeniler', () => {
    expect(paketIletisiYenilemeIster('ORN-M1', 'tmi-ie-9', 'ORN-M1', bilinen)).toBe(true);
  });

  it('başka istasyonun yeni paketi listeyi yenilemez', () => {
    expect(paketIletisiYenilemeIster('ORN-M2', 'tmi-ie-9', 'ORN-M1', bilinen)).toBe(false);
    expect(paketIletisiYenilemeIster('ORN-M3', 'tmi-ie-2', 'ORN-M1', bilinen)).toBe(false);
  });

  it('bu istasyondan başka makineye alınan paket listeyi yeniler (eski tablette asılı kalmaz)', () => {
    expect(paketIletisiYenilemeIster('ORN-M2', 'tmi-ie-1', 'ORN-M1', bilinen)).toBe(true);
  });

  it('makinesi olmayan ileti eskisi gibi listeyi yeniler', () => {
    expect(paketIletisiYenilemeIster(undefined, 'tmi-ie-9', 'ORN-M1', bilinen)).toBe(true);
  });
});
