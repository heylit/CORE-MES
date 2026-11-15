import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { motorKodu } from './plan-motoru.ts';

// 3282 1c: teslimden geriye planlama. Veriler uydurmadır: tek atölye, iki tezgâh, gündüz vardiyası (08-16), 2026-01-05 pazartesi.
type Kayit = Record<string, unknown>;
interface Plan { ops: Record<string, Kayit & { S: number; C: number; job: string }>; fail?: string[] }
interface Degerlendirme { warn: { t: string; j?: string; txt: string }[] }
interface Ic {
  W0: Kayit;
  stHazirla: (st: unknown) => Kayit;
  schedule: (st: unknown, kip: string, taban: unknown) => Plan;
  evaluate: (plan: Plan, st: unknown, ref: unknown, hizli?: boolean) => Degerlendirme;
  stKur: (S: unknown) => { w: Kayit; D: { siparisler: Kayit[] } };
}
function motor(): Ic {
  const b = vm.createContext({}); b['self'] = b;
  vm.runInContext(motorKodu(), b);
  return vm.runInContext('({ W0, stHazirla, schedule, evaluate, stKur })', b) as Ic;
}
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const HAFTA_ICI = Object.fromEntries(GUN.map((g, i) => [g, i < 5 ? ['V1'] : []]));
const adim = (k: string, tezgah: string) => ({ k, ad: 'OP ' + k, tezgahlar: [{ id: tezgah, cevrim: 60, ayar: 0 }] });
function durum(m: Ic, siparisler: Kayit[], w: Kayit = {}, ek: Kayit = {}, ekD: Kayit = {}) {
  return m.stHazirla({
    D: {
      meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }], calismaGunleri: HAFTA_ICI,
      tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G' }, { id: 'T3', grup: 'G' }],
      personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['G'], ayar: true }, { id: 'P2', vardiya: 'V1', gruplar: ['G'] }],
      malzemeler: [], urunler: [{ id: 'U', rota: [adim('10', 'T1'), adim('20', 'T2')] }, { id: 'U1', rota: [adim('10', 'T1')] }], siparisler, ...ekD,
    },
    now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {},
    ...ek, w: { ...m.W0, tampon: false, ...w },
  });
}
function coz(m: Ic, st: Kayit) { const p = m.schedule(st, 'yeni', null); return { p, e: m.evaluate(p, st, null, false) }; }
const ilk = (p: Plan, job: string) => Math.min(...Object.values(p.ops).filter((o) => o.job === job).map((o) => o.S));
const son = (p: Plan, job: string) => Math.max(...Object.values(p.ops).filter((o) => o.job === job).map((o) => o.C));
// Saat, 2026-01-05 00:00'dan; 16.01 cuma 16:00 = 11 gün * 24 + 16.
const CUMA_16 = 11 * 24 + 16, CUMA_08 = 11 * 24 + 8;
const S1 = { id: 'S1', urun: 'U', adet: 2, termin: '2026-01-16 16:00' };

describe('3282 1c: geriye planlama', () => {
  test('ileri (varsayılan): emir şimdi başlar', () => {
    const m = motor();
    const { p } = coz(m, durum(m, [S1]));
    assert.ok(ilk(p, 'S1') < 24, 'pazartesi başlar');
  });

  test('planın yönü geri: emir termin günü, termine yetişecek kadar geç başlar; uyarı yok', () => {
    const m = motor();
    const { p, e } = coz(m, durum(m, [S1], { yon: 'geri' }));
    assert.ok(ilk(p, 'S1') >= CUMA_08, `başlama ${ilk(p, 'S1')}`);
    assert.ok(son(p, 'S1') <= CUMA_16 + 1e-6, `bitiş ${son(p, 'S1')}`);
    assert.equal(e.warn.filter((x) => x.t === 'geri').length, 0);
  });

  test('geri tamponu (gün) en geç başlamayı termin öncesine çeker; hafta sonu atlanır', () => {
    const m = motor();
    const { p } = coz(m, durum(m, [S1], { yon: 'geri', geriTampon: 1 }));
    // Termin - 1 gün = perşembe 16:00; iş perşembe başlar, cuma başlamaz.
    assert.ok(ilk(p, 'S1') >= 10 * 24 + 8 && son(p, 'S1') <= 10 * 24 + 16 + 1e-6, `başlama ${ilk(p, 'S1')} bitiş ${son(p, 'S1')}`);
  });

  test('emrin yönü planınkini ezer', () => {
    const m = motor();
    const { p } = coz(m, durum(m, [{ ...S1, yon: 'ileri' }, { ...S1, id: 'S2', yon: 'geri' }], { yon: 'geri' }));
    assert.ok(ilk(p, 'S1') < 24);
    assert.ok(ilk(p, 'S2') >= CUMA_08);
    const { p: p2 } = coz(m, durum(m, [{ ...S1, yon: 'geri' }]));
    assert.ok(ilk(p2, 'S1') >= CUMA_08, 'plan ileriyken emir geri');
  });

  test('geriye sığmayan emir ileri planlanır ve uyarı verir; terminsiz emir yönden etkilenmez', () => {
    const m = motor();
    const { p, e } = coz(m, durum(m, [{ ...S1, adet: 600 }, { id: 'S3', urun: 'U', adet: 2, termin: null }], { yon: 'geri' }));
    assert.ok(ilk(p, 'S1') < 24);
    const u = e.warn.filter((x) => x.t === 'geri');
    assert.equal(u.length, 1);
    assert.equal(u[0]?.j, 'S1');
    assert.match(u[0]?.txt ?? '', /geriye sığmadı/);
    const { p: p2 } = coz(m, durum(m, [{ id: 'S3', urun: 'U', adet: 2, termin: null }], { yon: 'geri' }));
    assert.ok(ilk(p2, 'S3') < 24, 'terminsiz emir şimdi başlar');
  });
});

