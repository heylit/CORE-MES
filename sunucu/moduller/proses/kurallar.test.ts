import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PROSES_HALKALARI } from '#paylasilan/sozlesme/proses.ts';
import {
  ayniRevizyon, cizimHalkasi, gecerliProgramlar, ilkParcaHalkasi, kontrolHalkasi, ncHalkalari, operasyonlar, planKarakteristigi, plansizOperasyonlar,
  revizyonKoduGecerliMi, revizyonListesi, revizyonSec, rotaHalkasi, zincir,
} from './kurallar.ts';

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

  test('zincir Atölye sırasıyla bütün halkaları verir; NC kaydı yoksa NC, takım, bağlama yok, yalnız kurulum kaynak-yok', () => {
    const z = zincir({
      cizim: cizimHalkasi({ revizyonlar: [], alinmamis: 0 }),
      rota: rotaHalkasi({ yururlukte: null, acikTaslak: false }),
      ...ncHalkalari([]),
      kontrol: kontrolHalkasi({ karakteristik: 0, plansizOplar: [] }),
      ilkParca: ilkParcaHalkasi({ acikEmir: 0, onay: 0, ret: 0 }),
    });
    assert.deepEqual(z.map((h) => h.anahtar), [...PROSES_HALKALARI]);
    assert.deepEqual(z.filter((h) => h.durum === 'kaynak-yok').map((h) => h.anahtar), ['kurulum']);
    assert.deepEqual(z.filter((h) => h.durum === 'yok').map((h) => h.anahtar).filter((a) => ['nc', 'takim', 'baglama'].includes(a)), ['nc', 'takim', 'baglama']);
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

describe('proses: NC/CAM programı ve teknik resim revizyonu (3800)', () => {
  test('revizyon listesi: kodsuz ve yinelenen düşer, yeniden eskiye; yürürlükteki işaretlenir, çizimde yoksa başa eklenir', () => {
    const cizim = [{ kod: 'A', durum: 'eski', sira: 1 }, { kod: 'b', durum: 'eski', sira: 2 }, { kod: 'C', durum: 'yayinda', sira: 3 }, { kod: null, durum: 'eski', sira: 4 }, { kod: 'B ', durum: 'eski', sira: 2 }] as const;
    assert.deepEqual(revizyonListesi(cizim, 'B'), [{ kod: 'C', durum: 'yayinda' }, { kod: 'b', durum: 'yururlukte' }, { kod: 'A', durum: 'eski' }]);
    assert.deepEqual(revizyonListesi([], 'D').map((r) => r.durum), ['yururlukte']);
    assert.deepEqual(revizyonListesi([], null), []);
  });

  test('revizyon seçimi: istenen varsa o, yoksa yürürlükteki, yoksa en yeni; revizyonsuz parçada null', () => {
    const l = [{ kod: 'C', durum: 'yayinda' }, { kod: 'B', durum: 'yururlukte' }, { kod: 'A', durum: 'eski' }] as const;
    assert.equal(revizyonSec(l, 'a'), 'A');
    assert.equal(revizyonSec(l, 'Z'), 'B');
    assert.equal(revizyonSec(l, null), 'B');
    assert.equal(revizyonSec([{ kod: 'C', durum: 'yayinda' }], null), 'C');
    assert.equal(revizyonSec([], 'C'), null);
    assert.equal(revizyonKoduGecerliMi(l, ' c '), 'C');
    assert.equal(revizyonKoduGecerliMi(l, 'X'), false);
    assert.equal(revizyonKoduGecerliMi([], null), null);
    assert.ok(ayniRevizyon('b ', 'B'));
  });

  test('geçerli programlar: revizyona özel program varsa genel gizlenir; yoksa genel "genel yerine"; başka revizyon görünmez; eski sonda', () => {
    const p = [
      { id: 1, opNo: 20, revizyonKodu: null, durum: 'onayli' },
      { id: 2, opNo: 30, revizyonKodu: null, durum: 'onayli' },
      { id: 3, opNo: 30, revizyonKodu: 'C', durum: 'eski' },
      { id: 4, opNo: 30, revizyonKodu: 'c', durum: 'taslak' },
      { id: 5, opNo: 30, revizyonKodu: 'B', durum: 'onayli' },
    ] as const;
    assert.deepEqual(gecerliProgramlar(p, 'C').map((x) => [x.id, x.genelYerine]), [[1, false], [4, false], [3, false]]);
    assert.deepEqual(gecerliProgramlar(p, 'A').map((x) => [x.id, x.genelYerine]), [[1, false], [2, true]]);
    assert.deepEqual(gecerliProgramlar(p, null).map((x) => x.id), [1, 2]);
    // Yalnız eski özel program genel olanı gizlemez.
    assert.deepEqual(gecerliProgramlar([{ id: 1, opNo: 30, revizyonKodu: null, durum: 'onayli' }, { id: 2, opNo: 30, revizyonKodu: 'C', durum: 'eski' }], 'C').map((x) => x.id), [1, 2]);
  });

  test('NC halkaları: program yoksa yok; onaysız program NC eksik; takımsız ya da aparatsız program kendi halkasını eksik yapar; eski sayılmaz', () => {
    assert.equal(ncHalkalari([]).nc.durum, 'yok');
    assert.equal(ncHalkalari([{ ad: 'P1', durum: 'eski', takimSayisi: 0, aparatSayisi: 0 }]).takim.durum, 'yok');
    const h = ncHalkalari([{ ad: 'P1', durum: 'onayli', takimSayisi: 3, aparatSayisi: 1 }, { ad: 'P2', durum: 'taslak', takimSayisi: 0, aparatSayisi: 2 }]);
    assert.deepEqual([h.nc.durum, h.takim.durum, h.baglama.durum], ['eksik', 'eksik', 'tamam']);
    assert.equal(h.nc.ozet, '2 program · 1 onaysız');
    assert.equal(ncHalkalari([{ ad: 'P1', durum: 'dogrulandi', takimSayisi: 3, aparatSayisi: 1 }]).nc.durum, 'eksik', 'doğrulandı henüz onaylı değil');
    const t = ncHalkalari([{ ad: 'P1', durum: 'onayli', takimSayisi: 3, aparatSayisi: 1 }]);
    assert.deepEqual([t.nc.durum, t.takim.ozet, t.baglama.ozet], ['tamam', '3 takım satırı', '1 aparat satırı']);
  });
});
