import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { HAM, HAM_GIRDISI, YAZAR, ac, bekle, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Fason adım planda termin günü kadar takvim beklemesidir: atölye kapasitesi tüketmez, sonraki adım dönüşten sonra başlar (kart #1310). Veriler uydurmadır.
function depo(terminGun: number | null) {
  const adim = (i: number, ek: Record<string, unknown> = {}) => ({ id: `p${i + 1}`, seq: (i + 1) * 10, opId: `d${i + 1}`, stationId: `s${i + 1}`, setup: 10, cycle: 4, ins: i === 0 ? [HAM_GIRDISI] : [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0, ...ek });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [1, 3].map((n) => ({ id: `s${n}`, code: `IS-${n}`, name: `İstasyon ${n}`, wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 })),
    machines: [], people: [],
    opdefs: [1, 2, 3].map((n) => ({ id: `d${n}`, code: `OP-${n}`, abbr: `A${n}`, name: `Adım ${n}`, stationId: n === 2 ? '' : `s${n}`, setup: 10, cycle: 4 })),
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }, HAM],
    routes: { i1: { base: 1, steps: [adim(0), adim(1, { stationId: '', fasonId: '41', terminGun, setup: null, cycle: null }), adim(2)] } },
    orders: [{ id: 'o1', no: 'UE-2030-001', itemId: 'i1', qty: 10, start: '2030-03-04', due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: 1, tur: 'seri' }],
  };
}

// Sunucuya bağlı kart ve operasyon: kimlikler sunucu numarasıdır (tahmin sorgusu bunlarla gider).
function bagliDepo() {
  const d = depo(null);
  const adimlar = d.routes.i1.steps.map((s, i) => ({ ...s, opId: String(7 + i) }));
  return {
    ...d,
    opdefs: d.opdefs.map((o, i) => ({ ...o, id: String(7 + i), bagli: true })),
    items: [{ ...d.items[0]!, id: '501', bagli: true }, HAM],
    routes: { 501: { base: 1, steps: adimlar } },
    orders: d.orders.map((o) => ({ ...o, itemId: '501' })),
  };
}

const PLAN_OZETI = '(function(){ const P = curPlan(), R = P.orders.o1; return {unplanned:R.unplanned||0, blocked:R.blocked, warnings:R.warnings, ops:R.ops.map(o=>({seq:o.seq, start:o.start, end:o.end})), sched:P.sched.map(e=>e.stepId), load:Object.keys(P.load)}; })()';
type PlanOzeti = { unplanned: number; blocked: boolean; warnings: string[]; ops: Array<{ seq: number; start: number; end: number }>; sched: string[]; load: string[] };

