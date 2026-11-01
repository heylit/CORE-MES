import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle, type MotorDurumu } from './plan-motoru.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1477 a: motorun ufku (gün) ve zaman dilimi sistem ayarındandır (plan.motor-ufuk-gun, plan.motor-dilim-dk); varsayılan 120 gün (1681 b), 15 dk.
// Veriler uydurmadır.

const GUNLER = { pzt: ['V'], sal: ['V'], car: ['V'], per: ['V'], cum: ['V'] };
// Tek tezgâh, günde 8 saat; 60 adet x 6 saat = 360 saat, yaklaşık 45 iş günü (63 takvim günü) sürer
const st = (m: ReturnType<typeof motorYukle>, olcek?: Record<string, unknown>, adet = 60): MotorDurumu => m.stHazirla({
  D: {
    meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V', bas: '08:00', bit: '16:00' }], calismaGunleri: GUNLER,
    tezgahlar: [{ id: 'T1', grup: 'G' }], personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'], ayar: true }], malzemeler: [],
    urunler: [{ id: 'U', rota: [{ k: '10', ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 360, ayar: 0 }] }] }],
    siparisler: [{ id: 'S1', urun: 'U', adet, termin: '2026-06-30 23:59', malzeme: [] }],
  },
  now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, w: { ...m.W0, ...olcek },
});
const derle = (m: ReturnType<typeof motorYukle>, s: MotorDurumu) => m.compile(s) as { days: unknown[]; gen: unknown };

describe('plan motoru: ufuk ve dilim (1477 a)', () => {
  test('ufuk 63 gün: ufku aşan iş yerleşmez; ufuk 90 gün olunca yerleşir', () => {
    const m = motorYukle();
    const p63 = m.schedule(st(m, { ufukGun: 63, dilimDk: 15 }), 'yeni', null);
    assert.equal(p63.ops['S1.10'], undefined);
    assert.deepEqual([...(p63.fail ?? [])], ['S1.10']);
    const m2 = motorYukle();
    const p90 = m2.schedule(st(m2, { ufukGun: 90, dilimDk: 15 }), 'yeni', null);
    const r = p90.ops['S1.10'];
    assert.ok(r && r.C > 63 * 24 && r.C < 90 * 24, JSON.stringify(r));
  });

  // 120 adet x 6 saat = 720 saat, günde 8 saat: 90 iş günü, yaklaşık 126 takvim günü
  test('varsayılan 120 gün (1681 b): ufku aşan iş yerleşmez; ufuk 182 gün olunca yerleşir', () => {
    const m = motorYukle();
    const p120 = m.schedule(st(m, undefined, 120), 'yeni', null);
    assert.equal(p120.ops['S1.10'], undefined);
    assert.deepEqual([...(p120.fail ?? [])], ['S1.10']);
    const m2 = motorYukle();
    const p182 = m2.schedule(st(m2, { ufukGun: 182, dilimDk: 15 }, 120), 'yeni', null);
    const r = p182.ops['S1.10'];
    assert.ok(r && r.C > 120 * 24 && r.C < 182 * 24, JSON.stringify(r));
  });

  test('derleme ufuk kadar gün kurar; sınır dışı ufuk ve tanımsız dilim varsayılana döner', () => {
    const m = motorYukle();
    assert.equal(derle(m, st(m, { ufukGun: 120, dilimDk: 30 })).days.length, 120);
    assert.equal(derle(m, st(m, { ufukGun: 63, dilimDk: 15 })).days.length, 63);
    assert.equal(derle(m, st(m, { ufukGun: 500, dilimDk: 7 })).days.length, 120);
    assert.equal(derle(m, st(m, { ufukGun: 'x' })).days.length, 120);
    assert.equal(derle(m, st(m)).days.length, 120);
  });

  test('30 dakikalık dilimde plan kurulur, iş aynı saatte biter (tam saatli iş)', () => {
    const m = motorYukle();
    const p15 = m.schedule(st(m, undefined, 4), 'yeni', null);
    const m2 = motorYukle();
    const p30 = m2.schedule(st(m2, { ufukGun: 63, dilimDk: 30 }, 4), 'yeni', null);
    assert.equal(p30.ops['S1.10']?.C, p15.ops['S1.10']?.C);
  });

  test('uzun ufukla kurulan taban, kısa ufukta sabit kipte çökmeden yeniden kurulur; ufuk dışı iş yerleşmez', () => {
    const m = motorYukle();
    const taban = m.schedule(st(m, { ufukGun: 90, dilimDk: 15 }), 'yeni', null);
    const m2 = motorYukle();
    // dondurma 0: başlangıçtaki iş dondurulmuş sayılıp tabandaki yerinde kalmasın
    const s = st(m2, { dondurma: 0, ufukGun: 63 });
    const p = m2.schedule(s, 'sabit', taban);
    assert.equal(p.ops['S1.10'], undefined);
    assert.deepEqual([...(p.fail ?? [])], ['S1.10']);
  });
});

describe('plan girdisi: motor ölçeği (1477 a)', () => {
  test('çalışmaya yazılır ve girdi birleşmesinden geçer', () => {
    const calisma = {
      surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
      rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
      param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
    };
    const ayarli = calismayaMotorAyari(calisma, { kural: 'atcs', amac: 'sirali', eksikStok: 'varsay' } as never, null, { ufukGun: 120, dilimDk: 30 });
    const g = planGirdisi({ calisma: ayarli, kayit: { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] }, kaynak: null, bugun: '2026-10-19' });
    assert.ok(g);
    const w = (g.st as { w: { ufukGun: unknown; dilimDk: unknown } }).w;
    assert.deepEqual([w.ufukGun, w.dilimDk], [120, 30]);
    assert.equal((calismayaMotorAyari(calisma, { kural: 'atcs', amac: 'sirali', eksikStok: 'varsay' } as never) as { w: Record<string, unknown> }).w['ufukGun'], undefined);
  });
});

describe('plan (gerçek PostgreSQL): motor ölçeği sistem ayarından (1477 a)', () => {
  const { c, tamam } = planTestOrtami();
  test('varsayılan 120 gün ve 15 dk; yönetici değiştirince planlama çalışması yeni ölçeği taşır', async () => {
    const calisma = async () => {
      const w = (await tamam<{ calisma: { w: { ufukGun?: unknown; dilimDk?: unknown } } | null }>(c.planlama, 'POST', '/plan/planlama-calismasi/olustur', {})).calisma?.w;
      return [w?.ufukGun, w?.dilimDk];
    };
    assert.deepEqual(await calisma(), [120, 15]);
    await tamam(c.yonetici, 'POST', '/ayarlar/plan.motor-ufuk-gun/degistir', { deger: 90 });
    await tamam(c.yonetici, 'POST', '/ayarlar/plan.motor-dilim-dk/degistir', { deger: '30' });
    assert.deepEqual(await calisma(), [90, 30]);
  });
});
