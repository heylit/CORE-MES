import { describe, expect, it } from 'vitest';
import { iletiHataKarari } from '../../../../arkon/web/src/data/gonderim-hatasi.ts';

// Borç 44: hız ya da boyut sınırını aşan ileti öteki cihaza sessizce gitmiyordu.
describe('cihazlar arası ileti hatası', () => {
  it('hız sınırında bir kez yeniden denenir, ikinci retle uyarılır', () => {
    expect(iletiHataKarari({ status: 429 }, false)).toBe('tekrar');
    expect(iletiHataKarari({ status: 429 }, true)).toBe('uyar');
  });
  it('boyut sınırı ve öteki ret uyarılır; ağ yoksa sessiz', () => {
    expect([400, 413, 403, 500].map((status) => iletiHataKarari({ status }, false))).toEqual(['uyar', 'uyar', 'uyar', 'uyar']);
    expect(iletiHataKarari({ offline: true }, false)).toBe('sessiz');
    expect(iletiHataKarari({}, false)).toBe('sessiz');
  });
});
