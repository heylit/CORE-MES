import { describe, expect, it } from 'vitest';
import { bolunmusMu, parcaEtiketi } from '../../../../arkon/web/src/data/parca.ts';
import { operatoreAcik } from '../../../../arkon/web/src/data/tmi-plan.ts';

// Kart #1572: elle bölünmüş işin parçaları terminalde ayrı iştir; bütün işin paketi operatöre düşmez.
describe('elle bölünmüş iş', () => {
  it('parça etiketi sunucunun yazdığı parçadan; parça yoksa etiket yok', () => {
    expect(parcaEtiketi({ tmi: { parca: { no: 2, adet: 8, toplam: 3 } } })).toBe('Parça 2/3 · 8 adet');
    expect(parcaEtiketi({ tmi: { parca: { no: 1, adet: 12 } } })).toBe('Parça 1 · 12 adet');
    for (const p of [{ tmi: {} }, { tmi: { parca: { no: '1', adet: 4 } } }, { tmi: null }, {}, null, undefined]) expect(parcaEtiketi(p)).toBeNull();
  });

  it('bütün işin paketi operatöre düşmez, parça paketi düşer', () => {
    expect(bolunmusMu({ tmi: { bolunmus: true } })).toBe(true);
    expect(bolunmusMu({ tmi: {} })).toBe(false);
    const butun = { status: 'published', tmi: { bolunmus: true } };
    const parca = { status: 'published', tmi: { parca: { no: 1, adet: 12, toplam: 2 } } };
    expect(operatoreAcik(butun)).toBe(false);
    expect(operatoreAcik(parca)).toBe(true);
  });
});
