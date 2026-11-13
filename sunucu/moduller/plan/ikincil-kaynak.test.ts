import assert from 'node:assert/strict';
import vm from 'node:vm';
import { describe, test } from 'node:test';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import { ikincilKaynakKur, type MotorIkincilKaynagi, type MotorKaynakIstegi } from './girdi/ikincil-kurallar.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { degerlendirmeKodu } from './degerlendirme.ts';
import { motorYukle } from './plan-motoru.ts';

// 3199 (A + D): aparat ve özel takım planın ikincil kaynağıdır. Veriler uydurmadır (ORN-). Gün 2026-10-19 Pazartesi, vardiya 08:00-16:00,
// iki istasyonda birer tezgâh; iki emir aynı adımı (OP 10, 60 dk) ister, aday iki tezgâh. Kaynaksız iki iş 08:00'de yan yana başlar.
const V = '3';
const makine = (id: string, istasyon: string) => ({ id, code: `ORN-T${id}`, name: `Tezgah ${id}`, stationId: istasyon });
const kayit = (ayar: number) => ({
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'ORN-MM-1', name: 'Ornek mil', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Frezeleme' }],
  machines: [makine('100', '10'), makine('200', '20')],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: ayar, cycle: 60, alts: ['20'], altTimes: { 20: { setup: ayar, cycle: 60 } }, ins: [] }] } },
  orders: [],
});
const istasyon = (id: string) => ({ id, code: `ORN-S${id}`, name: `Istasyon ${id}`, wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true });
const emir = (id: string, no: string) => ({ id, no, itemId: '50', qty: 1, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' });
const kaynakOkumasi = (ikincil: unknown) => ({
  durum: {
    wcs: [{ id: '1', code: 'ORN-IM', name: 'Talasli', week: null, aktif: true }],
    stations: [istasyon('10'), istasyon('20')],
    machines: [{ ...makine('100', '10'), status: 'aktif', aktif: true }, { ...makine('200', '20'), status: 'aktif', aktif: true }],
    people: [],
    cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    emirler: { orders: [emir('1', 'ORN-E1'), emir('2', 'ORN-E2')], opStatus: {}, opProg: {} },
  },
  ek: { takvim: { hafta: { 1: { 1: [V], 2: [V], 3: [V], 4: [V], 5: [V] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null, ikincil },
});
const calisma = (): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 0 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: ['personel'], olaylar: [], plan: null,
});
const kaynak = (k: Partial<MotorIkincilKaynagi> = {}): MotorIkincilKaynagi => ({
  id: '1', kart: '900', kod: 'AP-ORN-12', ad: 'Flans baglama fiksturu', istasyon: null, adet: 1, tur: 'aparat', kisit: 'sert', kesintiler: [],
  omur: null, omurBirimi: null, degisimDk: null, kalanPay: null, ...k,
});
const iste = (x: Partial<MotorKaynakIstegi> = {}): MotorKaynakIstegi => ({ kart: '900', adet: 1, asama: 'ayar_isleme', ...x });

interface Islem { m: string; S: number; Su: number; C: number; why: { t: string; r?: string }; ikBas?: number; takim?: { id: string; n: number; dk: number; at: number | null; kalan: number; bilinmiyor: boolean }[] }
function planla(ikincil: unknown, ayar = 0, kapali: string[] = ['personel']) {
  const g = planGirdisi({ calisma: calismayaMotorAyari({ ...calisma(), kapali }, MOTOR_AYARI_VARSAYILAN), kayit: kayit(ayar), kaynak: kaynakOkumasi(ikincil), bugun: '2026-10-19' });
  assert.ok(g);
  const m = motorYukle();
  const st = m.stHazirla(g.st) as { pref: Record<string, string> };
  // Her emir kendi tezgâhında: kaynaksız iki iş aynı anda başlar; bekleme yalnız ikincil kaynaktandır.
  st.pref['1.10'] = '100';
  st.pref['2.10'] = '200';
  const plan = m.schedule(st, 'yeni', null);
  const p = plan as unknown as { ops: Record<string, Islem>; fail: string[] };
  const e = m.evaluate(plan, st, null, false) as { warn: { t: string; txt: string }[] };
  const ops = Object.values(p.ops).sort((a, b) => a.S - b.S || a.m.localeCompare(b.m));
  return { ops, fail: p.fail, warn: e.warn, D: g.S['D'] as Record<string, unknown> };
}
const IKI_ISTEK = (x: Partial<MotorKaynakIstegi> = {}) => ({ 'ORN-E1|10': [iste(x)], 'ORN-E2|10': [iste(x)] });
const yakin = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('plan 3199: ikincil kaynak kısıtı', () => {
  test('kaynaksız iki iş 08:00de yan yana başlar (karşılaştırma tabanı)', () => {
    const { ops } = planla(null);
    assert.equal(ops.length, 2);
    assert.ok(ops.every((o) => yakin(o.S, 8)), JSON.stringify(ops.map((o) => o.S)));
  });

  test('sert, tek adetli aparat iki işi sıraya koyar; ikinci işin nedeni ikincil kaynak ve kaynağın kimliği', () => {
    const { ops, D } = planla({ kaynaklar: [kaynak()], istekler: IKI_ISTEK() });
    assert.equal((D['ikincilKaynaklar'] as unknown[]).length, 1);
    assert.deepEqual(Object.keys(D['opKaynak'] as object).sort(), ['1.10', '2.10']);
    const [a, b] = ops as [Islem, Islem];
    assert.ok(yakin(a.S, 8) && b.S >= a.C - 1e-6, JSON.stringify(ops));
    assert.deepEqual({ ...b.why }, { t: 'ikincil', r: '1' });
    // Çizelgedeki bekleme taraması: kaymadan önceki ilk aday başlangıç; beklemeyen işte alan yok.
    assert.ok(b.ikBas !== undefined && yakin(b.ikBas, 8) && b.ikBas < b.S, JSON.stringify(b));
    assert.equal(a.ikBas, undefined);
  });

  test('kayıtlı plan (çizelgenin okuduğu) bekleme başlangıcını ve takımı taşır', () => {
    const g = planGirdisi({ calisma: calismayaMotorAyari(calisma(), MOTOR_AYARI_VARSAYILAN), kayit: kayit(0), kaynak: kaynakOkumasi({ kaynaklar: [kaynak()], istekler: IKI_ISTEK() }), bugun: '2026-10-19' });
    assert.ok(g);
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: 'Europe/Istanbul' }); b['self'] = b;
    const m = vm.runInContext(`${degerlendirmeKodu()}\n;({ schedule, stHazirla, planKaydi });`, b) as {
      schedule: (st: unknown, kip: string, taban: null) => unknown; stHazirla: (st: unknown) => { pref: Record<string, string> };
      planKaydi: (p: unknown, st: unknown, ref: null) => { ops: Record<string, Islem> };
    };
    const st = m.stHazirla(g.st);
    st.pref['1.10'] = '100'; st.pref['2.10'] = '200';
    const ops = Object.values(m.planKaydi(m.schedule(st, 'yeni', null), st, null).ops).sort((x, y) => x.S - y.S);
    assert.ok(ops[1]!.ikBas !== undefined && yakin(ops[1]!.ikBas, 8), JSON.stringify(ops));
    assert.equal(ops[0]!.ikBas, undefined);
  });

  test('istasyonlu satır ortak satırdan önce gelir: istasyonun tezgâhı kendi satırının adedini kullanır', () => {
    // Tezgâh 100 (istasyon 10) kendi istasyon satırını, tezgâh 200 ortak satırı sayar: iki iş ayrı sayaçtadır, birbirini bekletmez.
    const ikiSatir = [kaynak({ id: '1', istasyon: null, adet: 1 }), kaynak({ id: '2', istasyon: '10', adet: 1 })];
    const { ops } = planla({ kaynaklar: ikiSatir, istekler: IKI_ISTEK() });
    assert.ok(ops.every((o) => yakin(o.S, 8)), JSON.stringify(ops.map((o) => [o.m, o.S, o.why])));
    // Yalnız ortak satır olsaydı ikinci iş beklerdi (yukarıdaki sert testin tabanı).
  });

  test('iki adetli aparat sınırlamaz; adım iki adet isterse yine sıraya girer', () => {
    assert.ok(planla({ kaynaklar: [kaynak({ adet: 2 })], istekler: IKI_ISTEK() }).ops.every((o) => yakin(o.S, 8)));
    const { ops } = planla({ kaynaklar: [kaynak({ adet: 2 })], istekler: IKI_ISTEK({ adet: 2 }) });
    assert.ok(ops[1]!.S >= ops[0]!.C - 1e-6);
  });

  test('İzle kaynak planı sınırlamaz, aşımı uyarı olarak verir', () => {
    const { ops, warn } = planla({ kaynaklar: [kaynak({ kisit: 'izle' })], istekler: IKI_ISTEK() });
    assert.ok(ops.every((o) => yakin(o.S, 8)));
    const w = warn.filter((x) => x.t === 'ikincil');
    assert.equal(w.length, 1);
    assert.match(w[0]!.txt, /AP-ORN-12: .* kapasite aşılıyor \(2 \/ 1\); İzle/);
  });

  test('aparat kısıtı kapatılınca (Kısıtlar) sert kaynak da yalnız izlenir: iki iş yan yana başlar, aşım uyarıdır', () => {
    const { ops, warn } = planla({ kaynaklar: [kaynak()], istekler: IKI_ISTEK() }, 0, ['personel', 'aparat']);
    const [a, b] = ops as [Islem, Islem];
    assert.ok(yakin(a.S, 8) && yakin(b.S, 8), JSON.stringify(ops));
    assert.equal(b.ikBas, undefined);
    assert.ok(warn.some((w) => w.txt.includes('AP-ORN-12')), JSON.stringify(warn));
  });

  test('kesinti (bakım) o saatlerde adedi düşürür: bakımdaki tek aparatı isteyen iş bakım bitince başlar', () => {
    const bakim = { neden: 'bakim' as const, bas: '2026-10-19T08:00:00+03:00', bit: '2026-10-19T10:00:00+03:00', adet: 1 };
    const { ops } = planla({ kaynaklar: [kaynak({ kesintiler: [bakim] })], istekler: { 'ORN-E1|10': [iste()] } });
    const bekleyen = ops.find((o) => o.m === '100')!;
    assert.ok(yakin(bekleyen.S, 10), JSON.stringify(ops.map((o) => [o.m, o.S, o.why])));
    assert.deepEqual({ ...bekleyen.why }, { t: 'ikincil', r: '1' });
    assert.ok(yakin(ops.find((o) => o.m === '200')!.S, 8), 'kaynak istemeyen iş beklemez');
    const yarim = planla({ kaynaklar: [kaynak({ adet: 2, kesintiler: [bakim] })], istekler: IKI_ISTEK() }).ops;
    assert.deepEqual(yarim.map((o) => o.S), [8, 9], 'iki adetten biri bakımda: ikinci iş ilki bitince');
  });

  test('yalnız işlemede istenen kaynak ayar sırasında boş sayılır: ikinci işin ayarı öncekinin işlemesiyle üst üste', () => {
    const { ops } = planla({ kaynaklar: [kaynak()], istekler: IKI_ISTEK({ asama: 'isleme' }) }, 30);
    const [a, b] = ops as [Islem, Islem];
    assert.ok(b.Su >= a.C - 1e-6, 'işleme çakışmaz');
    assert.ok(b.S < a.C - 1e-6, `ayar öne alınır: ${JSON.stringify(ops)}`);
    const tam = planla({ kaynaklar: [kaynak()], istekler: IKI_ISTEK() }, 30).ops;
    assert.ok(tam[1]!.S >= tam[0]!.C - 1e-6, 'ayar ve işleme: ayar da bekler');
  });

  test('istasyonlu satır yalnız o istasyonun tezgâhında, ortak satır her yerde sayılır; tanımsız kart sınırlamaz', () => {
    const yalniz10 = planla({ kaynaklar: [kaynak({ istasyon: '10' })], istekler: IKI_ISTEK() }).ops;
    assert.ok(yalniz10.every((o) => yakin(o.S, 8)), 'tezgâh 200 istasyon 20: satır yok, sınır yok');
    assert.ok(planla({ kaynaklar: [kaynak({ kart: '901' })], istekler: IKI_ISTEK() }).ops.every((o) => yakin(o.S, 8)));
  });

  test('takım ömrü yetmezse ömrün bittiği anda değişim süresi eklenir, sonraki iş yenilenmiş ömürle sürer; uyarı ve başlangıç ömrü', () => {
    const takim = kaynak({ id: '2', kart: '950', kod: 'TK-ORN-03', tur: 'ozel_takim', adet: 2, omur: 90, omurBirimi: 'dk', degisimDk: 20, kalanPay: 0.5 });
    const { ops, warn } = planla({ kaynaklar: [takim], istekler: { 'ORN-E1|10': [iste({ kart: '950', asama: 'isleme' })], 'ORN-E2|10': [iste({ kart: '950', asama: 'isleme' })] } });
    const [a, b] = ops as [Islem, Islem];
    const ilk = [a, b].find((o) => o.takim?.[0]?.n === 1)!;
    const ikinci = [a, b].find((o) => o !== ilk)!;
    assert.ok(ilk, JSON.stringify(ops));
    assert.ok(yakin(ilk.C - ilk.Su, 80 / 60), 'iş 60 dk + 20 dk değişim');
    assert.ok(yakin(ilk.takim![0]!.at!, ilk.Su + 45 / 60), 'kalan 45 dk bitince');
    assert.equal(ikinci.takim![0]!.n, 0);
    assert.ok(yakin(ikinci.C - ikinci.Su, 1));
    assert.equal(warn.filter((w) => w.t === 'takim').length, 1);
    const bilinmez = planla({ kaynaklar: [{ ...takim, kalanPay: null }], istekler: { 'ORN-E1|10': [iste({ kart: '950' })] } }).ops.find((o) => o.takim)!;
    assert.deepEqual([bilinmez.takim![0]!.n, bilinmez.takim![0]!.bilinmiyor], [0, true], 'kayıt yoksa tam ömür (V13)');
  });

  test('adet birimli ömür işin adedinden düşer; ömrü olmayan özel takım sayılmaz', () => {
    const takim = kaynak({ id: '2', kart: '950', tur: 'ozel_takim', adet: 2, omur: 1, omurBirimi: 'adet', degisimDk: 15 });
    const { ops } = planla({ kaynaklar: [takim], istekler: IKI_ISTEK({ kart: '950' }) });
    assert.deepEqual(ops.map((o) => o.takim![0]!.n).sort(), [0, 1]);
    const omursuz = planla({ kaynaklar: [kaynak({ tur: 'ozel_takim', adet: 2 })], istekler: IKI_ISTEK() }).ops;
    assert.ok(omursuz.every((o) => o.takim === undefined && yakin(o.C - o.S, 1)));
  });

  test('okuma kurucusu: kaynak, kart adı, istek anahtarı ve ömür payı; okunamayan dilim null', () => {
    const e = ikincilKaynakKur({
      kaynaklar: [{
        id: 7, aparatKartiId: 950, istasyonId: 10, adet: 1, tur: 'ozel_takim', kisit: 'sert', omur: 600, omurBirimi: 'dk', degisimDk: 20,
        kesintiler: [{ id: 1, neden: 'bakim', baslangic: '2026-11-13T08:00:00+03:00', bitis: '2026-11-13T11:00:00+03:00', adet: 1, aciklama: null }],
        degistiren: { id: 1, ad: null }, degisme: '2026-11-13T08:00:00+03:00', surum: 1,
      }],
      kartlar: new Map([[950, { kod: 'TK-ORN-03', ad: 'Form freze' }]]),
      istekler: [{ anahtar: 'ORN-E1|10', istekler: [{ malzemeId: 950, adet: 1, asama: 'isleme' }] }],
      takimlar: [{ kartId: 950, istasyonId: 10, kalanPay: 0.2 }, { kartId: 950, istasyonId: 11, kalanPay: 0.1 }],
    });
    assert.deepEqual(e.kaynaklar?.[0], {
      id: '7', kart: '950', kod: 'TK-ORN-03', ad: 'Form freze', istasyon: '10', adet: 1, tur: 'ozel_takim', kisit: 'sert',
      kesintiler: [{ neden: 'bakim', bas: '2026-11-13T08:00:00+03:00', bit: '2026-11-13T11:00:00+03:00', adet: 1 }], omur: 600, omurBirimi: 'dk', degisimDk: 20, kalanPay: 0.2,
    });
    assert.deepEqual(e.istekler, { 'ORN-E1|10': [{ kart: '950', adet: 1, asama: 'isleme' }] });
    assert.deepEqual(ikincilKaynakKur({ kaynaklar: null, kartlar: new Map(), istekler: null, takimlar: null }), { kaynaklar: null, istekler: null });
  });
});
