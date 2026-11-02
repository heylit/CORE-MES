import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { govdeDoldur, yerTutucuGecerliMi, yerTutuculari, yolDoldur } from './sablon.ts';
import type { SablonBaglami } from './sablon.ts';

const baglam = (istasyon: SablonBaglami['istasyon'] = { id: 3, kod: 'ORN-TORNA 1', emirId: 6, emirNo: 'MM-ORN/1' }): SablonBaglami => {
  let n = 0;
  return { simdiMs: 1_000_000, kaynak: 'yuk.terminal.0001', istasyon, uuid: () => { n += 1; return `u${String(n)}`; } };
};

describe('yük şablonu', () => {
  it('yol yer tutucuları adres kodlamasıyla doldurulur', () => {
    assert.equal(
      yolDoldur('/arkon/kayitlar/events?makine={istasyon.kod}&baslangic={simdi-600}&bitis={simdi}', baglam()),
      '/arkon/kayitlar/events?makine=ORN-TORNA%201&baslangic=400000&bitis=1000000',
    );
    assert.equal(yolDoldur('/uretim-emirleri/{istasyon.emirId}', baglam()), '/uretim-emirleri/6');
    assert.equal(yolDoldur('/oturum', baglam()), '/oturum');
  });

  it('gövdede tek yer tutucu türünü korur, karışık metin metin kalır, her uuid yenidir', () => {
    const govde = govdeDoldur({ satirlar: [{ cid: '{uuid}', at: '{simdi}', machine: '{istasyon.kod}', orderNo: '{istasyon.emirNo}', not: 'yuk {kaynak}', delta: 1 }], kaynak: '{kaynak}', id: '{uuid}' }, baglam());
    assert.deepEqual(govde, { satirlar: [{ cid: 'u1', at: 1_000_000, machine: 'ORN-TORNA 1', orderNo: 'MM-ORN/1', not: 'yuk yuk.terminal.0001', delta: 1 }], kaynak: 'yuk.terminal.0001', id: 'u2' });
    assert.equal(govdeDoldur(null, baglam()), null);
  });

  it('istasyonsuz bağlamda istasyon, bilinmeyen alanda ve adda doldurma durur', () => {
    assert.throws(() => yolDoldur('/a?m={istasyon.kod}', baglam(null)), /istasyon/);
    assert.throws(() => yolDoldur('/a?m={istasyon.yok}', baglam()), /yok/);
    assert.throws(() => govdeDoldur({ a: '{baska}' }, baglam()), /Bilinmeyen/);
  });

  it('yer tutucu denetimi senaryo okunurken bilinmeyeni ayırır', () => {
    assert.deepEqual(yerTutuculari('/a/{istasyon.id}?b={simdi-60}&c={x}'), ['istasyon.id', 'simdi-60', 'x']);
    for (const ad of ['uuid', 'simdi', 'simdi-86400', 'kaynak', 'istasyon.kod']) assert.equal(yerTutucuGecerliMi(ad), true, ad);
    for (const ad of ['x', 'simdi-', 'istasyon', 'istasyon.a.b', 'kaynak-1']) assert.equal(yerTutucuGecerliMi(ad), false, ad);
  });
});
