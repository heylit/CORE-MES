import assert from 'node:assert/strict';
import vm from 'node:vm';
import { describe, test } from 'node:test';
import { devirPartisi } from '#paylasilan/devir-kurali.ts';
import { motorKodu } from './plan-motoru.ts';
import { tasimaHesabi } from './tasima.ts';

// 3603: motorun ilk parti (lot1) kuralı sunucuyla ortak devirPartisi'ne eşittir: devir adedi ardılın bağındadır, öncülün kendi devir adedi
// ilk partiye karışmaz, boş devir adedi adedin dörtte biridir. Vardiya 08:00-16:00, her adım adet x 60 dk (saat ekseni). Veriler uydurmadır.
type Kayit = Record<string, unknown>;
type Op = { id: string; job: string; m: string; S: number; C: number; lot1: number };
interface Ic { W0: Kayit; stHazirla: (s: Kayit) => Kayit; schedule: (st: Kayit, kip: string, taban: null) => { ops: Record<string, Op> } }
function motor(): Ic {
  const b = vm.createContext({}); b['self'] = b;
  vm.runInContext(motorKodu(), b);
  return vm.runInContext('({ W0, stHazirla, schedule })', b) as Ic;
}
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const adim = (k: string, tezgah: string, ek: Kayit = {}) => ({ k, ad: `OP ${k}`, tezgahlar: [{ id: tezgah, cevrim: 60, ayar: 0 }], bag: [], aile: '', ...ek });
const veri = (oncul: Kayit, ardil: Kayit, adet: number) => ({
  meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
  calismaGunleri: Object.fromEntries(GUN.map((g, i) => [g, i < 5 ? ['V1'] : []])), tatiller: [],
  tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G' }], personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['G'], ayar: true }, { id: 'P2', vardiya: 'V1', gruplar: ['G'] }], malzemeler: [],
  urunler: [{ id: 'U', rota: [oncul, ardil] }], siparisler: [{ id: 'S1', urun: 'U', adet, termin: null }],
});
const d = (m: Ic, oncul: Kayit, ardil: Kayit, adet: number) => m.stHazirla({
  D: veri(oncul, ardil, adet),
  now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, w: { ...m.W0, tampon: false },
});
const calismaOf = (oncul: Kayit, ardil: Kayit, adet: number, ops: Record<string, Op>) => ({
  surum: 2, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [],
  w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 }, D: veri(oncul, ardil, adet), plan: { dataVer: 1, ops },
});
const ardilAkisli = (devir: number | undefined) => adim('20', 'T2', { ortusebilir: true, bag: [['10', 'o']], ...(devir === undefined ? {} : { transfer: devir }) });

describe('devir partisi: motor ve ortak kural (3603)', () => {
  test('DK-01: öncülün ilk partisi ardılın devir adedi kadardır (en çok öncülün adedi); boşsa adedin dörtte biri', () => {
    const m = motor();
    for (const [adet, devir] of [[8, 3], [8, 1], [8, 8], [8, 100], [8, undefined], [4, undefined], [6, 2]] as const) {
      const pl = m.schedule(d(m, adim('10', 'T1'), ardilAkisli(devir), adet), 'yeni', null); const op = pl.ops['S1.10']!;
      assert.equal(op.lot1 - op.S, devirPartisi(devir, adet), `adet ${adet}, devir ${String(devir)}`);
    }
  });

  test('DK-02: öncülün kendi devir adedi (kendi öncülüne olan bağı) ilk partiyi etkilemez', () => {
    const m = motor();
    for (const kendi of [undefined, 1, 5]) {
      const op = m.schedule(d(m, adim('10', 'T1', kendi === undefined ? {} : { transfer: kendi }), ardilAkisli(6), 8), 'yeni', null).ops['S1.10']!;
      assert.equal(op.lot1 - op.S, 6, `öncül devir ${String(kendi)}`);
    }
  });

  test('DK-04: öncülün adımındaki adet (hurdası düşülmüş ya da bölünmüş emrin payı) devir partisinin üst sınırıdır', () => {
    const m = motor();
    const st = d(m, adim('10', 'T1'), ardilAkisli(100), 8);
    (st['D'] as Kayit)['opAdet'] = { 'S1.10': 5 };
    const op = m.schedule(st, 'yeni', null).ops['S1.10']!;
    assert.equal(op.lot1 - op.S, devirPartisi(100, 5));
    assert.equal(op.lot1, op.C);
  });

  // Rapordaki durum: devir adedi (100) emrin adedinden (8) büyük: bütün emir devredilir. Elle taşımada ardıl öncülün bitişinden önceye
  // konamaz (eskiden öncülün boş devir adedi %25 alınır, ardıl erken kabul edilir, sunucu canlıya almada reddederdi).
  test('DK-03: devir adedi emirden büyükse Kokpit taşıması ardılı öncülün bitişinden önceye koymaz', () => {
    const m = motor();
    const oncul0 = adim('10', 'T1'), ardil0 = ardilAkisli(100);
    const ops = m.schedule(d(m, oncul0, ardil0, 8), 'yeni', null).ops;
    const oncul = ops['S1.10']!, ardil = ops['S1.20']!;
    assert.equal(oncul.lot1, oncul.C);
    const calisma = calismaOf(oncul0, ardil0, 8, ops);
    const r = tasimaHesabi(calisma, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: oncul.S + 2 });
    assert.equal(r.gecerli, true, r.ileti ?? '');
    const yeni = r.isler.find((i) => i.isId === 'S1.20')!;
    assert.ok(yeni.S >= oncul.C - 1e-6, `ardıl ${yeni.S}, öncül bitişi ${oncul.C}; eski yeri ${ardil.S}`);
  });
});
