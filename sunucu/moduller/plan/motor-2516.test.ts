import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import { calismayaMotorAyari, motorAyariCoz } from './motor-ayari-kurallar.ts';
import { cozumGirdisi } from './plan-girdisi.ts';
import { motorKodu } from './plan-motoru.ts';

// 2516: planlama motoru düzeltmeleri (2507 a, 2509 a ve 2509-1 c, 2510 a, 2513 a, B-2483-9/-10/-11/-12/-15/-16/-67). Veriler uydurmadır:
// tek atölye, bir ya da iki tezgâh, gündüz vardiyası.
type Kayit = Record<string, unknown>;
interface Plan { ops: Record<string, Kayit & { S: number; C: number; m: string; pay?: number }>; fail?: string[] }
interface Degerlendirme {
  onT: number; late: number; yerlesmeyenSip: number; mesaiH: number; mesaiTL: number | null;
  J: Record<string, { T: number | null; p: number | null }>; util: Record<string, { u: number | null }>; warn: { t: string; txt: string; oncul?: string }[];
}
interface Ic {
  W0: Kayit;
  stHazirla: (st: unknown) => Kayit;
  schedule: (st: unknown, kip: string, taban: unknown) => Plan;
  evaluate: (plan: Plan, st: unknown, ref: unknown, hizli?: boolean) => Degerlendirme;
  haftaNo: (D: unknown, gun: number) => number;
  vardiyaNetSaat: (D: unknown, id: string) => number;
  verimIzle: (a: Kayit, v: number | null) => void;
  vardiyaIzle: (a: Kayit, v: string[] | null) => void;
  tmiMrpEksikleri: (m: Kayit[], l: unknown) => void;
  tmEksikYaz: (st: unknown) => { D: { satinalma: { kod: string; miktar: number; tm?: string }[] } };
}
function motor(): Ic {
  const b = vm.createContext({}); b['self'] = b;
  vm.runInContext(motorKodu(), b);
  return vm.runInContext('({ W0, stHazirla, schedule, evaluate, haftaNo, vardiyaNetSaat, verimIzle, vardiyaIzle, tmiMrpEksikleri, tmEksikYaz })', b) as Ic;
}
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const HAFTA_ICI = Object.fromEntries(GUN.map((g, i) => [g, i < 5 ? ['V1'] : []]));
const adim = (k: string, tezgah: string, ek: Kayit = {}) => ({ k, ad: 'OP ' + k, tezgahlar: [{ id: tezgah, cevrim: 60, ayar: 0 }], ...ek });
function durum(m: Ic, D: Kayit, ek: Kayit = {}) {
  return m.stHazirla({
    D: {
      meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }], calismaGunleri: HAFTA_ICI,
      tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G' }],
      personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['G'], ayar: true }, { id: 'P2', vardiya: 'V1', gruplar: ['G'] }, { id: 'P3', vardiya: 'V1', gruplar: ['G'] }],
      malzemeler: [], urunler: [{ id: 'U', rota: [adim('10', 'T1')] }], siparisler: [], ...D,
    },
    now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {},
    ...ek, w: { ...m.W0, tampon: false, ...((ek['w'] as Kayit | undefined) ?? {}) },
  });
}
const coz = (m: Ic, st: Kayit) => { const p = m.schedule(st, 'yeni', null); return { p, e: m.evaluate(p, st, null, false) }; };

describe('2516: sipariş sayımı ve ceza (B-2483-9, -10)', () => {
  test('terminsiz sipariş zamanında da geç de sayılmaz; yerleşmeyen sipariş geç değil ayrı sayılır', () => {
    const m = motor();
    const st = durum(m, {
      urunler: [{ id: 'U', rota: [adim('10', 'T1')] }, { id: 'Y', rota: [adim('10', 'T9')] }],
      siparisler: [
        { id: 'S1', urun: 'U', adet: 2, termin: '2026-01-09 16:00' },
        { id: 'S2', urun: 'U', adet: 2, termin: null },
        { id: 'S3', urun: 'Y', adet: 2, termin: '2026-01-09 16:00' },
        { id: 'S4', urun: 'U', adet: 30, termin: '2026-01-05 10:00' },
      ],
    });
    const { e } = coz(m, st);
    assert.equal(e.onT, 1, 'yalnız S1');
    assert.equal(e.late, 1, 'yalnız S4');
    assert.equal(e.yerlesmeyenSip, 1, 'S3 tezgâhsız');
  });

  test('ceza verisi yoksa geç siparişin cezası null; zamanında olanın 0', () => {
    const m = motor();
    const st = durum(m, { siparisler: [{ id: 'S1', urun: 'U', adet: 30, termin: '2026-01-05 10:00' }, { id: 'S2', urun: 'U', adet: 1, termin: '2026-01-09 16:00' }] });
    const { e } = coz(m, st);
    assert.ok((e.J['S1']?.T ?? 0) > 0);
    assert.equal(e.J['S1']?.p, null);
    assert.equal(e.J['S2']?.p, 0);
  });
});

