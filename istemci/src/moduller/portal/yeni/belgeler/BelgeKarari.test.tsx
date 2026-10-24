import { describe, expect, it } from 'vitest';
import { SIMDI } from '../ornek-veri.ts';
import { kararKaydi } from './BelgeKarari.tsx';
import { belgeKur } from './test-verisi.ts';

describe('kararKaydi', () => {
  const b = belgeKur({ id: 'd3', partyId: 'p1', type: 'İmza sirküleri', status: 'pending' });

  it('onay notu geçmişe yazılır; not yoksa yalnız "Onaylandı"', () => {
    const k = kararKaydi(b, true, '  Aslı görüldü ', 'tmi-6', SIMDI);
    expect(k).toMatchObject({ id: 'd3', surum: 1, status: 'approved', rejectNote: '' });
    expect(k.history?.at(-1)).toEqual({ at: new Date(SIMDI).toISOString(), by: 'firm', u: 'tmi-6', text: 'Onaylandı: Aslı görüldü' });
    expect(kararKaydi(b, true, '', 'tmi-6', SIMDI).history?.at(-1)?.text).toBe('Onaylandı');
  });

  it('ret gerekçesi kayda ve geçmişe yazılır', () => {
    const k = kararKaydi(b, false, 'Süresi geçmiş', 'tmi-6', SIMDI);
    expect(k).toMatchObject({ status: 'rejected', rejectNote: 'Süresi geçmiş' });
    expect(k.history?.at(-1)?.text).toBe('Reddedildi: Süresi geçmiş');
  });
});
