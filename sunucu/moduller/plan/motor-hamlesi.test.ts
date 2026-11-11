import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { degerlendirmeGovdesi, degerlendirmeSonucu, type DegerlendirmeIstegi, type DegerlendirmeSonucu } from '#paylasilan/sozlesme/planlama.ts';
import { degerlendirmeYap, maliyetsiz, type DegerlendirmeZarfi } from './degerlendirme.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 2129-1 b: iyileştirme ara ve öne al önizlemesi. Betik doğrudan koşar (veritabanı yok); iki tezgâh, sekiz emir, uydurma veri.
const tezgah = (id: string, grup: string, ucret: number | null): Record<string, unknown> => ({ id, ad: id, grup, ucret, verim: 1, vardiyalar: ['3'], opOran: 0 });
const adim = (p: string, seq: number, st: string, cycle: number, setup: number) => ({ id: `${p}-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId: st, setup, cycle, alts: [], altTimes: {}, ins: [] });
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }, { id: '51', code: 'MM-2', name: 'Ornek burc', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10', 750) }, { id: '200', code: 'F1', name: 'Freze 1', stationId: '20', plan: tezgah('200', '20', 900) }],
  routes: { 50: { base: null, steps: [adim('50', 10, '10', 60, 60), adim('50', 20, '20', 90, 30)] }, 51: { base: null, steps: [adim('51', 10, '20', 50, 45), adim('51', 20, '10', 80, 30)] } },
  orders: Array.from({ length: 8 }, (_, i) => ({ id: `O${String(i)}`, no: `E-${String(i)}`, itemId: i % 2 ? '50' : '51', qty: 4 + ((i * 7) % 9), start: '2026-10-19',
    due: `2026-10-${String(20 + ((i * 5) % 6))}`, priority: 1 + (i % 3), status: 'serbest' })),
};
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }, { id: '20', code: 'FRZ', name: 'Freze', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }, { id: '200', code: 'F1', name: 'Freze 1', stationId: '20', status: 'aktif', aktif: true }],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
};
const calismaKur = (): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4, denge: 'otomatik', sure: 2 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
type Op = { job: string; m: string; S: number; C: number };
// Kayıtlı plan: kural tabanlı plan (gecikir); arama ve öne alma bunun üstüne kurulur. Kaynak birleşmesi veri sürümünü artırır ve ilk
// geri yazmada bir kez daha eskitir (PD-21 notu): çalışma kararlı olana dek birleştirilir, plan o sürümde güncel olur.
function planli(): Record<string, unknown> {
  let S: Record<string, unknown> = calismaKur();
  let g = planGirdisi({ calisma: S, kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' });
  for (let i = 0; i < 4 && g && g.S['dataVer'] !== S['dataVer']; i++) { S = g.S; g = planGirdisi({ calisma: S, kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' }); }
  assert.ok(g && g.S['dataVer'] === S['dataVer'], 'birleşme kararlı');
  const m = motorYukle(); const p = m.schedule(g.st, 'dagit', null);
  const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
  const J = Object.fromEntries(Object.entries(e.J).map(([k, x]) => [k, { C: x.C, T: x.T }]));
  return { ...S, plan: { ops: p.ops, fail: [], J, dataVer: S['dataVer'] } };
}
const surumu = (c: Record<string, unknown>): number => c['dataVer'] as number;
const AN = Date.parse('2026-10-19T06:00:00Z');
const dene = (istek: DegerlendirmeIstegi, calisma: unknown = planli()) => degerlendirmeYap({ calisma, kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19', istek }, AN);
const zarf = (r: Awaited<ReturnType<typeof dene>>): DegerlendirmeZarfi => { assert.ok(r && !('hata' in r), JSON.stringify(r)); return r; };
const sonuc = (r: Awaited<ReturnType<typeof dene>>): DegerlendirmeSonucu => degerlendirmeSonucu.parse(zarf(r).sonuc);
// En geç biten sipariş: öne alınınca kazancı görülecek olan.
function enGec(c: Record<string, unknown>): string {
  const J = (c['plan'] as { J: Record<string, { C: number }> }).J;
  return Object.entries(J).sort((a, b) => b[1].C - a[1].C)[0]![0];
}

describe('planlama hamlesi: iyileştirme ara (2129-1 b)', () => {
  test('MH-01: kural tabanlı planın gecikmesini düşürür; plan veri sürümünde, değişen siparişler listede; aynı girdi aynı sonuç', async () => {
    const c = planli();
    const a = await dene({ tur: 'plan-iyilestir' }, c);
    const s = sonuc(a); if (s.tur !== 'plan-iyilestir') return assert.fail(s.tur);
    assert.ok(s.plan, 'daha iyi plan bulunur');
    assert.ok(s.gecikmeSonra !== null && s.gecikmeSonra < s.gecikmeOnce - 1e-6, `${String(s.gecikmeSonra)} < ${String(s.gecikmeOnce)}`);
    assert.equal(s.plan['dataVer'], surumu(c));
    assert.ok(s.degisen.length > 0);
    for (const d of s.degisen) assert.ok(d.once !== d.sonra, d.siparisId);
    assert.deepEqual(Object.keys(s.plan['ops'] as object).sort(), Object.keys((c['plan'] as { ops: object }).ops).sort(), 'işler düşmez');
    assert.deepEqual(await dene({ tur: 'plan-iyilestir' }, c), a);
  });

  test('MH-02: kullanıcının kilidi yerinde kalır', async () => {
    const c = planli(); const ops = (c['plan'] as { ops: Record<string, Op> }).ops;
    const [id, r] = Object.entries(ops).sort((x, y) => y[1].S - x[1].S)[0]!;
    const k = { ...c, locks: { [id]: { m: r.m, S: r.S } } };
    const s = sonuc(await dene({ tur: 'plan-iyilestir' }, k)); if (s.tur !== 'plan-iyilestir') return assert.fail(s.tur);
    if (s.plan === null) return;
    const y = (s.plan['ops'] as Record<string, Op>)[id];
    assert.deepEqual([y?.m, y?.S], [r.m, r.S]);
  });

  test('MH-03: daha iyisi yoksa plan null, gecikme önceki; ikinci arama ilkinin sonucunu taban alır', async () => {
    const c = planli();
    const s = sonuc(await dene({ tur: 'plan-iyilestir' }, c)); if (s.tur !== 'plan-iyilestir' || !s.plan) return assert.fail('ilk arama');
    const ikinci = sonuc(await dene({ tur: 'plan-iyilestir' }, { ...c, plan: s.plan })); if (ikinci.tur !== 'plan-iyilestir') return assert.fail(ikinci.tur);
    if (ikinci.plan === null) { assert.equal(ikinci.gecikmeSonra, null); assert.deepEqual(ikinci.degisen, []); }
    else assert.ok((ikinci.gecikmeSonra ?? Infinity) < ikinci.gecikmeOnce);
  });
});

describe('planlama hamlesi: öne al (2129-1 b)', () => {
  test('MH-04: en geç biten sipariş daha erken biter; yol adı ve önceki/yeni bitiş döner; aynı girdi aynı sonuç', async () => {
    const c = planli(); const j = enGec(c);
    const a = await dene({ tur: 'one-al', siparisId: j }, c);
    const s = sonuc(a); if (s.tur !== 'one-al') return assert.fail(s.tur);
    assert.ok(s.plan, s.neden ?? '');
    assert.equal(s.siparisId, j);
    assert.ok(s.yol);
    assert.ok(s.bitisOnce !== null && s.bitisSonra !== null && s.bitisSonra < s.bitisOnce - 0.05);
    assert.ok(s.degisen.some((d) => d.siparisId === j));
    assert.deepEqual(await dene({ tur: 'one-al', siparisId: j }, c), a);
  });

  test('MH-05: siparişin bütün adımları kilitliyse öne alınmaz, neden yazılır; kilit oynamaz', async () => {
    const c = planli(); const j = enGec(c); const ops = (c['plan'] as { ops: Record<string, Op & { id: string }> }).ops;
    const locks = Object.fromEntries(Object.entries(ops).filter(([, r]) => r.job === j).map(([id, r]) => [id, { m: r.m, S: r.S }]));
    const s = sonuc(await dene({ tur: 'one-al', siparisId: j }, { ...c, locks })); if (s.tur !== 'one-al') return assert.fail(s.tur);
    assert.equal(s.plan, null);
    assert.ok(s.neden);
  });
});

describe('planlama hamlesi: ret ve sözleşme', () => {
  test('MH-06: plan yoksa plan-yok, plan veriden eskiyse plan-bayat, bilinmeyen sipariş siparis-yok', async () => {
    assert.deepEqual(await dene({ tur: 'plan-iyilestir' }, calismaKur()), { hata: 'plan-yok' });
    const c = planli();
    assert.deepEqual(await dene({ tur: 'one-al', siparisId: enGec(c) }, { ...c, dataVer: surumu(c) + 1 }), { hata: 'plan-bayat' });
    assert.deepEqual(await dene({ tur: 'plan-iyilestir' }, { ...c, dataVer: surumu(c) + 1 }), { hata: 'plan-bayat' });
    assert.deepEqual(await dene({ tur: 'one-al', siparisId: 'YOK' }, c), { hata: 'siparis-yok' });
  });

  test('MH-07: gövde: öne al sipariş ister, iyileştirme alan almaz; maliyetsiz görünüm planı değiştirmez', async () => {
    assert.ok(degerlendirmeGovdesi.safeParse({ surum: 1, istek: { tur: 'plan-iyilestir' } }).success);
    assert.ok(!degerlendirmeGovdesi.safeParse({ surum: 1, istek: { tur: 'plan-iyilestir', ms: 5 } }).success);
    assert.ok(!degerlendirmeGovdesi.safeParse({ surum: 1, istek: { tur: 'one-al' } }).success);
    assert.ok(degerlendirmeGovdesi.safeParse({ surum: 1, istek: { tur: 'one-al', siparisId: 'O1' } }).success);
    const s = sonuc(await dene({ tur: 'plan-iyilestir' }));
    const m = maliyetsiz(s);
    if (m.tur !== 'plan-iyilestir' || s.tur !== 'plan-iyilestir') return assert.fail(m.tur);
    // Planın işleri ve sonucun öteki alanları aynen kalır; yalnız TL toplamları (ozet.tl, oncekiOzet.tl) maliyeti görmeyene gitmez (2934).
    const tlsiz = (p: Record<string, unknown> | null) => {
      if (p === null) return null;
      const { ozet, oncekiOzet, ...geri } = p as { ozet?: Record<string, unknown>; oncekiOzet?: Record<string, unknown> };
      return { ...geri, ozet: ozet && { ...ozet, tl: undefined }, oncekiOzet: oncekiOzet && { ...oncekiOzet, tl: undefined } };
    };
    assert.deepEqual({ ...m, plan: tlsiz(m.plan) }, { ...s, plan: tlsiz(s.plan) });
    assert.ok(s.plan !== null && (s.plan['ozet'] as { tl?: unknown }).tl != null, 'örnek plan TL taşımalı');
    assert.deepEqual(m.plan?.['ops'], s.plan['ops']);
    for (const o of ['ozet', 'oncekiOzet']) if (m.plan?.[o] !== undefined) assert.equal((m.plan[o] as { tl?: unknown }).tl, null, o);
  });
});
