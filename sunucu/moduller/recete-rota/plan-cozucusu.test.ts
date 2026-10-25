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

  // Ayarcı yokken ne olacağı Soru 159 b'nindir (sınır uygulanmaz, uyarı); burada yalnız iki davranışın da yerleştirdiği durumlar sınanır.
  test('tarihsiz emir bugünden başlar; ayarlı adım vardiyalı ayarcıyla da, sayfada ayarcı kısıtı kapalıyken de yerleşir', async () => {
    const ayarli = { ...adim(10, 30), setup: 30 };
    const ayarci = { id: '7', name: 'Deneme ayarci', code: 'A7', wcId: '1', stationId: '10', skills: ['10'], active: true };
    const k = (kapali: string[], kisiler: unknown[]) => ({
      ...KAYNAK, calisma: { ...KAYNAK.calisma, kapali },
      kaynak: {
        durum: { ...KAYNAK.kaynak.durum, routes: { 50: { base: null, steps: [ayarli] } }, people: kisiler,
          emirler: { orders: [{ ...emir('3', 'E-3'), start: null, due: null }], opStatus: {}, opProg: {} } },
        // kişinin vardiyası ve iş merkezi haftası takvim ekindedir (çerçevenin kaynak okuması)
        ek: { takvim: { hafta: { 1: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((g) => [g, [V]])) }, kisiVardiyasi: { 7: V } }, makineNotu: null, kisiGorevi: { 7: 'Ayarcı' } },
      },
    });
    const i = istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-3|10'] }] });
    for (const r of [await coz(k([], [ayarci]), i), await coz(k(['ayarci'], []), i)]) {
      assert.deepEqual(r.yerlesmeyen, []);
      assert.equal(yer(r, 'E-3|10')!.baslangic, '2026-10-19T05:00:00.000Z');
    }
  });

  test('168 b: vardiyanın molasında tezgâh çalışmaz; gece vardiyasının molası ertesi güne düşer', async () => {
    const k = (shifts: unknown[], gun: string) => ({
      ...KAYNAK,
      calisma: { ...KAYNAK.calisma, D: { ...KAYNAK.calisma.D, calismaGunleri: Object.fromEntries(['pzt', 'sal', 'car', 'per', 'cum'].map((g) => [g, [gun]])) } },
      kaynak: { ...KAYNAK.kaynak, durum: { ...KAYNAK.kaynak.durum, cal: { shifts, holidays: [] } } },
    });
    // 08:00'den 60 dk iş, 08:30-08:45 mola: 09:15'te biter
    const gunduz = k([{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [{ start: '08:30', end: '08:45' }] }], V);
    const r = await coz(gunduz, istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual([yer(r, 'E-1|10')!.baslangic, yer(r, 'E-1|10')!.bitis], ['2026-10-19T05:00:00.000Z', '2026-10-19T06:15:00.000Z']);
    // 22:00-06:00 vardiyası, gece 00:30-01:00 mola; simdi 23:00 (20:00Z): ilk iş gece yarısı biter, ikincisi molayı geçip 01:30'da
    const gece = k([{ id: '4', name: 'Gece', start: '22:00', end: '06:00', breaks: [{ start: '00:30', end: '01:00' }] }], '4');
    const g = await coz(gece, istek({ simdi: new Date('2026-10-19T20:00:00Z'), kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-2|10'] }] }));
    assert.equal(yer(g, 'E-1|10')!.bitis, '2026-10-19T21:00:00.000Z');
    assert.equal(yer(g, 'E-2|10')!.bitis, '2026-10-19T22:30:00.000Z');
  });

  test('512 1 a: taslağın ek vardiyası motorun kapasitesidir; verilmezse çalışmanınki, boş liste çalışmanınkini siler', async () => {
    const aksam = { id: '9', name: 'Aksam', start: '16:00', end: '23:59', breaks: [] };
    const k = (ekMesai: unknown[]) => ({
      ...KAYNAK,
      calisma: { ...KAYNAK.calisma, ekMesai, D: { ...KAYNAK.calisma.D, vardiyalar: [...KAYNAK.calisma.D.vardiyalar, { id: '9', bas: '16:00', bit: '23:59' }] } },
      kaynak: { ...KAYNAK.kaynak, durum: { ...KAYNAK.kaynak.durum, cal: { shifts: [...KAYNAK.kaynak.durum.cal.shifts, aksam], holidays: [] } } },
    });
    // simdi 15:30 (12:30Z), 60 dk iş: vardiya 16:00'da biter; ek vardiyasız ertesi gün 08:30'da, akşam ek vardiyasıyla 16:30'da biter
    const is = { simdi: new Date('2026-10-19T12:30:00Z'), kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] };
    const bitis = async (kaynak: ReturnType<typeof k>, ek: Partial<PlanMotoruIstegi>) => yer(await coz(kaynak, istek({ ...is, ...ek })), 'E-1|10')!.bitis;
    const ertesi = '2026-10-20T05:30:00.000Z', aksamda = '2026-10-19T13:30:00.000Z';
    assert.equal(await bitis(k([]), {}), ertesi);
    assert.equal(await bitis(k([]), { ekMesai: [{ makineId: 100, gun: '2026-10-19', vardiyaId: 9 }] }), aksamda, 'taslağın ek vardiyası');
    assert.equal(await bitis(k([]), { ekMesai: [{ makineId: 101, gun: '2026-10-19', vardiyaId: 9 }] }), ertesi, 'başka tezgâhın ek vardiyası');
    assert.equal(await bitis(k([]), { ekMesai: [{ makineId: 100, gun: '2026-10-20', vardiyaId: 9 }] }), ertesi, 'başka günün ek vardiyası');
    const calismada = k([{ m: '100', gun: 0, vardiya: '9' }]);
    assert.equal(await bitis(calismada, {}), aksamda, 'istek vermezse çalışmanın ek vardiyası');
    assert.equal(await bitis(calismada, { ekMesai: [] }), ertesi, 'taslakta ek vardiya yoksa çalışmanınki kullanılmaz');
  });

  test('168 b: vardiyası tanımsız tezgâhın işi vardiyasiz\'dadır, ötekiler dizilir', async () => {
    const k = { ...KAYNAK, calisma: { ...KAYNAK.calisma, D: { ...KAYNAK.calisma.D, calismaGunleri: {} } } };
    const r = await coz(k, istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual([r.yerlesimler, r.yerlesmeyen, r.vardiyasiz], [[], [], ['E-1|10']]);
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
    assert.deepEqual(r, { yerlesimler: [], yerlesmeyen: ['E-404|10'], vardiyasiz: [] });
  });

  test('planlama sayfasının çalışma kaydı yoksa komut reddedilir', async () => {
    await vt().tx((db) => sorgular.kayitSil(db, PLANLAMA_ANAHTARI));
    await assert.rejects(vt().tx((db) => sunucuPlanCozucusu(db, istek({ kuyruklar: [{ makineId, anahtarlar: ['E-1|10'] }] }))), /çalışma kaydı/);
  });
});
