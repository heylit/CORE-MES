import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { degerlendirmeGovdesi, degerlendirmeSonucu, SIRA_EN_COK, type DegerlendirmeIstegi, type DegerlendirmeSonucu } from '#paylasilan/sozlesme/planlama.ts';
import { degerlendirmeYap, maliyetsiz, type DegerlendirmeZarfi } from './degerlendirme.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 2149: tezgâh sırası önizlemesi (kuyrukta bir öne/arkaya, sürükle, tezgâh sırası Uygula). Betik doğrudan koşar (veritabanı yok); iki tezgâh,
// sekiz emir, uydurma veri (2129b fikstürü).
const tezgah = (id: string, grup: string, ucret: number | null): Record<string, unknown> => ({ id, ad: id, grup, ucret, verim: 1, vardiyalar: ['3'], opOran: 0 });
const adim = (p: string, seq: number, st: string, cycle: number, setup: number) => ({ id: `${p}-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId: st, setup, cycle, alts: [] as string[], altTimes: {} as Record<string, { setup: number; cycle: number }>, ins: [] });
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
type Op = { id: string; job: string; m: string; S: number; C: number; act?: boolean; done?: boolean };
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
type Sira = Extract<DegerlendirmeSonucu, { tur: 'sira-degistir' }>;
const sira = (r: Awaited<ReturnType<typeof dene>>): Sira => { const s = sonuc(r); if (s.tur !== 'sira-degistir') return assert.fail(s.tur); return s; };
const opsOf = (c: Record<string, unknown>): Record<string, Op> => (c['plan'] as { ops: Record<string, Op> }).ops;
// Tezgâhın planlı, başlamamış kuyruğu plandaki sırasıyla.
const kuyrukOf = (c: Record<string, unknown>, m: string): string[] =>
  Object.values(opsOf(c)).filter((r) => r.m === m && Number.isFinite(r.S) && !r.act && !r.done).sort((a, b) => a.S - b.S).map((r) => r.id);
// İki tezgâhta da yapılabilen adım için ikinci tezgâh: rota adımına alternatif eklenir.
const ESNEK = '51-o10'; const ESNEK_SEQ = '.10';
function esnekKayit(): typeof KAYIT {
  return { ...KAYIT, routes: { ...KAYIT.routes, 51: { base: null, steps: KAYIT.routes[51].steps.map((x) => (x.id === ESNEK ? { ...x, alts: ['10'], altTimes: { 10: { setup: 45, cycle: 50 } } } : x)) } } };
}

describe('planlama hamlesi: tezgâh sırası (2149)', () => {
  test('MS-01: komşu iki adım yer değiştirir; önizleme istenen sırayı taşır, plan veri sürümünde; aynı girdi aynı sonuç', async () => {
    const c = planli(); const m = '100'; const q = kuyrukOf(c, m);
    assert.ok(q.length >= 3, 'kuyrukta en az üç iş');
    // Öncülünü bekleyen adım öne alınamaz (neden yazılır); öncülü hazır olan çift yer değiştirir.
    let tutulan = 0;
    for (let i = 1; i < q.length; i++) {
      const istek: DegerlendirmeIstegi = { tur: 'sira-degistir', tezgah: m, sira: [q[i]!, q[i - 1]!] };
      const a = await dene(istek, c); const s = sira(a);
      if (s.plan === null) { assert.match(s.neden ?? '', /tutamadı/); assert.deepEqual(s.degisen, []); continue; }
      tutulan++;
      assert.equal(s.neden, null);
      assert.equal(s.plan['dataVer'], surumu(c));
      const y = s.plan['ops'] as Record<string, Op>;
      assert.ok(y[q[i]!]!.S < y[q[i - 1]!]!.S, 'istenen sıra');
      assert.ok(s.sira.indexOf(q[i]!) < s.sira.indexOf(q[i - 1]!));
      assert.deepEqual(Object.keys(y).sort(), Object.keys(opsOf(c)).sort(), 'işler düşmez');
      assert.ok(s.gecikmeSonra !== null);
      if (tutulan === 1) assert.deepEqual(await dene(istek, c), a);
    }
    assert.ok(tutulan > 0, 'en az bir çift yer değiştirir');
  });

  test('MS-02: bütün kuyruğun yeni sırası (tezgâh sırası Uygula) en az bir sırada tutulur ya da nedeniyle reddedilir', async () => {
    const c = planli();
    let tutulan = 0;
    for (const m of ['100', '200']) {
      const q = kuyrukOf(c, m); if (q.length < 2) continue;
      const yeni = [q[q.length - 1]!, ...q.slice(0, -1)];
      const s = sira(await dene({ tur: 'sira-degistir', tezgah: m, sira: yeni }, c));
      if (s.plan) { tutulan++; const y = s.plan['ops'] as Record<string, Op>; for (let i = 1; i < yeni.length; i++) assert.ok(y[yeni[i - 1]!]!.S < y[yeni[i]!]!.S, `${m} ${String(i)}`); }
      else assert.ok(s.neden);
    }
    assert.ok(tutulan > 0, 'en az bir tezgâhta yeni sıra tutulur');
  });

  test('MS-03: sabit adımın sıradaki yeri değişmez; sabit adım başka tezgâha gitmez', async () => {
    const c = planli(); const m = '100'; const q = kuyrukOf(c, m); const r = opsOf(c)[q[0]!]!;
    const k = { ...c, locks: { [q[0]!]: { m: r.m, S: r.S } } };
    const s = sira(await dene({ tur: 'sira-degistir', tezgah: m, sira: [q[1]!, q[0]!] }, k));
    assert.equal(s.plan, null); assert.match(s.neden ?? '', /sabit/);
    assert.deepEqual(s.sira.slice(0, q.length), q, 'kayıtlı sıra döner');
    const s2 = sira(await dene({ tur: 'sira-degistir', tezgah: '200', sira: [q[0]!] }, k));
    assert.equal(s2.plan, null); assert.match(s2.neden ?? '', /sabit/);
  });

  test('MS-04: başlamış adım oynamaz, yapamayan tezgâha taşınmaz, bilinmeyen adım ve tezgâh reddedilir, değişmeyen sıra reddedilir', async () => {
    const c = planli(); const q = kuyrukOf(c, '100');
    const ops = opsOf(c); const bas = { ...c, plan: { ...(c['plan'] as object), ops: { ...ops, [q[0]!]: { ...ops[q[0]!]!, act: true } } } };
    assert.match(sira(await dene({ tur: 'sira-degistir', tezgah: '100', sira: [q[1]!, q[0]!] }, bas)).neden ?? '', /başlamış/);
    const baskaTezgahta = kuyrukOf(c, '200')[0]!;
    assert.match(sira(await dene({ tur: 'sira-degistir', tezgah: '100', sira: [baskaTezgahta] }, c)).neden ?? '', /yapılamaz/);
    assert.match(sira(await dene({ tur: 'sira-degistir', tezgah: '100', sira: ['YOK-o1'] }, c)).neden ?? '', /planda yok/);
    assert.match(sira(await dene({ tur: 'sira-degistir', tezgah: '999', sira: [q[0]!] }, c)).neden ?? '', /Tezgâh/);
    assert.match(sira(await dene({ tur: 'sira-degistir', tezgah: '100', sira: [q[0]!, q[1]!] }, c)).neden ?? '', /değişmedi/);
  });

  test('MS-05: başka tezgâhta da yapılabilen adım bu tezgâha taşınır, bırakıldığı işin önüne yerleşir', async () => {
    const kayit = esnekKayit();
    let S: Record<string, unknown> = calismaKur();
    let g = planGirdisi({ calisma: S, kayit, kaynak: KAYNAK, bugun: '2026-10-19' });
    for (let i = 0; i < 4 && g && g.S['dataVer'] !== S['dataVer']; i++) { S = g.S; g = planGirdisi({ calisma: S, kayit, kaynak: KAYNAK, bugun: '2026-10-19' }); }
    assert.ok(g);
    const mt = motorYukle(); const p = mt.schedule(g.st, 'dagit', null);
    const e = mt.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
    const c = { ...S, plan: { ops: p.ops, fail: [], J: Object.fromEntries(Object.entries(e.J).map(([k, x]) => [k, { C: x.C, T: x.T }])), dataVer: S['dataVer'] } };
    const ops = opsOf(c);
    // Ürün 51'in ilk adımı (çift numaralı emirler): rotada freze, alternatifi torna.
    const tasinan = Object.values(ops).find((r) => r.id === `O0${ESNEK_SEQ}`);
    if (!tasinan) return assert.fail(`esnek adım planda yok: ${Object.keys(ops).slice(0, 5).join(',')}`);
    const hedef = tasinan.m === '100' ? '200' : '100';
    const q = kuyrukOf(c, hedef); assert.ok(q.length > 0);
    const s = sira(await degerlendirmeYap({ calisma: c, kayit, kaynak: KAYNAK, bugun: '2026-10-19', istek: { tur: 'sira-degistir', tezgah: hedef, sira: [tasinan.id, q[0]!] } }, AN));
    assert.equal(s.neden, null, s.neden ?? ''); if (s.plan === null) return;
    const y = s.plan['ops'] as Record<string, Op>;
    assert.equal(y[tasinan.id]!.m, hedef);
    assert.ok(y[tasinan.id]!.S < y[q[0]!]!.S);
    assert.ok(s.sira.includes(tasinan.id));
  });
});

describe('planlama hamlesi: tezgâh sırası ret ve sözleşme (2149)', () => {
  test('MS-06: plan yoksa plan-yok, plan veriden eskiyse plan-bayat', async () => {
    assert.deepEqual(await dene({ tur: 'sira-degistir', tezgah: '100', sira: ['x'] }, calismaKur()), { hata: 'plan-yok' });
    const c = planli(); const q = kuyrukOf(c, '100');
    assert.deepEqual(await dene({ tur: 'sira-degistir', tezgah: '100', sira: [q[1]!, q[0]!] }, { ...c, dataVer: surumu(c) + 1 }), { hata: 'plan-bayat' });
  });

  test('MS-07: gövde: boş, yinelenen ve sınırı aşan sıra reddedilir; fazla alan reddedilir; maliyetsiz görünüm sonucu değiştirmez', async () => {
    const g = (istek: unknown) => degerlendirmeGovdesi.safeParse({ surum: 1, istek }).success;
    assert.ok(g({ tur: 'sira-degistir', tezgah: '100', sira: ['a', 'b'] }));
    assert.ok(!g({ tur: 'sira-degistir', tezgah: '100', sira: [] }));
    assert.ok(!g({ tur: 'sira-degistir', tezgah: '100', sira: ['a', 'a'] }));
    assert.ok(!g({ tur: 'sira-degistir', tezgah: '', sira: ['a'] }));
    assert.ok(!g({ tur: 'sira-degistir', sira: ['a'] }));
    assert.ok(!g({ tur: 'sira-degistir', tezgah: '100', sira: Array.from({ length: SIRA_EN_COK + 1 }, (_, i) => `a${String(i)}`) }));
    assert.ok(!g({ tur: 'sira-degistir', tezgah: '100', sira: ['a'], hizli: true }));
    const c = planli(); const q = kuyrukOf(c, '100');
    const s = sira(await dene({ tur: 'sira-degistir', tezgah: '100', sira: [q[1]!, q[0]!] }, c));
    assert.deepEqual(maliyetsiz(s), s);
  });
});
