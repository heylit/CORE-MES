import { beforeAll, describe, expect, it } from 'vitest';
import { prototipYukle } from '../prototip.ts';
import { defaults, durumOku, DURUM_ANAHTARI } from './durum.ts';

// Açılış prototiptekiyle aynı olmalı: prototipin defaults işlevi ve kayıt okuma satırı, eski ekranın yüklediği prototipten
// alınıp sahte depoyla koşturulur.
let HTML = '';
beforeAll(async () => { HTML = await prototipYukle(); });
const parca = (bas: string, son: string): string => {
  const i = HTML.indexOf(bas);
  if (i < 0) throw new Error(`Prototipte bulunamadı: ${bas}`);
  return HTML.slice(i, HTML.indexOf(son, i) + son.length);
};

function prototipAcilis(metin: string | null): unknown {
  const depo = { getItem: (a: string) => (a === DURUM_ANAHTARI ? metin : null) };
  return new Function('localStorage', 'KEY', `${parca('function defaults() {', '};\n  }')}\n${parca('var state = defaults();', 'catch (e) { }')}\nreturn state;`)(depo, DURUM_ANAHTARI);
}

describe('durum', () => {
  it('varsayılan prototiptekiyle aynı', () => {
    expect(defaults()).toEqual(prototipAcilis(null));
  });

  it.each([
    ['boş', null],
    ['bozuk', '{bozuk'],
    ['yalnız tezgâh', '{"machine":"t2"}'],
    ['eksik byType', '{"byType":{"mill":{"fixture":"vise160","jaw":"j_soft","zero":"z_probe"}}}'],
    ['eksik meta ve wcs', '{"meta":{"part":"P"},"wcs":{"iso":"g55"},"tools":{"T1":"x"}}'],
    ['ek alan', '{"yeniAlan":[1,2],"gsim":{"t":1}}'],
    ['null', 'null'],
  ])('%s kayıt prototipteki gibi açılır', (_ad, metin) => {
    expect(durumOku(metin)).toEqual(prototipAcilis(metin));
  });

  it('her okuma yeni nesne verir (varsayılan paylaşılmaz)', () => {
    const a = durumOku(null);
    a.byType['mill'] = { fixture: 'degisti', jaw: '', zero: '' };
    expect(durumOku(null).byType['mill']?.fixture).toBe('vise125');
  });
});
