import { describe, expect, it } from 'vitest';
import { DELIVERY } from './constants.ts';
import { teslimSekliSecenekleri } from './teslim-sekli.ts';

describe('teslim şekli seçimi', () => {
  it('değer doluyken bile bütün seçenekler listede durur ve değer seçili gelir', () => {
    const h = teslimSekliSecenekleri(DELIVERY[0]!);
    for (const d of DELIVERY) expect(h).toContain(`>${d.replace(/&/g, '&amp;')}</option>`);
    expect(h.match(/ selected/g)).toHaveLength(1);
    expect(h).toContain('<option value="">Belirtilmedi</option>');
  });
  it('listede olmayan eski değer kaybolmaz ve kaçırılır', () => {
    const h = teslimSekliSecenekleri('ORN "özel" <b>');
    expect(h).toContain('selected>ORN &quot;özel&quot; &lt;b&gt;</option>');
    expect(h).toContain(DELIVERY[1]!);
  });
  it('boş değerde hiçbir seçenek seçili işaretlenmez', () => {
    expect(teslimSekliSecenekleri('')).not.toContain(' selected');
  });
});

import { terminMetni } from './calc.ts';
describe('karar aşamasında termin', () => {
  it('gün ve siparişin verileceği günden sayılan tarih birlikte yazılır', () => {
    expect(terminMetni({ leadDays: 12 }, '2026-11-25')).toBe('12 gün · 07.12.2026');
    expect(terminMetni({ leadDays: null })).toBeNull();
  });
});
