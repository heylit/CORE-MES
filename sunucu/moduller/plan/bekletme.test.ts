import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { MotorYerlesimiCevabi, PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planMotoruCozucusu, sunucuPlanCozucusu, type PlanMotoruIstegi } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3050 a: bekletme durum değil işarettir. Motor önerisi bekleyen emrin başlamamış adımını taşımaz: planda yeri varsa yerinde sabit kalır ve
// tezgâhı tutar, yeri yoksa "emir beklemede" nedeniyle yerleşmez. Bekletme kalkınca motor yeniden dizer. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): bekleyen emir motor önerisinde yerinde kalır', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, taslaktaOner, durum, yer } = planTestOrtami();
  let makineA = 0, makineB = 0;
  before(() => { ({ makineA, makineB } = durum()); });
  const motor = (t: PlanCevabi) => tamam<MotorYerlesimiCevabi>(c.planlama, 'GET', `/plan/motor-yerlesimi?taslak=${String(t.taslak!.id)}`);
  const emirOf = async (isEmriId: number) =>
    (await vt().tx((db) => db.tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId])))!.id;
  const beklet = async (isEmriId: number) => tamam(c.yonetici, 'POST', `/uretim-emirleri/${String(await emirOf(isEmriId))}/beklet`, { neden: 'malzeme' });
  const kaldir = async (isEmriId: number) => tamam(c.yonetici, 'POST', `/uretim-emirleri/${String(await emirOf(isEmriId))}/bekletme-kaldir`, {});

  test('yeri olan bekleyen adım aynı tezgâh ve saatte sabit; yeri olmayan "emir beklemede" ile yerleşmez; kalkınca yeniden dizilir', async () => {
    const kaynak = { tur: 'makine' as const, id: makineA };
    const [onde] = await isEmirleriAc([yeniAdim({ kaynak })], 10, '2099-01-10');
    const [bekleyen] = await isEmirleriAc([yeniAdim({ kaynak })], 10, '2099-01-20');
    const t = await taslaktaOner();
    const once = t.yerlesimler.find((y) => y.isEmriId === bekleyen)!;
    assert.ok(once, 'bekleyen adım taslakta yerleşti');
    // Termini daha yakın yeni iş: motor serbest olsaydı bekleyenin önüne alırdı.
    const [acil] = await isEmirleriAc([yeniAdim({ kaynak })], 10, '2026-11-13');
    const [yersiz] = await isEmirleriAc([yeniAdim({ kaynak })], 10, '2099-02-01');
    await beklet(bekleyen!);
    await beklet(yersiz!);

    const m = await motor(t);
    const y = m.yerlesimler.find((x) => x.isEmriId === bekleyen);
    assert.ok(y, JSON.stringify(m.yerlesimler.map((x) => x.isEmriId)));
    assert.equal(y.sabit, true, 'bekleyen adım sabit');
    assert.deepEqual([y.kaynak, y.baslangic, y.bitis], [once.kaynak, once.baslangic, once.bitis], 'yerinde kalır');
    // Tezgâhı tutar: aynı makinedeki öteki işler onun aralığına binmez.
    for (const x of m.yerlesimler.filter((z) => z.isEmriId !== bekleyen && z.kaynak.tur === 'makine' && z.kaynak.id === makineA)) {
      assert.ok(Date.parse(x.bitis) <= Date.parse(y.baslangic) || Date.parse(x.baslangic) >= Date.parse(y.bitis), `${String(x.isEmriId)} bekleyenin üstüne bindi`);
    }
    assert.ok(m.yerlesimler.some((x) => x.isEmriId === acil), 'öteki işler yerleşir');
    assert.ok(m.yerlesimler.some((x) => x.isEmriId === onde));
    assert.equal(m.yerlesimler.some((x) => x.isEmriId === yersiz), false, 'yeri olmayan bekleyen yerleşmez');
    const red = m.yerlesmeyen.find((x) => x.isEmriId === yersiz);
    assert.equal(red?.nedenKodu, 'emir-beklemede');

    await kaldir(bekleyen!);
    await kaldir(yersiz!);
    const m2 = await motor(t);
    assert.equal(m2.yerlesimler.find((x) => x.isEmriId === bekleyen)?.sabit, false, 'bekletme kalkınca motor dizer');
    assert.ok(m2.yerlesimler.some((x) => x.isEmriId === yersiz), 'yeri olmayan da yerleşir');
  });

  // Planlama koşulu 2: başlangıcı geçmişte kalan bekleyen adım çalışıyor sayılmamalı; motor isteğinde sabit olarak da gitmez.
  test('başlangıcı geçmişte kalan bekleyen adım motora sabit gitmez, "emir beklemede" ile yerleşmez', async () => {
    const [eski] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineB } })], 10, '2099-03-01');
    const t = await taslaktaOner();
    const y0 = yer(t, eski!);
    assert.ok(y0, 'adım taslakta yerleşti');
    await beklet(eski!);
    await vt().tx((db) => db.sorgu("UPDATE plan_senaryo_yerlesimi SET baslangic = now() - interval '1 hour', bitis = now() + interval '1 hour' WHERE senaryo_id = $1 AND is_emri_id = $2", [t.taslak!.id, eski]));
    const istekler: PlanMotoruIstegi[] = [];
    planMotoruCozucusu(async (db, i) => { istekler.push(i); return sunucuPlanCozucusu(db, i); });
    let m: MotorYerlesimiCevabi;
    try { m = await motor(t); } finally { planMotoruCozucusu(sunucuPlanCozucusu); }
    assert.ok(istekler.length > 0, 'motor çağrıldı');
    const anahtar = `${y0.emirNo}|${String(y0.opNo)}`;
    for (const i of istekler) assert.equal(i.sabitler.some((x) => x.anahtar === anahtar), false, 'bekleyen adım sabit gitmedi');
    assert.equal(m.yerlesimler.some((x) => x.isEmriId === eski), false);
    assert.equal(m.yerlesmeyen.find((x) => x.isEmriId === eski)?.nedenKodu, 'emir-beklemede');
    await kaldir(eski!);
  });
});