describe('2516: kilitli iş öncülü geç biterse uyarı (2507 a)', () => {
  test('kilit saatinde kalır; öncülü kilitten sonra hazırsa uyarı öncülü söyler; öncül yetişirse uyarı yok', () => {
    const m = motor();
    const D = { urunler: [{ id: 'U', rota: [adim('10', 'T1'), adim('20', 'T2', { bag: [['10', 'b']] })] }], siparisler: [{ id: 'S1', urun: 'U', adet: 4, termin: null }] };
    const erken = durum(m, D, { locks: { 'S1.20': { m: 'T2', S: 10 } } });
    const a = coz(m, erken);
    assert.equal(a.p.ops['S1.20']?.S, 10, 'kilit sabit');
    assert.ok((a.p.ops['S1.10']?.C ?? 0) > 10);
    const u = a.e.warn.filter((w) => w.t === 'kilit');
    assert.equal(u.length, 1, JSON.stringify(a.e.warn));
    assert.equal(u[0]?.oncul, 'S1.10');
    const gec = durum(m, D, { locks: { 'S1.20': { m: 'T2', S: 14 } } });
    assert.equal(coz(m, gec).e.warn.filter((w) => w.t === 'kilit').length, 0);
  });
});

describe('2516: ek mesai molası, çarpanı ve haftası (2510 a, B-2483-12)', () => {
  test('ek mesai saati molası düşülmüş süredir; bedel her ek mesaide çarpanla', () => {
    const m = motor();
    const vardiyalar = [{ id: 'V1', bas: '08:00', bit: '16:00' }, { id: 'V3', bas: '22:00', bit: '06:00', molalar: [{ bas: '02:00', bit: '03:00' }] }];
    assert.equal(m.vardiyaNetSaat({ vardiyalar }, 'V3'), 7);
    const D = { vardiyalar, ayarlar: { mesaiUcret: 100 }, siparisler: [{ id: 'S1', urun: 'U', adet: 2, termin: null }] };
    const ek = { ekMesai: [{ m: 'T1', gun: 1, vardiya: 'V3' }] };
    const a = coz(m, durum(m, D, ek)).e;
    assert.equal(a.mesaiH, 7);
    assert.equal(a.mesaiTL, 7 * 100 * 1.5, 'vardiyalı günde de çarpan');
    const b = coz(m, durum(m, { ...D, planTL: { mesaiCarpan: 2 } }, ek)).e;
    assert.equal(b.mesaiTL, 7 * 100 * 2);
  });

  test('hafta pazartesi başlar: çarşamba başlayan planda pazartesi yeni haftadır', () => {
    const m = motor();
    const D = { meta: { baslangic: '2026-01-07' } };
    assert.deepEqual([0, 4, 5, 11, 12].map((g) => m.haftaNo(D, g)), [0, 0, 1, 1, 2]);
    assert.deepEqual([0, 6, 7].map((g) => m.haftaNo({ meta: { baslangic: '2026-01-05' } }, g)), [0, 0, 1]);
  });
});

describe('2516: ayarcı yalnız ayar dakikasında meşgul (2513 a)', () => {
  const D = (ayarDk: number | null) => ({
    urunler: [
      { id: 'A', rota: [{ k: '10', ad: 'OP', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 60 }], ...(ayarDk === null ? {} : { ayarDk }) }] },
      { id: 'B', rota: [{ k: '10', ad: 'OP', tezgahlar: [{ id: 'T2', cevrim: 60, ayar: 60 }], ...(ayarDk === null ? {} : { ayarDk }) }] },
    ],
    siparisler: [{ id: 'S1', urun: 'A', adet: 2, termin: '2026-01-06 16:00' }, { id: 'S2', urun: 'B', adet: 2, termin: '2026-01-06 16:00' }],
  });
  const fark = (m: Ic, d: Kayit) => { const p = coz(m, durum(m, d)).p; return Math.abs((p.ops['S1.10']?.S ?? NaN) - (p.ops['S2.10']?.S ?? NaN)); };
  test('tek ayarcıyla iki hazırlık: ayar dakikası 30 ise ikinci 30 dk sonra başlar; ayar dakikası yoksa bütün hazırlığı (60 dk) bekler', () => {
    const m = motor();
    assert.ok(Math.abs(fark(m, D(30)) - 0.5) < 1e-6, String(fark(m, D(30))));
    assert.ok(Math.abs(fark(m, D(null)) - 1) < 1e-6, String(fark(m, D(null))));
  });
  test('ayar dakikası 0 ise ayarcı aranmaz', () => {
    const m = motor();
    assert.ok(fark(m, D(0)) < 1e-6);
  });
});

