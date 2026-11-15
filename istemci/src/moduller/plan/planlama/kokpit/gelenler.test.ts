import { describe, expect, it } from 'vitest';
import { gelenler, gelenTonu } from './gelenler.ts';
import type { KokpitEmri } from './kurallar.ts';

const emir = (id: string, durum: KokpitEmri['durum'], termin: number | null): KokpitEmri =>
  ({ id, no: `ORN-${id}`, urun: 'ORN-Parça', adet: 10, termin, bitis: null, durum, gecikme: null, adimlar: [] });
const yaz = (t: number): string => `t${String(t)}`;

describe('Gelenler (3282)', () => {
  it('plansız emirler terminine göre önce, olaylar yeniden eskiye; planlı emir gelen değildir', () => {
    const l = gelenler([emir('1', 'iyi', 5), emir('2', 'plansiz', 40), emir('3', 'plansiz', 10), emir('4', 'plansiz', null)], [
      { neden: 'emir-iptal', zaman: '2026-10-20T08:00:00Z', uretimEmriId: 1, emirNo: 'ORN-1', makineId: null, makineKod: null },
      { neden: 'durus', zaman: '2026-10-20T09:00:00Z', uretimEmriId: null, emirNo: null, makineId: 4, makineKod: 'ORN-T01' },
    ], yaz);
    expect(l.map((g) => [g.tur, g.baslik, g.emirId])).toEqual([
      ['yeni', 'ORN-3', '3'], ['yeni', 'ORN-2', '2'], ['yeni', 'ORN-4', '4'], ['durus', 'ORN-T01', null], ['emir-iptal', 'ORN-1', '1'],
    ]);
    expect(l[0]?.metin).toBe('Plansız. 10 adet, teslim t10.');
    expect(l[2]?.metin).toBe('Plansız. 10 adet.');
    expect(l[3]?.metin).toMatch(/^ORN-T01: Tezgâh arızada/);
  });

  it('Kokpit\'te olmayan emrin olayı seçilemez (emirId null); boş girdi boş listedir', () => {
    expect(gelenler([], [{ neden: 'emir-bitti', zaman: '2026-10-20T08:00:00Z', uretimEmriId: 9, emirNo: 'ORN-9', makineId: null, makineKod: null }], yaz)[0]?.emirId).toBeNull();
    expect(gelenler([], [], yaz)).toEqual([]);
  });

  it('ton: duruş hata, plansız ve satın alma termini uyarı, öteki olaylar bilgi', () => {
    expect([gelenTonu('durus'), gelenTonu('yeni'), gelenTonu('satin-alma-termini'), gelenTonu('rota-degisti')]).toEqual(['hata', 'uyari', 'uyari', 'bilgi']);
  });
});
