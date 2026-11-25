import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 3681: başlamış adım da bölünür; çalışan kaynak 1. paydır, kalan adet paylaştırılır, payların sayılanı korunur, uygulanamayan bölmenin
// nedeni motorda kalır. Motor yalnız hesap yapar (veritabanı yok); veriler uydurmadır. Süre: 30 dk/adet, tezgâh 08:00-16:00.
const makine = (id: string) => ({ id, code: `T${id}`, name: `Tezgah ${id}`, stationId: '10', status: 'aktif', aktif: true });
const istasyon = (id: string) => ({ id, code: `S${id}`, name: `Istasyon ${id}`, wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true });
const adim = (seq: number, stationId: string) => ({
  id: `50-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId, setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [], split: 'tek', minLot: 0,
});
type Gercek = { m: string; S: number; n?: number; A?: number; kalan?: number; sayim?: number; paylar?: Record<string, number>; C?: number };
interface Ayar { adet?: number; elleBol?: Record<string, { adet: number; m: string }[]>; gercek?: Record<string, Gercek>; calisan?: Record<string, unknown>[] }
const girdi = (a: Ayar) => {
  const ROTA = {
    items: [{ id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul', unit: 'ad', stock: 0 }],
    routes: { 50: { base: null, steps: [adim(10, '10'), adim(20, '30')] } },
    routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
  };
  const kayit = {
    version: 7, savedAt: 9, items: ROTA.items, opdefs: [{ id: '13', name: 'Montaj' }], machines: [], routes: ROTA.routes,
    orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: a.adet ?? 30, start: '2026-10-19', due: '2026-11-20', priority: 1, status: 'serbest' }],
  };
  const kaynak = {
    durum: {
      ...ROTA,
      wcs: [{ id: '1', code: 'IM-1', name: 'Montaj', week: null, aktif: true }],
      stations: [istasyon('10'), istasyon('30')],
      machines: [makine('100'), makine('101'), makine('102'), { ...makine('300'), stationId: '30' }],
      people: [],
      ...(a.calisan ? { calisanAdimlar: a.calisan } : {}),
      cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    },
    ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null, insanliIstasyonlar: [], ekipUyeleri: {} },
  };
  const calisma = {
    surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
    rrSavedAt: 5, dataVer: 1, kisitSurum: 2, down: [], ekMesai: [], locks: {}, gercek: {}, ...(a.elleBol ? { elleBol: a.elleBol } : {}), w: { famK: 0.3, mat: 'sert', dondurma: 4, rule: 'edd' },
    param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: ['personel'], olaylar: [], plan: null,
  };
  const g = planGirdisi({ calisma: calismayaMotorAyari(calisma, { ...MOTOR_AYARI_VARSAYILAN }), kayit, kaynak, bugun: '2026-10-19' });
  assert.ok(g);
  return g;
};
interface Is { m: string; S: number; C: number; act?: number; pin?: number; done?: number }
interface CxOp { id: string; adet: number; bolAdet?: number; kalanAdet?: number; sayilan?: number; parca?: number; parcaAdedi?: number; elle?: number; asil?: string; c: { m: string }[]; pr: [string, string][] }
interface Cx { ops: CxOp[]; bolme: Record<string, { kod: string; metin: string }> }
const planla = (a: Ayar) => {
  const m = motorYukle();
  const st = girdi(a).st;
  Object.assign(st.gercek as Record<string, unknown>, a.gercek ?? {});
  const cx = m.compile(m.stHazirla(st)) as Cx;
  const p = m.schedule(st, 'yeni', null) as { ops: Record<string, Is> };
  return { st, cx, p, paylar: Object.keys(p.ops).filter((id) => id.startsWith('O1.10')).sort(), op: (id: string) => cx.ops.find((o) => o.id === id) };
};
// Motor ayrı vm bağlamında koşar: nesneler başka gerçeklemden gelir, deepEqual yerine kayıt metnine bakılır.
const esit = (a: unknown, b: unknown): void => { assert.equal(JSON.stringify(a), JSON.stringify(b)); };
const yarim = (o: Partial<Gercek> = {}): Gercek => ({ m: '100', S: 1, n: 8, A: 30, kalan: 11, sayim: 5, ...o });

describe('plan: başlamış adımı bölme (3681 C)', () => {
  test('başlamış, bölünmemiş 30 adet, 8 sayılmış: eşit 2 bölme çalışan tezgâhta 8+11=19, ikincisi seçilen tezgâhta 11; 1. payın başlangıcı değişmez', () => {
    const { cx, p, paylar, op } = planla({ gercek: { 'O1.10': yarim() }, elleBol: { 'O1.10': [{ adet: 19, m: '100' }, { adet: 11, m: '101' }] } });
    esit(paylar, ['O1.10', 'O1.10~2']);
    esit(cx.ops.filter((o) => o.id.startsWith('O1.10')).map((o) => [o.adet, o.parca, o.parcaAdedi]), [[19, 1, 2], [11, 2, 2]]);
    assert.equal(op('O1.10')?.sayilan, 8);
    assert.equal(op('O1.10')?.kalanAdet, 11);
    assert.equal(p.ops['O1.10']!.m, '100');
    assert.equal(p.ops['O1.10']!.S, 1, 'başlamış payın başlangıcı yerinde');
    assert.equal(p.ops['O1.10']!.act, 1);
    assert.equal(p.ops['O1.10~2']!.m, '101');
    assert.ok(p.ops['O1.20']!.S >= Math.max(p.ops['O1.10']!.C, p.ops['O1.10~2']!.C) - 1e-9, 'ardıl iki payı da bekler');
    esit(cx.bolme, {});
  });

  test('1. payın bitişi yalnız kendi kalanından hesaplanır: bölme kalan süreyi payın kalan adedine oranlar', () => {
    // Bölünmemiş adımın kalanı 11 saat (22 adet x 30 dk); 11 adetlik kalan pay 5,5 saatte biter.
    const bolunmus = planla({ gercek: { 'O1.10': yarim({ kalan: 11 }) }, elleBol: { 'O1.10': [{ adet: 19, m: '100' }, { adet: 11, m: '101' }] } });
    const yariKalan = planla({ gercek: { 'O1.10': yarim({ kalan: 5.5 }) } });
    assert.ok(Math.abs(bolunmus.p.ops['O1.10']!.C - yariKalan.p.ops['O1.10']!.C) < 1e-6);
    assert.ok(bolunmus.p.ops['O1.10']!.C < planla({ gercek: { 'O1.10': yarim({ kalan: 11 }) } }).p.ops['O1.10']!.C, 'bölünmemiş adımdan erken');
  });

  test('derleme birden çok kez koşsa da kalan üst üste oranlanmaz', () => {
    const { st } = planla({ gercek: { 'O1.10': yarim({ kalan: 11 }) }, elleBol: { 'O1.10': [{ adet: 19, m: '100' }, { adet: 11, m: '101' }] } });
    const m = motorYukle();
    const once = m.schedule(st, 'yeni', null) as { ops: Record<string, Is> };
    const sonra = m.schedule(st, 'yeni', null) as { ops: Record<string, Is> };
    assert.equal(once.ops['O1.10']!.C, sonra.ops['O1.10']!.C);
  });

  test('çalışan tezgâh listede başka sırada ise 1. pay olur', () => {
    const { cx, p } = planla({ gercek: { 'O1.10': yarim({ m: '101' }) }, elleBol: { 'O1.10': [{ adet: 11, m: '100' }, { adet: 19, m: '101' }] } });
    esit(cx.ops.filter((o) => o.id.startsWith('O1.10')).map((o) => [o.id, o.adet, o.c.map((c) => c.m)]), [['O1.10', 19, ['101']], ['O1.10~2', 11, ['100']]]);
    assert.equal(p.ops['O1.10']!.m, '101');
  });
});

describe('plan: farklı ilerleyen paylar (3681 C)', () => {
  test('pay 1 15/15 bitti, pay 2 5/15: kalan 10, 1. payın tezgâhına ve 2. paya 5+5 verilir; biten payın eski yeri değişmez', () => {
    // Çalışan kaynak 101 (5 sayılmış); 100'deki pay 15 sayarak bitmişti. Kalanı yeniden böl: 100 -> 15+5 = 20, 101 -> 5+5 = 10.
    const g = yarim({ m: '101', n: 20, kalan: 5, paylar: { 100: 15, 101: 5 } });
    const { cx, p, op } = planla({ gercek: { 'O1.10': g }, elleBol: { 'O1.10': [{ adet: 20, m: '100' }, { adet: 10, m: '101' }] } });
    esit(cx.bolme, {});
    assert.equal(op('O1.10')?.c[0]?.m, '101');
    assert.equal(op('O1.10~2')?.c[0]?.m, '100');
    assert.equal(op('O1.10')?.kalanAdet, 5);
    assert.equal(op('O1.10~2')?.kalanAdet, 5);
    assert.equal(op('O1.10~2')?.sayilan, 15);
    assert.equal(p.ops['O1.10~2']!.S, 1, 'eski yeri: başlangıç adımınki');
    assert.equal(p.ops['O1.10~2']!.act, 1);
    assert.equal(p.ops['O1.10~2']!.m, '100');
    assert.ok(p.ops['O1.10~2']!.C > 7 && p.ops['O1.10']!.C > 7);
  });

  test('biten pay kapanır: kalanı yoksa planda yeri sayılanla biter, tezgâhını tutmaz', () => {
    const g = yarim({ m: '101', n: 20, kalan: 5, paylar: { 100: 15, 101: 5 } });
    const { p, op } = planla({ gercek: { 'O1.10': g }, elleBol: { 'O1.10': [{ adet: 15, m: '100' }, { adet: 15, m: '101' }] } });
    assert.equal(op('O1.10~2')?.kalanAdet, 0);
    assert.equal(p.ops['O1.10~2']!.done, 1);
    assert.ok(p.ops['O1.10~2']!.C <= 7 + 1e-9, 'şimdiden sonrasına taşmaz');
    assert.equal(p.ops['O1.10']!.m, '101');
  });

  test('fazla sayım: pay 1 18/15 sayıldıysa pay 2 nin kalanı 12 ye iner (adım toplamı esastır)', () => {
    const g = yarim({ m: '100', n: 18, kalan: 6, paylar: { 100: 18 } });
    const { op, cx } = planla({ gercek: { 'O1.10': g }, elleBol: { 'O1.10': [{ adet: 15, m: '100' }, { adet: 15, m: '101' }] } });
    esit(cx.bolme, {});
    assert.equal(op('O1.10')?.kalanAdet, 0);
    assert.equal(op('O1.10~2')?.kalanAdet, 12);
    assert.equal(op('O1.10~2')?.bolAdet, 15, 'kayıtlı pay adedi korunur, kalan 12');
    assert.equal(op('O1.10~2')?.adet, 12, 'süre kalan adetten');
  });
});

describe('plan: üç paylı fazla sayım (3681)', () => {
  test('fazla sayım öteki payların kalanından sondan başa düşülür: 1. pay 14/10 sayıldıysa son pay 10 dan 6 ya iner, ortadaki payın kalanı değişmez', () => {
    const g = yarim({ m: '100', n: 14, kalan: 8, paylar: { 100: 14 } });
    const { op, cx } = planla({ gercek: { 'O1.10': g }, elleBol: { 'O1.10': [{ adet: 10, m: '100' }, { adet: 10, m: '101' }, { adet: 10, m: '102' }] } });
    esit(cx.bolme, {});
    esit(['O1.10', 'O1.10~2', 'O1.10~3'].map((id) => op(id)?.kalanAdet), [0, 10, 6]);
  });
});

describe('plan: bölünemeyen ya da uygulanamayan bölmenin nedeni (3681 D)', () => {
  test('rotada olmayan tezgâha verilen pay: bölme uygulanmaz, neden döner, adım tek parça kalır', () => {
    const { cx, paylar } = planla({ elleBol: { 'O1.10': [{ adet: 15, m: '100' }, { adet: 15, m: '300' }] } });
    esit(paylar, ['O1.10']);
    esit(cx.bolme['O1.10'], { kod: 'tezgah', metin: "Parça 2'nin tezgâhı rotada yok" });
  });

  test('adet parça sayısından az', () => {
    const { cx } = planla({ adet: 1, elleBol: { 'O1.10': [{ adet: 1, m: '100' }, { adet: 1, m: '101' }] } });
    assert.equal(cx.bolme['O1.10']?.kod, 'adet');
    assert.match(cx.bolme['O1.10']!.metin, /Adet parça sayısından az/);
  });

  test('geçersiz pay (adet 0) ve tek kayıtlı pay (birleştirme) ayrımı: tek pay nedensiz bütün kalır', () => {
    assert.equal(planla({ elleBol: { 'O1.10': [{ adet: 0, m: '100' }, { adet: 30, m: '101' }] } }).cx.bolme['O1.10']?.kod, 'gecersiz');
    const tek = planla({ elleBol: { 'O1.10': [{ adet: 30, m: '100' }] } });
    esit(tek.cx.bolme, {});
    esit(tek.paylar, ['O1.10']);
  });

  test('başlamış adımda çalışan tezgâhın payı yoksa ya da başlamış payın tezgâhı bölmede yoksa bölme uygulanmaz', () => {
    const calisanYok = planla({ gercek: { 'O1.10': yarim({ m: '102' }) }, elleBol: { 'O1.10': [{ adet: 19, m: '100' }, { adet: 11, m: '101' }] } });
    assert.equal(calisanYok.cx.bolme['O1.10']?.kod, 'calisan');
    assert.match(calisanYok.cx.bolme['O1.10']!.metin, /Çalışan tezgâhın \(T102\) payı yok|Çalışan tezgâhın \(102\) payı yok/);
    esit(calisanYok.paylar, ['O1.10']);
    assert.equal(calisanYok.p.ops['O1.10']!.m, '102', 'başladığı tezgâhta bütün kalır');
    const payiSilinen = planla({ gercek: { 'O1.10': yarim({ m: '101', n: 20, paylar: { 100: 15, 101: 5 } }) }, elleBol: { 'O1.10': [{ adet: 15, m: '101' }, { adet: 15, m: '102' }] } });
    assert.equal(payiSilinen.cx.bolme['O1.10']?.kod, 'baslamis-pay');
  });

  test('bitmiş adım bölünmez: neden döner', () => {
    const { cx } = planla({ gercek: { 'O1.10': { m: '100', S: 8, C: 9, n: 30, A: 30 } }, elleBol: { 'O1.10': [{ adet: 15, m: '100' }, { adet: 15, m: '101' }] } });
    esit(cx.bolme['O1.10'], { kod: 'bitti', metin: 'Bitmiş adım bölünmez' });
  });

  test('bölünmeyen adımın görünümü değişmez: bolme boş, paylı kayıt alanı yok', () => {
    const { cx, paylar } = planla({});
    esit(cx.bolme, {});
    esit(paylar, ['O1.10']);
    assert.equal(cx.ops.find((o) => o.id === 'O1.10')?.parca, undefined);
  });
});

describe('plan: sunucunun pay ilerlemesi gerçekleşen kayda geçer (3681)', () => {
  test('çalışan adımın payları (makine ve kişi) tezgâh anahtarıyla gerçekleşen kayıtta durur; yoksa alan yoktur', () => {
    const calisan = (paylar?: unknown) => [{ anahtar: 'E-1|10', makineId: '101', baslangic: '2026-10-19T05:00:00.000Z', sayimAni: '2026-10-19T06:00:00.000Z', kalanVerimliDk: 300, saglam: 20, adet: 30, ...(paylar ? { paylar } : {}) }];
    const g = (c: Record<string, unknown>[]) => (girdi({ calisan: c }).st.gercek as Record<string, { m: string; n: number; paylar?: Record<string, number> }>)['O1.10'];
    const var_ = g(calisan([{ makineId: '100', kisiId: null, sayilan: 15 }, { makineId: '101', kisiId: null, sayilan: 5 }, { makineId: null, kisiId: '7', sayilan: 2 }]));
    assert.ok(var_, 'çalışan adım gerçekleşen kayda girdi');
    esit(var_.paylar, { 100: 15, 101: 5, 'kisi-7': 2 });
    assert.equal(g(calisan())?.paylar, undefined);
  });
});
