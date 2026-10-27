import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { eksikStokIletisi, eksikStoklar } from './eksik-stok-kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// Kart 811 P3 (772 a): stoku bilinmeyen malzemeyi tüketen iş "dur" ayarında canlıya geçmez. Veriler uydurmadır.

describe('plan: stoku bilinmeyen malzeme kuralı', () => {
  const kartlar = new Map([
    [1, { kod: 'HM-1', ad: 'Ornek cubuk', tur: 'hammadde' }], [2, { kod: 'TM-1', ad: null, tur: 'ticari_mal' }],
    [3, { kod: 'YM-1', ad: 'Ara parca', tur: 'yarimamul' }], [4, { kod: 'HM-2', ad: 'Stoklu cubuk', tur: 'hammadde' }],
  ]);
  const ihtiyaclar = new Map([
    [10, [{ malzemeNo: 1, opNo: 10 }, { malzemeNo: 2, opNo: 10 }, { malzemeNo: 3, opNo: 10 }, { malzemeNo: 4, opNo: 10 }, { malzemeNo: 1, opNo: 20 }]],
    [11, [{ malzemeNo: 1, opNo: 10 }]],
    [12, null],
  ]);
  const stokluKartlar = new Set([4]);

  test('yalnız işin kendi adımındaki, stok kaydı olmayan hammadde ve ticari mal sayılır; emirler birleşir', () => {
    const l = eksikStoklar({
      isler: [{ uretimEmriId: 10, emirNo: 'E-2', opNo: 10 }, { uretimEmriId: 11, emirNo: 'E-1', opNo: 10 }, { uretimEmriId: 12, emirNo: 'E-3', opNo: 10 }],
      ihtiyaclar, kartlar, stokluKartlar,
    });
    assert.deepEqual(l, [{ kod: 'HM-1', ad: 'Ornek cubuk', emirler: ['E-1', 'E-2'] }, { kod: 'TM-1', ad: null, emirler: ['E-2'] }]);
    assert.match(eksikStokIletisi(l), /HM-1 Ornek cubuk \(E-1, E-2\); TM-1 \(E-2\)/);
  });

  test('başka adımın malzemesi ve stoklu kart engellemez', () => {
    assert.deepEqual(eksikStoklar({ isler: [{ uretimEmriId: 10, emirNo: 'E-2', opNo: 30 }], ihtiyaclar, kartlar, stokluKartlar }), []);
    assert.deepEqual(eksikStoklar({ isler: [], ihtiyaclar, kartlar, stokluKartlar }), []);
  });
});

describe('plan (gerçek PostgreSQL): stoku bilinmeyen malzeme ile canlıya alma', () => {
  const { c, istek, tamam, kartAc, yeniAdim, isEmirleriAc, taslaktaOner, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  before(() => { ({ ortam } = durum()); });
  const gonder = async (p: PlanCevabi) =>
    (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum })).senaryolar.find((x) => x.id === p.taslak!.id)!.surum;
  const canliyaAl = async (id: number, surum: number) => istek(c.mudur, 'POST', `/plan/senaryolar/${id}/canliya-al`, { surum, cakismalariKabul: true });

  test('865 b: varsayılan "varsay"dır; stoksuz hammaddeli iş canlıya geçer', async () => {
    const stoksuz = await kartAc('hammadde');
    const [is] = await isEmirleriAc([yeniAdim({ bilesenler: [{ malzemeId: stoksuz, miktar: 1, fireYuzde: 0 }] })]);
    const p = await taslaktaOner();
    assert.ok(p.yerlesimler.some((y) => y.isEmriId === is));
    const r = await canliyaAl(p.taslak!.id, await gonder(p));
    assert.equal(r.statusCode, 200, r.body);
  });

  test('"dur" taslağın kendi ayar sürümüdür: stoksuz hammaddeli iş reddedilir, güncel "varsay" sürümüne bağlanınca geçer; stok kaydı da açar', async () => {
    // Ortak kurulumun kartlarına stok kaydı açılır; "dur" yalnız bu testin stoksuz kartında durdurur.
    await ortam!.sahip.sorgu('INSERT INTO stok_malzeme_ayari (malzeme_id) SELECT k.no FROM malzeme_katalog_karti k WHERE NOT EXISTS (SELECT 1 FROM stok_malzeme_ayari a WHERE a.malzeme_id = k.no)');
    await tamam(c.yonetici, 'POST', '/plan/motor-ayarlari', { eksikStok: 'dur' });
    const stoksuz = await kartAc('hammadde');
    const kod = (await ortam!.sahip.tek<{ kod: string }>('SELECT stok_kodu AS kod FROM malzeme_katalog_karti WHERE no = $1', [stoksuz]))!.kod;
    const [is] = await isEmirleriAc([yeniAdim({ bilesenler: [{ malzemeId: stoksuz, miktar: 1, fireYuzde: 0 }] })]);
    let p = await taslaktaOner();
    assert.ok(p.yerlesimler.some((y) => y.isEmriId === is));
    const id = p.taslak!.id;
    let surum = await gonder(p);
    const red = await canliyaAl(id, surum);
    assert.equal(red.statusCode, 409, red.body);
    assert.match(red.body, new RegExp(`stoku bilinmeyen malzeme.*${kod}`, 's'));

    // Ayar "varsay" olsa da taslak kendi sürümünde kalır (774 a).
    await tamam(c.yonetici, 'POST', '/plan/motor-ayarlari', { eksikStok: 'varsay' });
    assert.equal((await canliyaAl(id, surum)).statusCode, 409);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${id}/onaydan-cek`, { surum });
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/senaryolar/${id}/motor-ayari-guncelle`, { surum: surum + 1 });
    surum = await gonder(p);
    assert.equal((await canliyaAl(id, surum)).statusCode, 200);
    await tamam(c.yonetici, 'POST', '/plan/motor-ayarlari', { eksikStok: 'dur' });

    // "Dur" yeniden; stok kaydı açılan kart engellemez.
    const [is2] = await isEmirleriAc([yeniAdim({ bilesenler: [{ malzemeId: stoksuz, miktar: 1, fireYuzde: 0 }] })]);
    const p2 = await taslaktaOner();
    assert.ok(p2.yerlesimler.some((y) => y.isEmriId === is2));
    const s2 = await gonder(p2);
    assert.equal((await canliyaAl(p2.taslak!.id, s2)).statusCode, 409);
    await ortam!.sahip.sorgu('INSERT INTO stok_malzeme_ayari (malzeme_id) VALUES ($1)', [stoksuz]);
    assert.equal((await canliyaAl(p2.taslak!.id, s2)).statusCode, 200);
  });
});
