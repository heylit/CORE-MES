import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import type { PlanMotoruIstegi } from './disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { coz, sunucuPlanCozucusu } from './plan-cozucusu.ts';
import { planCozumKaynagi } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';

// Reçete ve Rota'nın ana kaydı (planın girdisi) doğrudan yazılır: sahibi modülün yazma yolu bu testin konusu değildir.
const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);

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

  test('690 b: emirler arası bağ (parti kolu) ardılı öncülün bitişine bekletir; motorda karşılığı olmayan bağ yok sayılır', async () => {
    const kuyruklar = [{ makineId: 100, anahtarlar: ['E-1|10'] }, { makineId: 101, anahtarlar: ['E-2|10'] }];
    const serbest = await coz(KAYNAK, istek({ kuyruklar }));
    assert.equal(yer(serbest, 'E-2|10')!.baslangic, '2026-10-19T05:00:00.000Z', 'bağsız iki tezgâhta aynı anda başlar');
    const bagli = await coz(KAYNAK, istek({ kuyruklar, baglar: [{ anahtar: 'E-2|10', oncul: 'E-1|10' }, { anahtar: 'E-2|10', oncul: 'E-9|10' }] }));
    assert.deepEqual(bagli.yerlesmeyen, []);
    assert.ok(Date.parse(yer(bagli, 'E-2|10')!.baslangic) >= Date.parse(yer(bagli, 'E-1|10')!.bitis), 'ardıl öncülün bitişini bekler');
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

  test('525 4 a, 554 a: termini girilmemiş eksik malzeme olması gereken tarihte gelmiş sayılır, iş kaymaz; girilen geç termin katı kipte işi bekletir', async () => {
    const ham = { id: '60', code: 'HM-1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', stock: 0 };
    const k = (mat: string, termin: string | null) => ({
      ...KAYNAK, calisma: { ...KAYNAK.calisma, w: { ...KAYNAK.calisma.w, mat } },
      kayit: { ...KAYNAK.kayit, items: [{ ...ham, plan: { kod: '60', ad: 'Ornek cubuk', birim: 'kg', stok: 0, birimFiyat: 0, tedarikGun: null, muayeneGun: 0 } }] },
      kaynak: { ...KAYNAK.kaynak, ek: termin === null ? null : { tedarikTerminleri: [{ kod: '60', termin, surum: 1, aciklama: '' }] },
        durum: { ...KAYNAK.kaynak.durum, items: [...KAYNAK.kaynak.durum.items, ham],
          routes: { 50: { base: null, steps: [{ ...adim(10, 30), ins: [{ itemId: '60', qty: 1 }] }, adim(20, 15)] } } } },
    });
    const i = istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-1|20'] }] });
    const terminsiz = await coz(k('sert', null), i);
    assert.deepEqual([terminsiz.yerlesmeyen, terminsiz.malzemeBekleyen], [[], []]);
    assert.ok(yer(terminsiz, 'E-1|10') && yer(terminsiz, 'E-1|20'));
    const gec = await coz(k('sert', '2026-10-23'), i);
    assert.equal(yer(gec, 'E-1|10')!.baslangic, '2026-10-23T05:00:00.000Z', 'termin günü 08:00');
    // Eski uyarı kipi karma kipe taşınır (1650 4 c): Satın Alma termini belli geliştir, karma kipte de bekletir.
    const karma = await coz(k('uyari', '2026-10-23'), i);
    assert.equal(yer(karma, 'E-1|10')!.baslangic, '2026-10-23T05:00:00.000Z');
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

  test('650 a: tezgâh kendi iş merkezinin haftasıyla çalışır; haftasında vardiya olmayan merkezin tezgâhı vardiyasız', async () => {
    // Merkez 1 (T1, T2) hafta içi 08:00-16:00; merkez 2 (T3) her gün 13:00-17:00; merkez 3 (T4) vardiyasız. Atölyenin tek takvimi birleşimdir.
    const ogle = { id: '5', name: 'Ogle', start: '13:00', end: '17:00', breaks: [] };
    const hafta = (ids: string[], gunler: number[]) => Object.fromEntries(gunler.map((g) => [g, ids]));
    const d = KAYNAK.kaynak.durum;
    const k = {
      ...KAYNAK,
      calisma: { ...KAYNAK.calisma, D: { ...KAYNAK.calisma.D, vardiyalar: [...KAYNAK.calisma.D.vardiyalar, { id: '5', bas: '13:00', bit: '17:00' }] } },
      kaynak: {
        durum: {
          ...d,
          wcs: [...d.wcs, { id: '2', code: 'IM2', name: 'Ogle merkezi', aktif: true }, { id: '3', code: 'IM3', name: 'Bos merkez', aktif: true }],
          stations: [...d.stations, { id: '20', code: 'TOR2', name: 'Torna 2', wcId: '2', eff: 100, opPer: 1, count: 1, aktif: true },
            { id: '30', code: 'TOR3', name: 'Torna 3', wcId: '3', eff: 100, opPer: 1, count: 1, aktif: true }],
          machines: [...d.machines, { id: '200', code: 'T3', name: 'Torna 3', stationId: '20', status: 'aktif', aktif: true },
            { id: '300', code: 'T4', name: 'Torna 4', stationId: '30', status: 'aktif', aktif: true }],
          cal: { shifts: [...d.cal.shifts, ogle], holidays: [] },
        },
        ek: { takvim: { hafta: { 1: hafta([V], [1, 2, 3, 4, 5]), 2: hafta(['5'], [0, 1, 2, 3, 4, 5, 6]) }, kisiVardiyasi: {} } },
      },
    };
    const r = await coz(k, istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }, { makineId: 200, anahtarlar: ['E-2|10'] }, { makineId: 300, anahtarlar: ['E-2|20'] }] }));
    assert.deepEqual([yer(r, 'E-1|10')!.baslangic, yer(r, 'E-1|10')!.bitis], ['2026-10-19T05:00:00.000Z', '2026-10-19T06:00:00.000Z'], 'merkez 1: 08:00');
    assert.deepEqual([yer(r, 'E-2|10')!.baslangic, yer(r, 'E-2|10')!.bitis], ['2026-10-19T10:00:00.000Z', '2026-10-19T11:00:00.000Z'], 'merkez 2: 13:00');
    assert.deepEqual(r.vardiyasiz, ['E-2|20'], 'merkez 3: vardiyasız');
  });

  test('651 a: arızadaki tezgâh vardiya sonuna kadar kapalıdır; silinen oto satırı geri gelmez, makine çalışınca satır kapanır', async () => {
    const d = KAYNAK.kaynak.durum;
    const durumlu = (status: string, calisma: object = {}) => ({ ...KAYNAK, calisma: { ...KAYNAK.calisma, ...calisma },
      kaynak: { ...KAYNAK.kaynak, durum: { ...d, machines: d.machines.map((m) => m.id === '100' ? { ...m, status } : m) } } });
    const i = istek({ simdi: new Date('2026-10-19T07:00:00Z'), kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] });
    const bas = async (k: Parameters<typeof coz>[0]) => yer(await coz(k, i), 'E-1|10')!.baslangic;
    assert.equal(await bas(durumlu('ariza')), '2026-10-20T05:00:00.000Z', 'arıza: 10:00-16:00 kapalı, ertesi gün 08:00');
    assert.equal(await bas(durumlu('bakim')), '2026-10-20T05:00:00.000Z', 'bakım da aynı');
    assert.equal(await bas(durumlu('ariza', { arizaOto: { 100: 'ariza' } })), '2026-10-19T07:00:00.000Z', 'planlamacının sildiği satır geri gelmez');
    const acik = { arizaOto: { 100: 'ariza' }, down: [{ m: '100', from: 10, to: 16, neden: 'arıza', oto: 1 }] };
    assert.equal(await bas(durumlu('aktif', acik)), '2026-10-19T07:00:00.000Z', 'makine çalışır: oto satır şimdide kapanır');
    assert.equal(await bas(durumlu('aktif', { down: [{ m: '100', from: 10, to: 16, neden: 'arıza' }] })), '2026-10-20T05:00:00.000Z', 'elle girilen satır kalır');
  });

  test('678 a: başlangıcı olmayan emir bugünün başından serbesttir; gece vardiyasında ilk vardiya saatini beklemez', async () => {
    const d = KAYNAK.kaynak.durum;
    const gece = { id: V, name: 'Gece', start: '00:00', end: '12:00', breaks: [] };
    const k = { ...KAYNAK,
      calisma: { ...KAYNAK.calisma, D: { ...KAYNAK.calisma.D, vardiyalar: [{ id: V, bas: '00:00', bit: '12:00' }] } },
      kaynak: { ...KAYNAK.kaynak, durum: { ...d, cal: { shifts: [gece], holidays: [] },
        emirler: { ...d.emirler, orders: d.emirler.orders.map((o) => ({ ...o, start: null })) } } } };
    // Tesiste 20.10 02:00; çalışmanın başlangıcı 19.10.
    const r = await coz(k, istek({ simdi: new Date('2026-10-19T23:00:00Z'), kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.equal(yer(r, 'E-1|10')!.baslangic, '2026-10-19T23:00:00.000Z');
  });

  test('168 b: vardiyası tanımsız tezgâhın işi vardiyasiz\'dadır, ötekiler dizilir', async () => {
    const k = { ...KAYNAK, calisma: { ...KAYNAK.calisma, D: { ...KAYNAK.calisma.D, calismaGunleri: {} } } };
    const r = await coz(k, istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual([r.yerlesimler, r.yerlesmeyen, r.vardiyasiz], [[], [], ['E-1|10']]);
  });

  // 669 a, 671 a: Motor A'nın kuralları ortak motorda (her biri recete-rota/FARK.md'de).
  test('CA-2: fason adım kuyruğa girmez; sonraki iç adım öncülünün bitişinden termin günü kadar sonra başlar, termin yoksa 7 gün', async () => {
    const fason = (terminGun: number | null) => ({ ...adim(20, 0), stationId: null, fasonId: '9', terminGun, setup: 0, proc: 0, cycle: 0 });
    const k = (terminGun: number | null) => ({ ...KAYNAK, kaynak: { ...KAYNAK.kaynak, durum: { ...KAYNAK.kaynak.durum,
      routes: { 50: { base: null, steps: [adim(10, 30), fason(terminGun), adim(30, 15)] } } } } });
    const i = istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-1|30'] }] });
    const r = await coz(k(2), i);
    assert.equal(yer(r, 'E-1|20'), undefined, 'fason adım yerleşim değildir');
    assert.equal(yer(r, 'E-1|10')!.bitis, '2026-10-19T06:00:00.000Z');
    assert.equal(yer(r, 'E-1|30')!.baslangic, '2026-10-21T06:00:00.000Z', 'iki gün sonra, vardiya içinde');
    assert.equal(yer(await coz(k(null), i), 'E-1|30')!.baslangic, '2026-10-26T06:00:00.000Z', 'termin yoksa yedi gün');
  });

  test('yeri sabit iş tezgâhın boş anını ilerletmez: önüne sığan kuyruk işi önce yapılır, ardılı sabit işin saniyeli bitişini bekler', async () => {
    const r = await coz(KAYNAK, istek({
      kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }, { makineId: 101, anahtarlar: ['E-2|20'] }],
      sabitler: [{ anahtar: 'E-2|10', makineId: 100, baslangic: '2026-10-19T07:00:00.000Z', bitis: '2026-10-19T08:00:30.000Z' }],
    }));
    assert.equal(yer(r, 'E-1|10')!.baslangic, '2026-10-19T05:00:00.000Z', 'sabit işin önündeki boşlukta');
    assert.ok(Date.parse(yer(r, 'E-2|20')!.baslangic) >= Date.parse('2026-10-19T08:00:30.000Z'), 'sabit öncülün bitişinden önce başlamaz');
  });

  test('elle seçilen rota dışı makine tutulur; süre rotadaki tezgâhınkidir', async () => {
    const k = { ...KAYNAK, kaynak: { ...KAYNAK.kaynak, durum: { ...KAYNAK.kaynak.durum,
      stations: [...KAYNAK.kaynak.durum.stations, { id: '20', code: 'FRZ', name: 'Freze', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
      machines: [...KAYNAK.kaynak.durum.machines, { id: '200', code: 'F1', name: 'Freze 1', stationId: '20', status: 'aktif', aktif: true }] } } };
    const r = await coz(k, istek({ kuyruklar: [{ makineId: 200, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual(r.yerlesmeyen, []);
    assert.deepEqual([yer(r, 'E-1|10')!.makineId, yer(r, 'E-1|10')!.baslangic, yer(r, 'E-1|10')!.bitis], [200, '2026-10-19T05:00:00.000Z', '2026-10-19T06:00:00.000Z']);
  });

  test('A4 3b: kuyruğa konan çalışan iş öndeki işten sonra kalan adediyle, ayarsız sürer', async () => {
    const ayarli = { ...adim(10, 30), setup: 20 };
    const k = { ...KAYNAK, kaynak: { ...KAYNAK.kaynak, durum: { ...KAYNAK.kaynak.durum, routes: { 50: { base: null, steps: [ayarli, adim(20, 15)] } },
      calisanAdimlar: [{ anahtar: 'E-1|10', makineId: '100', baslangic: '2026-10-19T04:30:00.000Z', sayimAni: '2026-10-19T05:00:00.000Z', kalanVerimliDk: 30, saglam: 1, adet: 2 }] } } };
    const r = await coz(k, istek({
      kuyruklar: [{ makineId: 100, anahtarlar: ['E-2|10', 'E-1|10'] }],
      calisanlar: [{ anahtar: 'E-1|10', makineId: 100, baslangic: '2026-10-19T04:30:00.000Z', sayimAni: '2026-10-19T05:00:00.000Z', kalanDk: 30, kalanVerimliDk: 30 }],
    }));
    const e2 = yer(r, 'E-2|10')!, e1 = yer(r, 'E-1|10')!;
    assert.equal(e2.baslangic, '2026-10-19T05:00:00.000Z');
    assert.equal(e1.baslangic, e2.bitis, 'öndeki işten sonra');
    assert.equal(Date.parse(e1.bitis) - Date.parse(e1.baslangic), 30 * 60_000, 'kalan bir adet, ayarsız');
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
      await receteRotaKaydiEkle(db, KAYNAK.kayit, kisiId);
      await sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'metin', deger: JSON.stringify(KAYNAK.calisma), kisiId });
    });
  });
  after(async () => { await ortam?.kaldir(); });

  test('kaynaklar ve emirler kullanıcısız okunur; emri olmayan kuyruk işi yerleşmez', async () => {
    const k = await vt().tx((db) => planCozumKaynagi(db));
    const d = k?.kaynak.durum as { machines: Array<{ id: string }> | null; emirler: unknown; routes: unknown } | undefined;
    assert.deepEqual(d?.machines?.map((m) => m.id), [String(makineId)]);
    assert.notEqual(d?.emirler, null, 'emir dilimi okunur');
    assert.notEqual(d?.routes, null, 'rota dilimi okunur');
    // N8: takvim eki planlama sayfasındaki gibi kurulur (iş merkezinin haftalık vardiyası)
    assert.deepEqual(Object.keys((k?.kaynak.ek as { takvim: object | null } | undefined)?.takvim ?? {}).sort(), ['hafta', 'kisiVardiyasi']);
    const r = await vt().tx((db) => sunucuPlanCozucusu(db, istek({ kuyruklar: [{ makineId, anahtarlar: ['E-404|10'] }] })));
    assert.deepEqual(r, { yerlesimler: [], yerlesmeyen: ['E-404|10'], vardiyasiz: [], malzemeBekleyen: [] });
  });

  test('planlama sayfasının çalışma kaydı yoksa komut reddedilir', async () => {
    await vt().tx((db) => sorgular.planlamaKaydiSil(db, PLANLAMA_ANAHTARI));
    await assert.rejects(vt().tx((db) => sunucuPlanCozucusu(db, istek({ kuyruklar: [{ makineId, anahtarlar: ['E-1|10'] }] }))), /çalışma kaydı/);
  });
});
