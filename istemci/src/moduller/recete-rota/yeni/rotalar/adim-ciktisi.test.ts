import { describe, expect, it } from 'vitest';
import { akisKarti, ciktiAdaylari, ciktiEngeli, kaydetGovdesi, rotaFarki, tasinanMalzeme, yeniAdim, type Adim, type Malzeme, type Operasyon } from './kurallar.ts';

// 3320 a (Test ön bakışı T11): ekran sunucunun akisiCikar ve tasinanMalzemeler kuralıyla aynı zinciri kurar. Veriler uydurmadır.
const malzeme = (id: string, type: Malzeme['type'], ek: Partial<Malzeme> = {}): Malzeme => ({
  id, kayitNo: Number(id), code: `ORN-${id}`, name: `Kart ${id}`, type, unit: 'adet', cost: null, stock: null, min: null, aktif: true,
  kategori: null, kategoriAdi: null, girdiOlabilir: true, ...ek,
});
const op: Operasyon = { id: '21', code: 'OP21', abbr: 'A21', name: 'Kesim', group: 'KES', groupName: 'Kesim', stationId: '31', setup: 10, cycle: 3, aktif: true };
const adim = (id: string, seq: number, ek: Partial<Adim> = {}): Adim => ({ ...yeniAdim(op, id), seq, opNo: seq, ...ek });
const kartlar = [malzeme('2', 'ham'), malzeme('3', 'yari'), malzeme('4', 'mamul'), malzeme('5', 'yari', { aktif: false }), malzeme('6', 'yari'), malzeme('11', 'mamul')];
const var_ = (id: string) => kartlar.some((m) => m.id === id);

describe('ara adımın çıktı kartı (3320 a)', () => {
  const liste = [adim('a', 10, { ins: [{ itemId: '2', qty: 1, scrap: 0 }], ciktiId: '3' }), adim('b', 20), adim('c', 30)];

  it('çıktılı adımın akış kartı seçilen karttır (statülü değil); sonraki adım onu taşır, sonraki ara adım o kartın statüsünü açar', () => {
    expect(akisKarti('11', liste, 0, var_)).toEqual({ itemId: '3', adim: null });
    expect(tasinanMalzeme('11', liste, 1, var_)).toBe('3');
    expect(akisKarti('11', liste, 1, var_)).toEqual({ itemId: '3', adim: liste[1] });
    expect(akisKarti('11', liste, 2, var_)).toEqual({ itemId: '11', adim: null });
  });

  it('seçim yoksa ya da kart listede yoksa bugünkü statülü zincir', () => {
    const statulu = liste.map((a) => ({ ...a, ciktiId: null }));
    expect(akisKarti('11', statulu, 0, var_)).toEqual({ itemId: '2', adim: statulu[0] });
    const kayip = [{ ...liste[0]!, ciktiId: '99' }, liste[1]!, liste[2]!];
    expect(akisKarti('11', kayip, 0, var_)).toEqual({ itemId: '2', adim: kayip[0] });
  });

  it('adaylar: yalnız aktif YM ve MM; ürün, rotadaki giren ve başka adımın çıktısı listelenmez', () => {
    const l = [adim('a', 10, { ins: [{ itemId: '4', qty: 1, scrap: 0 }] }), adim('b', 20, { ciktiId: '6' }), adim('c', 30)];
    expect(ciktiAdaylari(kartlar, '', '11', l, 'a').map((m) => m.id)).toEqual(['3']);
    expect(ciktiAdaylari(kartlar, '', '11', l, 'b').map((m) => m.id)).toEqual(['3', '6']);
    expect(ciktiEngeli(malzeme('3', 'yari'), (id) => id === '3')).toMatch(/kendi rotası var/);
    expect(ciktiEngeli(malzeme('3', 'yari'), () => false)).toBeNull();
  });

  it('kaydet: seçim sayıyla gider; son adıma taşınan adımın seçimi null gider; alanı olmayan adımda gitmez', () => {
    const opBul = (id: string) => (id === '21' ? op : undefined);
    const g = kaydetGovdesi([adim('a', 10, { ciktiId: '3' }), adim('b', 20), adim('c', 30, { ciktiId: '4' })], [10, 20, 30], opBul);
    expect(g.map((x) => x['ciktiMalzemeId'])).toEqual([3, undefined, null]);
    expect(rotaFarki([adim('a', 10), adim('b', 20)], [adim('a', 10, { ciktiId: '3' }), adim('b', 20)], { malzeme: (id) => `ORN-${id}`, op: () => 'Kesim', istasyon: () => '' }).join(' '))
      .toMatch(/çıktı statülü → ORN-3/);
  });
});