async function planAc(terminGun: number | null, emirYeri?: string, deger: unknown = depo(terminGun)) {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger, surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Window & { eval: (k: string) => unknown };
  const ifade = <T,>(k: string): T => JSON.parse(String(pencere.eval(`JSON.stringify(${k})`))) as T;
  if (emirYeri !== undefined) pencere.eval(`${emirYeri}; invalidate();`);
  return ifade<PlanOzeti>(PLAN_OZETI);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Fason adım planda termin beklemesidir', () => {
  it('fason adım planlanamıyor saymaz; termin günü kadar sürer, istasyon yükü ve iş listesi almaz; sonraki adım dönüşten sonra başlar', async () => {
    const p = await planAc(5);
    expect([p.unplanned, p.blocked]).toEqual([0, false]);
    const [op10, op20, op30] = p.ops;
    expect(op20!.start).toBeCloseTo(op10!.end, 6);
    expect(op20!.end - op20!.start).toBeCloseTo(5, 6);
    expect(op30!.start).toBeGreaterThanOrEqual(op20!.end - 1e-6);
    expect(p.sched).toEqual(['p1', 'p3']);
    expect(p.load.sort()).toEqual(['s1', 's3']);
  }, 40000);

  it('emirde içeri alınan fason adım atölyede, emirde fasona alınan iç adım termin beklemesi olarak planlanır; rota değişmez', async () => {
    const ic = await planAc(5, 'EMIR_YERI = {"o1|root|p2": {fasonId:null, terminGun:null, stationId:"s3", setup:10, cycle:4}}');
    expect(ic.sched).toEqual(['p1', 'p2', 'p3']);
    expect(ic.ops[1]!.end - ic.ops[1]!.start).toBeLessThan(1);
    cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat();
    const dis = await planAc(5, 'EMIR_YERI = {"o1|root|p3": {fasonId:"41", terminGun:2, stationId:null, setup:null, cycle:null}}');
    expect([dis.unplanned, dis.blocked]).toEqual([0, false]);
    expect(dis.sched).toEqual(['p1']);
    expect(dis.ops[2]!.start).toBeGreaterThanOrEqual(dis.ops[1]!.end - 1e-6);
    expect(dis.ops[2]!.end - dis.ops[2]!.start).toBeCloseTo(2, 6);
  }, 60000);

  it('sunucu emrinin adım yeri iş emri sırasıyla rota adımına eşlenir', async () => {
    const p = await planAc(5, `uyumlaEmirler({orders:[{id:"o1", no:"UE-2030-001", itemId:"i1", qty:10, start:"2030-03-04", due:"2030-03-29", priority:3, status:"serbest", tur:"seri", note:null, created:1, surum:1}],
      opStatus:{}, opProg:{}, opYer:{"o1|root|2": {fasonId:null, terminGun:null, stationId:"s3", setup:10, cycle:4}}})`);
    expect(p.sched).toEqual(['p1', 'p2', 'p3']);
  }, 40000);

  it('termini girilmemiş fason adım uyarı verir ve 7 gün bekler (kullanıcı kararı 16.10.2026); emir yine planlanır', async () => {
    const p = await planAc(null);
    expect([p.unplanned, p.blocked]).toEqual([0, false]);
    expect(p.warnings).toContain('MM-001, adım 20: fason adımın termin günü girilmemiş; 7 gün sayıldı.');
    expect(p.ops[1]!.end - p.ops[1]!.start).toBeCloseTo(7, 6);
  }, 40000);

  it('termini girilmemiş bağlı fason adım satın almanın geçmiş teslimat tahminini bekler; tahmin yoksa 7 gün kalır', async () => {
    // Satın almanın geçmişi yalnız 10 adet için var (3,5 gün); başka adet null döner.
    const sorgular: string[] = [];
    sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: bagliDepo(), surum: 1 }]);
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const m = /\/api\/recete-rota\/fason-tahminleri\?s=(.*)$/.exec(adres);
      if (m) {
        const dortluler = decodeURIComponent(m[1]!).split(',');
        sorgular.push(...dortluler);
        return new Response(JSON.stringify({ gunler: dortluler.map((d) => (d === '501-8-41-10' ? 3.5 : null)) }), { status: 200 });
      }
      return asil(adres, secenek);
    }));
    // Çerçevenin tahmin isteği gerçek köprüden geçer (sorgu metni köprüde kurulur); başka istek bu testte yanıtlanmaz.
    const isle = kopruKur();
    const dinleyici = (e: MessageEvent) => {
      const m = e.data as { kanal?: string; yon?: string; id?: number; tip?: string; veri?: unknown } | null;
      if (m?.kanal !== 'recete-rota' || m.yon !== 'istek' || m.tip !== 'fason-tahmin') return;
      const cerceve = Array.from(document.querySelectorAll('iframe')).reverse().find((f) => f.getAttribute('srcdoc') === null);
      const w = cerceve?.contentWindow as (Window & { MessageEvent: typeof MessageEvent }) | null | undefined;
      const yanit = (govde: Record<string, unknown>) => { w?.dispatchEvent(new w.MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'yanit', id: m.id, ...govde }, source: w.parent })); };
      isle(m.tip, m.veri).then((veri) => { yanit({ ok: true, veri }); }, (h: unknown) => { yanit({ ok: false, ...kopruHatasi(h) }); });
    };
    window.addEventListener('message', dinleyici);
    onTestFinished(() => { window.removeEventListener('message', dinleyici); });
    ac('/recete-rota');
    const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
    const belge = await prototipiCalistir(html);
    const pencere = belge.defaultView as unknown as Window & { eval: (k: string) => unknown };
    const plan = (): PlanOzeti => JSON.parse(String(pencere.eval(`JSON.stringify(${PLAN_OZETI})`))) as PlanOzeti;
    plan();
    await vi.waitFor(() => { expect(sorgular).toContain('501-8-41-10'); });
    await vi.waitFor(() => { expect(plan().ops[1]!.end - plan().ops[1]!.start).toBeCloseTo(3.5, 6); });
    expect(plan().warnings).toContain('MM-001, adım 20: fason adımın termin günü girilmemiş; geçmiş teslimattan 3,5 gün sayıldı.');

    // verisi olmayan sorgu (başka adet) 7 günde kalır ve bir daha sorulmaz
    pencere.eval('st.orders[0].qty = 20; invalidate();');
    plan();
    await vi.waitFor(() => { expect(sorgular).toContain('501-8-41-20'); });
    await bekle(50);
    pencere.eval('invalidate();');
    const p = plan();
    expect(p.ops[1]!.end - p.ops[1]!.start).toBeCloseTo(7, 6);
    expect(p.warnings).toContain('MM-001, adım 20: fason adımın termin günü girilmemiş; 7 gün sayıldı.');
    await bekle(50);
    expect(sorgular.filter((d) => d === '501-8-41-20')).toHaveLength(1);
    expect(sorgular.filter((d) => d === '501-8-41-10')).toHaveLength(1);
  }, 60000);
});

describe('Süresi girilmemiş adım', () => {
  it('işlem ve değişim süresi boş iç adım (sunucu rotasında birim süre yok) sıfır dakikayla planlanmaz: uyarı verir, planlanamayan sayılır; elle girilen 0 planlanır', async () => {
    const bos = await planAc(5, 'Object.assign(st.routes.i1.steps[1], {fasonId:null, stationId:"s3", proc:null, chg:null, cycle:0})');
    expect(bos.warnings).toContain('MM-001, adım 20: işlem süresi girilmemiş; adım planlanmadı.');
    expect(bos.unplanned).toBe(1);
    expect(bos.ops.map((o) => o.seq)).toEqual([10, 30]);
    cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat();
    const sifir = await planAc(5, 'Object.assign(st.routes.i1.steps[1], {fasonId:null, stationId:"s3", proc:0, chg:null, cycle:0})');
    expect(sifir.warnings.some((w) => w.includes('işlem süresi girilmemiş'))).toBe(false);
    expect(sifir.ops.map((o) => o.seq)).toEqual([10, 20, 30]);
  }, 60000);
});
