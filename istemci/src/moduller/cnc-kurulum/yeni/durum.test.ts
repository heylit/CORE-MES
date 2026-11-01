import { beforeAll, describe, expect, it } from 'vitest';
import { prototipYukle } from '../prototip-html.ts';
import { acilisVarsayimlari, defaults, durumOku, DURUM_ANAHTARI } from './durum.ts';

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

describe('açılış varsayılanları', () => {
  // Prototipin betik yüklenirken uyguladığı satırlar, prototipteki sırayla koşturulur.
  const SATIRLAR = [
    ['var STOCK_DEF = {', '\n'], ['state.stock = Object.assign({}, STOCK_DEF', '\n'], ['if (state.stock.axV !== 3)', '\n'],
    ['var gs = state.gsimOpt = Object.assign(', '\n'], ['if (!state.gtools || !state.gtools.__v2)', '\n'], ['if (state.gstock && !state.gstockMan)', '\n'],
    ['var LIFE_DEF = {', '\n'], ['state.life = Object.assign({}, LIFE_DEF', '\n'], ['state.wear = state.wear || {};', '\n'],
  ] as const;
  const prototipVarsayimlari = (kayit: unknown): unknown => {
    const govde = SATIRLAR.map(([bas, son]) => { const i = HTML.indexOf(bas); if (i < 0) throw new Error(bas); return HTML.slice(i, HTML.indexOf(son, i)); }).join('\n');
    return new Function('state', `${govde}\nreturn state;`)(JSON.parse(JSON.stringify(kayit)));
  };

  it.each([
    ['varsayılan', null],
    ['eski stok ekseni ve gstock', '{"stock":{"axis":"x","dAllow":4},"gstock":{"x":1},"cam":{"suV":1,"su":{"a":1}}}'],
    ['dolu ömür', '{"life":{"mode":"anal","cal":{"t|m":1.2}},"wearLog":[1],"cam":{"suV":2,"su":{"a":1},"sc":{"tol":"std"}},"gtools":{"__v2":1,"T1":2}}'],
  ])('%s kayıt prototipteki gibi tamamlanır', (_ad, metin) => {
    const s = durumOku(metin);
    const beklenen = prototipVarsayimlari(s);
    acilisVarsayimlari(s);
    expect(s).toEqual(beklenen);
  });

  it('iç nesneler her uygulamada yenidir', () => {
    const a = durumOku(null); acilisVarsayimlari(a);
    a.life.cal['x'] = 2;
    const b = durumOku(null); acilisVarsayimlari(b);
    expect(b.life.cal).toEqual({});
  });
});
