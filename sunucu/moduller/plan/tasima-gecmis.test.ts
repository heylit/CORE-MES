import assert from 'node:assert/strict';
import { test } from 'node:test';
import { motorYukle, type MotorDurumu } from './plan-motoru.ts';
import { tasimaHesabi } from './tasima.ts';

// Saati geçmiş ama gerçekleşme kaydı olmayan emir: motor onu "bitti" sayıp geçmişte bırakır; elle taşınınca kilit yazılır ve motor
// sonraki kurulumda işi kilitteki yerde, bitmemiş olarak tutar. Veriler uydurmadır; eksen pazartesi 00:00, vardiya 08:00-16:00.
const GUN = ['pzt', 'sal', 'car', 'per', 'cum'];
const adim = (k: string, tezgah: string, bag: [string, string][] = []) => ({ k, ad: `OP ${k}`, tezgahlar: [{ id: tezgah, cevrim: 60, ayar: 0 }], transfer: 1, bag });
const D = {
  meta: { ad: 'Ornek', baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
  calismaGunleri: Object.fromEntries(GUN.map((g) => [g, ['V1']])), tatiller: [],
  tezgahlar: [{ id: 'T1', grup: 'G', opOran: 0 }, { id: 'T2', grup: 'G', opOran: 0 }], personel: [], malzemeler: [],
  urunler: [{ id: 'U', rota: [adim('10', 'T1'), adim('20', 'T2', [['10', 'b']])] }],
  siparisler: [{ id: 'S1', urun: 'U', adet: 2, termin: null }],
};

test('TG-01: saati geçmiş, başlamamış emir taşınır; motor kilidi tutar ve işi bitmiş saymaz', () => {
  const m = motorYukle();
  const durum = (now: number, locks: Record<string, unknown>): MotorDurumu => ({
    D, now, down: [], ekMesai: [], eksik: [], locks, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, w: { ...m.W0, tampon: false, dondurma: 0 },
  });
  const ilk = m.schedule(durum(8, {}), 'dagit', null);
  // Salı 08:00: pazartesi yapılmayan iki adımı motor geçmişte bırakır ve bitti sayar.
  const sali = m.schedule(durum(32, {}), 'dagit', ilk);
  const gecmis = (p: typeof sali, id: string) => { const r = p.ops[id] as unknown as Record<string, unknown>; return [Boolean(r['done']), Boolean(r['act']), Number(r['C']) <= 32]; };
  assert.deepEqual([gecmis(sali, 'S1.10'), gecmis(sali, 'S1.20')], [[true, false, true], [true, false, true]]);

  const calisma = { surum: 2, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], w: { ...m.W0, tampon: false, dondurma: 0 }, param: {}, D, plan: sali };
  const t = tasimaHesabi(calisma as unknown as Record<string, unknown>, 32, { isId: 'S1.10', tezgah: 'T1', baslangic: 34 });
  assert.equal(t.gecerli, true, t.ileti ?? '');
  assert.deepEqual(t.isler.map((x) => [x.isId, x.S, x.tur]), [['S1.10', 34, 'tasinan'], ['S1.20', 36, 'itilen']]);

  const locks = Object.fromEntries(t.isler.map((x) => [x.isId, { m: x.tezgah, S: x.S }]));
  const sonra = m.schedule(durum(32, locks), 'dagit', sali);
  const yer = (id: string) => { const r = sonra.ops[id] as unknown as Record<string, unknown>; return [r['S'], r['C'], Boolean(r['done'])]; };
  assert.deepEqual([yer('S1.10'), yer('S1.20')], [[34, 36, false], [36, 38, false]]);
});