describe('2516: fason süresi (B-2483-11) ve uydurulan sabitler (B-2483-16)', () => {
  test('süresi girilmemiş fasoncu 7 gün; kapasitesi bilinmeyen firmada aynı anda iş sınırı yok', () => {
    const m = motor();
    const st = durum(m, {
      calismaGunleri: Object.fromEntries(GUN.map((g) => [g, ['V1']])),
      fasoncular: [{ id: 'F', ad: 'Fason', cikisGunleri: GUN, cikisSaat: 16 }],
      urunler: [{ id: 'U', rota: [{ k: '10', ad: 'Kaplama', fason: 'F' }] }],
      siparisler: [{ id: 'S1', urun: 'U', adet: 1, termin: null }, { id: 'S2', urun: 'U', adet: 1, termin: null }],
    });
    const p = coz(m, st).p;
    const a = p.ops['S1.10']!, b = p.ops['S2.10']!;
    assert.equal(a.C - a.S, 7 * 24);
    assert.equal(a.S, b.S, 'kapasite uydurulmaz (eskiden 1)');
  });

  test('emrin fason adımı rotada fasonsa süresi emrin termininden, yoksa Satın Alma tahmininden; ikisi de yoksa rotanınki (7 gün), ürün kopyalanmaz', () => {
    const adimi = (seq: number, fason: boolean) => ({ id: `50-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId: fason ? null : '10', fasonId: fason ? '5' : null,
      terminGun: null, setup: 0, cycle: 2, alts: [], altTimes: {}, ins: [] });
    const emir = (id: string) => ({ id, no: `UE-${id}`, itemId: '50', qty: 5, start: '2026-10-19', due: '2026-10-30', priority: 2, note: '', status: 'serbest' });
    const durumu = {
      stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
      machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
      items: [{ id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul', unit: 'adet', stock: 0 }],
      opdefs: [{ id: '13', code: 'TOR', name: 'Tornalama' }],
      routes: { 50: { steps: [adimi(10, false), adimi(20, true)] } },
      routeRevs: [{ id: '1', itemId: '50', status: 'yururlukte' }],
      emirler: {
        orders: [emir('7'), emir('8'), emir('9')], opStatus: {}, opProg: {},
        opYer: { '7|root|2': { fasonId: '5', terminGun: null, tahminGun: 3 }, '8|root|2': { fasonId: '5', terminGun: 4, tahminGun: 3 }, '9|root|2': { fasonId: '5', terminGun: null } },
      },
    };
    const D0 = { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [] };
    const g = cozumGirdisi({
      calisma: { D: D0, rrSavedAt: 9, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null },
      kayit: { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] },
      kaynak: { durum: durumu, ek: null },
      istek: { simdi: '2026-10-19T05:00:00Z', kuyruklar: [{ makineId: 100, anahtarlar: ['UE-7|10', 'UE-8|10', 'UE-9|10'] }], sabitler: [], calisanlar: [] },
    });
    assert.ok(g);
    const D = (g.st as { D: { siparisler: { id: string; urun: string }[]; urunler: { id: string; rota: { k: string; fason?: string }[] }[]; fasoncular: { id: string; sureGun: number }[] } }).D;
    const sure = (id: string) => {
      const u = D.urunler.find((x) => x.id === D.siparisler.find((x) => x.id === id)?.urun);
      return D.fasoncular.find((f) => f.id === u?.rota.find((r) => r.fason)?.fason)?.sureGun;
    };
    assert.deepEqual([sure('7'), sure('8'), sure('9')], [3, 4, 7]);
    assert.equal(D.siparisler.find((x) => x.id === '9')?.urun, '50');
  });

  test('açık saati olmayan tezgâhın doluluğu null', () => {
    const m = motor();
    const st = durum(m, {
      tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G', hafta: Object.fromEntries(GUN.map((g) => [g, []])) }],
      siparisler: [{ id: 'S1', urun: 'U', adet: 2, termin: null }],
    });
    const { e } = coz(m, st);
    assert.equal(e.util['T2']?.u, null);
    assert.ok((e.util['T1']?.u ?? 0) > 0);
  });
});

describe('2516: verim ve vardiya izleme (B-2483-15)', () => {
  test('elle değiştirilmemiş verim ve vardiya listesi istasyonu izler; elle değişen korunur; işaretsiz eski kayıt eşitse izlemeye girer', () => {
    const m = motor();
    const a: Kayit = { verim: 0.9, verimIst: 0.9, vardiyalar: ['1'], vardiyalarIst: ['1'] };
    m.verimIzle(a, 0.8); m.vardiyaIzle(a, ['1', '2']);
    assert.deepEqual([a['verim'], a['verimIst'], a['vardiyalar']], [0.8, 0.8, ['1', '2']]);
    const elle: Kayit = { verim: 0.7, verimIst: 0.9, vardiyalar: ['2'], vardiyalarIst: ['1'] };
    m.verimIzle(elle, 0.8); m.vardiyaIzle(elle, ['1', '2']);
    assert.deepEqual([elle['verim'], elle['vardiyalar']], [0.7, ['2']]);
    const eski: Kayit = { verim: 0.8 };
    m.verimIzle(eski, 0.8);
    assert.equal(eski['verimIst'], 0.8);
  });
});

describe('2516: siparişi verilmemiş eksik sunucunun sayısıdır (B-2483-67)', () => {
  // M 1 kg/adet; A 100 adet başlamış, 60 kg sarf edilmiş; B 50 adet; stok 90. Sunucu net 0; motorun brüt hesabı 60 eksik derdi.
  const st = (m: Ic, mrp: unknown) => {
    const malzemeler: Kayit[] = [{ kod: 'M', stok: 90 }];
    if (mrp !== undefined) m.tmiMrpEksikleri(malzemeler, mrp);
    return { D: { meta: { baslangic: '2026-01-05' }, vardiyalar: [], calismaGunleri: {}, malzemeler, satinalma: [],
      siparisler: [{ id: 'A', adet: 100, malzeme: [{ kod: 'M', miktar: 1 }] }, { id: 'B', adet: 50, malzeme: [{ kod: 'M', miktar: 1 }] }] }, tmEk: { bas: 0, ih: {} } };
  };
  const eksik = (r: ReturnType<Ic['tmEksikYaz']>) => r.D.satinalma.filter((x) => x.tm === 'siparis-yok').map((x) => [x.kod, x.miktar]);
  test('sunucu eksiği varsa o; listede olmayan malzeme 0; hesaplanamayan (null) satır yazmaz; sunucu sayısı yoksa eski hesap', () => {
    const m = motor();
    assert.deepEqual(eksik(m.tmEksikYaz(st(m, []))), []);
    assert.deepEqual(eksik(m.tmEksikYaz(st(m, [{ kod: 'M', eksik: 25 }]))), [['M', 25]]);
    assert.deepEqual(eksik(m.tmEksikYaz(st(m, [{ kod: 'M', eksik: null }]))), []);
    assert.deepEqual(eksik(m.tmEksikYaz(st(m, undefined))), [['M', 60]]);
  });
});

describe('2516: acil iş payı motor ayarında, pay oranı yerleşimde (2509 a, 2509-1 c)', () => {
  test('eski ayar satırında acilPay yoksa 0,05; çalışmanın param.acilPay değeri sistem ayarıyla ezilir', () => {
    assert.equal(motorAyariCoz({ amac: 'sirali' }).acilPay, 0.05);
    assert.equal(motorAyariCoz({ acilPay: 0.5 }).acilPay, 0.05, 'sınır dışı varsayılana düşer');
    const c = calismayaMotorAyari({ D: {}, param: { tampon: true, acilPay: 0.2 } }, { ...MOTOR_AYARI_VARSAYILAN, acilPay: 0.1 }) as { param: Kayit };
    assert.deepEqual(c.param, { tampon: true, acilPay: 0.1 });
  });
  test('tampon açıkken yerleşim pay oranını taşır; işleme süresi 1/(1-pay) uzar', () => {
    const m = motor();
    const st = durum(m, { siparisler: [{ id: 'S1', urun: 'U', adet: 3, termin: null }] }, { w: { tampon: true, acilPay: 0.05 } });
    const r = m.schedule(st, 'yeni', null).ops['S1.10']!;
    assert.ok(Math.abs((r.pay ?? NaN) - 0.05) < 1e-9);
    assert.ok(Math.abs((r.C - r.S) * (1 - 0.05) - 3) < 1e-6, String(r.C - r.S));
  });
});
