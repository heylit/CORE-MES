import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PROSES_HALKALARI } from '#paylasilan/sozlesme/proses.ts';
import { cizimHalkasi, ilkParcaHalkasi, kontrolHalkasi, operasyonlar, planKarakteristigi, plansizOperasyonlar, rotaHalkasi, zincir } from './kurallar.ts';

describe('proses: halka durumları (3290)', () => {
  test('çizim: alınmış resim yoksa yok; yayındaki belge alınmadıysa eksik; hepsi alındıysa tamam', () => {
    assert.equal(cizimHalkasi({ revizyonlar: [], alinmamis: 0 }).durum, 'yok');
    assert.equal(cizimHalkasi({ revizyonlar: [], alinmamis: 2 }).durum, 'eksik');
    assert.equal(cizimHalkasi({ revizyonlar: ['C'], alinmamis: 1 }).durum, 'eksik');
    const t = cizimHalkasi({ revizyonlar: ['C', 'C'], alinmamis: 0 });
    assert.equal(t.durum, 'tamam');
    assert.equal(t.ozet, 'Rev C alındı');
  });

  test('rota: yürürlükte yoksa yok (taslak varsa eksik); yürürlükteyse tamam ve açık taslak özetinde', () => {
    assert.equal(rotaHalkasi({ yururlukte: null, acikTaslak: false }).durum, 'yok');
    assert.equal(rotaHalkasi({ yururlukte: null, acikTaslak: true }).durum, 'eksik');
    const r = rotaHalkasi({ yururlukte: { harf: 'B', adimSayisi: 6 }, acikTaslak: true });
    assert.equal(r.durum, 'tamam');
    assert.equal(r.ozet, 'Rev B yürürlükte · 6 op · açık taslak var');
  });

  test('kontrol planı: karakteristik yoksa yok; numune planı olmayan fason dışı operasyon eksik yapar', () => {
    assert.equal(kontrolHalkasi({ karakteristik: 0, plansizOplar: [] }).durum, 'yok');
    const adimlar = [
      { opNo: 10, ad: 'Kesim', fason: false, tezgah: null, ayarSuresiDk: null, birimSureDk: null, gercek: null },
      { opNo: 20, ad: 'Kaplama', fason: true, tezgah: null, ayarSuresiDk: null, birimSureDk: null, gercek: null },
    ];
    assert.deepEqual(plansizOperasyonlar(adimlar, new Set()), [10]);
    assert.deepEqual(plansizOperasyonlar(adimlar, new Set([10])), []);
    assert.equal(kontrolHalkasi({ karakteristik: 4, plansizOplar: [10] }).ozet, '4 karakteristik · numune planı yok: OP 10');
    assert.equal(kontrolHalkasi({ karakteristik: 4, plansizOplar: [] }).durum, 'tamam');
  });

  test('ilk parça: açık emir yoksa henüz gerekmez; ret ya da kararsız emir eksik; hepsi onaylıysa tamam', () => {
    assert.equal(ilkParcaHalkasi({ acikEmir: 0, onay: 0, ret: 0 }).durum, 'gerekmez');
    assert.equal(ilkParcaHalkasi({ acikEmir: 2, onay: 1, ret: 1 }).ozet, '1 emirde ret');
    assert.equal(ilkParcaHalkasi({ acikEmir: 3, onay: 1, ret: 0 }).ozet, '2/3 açık emirde karar yok');
    assert.equal(ilkParcaHalkasi({ acikEmir: 2, onay: 2, ret: 0 }).durum, 'tamam');
  });

  test('zincir Atölye sırasıyla bütün halkaları verir; kaynağı olmayanlar kaynak-yok', () => {
    const z = zincir({
      cizim: cizimHalkasi({ revizyonlar: [], alinmamis: 0 }),
      rota: rotaHalkasi({ yururlukte: null, acikTaslak: false }),
      kontrol: kontrolHalkasi({ karakteristik: 0, plansizOplar: [] }),
      ilkParca: ilkParcaHalkasi({ acikEmir: 0, onay: 0, ret: 0 }),
    });
    assert.deepEqual(z.map((h) => h.anahtar), [...PROSES_HALKALARI]);
    assert.deepEqual(z.filter((h) => h.durum === 'kaynak-yok').map((h) => h.anahtar), ['nc', 'takim', 'baglama', 'kurulum']);
  });
  test('operasyonun karakteristiği numune planının kapsadığı ayrı balonlardır; planı olmayan op null', () => {
    const balonlar = [{ no: 1, kritik: true }, { no: 2, kritik: false }, { no: 3, kritik: true }];
    assert.equal(planKarakteristigi([{ balonlar: 'hepsi' }], balonlar), 3);
    assert.equal(planKarakteristigi([{ balonlar: 'kritik' }, { balonlar: [1, 2] }], balonlar), 3);
    assert.equal(planKarakteristigi([{ balonlar: [2] }, { balonlar: [2] }], balonlar), 1);
    const op = operasyonlar([{ opNo: 10, ad: 'Kesim', fason: false, tezgah: 'ORN-T1', ayarSuresiDk: null, birimSureDk: null, gercek: null },
      { opNo: 20, ad: 'Freze', fason: false, tezgah: null, ayarSuresiDk: null, birimSureDk: null, gercek: null }], new Set([20]), new Map([[10, 2]]));
    assert.deepEqual(op.map((o) => [o.opNo, o.karakteristik, o.numunePlani, o.talimat]), [[10, 2, true, false], [20, null, false, true]]);
  });
});