// En geç başlamanın kendisi tam eşitlikle ölçülür: dallanan rota, gece ve hafta sonu, fason, geçmişte kalan en geç başlama, serbest
// bırakma ve tampon sınırı. cevrim dakikadır: adet 2, cevrim 60 = 2 saat.
describe('3282 1c: en geç başlamanın hesabı', () => {
  const sure = (k: string, tezgahlar: [string, number][], bag?: [string, string][]) => ({ k, ad: 'OP ' + k, tezgahlar: tezgahlar.map(([id, cevrim]) => ({ id, cevrim, ayar: 0 })), ...(bag ? { bag } : {}) });
  test('dallanan rota: kritik yol en uzun koldur (toplam değil), adım süresi en kısa adaydır', () => {
    const m = motor();
    // A 2 sa (T1); B 6 sa (T2) ya da 12 sa (T3); C ikisini bekler, 2 sa. Kritik yol 6 + 2 = 8 sa: cuma 08:00.
    const urunler = [{ id: 'D', rota: [sure('A', [['T1', 60]]), sure('B', [['T2', 180], ['T3', 360]]), sure('C', [['T1', 60]], [['A', 'b'], ['B', 'b']])] }];
    const { p } = coz(m, durum(m, [{ ...S1, urun: 'D' }], { yon: 'geri' }, {}, { urunler }));
    assert.equal(ilk(p, 'S1'), CUMA_08);
    assert.equal(son(p, 'S1'), CUMA_16);
  });

  test('geri sayım gece ve hafta sonunu atlar', () => {
    const m = motor();
    // 12 sa iş, termin pazartesi 12.01 12:00: pazartesi 08-12 (4 sa) + cuma 08-16 (8 sa) = cuma 09.01 08:00.
    const { p } = coz(m, durum(m, [{ id: 'S1', urun: 'U1', adet: 12, termin: '2026-01-12 12:00' }], { yon: 'geri' }));
    assert.equal(ilk(p, 'S1'), 4 * 24 + 8);
    assert.equal(son(p, 'S1'), 7 * 24 + 12);
  });

  test('fason süresi takvim saatiyle düşülür', () => {
    const m = motor();
    // 2 sa tezgâh + 2 gün fason; termin cuma 16:00 - 48 sa = çarşamba 16:00, tezgâh işi çarşamba 14:00'te başlar.
    const urunler = [{ id: 'F1', rota: [sure('10', [['T1', 60]]), { k: '20', ad: 'Kaplama', fason: 'F', bag: [['10', 'b']] }] }];
    const fasoncular = [{ id: 'F', ad: 'Fason', sureGun: 2, cikisGunleri: GUN, cikisSaat: 16 }];
    const { p } = coz(m, durum(m, [{ ...S1, urun: 'F1' }], { yon: 'geri' }, {}, { urunler, fasoncular }));
    assert.equal(p.ops['S1.10']?.S, 9 * 24 + 14);
  });

  test('en geç başlama takvimde ama şimdiden önceyse emir şimdi başlar ve uyarı tarihi söyler', () => {
    const m = motor();
    // Şimdi çarşamba 08:00; 24 sa iş, termin perşembe 16:00: en geç başlama salı 08:00.
    const { p, e } = coz(m, durum(m, [{ id: 'S1', urun: 'U1', adet: 24, termin: '2026-01-08 16:00' }], { yon: 'geri' }, { now: 2 * 24 + 8 }));
    assert.equal(ilk(p, 'S1'), 2 * 24 + 8);
    const u = e.warn.filter((x) => x.t === 'geri');
    assert.equal(u.length, 1);
    assert.doesNotMatch(u[0]?.txt ?? '', /takvimden önce/);
  });

  test('serbest bırakma en geç başlamadan sonraysa o geçerlidir', () => {
    const m = motor();
    // 2 sa iş: en geç başlama cuma 14:00; serbest cuma 15:00.
    const { p } = coz(m, durum(m, [{ id: 'S1', urun: 'U1', adet: 2, termin: '2026-01-16 16:00', serbest: '2026-01-16 15:00' }], { yon: 'geri' }));
    assert.equal(ilk(p, 'S1'), 11 * 24 + 15);
    const { p: p2 } = coz(m, durum(m, [{ id: 'S1', urun: 'U1', adet: 2, termin: '2026-01-16 16:00', serbest: '2026-01-12 08:00' }], { yon: 'geri' }));
    assert.equal(ilk(p2, 'S1'), 11 * 24 + 14);
  });

  test('geri tamponu en çok 30 gündür', () => {
    const m = motor();
    const sip = [{ id: 'S1', urun: 'U1', adet: 2, termin: '2026-03-02 16:00' }];
    const otuz = ilk(coz(m, durum(m, sip, { yon: 'geri', geriTampon: 30 })).p, 'S1');
    assert.equal(ilk(coz(m, durum(m, sip, { yon: 'geri', geriTampon: 45 })).p, 'S1'), otuz);
    // 2 Mart - 30 gün = 31 Ocak cumartesi; iş cuma 30 Ocak 14:00'te başlar.
    assert.equal(otuz, 25 * 24 + 14);
  });
});

