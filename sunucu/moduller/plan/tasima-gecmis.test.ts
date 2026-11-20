import assert from 'node:assert/strict';
import { test } from 'node:test';
import { motorYukle, type MotorDurumu } from './plan-motoru.ts';
import { tasimaHesabi } from './tasima.ts';

// Eski kayıtlı planda saati geçmiş iş "bitti" (done, act yok) durabilir: elle taşınınca kilit yazılır ve motor işi kilitteki yerde,
// bitmemiş olarak tutar. Motor artık böyle işi kendisi de yeniden dizer (3308-11). Veriler uydurmadır; eksen pazartesi 00:00, vardiya 08:00-16:00.
const GUN = ['pzt', 'sal', 'car', 'per', 'cum'];
const adim = (k: string, tezgah: string, bag: [string, string][] = []) => ({ k, ad: `OP ${k}`, tezgahlar: [{ id: tezgah, cevrim: 60, ayar: 0 }], transfer: 1, bag });
const D = {
  meta: { ad: 'Ornek', baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
  calismaGunleri: Object.fromEntries(GUN.map((g) => [g, ['V1']])), tatiller: [],
  tezgahlar: [{ id: 'T1', grup: 'G', opOran: 0 }, { id: 'T2', grup: 'G', opOran: 0 }], personel: [], malzemeler: [],
  urunler: [{ id: 'U', rota: [adim('10', 'T1'), adim('20', 'T2', [['10', 'b']])] }],
  siparisler: [{ id: 'S1', urun: 'U', adet: 2, termin: null }],
};

test('TG-01: eski planda bitti görünen, başlamamış emir taşınır; motor kilidi tutar ve işi bitmiş saymaz', () => {
  const m = motorYukle();
  const durum = (now: number, locks: Record<string, unknown>): MotorDurumu => ({
    D, now, down: [], ekMesai: [], eksik: [], locks, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, w: { ...m.W0, tampon: false, dondurma: 0 },
  });
  const ilk = m.schedule(durum(8, {}), 'dagit', null);
  // Eski motorun bıraktığı plan: pazartesi yapılmayan iki adım geçmişte, bitti işaretli.
  const eski = (id: string) => ({ ...(ilk.ops[id] as unknown as Record<string, unknown>), pin: 1, done: 1 });
  const sali = { ...ilk, ops: { 'S1.10': eski('S1.10'), 'S1.20': eski('S1.20') } } as unknown as typeof ilk;
  // Motor salı günü bu işleri kendisi de bitmiş saymaz, baştan dizer.
  const kendisi = m.schedule(durum(32, {}), 'dagit', sali);
  assert.deepEqual(['S1.10', 'S1.20'].map((id) => { const r = kendisi.ops[id] as unknown as Record<string, unknown>; return [r['S'], r['C'], Boolean(r['done'])]; }), [[32, 34, false], [34, 36, false]]);

  const calisma = { surum: 2, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], w: { ...m.W0, tampon: false, dondurma: 0 }, param: {}, D, plan: sali };
  const t = tasimaHesabi(calisma as unknown as Record<string, unknown>, 32, { isId: 'S1.10', tezgah: 'T1', baslangic: 34 });
  assert.equal(t.gecerli, true, t.ileti ?? '');
  assert.deepEqual(t.isler.map((x) => [x.isId, x.S, x.tur]), [['S1.10', 34, 'tasinan'], ['S1.20', 36, 'itilen']]);

  const locks = Object.fromEntries(t.isler.map((x) => [x.isId, { m: x.tezgah, S: x.S }]));
  const sonra = m.schedule(durum(32, locks), 'dagit', sali);
  const yer = (id: string) => { const r = sonra.ops[id] as unknown as Record<string, unknown>; return [r['S'], r['C'], Boolean(r['done'])]; };
  assert.deepEqual([yer('S1.10'), yer('S1.20')], [[34, 36, false], [36, 38, false]]);
});

test('TG-02 (3501 a): büyümüş takvimle kurulmuş planda 240 günün ötesindeki adım elle taşınır; plan ötede değilken aynı saat ufuk dışıdır', () => {
  const m = motorYukle();
  // 301. gün pazartesidir. Adımlar 08:00-10:00 ve 10:00-12:00; ilki ertesi gün 08:00'e taşınır.
  const G = 301 * 24;
  const yer = (id: string, tezgah: string, S: number) => ({ id, job: 'S1', m: tezgah, S, Su: S, C: S + 2, lot1: S + 1, su: 0, run: 2 });
  const calisma = (ops: Record<string, unknown>) => ({ surum: 2, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], w: { ...m.W0, tampon: false, dondurma: 0 }, param: {}, D, plan: { ops, fail: [] } });
  const otede = calisma({ 'S1.10': yer('S1.10', 'T1', G + 8), 'S1.20': yer('S1.20', 'T2', G + 10) });
  const t = tasimaHesabi(otede as unknown as Record<string, unknown>, 32, { isId: 'S1.10', tezgah: 'T1', baslangic: G + 32 });
  assert.equal(t.gecerli, true, t.ileti ?? '');
  assert.deepEqual(t.isler.map((x) => [x.isId, x.S, x.tur]), [['S1.10', G + 32, 'tasinan'], ['S1.20', G + 34, 'itilen']]);
  const yakin = calisma({ 'S1.10': yer('S1.10', 'T1', 32), 'S1.20': yer('S1.20', 'T2', 34) });
  const r = tasimaHesabi(yakin as unknown as Record<string, unknown>, 32, { isId: 'S1.10', tezgah: 'T1', baslangic: G + 32 });
  assert.equal(r.gecerli, false);
  assert.match(r.ileti ?? '', /ufk/);
});
