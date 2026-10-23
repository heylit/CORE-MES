import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import type { PlanMotoruIstegi } from '../plan/disari.ts';
import { DURUM_ANAHTARI, PLANLAMA_ANAHTARI } from './disari.ts';
import { coz, sunucuPlanCozucusu } from './plan-cozucusu.ts';
import { planCozumKaynagi } from './servis.ts';
import * as sorgular from './sorgular.ts';

// Sunucu çözücüsü (ADR 0018): plan modülünün isteği (anahtar "emir no|OP no", makine kimliği, gerçek an) sunucunun güncel emir, rota ve
// kaynaklarıyla motora çevrilir, sabit kipte dizilir. Motorun kendisi plan-motoru.test.ts'te, girdi çevirisi plan-girdisi.test.ts'te sınanır.
// Veriler uydurmadır. Tesis Europe/Istanbul (UTC+3): 05:00Z tesiste 08:00, vardiya 08:00-16:00.

const V = '3';
const adim = (opNo: number, dk: number) => ({
  id: `50-o${String(opNo)}`, opNo, seq: opNo, opId: '13', name: 'Tornalama', stationId: '10', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup: 0, proc: dk, chg: null, cycle: dk, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
});
const emir = (id: string, no: string) => ({ id, no, itemId: '50', qty: 2, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' });
const KAYNAK = {
  calisma: {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: V, bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: [V], sal: [V], car: [V], per: [V], cum: [V] },
      tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  },
  // Kayıtta bağlanmadan önceki yerel emir kalır (kart #1185); çözücü onu değil sunucunun emirlerini planlar.
  kayit: { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [{ id: 'O1', no: 'YEREL-1', itemId: '50', qty: 5, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' }] },
  kaynak: {
    durum: {
      items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul', unit: 'ad', stock: 0 }],
      opdefs: [{ id: '13', code: 'TOR', name: 'Tornalama' }],
      routes: { 50: { base: null, steps: [adim(10, 30), adim(20, 15)] } },
      routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
      wcs: [{ id: '1', code: 'IM', name: 'Merkez', aktif: true }],
      stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 2, aktif: true }],
      machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', status: 'aktif', aktif: true }],
      cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
      emirler: { orders: [emir('1', 'E-1'), emir('2', 'E-2')], opStatus: {}, opProg: {} },
      calisanAdimlar: [],
    },
    ek: null,
  },
};
const istek = (ek: Partial<PlanMotoruIstegi>): PlanMotoruIstegi => ({
  kip: 'sabit', simdi: new Date('2026-10-19T05:00:00Z'), kuyruklar: [], sabitler: [], calisanlar: [], taslakId: 1, ...ek,
});
const yer = (r: Awaited<ReturnType<typeof coz>>, a: string) => r.yerlesimler.find((y) => y.anahtar === a);

describe('sunucu plan çözücüsü', () => {
  test('kuyruğun tezgâh sırası korunur; saatler tesisin anı, makine istekteki', async () => {
    const r = await coz(KAYNAK, istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-2|10', 'E-1|10'] }] }));
    assert.deepEqual(r.yerlesmeyen, []);
    const e2 = yer(r, 'E-2|10')!, e1 = yer(r, 'E-1|10')!;
    assert.deepEqual([e2.makineId, e1.makineId], [100, 100]);
    assert.equal(e2.baslangic, '2026-10-19T05:00:00.000Z');
    assert.ok(Date.parse(e1.baslangic) >= Date.parse(e2.bitis), 'ikinci iş birincinin bitişinden önce başlamaz');
    const ters = await coz(KAYNAK, istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-2|10'] }] }));
    assert.equal(yer(ters, 'E-1|10')!.baslangic, '2026-10-19T05:00:00.000Z');
  });

  test('aynı istek her koşuda aynı planı verir', async () => {
    const i = istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-2|10'] }, { makineId: 101, anahtarlar: ['E-1|20', 'E-2|20'] }] });
    assert.deepEqual(await coz(KAYNAK, i), await coz(KAYNAK, i));
  });

  test('emrin istekte geçmeyen adımı ardılını bekletmez; sabit işin öncülü ardılını bekletir', async () => {
    const r = await coz(KAYNAK, istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|20'] }] }));
    assert.equal(yer(r, 'E-1|20')!.baslangic, '2026-10-19T05:00:00.000Z');
    const s = await coz(KAYNAK, istek({
      kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|20'] }],
      sabitler: [{ anahtar: 'E-1|10', makineId: 101, baslangic: '2026-10-19T06:00:00.000Z', bitis: '2026-10-19T08:00:00.000Z' }],
    }));
    assert.ok(Date.parse(yer(s, 'E-1|20')!.baslangic) >= Date.parse('2026-10-19T08:00:00.000Z'));
  });

  test('motorda karşılığı olmayan sabit iş tezgâhı o aralıkta kapatır', async () => {
    const r = await coz(KAYNAK, istek({
      kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }],
      sabitler: [{ anahtar: 'X-9|10', makineId: 100, baslangic: '2026-10-19T05:00:00.000Z', bitis: '2026-10-19T07:00:00.000Z' }],
    }));
    assert.ok(Date.parse(yer(r, 'E-1|10')!.baslangic) >= Date.parse('2026-10-19T07:00:00.000Z'));
  });

  test('motorda karşılığı olmayan kuyruk işi ve kayıttaki yerel emir yerleşmez', async () => {
    const r = await coz(KAYNAK, istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-9|10', 'YEREL-1|10', 'E-1|10'] }] }));
    assert.deepEqual(r.yerlesmeyen.sort(), ['E-9|10', 'YEREL-1|10']);
    assert.ok(yer(r, 'E-1|10'));
  });

  test('tarihsiz emir bugünden başlar; ayarlı adım ayarcı kısıtıyla ayarcı yoksa yerleşmez, sayfada kısıt kapalıysa yerleşir', async () => {
    const ayarli = { ...adim(10, 30), setup: 30 };
    const k = (kapali: string[]) => ({
      ...KAYNAK, calisma: { ...KAYNAK.calisma, kapali },
      kaynak: { ...KAYNAK.kaynak, durum: { ...KAYNAK.kaynak.durum, routes: { 50: { base: null, steps: [ayarli] } },
        emirler: { orders: [{ ...emir('3', 'E-3'), start: null, due: null }], opStatus: {}, opProg: {} } } },
    });
    const i = istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-3|10'] }] });
    assert.deepEqual((await coz(k([]), i)).yerlesmeyen, ['E-3|10']);
    const r = await coz(k(['ayarci']), i);
    assert.deepEqual(r.yerlesmeyen, []);
    assert.equal(yer(r, 'E-3|10')!.baslangic, '2026-10-19T05:00:00.000Z');
  });

  test('çalışma yoksa komut reddedilir', async () => {
    await assert.rejects(coz({ ...KAYNAK, calisma: null }, istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] })), /çalışma kaydı/);
  });
});

// Kaynak okuması sunucunun içinden, kullanıcısız (Soru 150 a): yetkisi olmayan bir oturumun süzgecine takılmaz.
describe('sunucu plan çözücüsü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let makineId = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_plan_cozucusu');
    const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const s = ortam.sahip;
    const im = await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('PC-IM', 'Deneme merkezi') RETURNING id");
    const ist = await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('PC-IS', 'Deneme torna', $1, true) RETURNING id", [im!.id]);
    const mk = await s.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('PC-M1', 'Deneme torna 1', $1, true) RETURNING id", [ist!.id]);
    makineId = mk!.id;
    await ortam.vt.tx(async (db) => {
      await sorgular.kayitEkle(db, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: KAYNAK.kayit, kisiId });
      await sorgular.kayitEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'metin', deger: JSON.stringify(KAYNAK.calisma), kisiId });
    });
  });
  after(async () => { await ortam?.kaldir(); });

  test('kaynaklar ve emirler kullanıcısız okunur; emri olmayan kuyruk işi yerleşmez', async () => {
    const k = await vt().tx((db) => planCozumKaynagi(db));
    const d = k?.kaynak.durum as { machines: Array<{ id: string }> | null; emirler: unknown; routes: unknown } | undefined;
    assert.deepEqual(d?.machines?.map((m) => m.id), [String(makineId)]);
    assert.notEqual(d?.emirler, null, 'emir dilimi okunur');
    assert.notEqual(d?.routes, null, 'rota dilimi okunur');
    const r = await vt().tx((db) => sunucuPlanCozucusu(db, istek({ kuyruklar: [{ makineId, anahtarlar: ['E-404|10'] }] })));
    assert.deepEqual(r, { yerlesimler: [], yerlesmeyen: ['E-404|10'] });
  });

  test('planlama sayfasının çalışma kaydı yoksa komut reddedilir', async () => {
    await vt().tx((db) => sorgular.kayitSil(db, PLANLAMA_ANAHTARI));
    await assert.rejects(vt().tx((db) => sunucuPlanCozucusu(db, istek({ kuyruklar: [{ makineId, anahtarlar: ['E-1|10'] }] }))), /çalışma kaydı/);
  });
});