describe('3282 1c: başlamış ya da kilitli emir', () => {
  test('ilk adımı başlamış emrin kalan adımı geri yönde de bekletilmez', () => {
    const m = motor();
    const { p } = coz(m, durum(m, [S1], { yon: 'geri' }, { now: 9, gercek: { 'S1.10': { m: 'T1', S: 8 } } }));
    const a20 = Object.values(p.ops).find((o) => o.job === 'S1' && String(o['id']).endsWith('.20'));
    assert.ok(a20 && a20.S < 24, `ikinci adım ${String(a20?.S)}`);
  });
  test('kilitli adımı olan emir geri yönde ileri dizilir, uyarı vermez', () => {
    const m = motor();
    const { p, e } = coz(m, durum(m, [S1], { yon: 'geri' }, { locks: { 'S1.10': { m: 'T1', S: 10 } } }));
    assert.ok(son(p, 'S1') < 24, `bitiş ${son(p, 'S1')}`);
    assert.equal(e.warn.filter((x) => x.t === 'geri').length, 0);
  });
});

describe('3282 1c: çalışmadan motor girdisine yön', () => {
  const calisma = (w: Kayit, param: Kayit = {}) => ({
    w: { famK: 0.3, mat: 'uyari', dondurma: 4, ...w }, param: { tampon: false, tamponZ: 0, acilPay: 0, ...param },
    down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [],
    D: { meta: { baslangic: '2026-01-05' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [],
      ayarlar: {}, siparisler: [{ id: 'S1', urun: 'U', adet: 1 }, { id: 'S2', urun: 'U', adet: 1 }, { id: 'S3', urun: 'U', adet: 1 }] },
  });
  test('yön ve tampon yoksa ileri, 0', () => {
    const st = motor().stKur(calisma({}));
    assert.equal(st.w['yon'], 'ileri');
    assert.equal(st.w['geriTampon'], 0);
    assert.deepEqual([...st.D.siparisler].map((s) => s['yon']), [undefined, undefined, undefined]);
  });
  test('planın yönü, geri tamponu ve emir yönü taşınır; tanımsız değer yok sayılır', () => {
    const st = motor().stKur(calisma({ yon: 'geri', yonEmir: { S1: 'ileri', S2: 'geri', S3: 'yana' } }, { geriTamponGun: 2 }));
    assert.equal(st.w['yon'], 'geri');
    assert.equal(st.w['geriTampon'], 2);
    assert.deepEqual([...st.D.siparisler].map((s) => s['yon']), ['ileri', 'geri', undefined]);
  });
});
