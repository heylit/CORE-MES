import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi } from '../plan-girdisi.ts';
import { dilimFarki, farkMetni } from './esdegerlik.ts';
import { KAYNAK_ALANLARI, kaynakDilimiKur, type KaynakDilimiOkumasi, type KaynakElleVerisi } from './kaynaklar-kurallar.ts';

// 1716: kaynak diliminin saf eşdeğerliği. Aynı veri eski yola Reçete ve Rota'nın durum biçiminde (recete-rota/kurallar.ts çevirileriyle
// aynı alanlar), yeni yola tipli okuma olarak verilir; kaynak alanları birebir aynı olmalı. Okumanın kendisi kaynaklar-vt.test.ts'te
// gerçek PostgreSQL ile sınanır. Veriler uydurmadır.

const OKUMA: KaynakDilimiOkumasi = {
  vardiyalar: [
    { id: 1, bas: '08:00', bit: '16:00', molalar: [{ bas: '12:00', bit: '12:30' }] },
    { id: 2, bas: '16:00', bit: '24:00', molalar: [] },
  ],
  tatiller: ['2026-10-29'],
  istasyon: {
    merkezler: [{ id: 5 }, { id: 6 }],
    istasyonlar: [
      { id: 10, merkezId: 5, verimYuzde: 90, operatorOrani: 0.5 },
      { id: 11, merkezId: 5, verimYuzde: 100, operatorOrani: 1 },
      { id: 12, merkezId: 7, verimYuzde: null, operatorOrani: null },
    ],
    makineler: [
      { id: 100, ad: 'Torna 1', istasyonId: 10 },
      { id: 101, ad: 'Torna 2', istasyonId: 10 },
      { id: 110, ad: 'Freze 1', istasyonId: 11 },
      { id: 120, ad: 'Taslama 1', istasyonId: 12 },
      { id: 130, ad: 'Bagsiz', istasyonId: null },
    ],
  },
  takvim: {
    hafta: [
      { merkezId: 5, gun: 1, vardiyaId: 2 }, { merkezId: 5, gun: 1, vardiyaId: 1 }, { merkezId: 5, gun: 2, vardiyaId: 1 },
      { merkezId: 6, gun: 1, vardiyaId: 1 }, { merkezId: 6, gun: 6, vardiyaId: 1 }, { merkezId: 5, gun: 3, vardiyaId: 99 },
    ],
    kisiVardiyasi: [{ kisiId: 7, vardiyaId: 1 }],
  },
  istasyonMaliyeti: new Map([[10, 900], [11, 1200]]),
  kisiler: [
    { id: 7, ad: 'Ornek Operator', gorev: 'Operatör', yetkinlikler: [10], makineler: [100], enCok: 2 },
    { id: 8, ad: 'Ornek Ayarci', gorev: 'Ayarcı', yetkinlikler: [10, 11], makineler: [], enCok: null },
  ],
  izinler: [{ kisiId: '7', gunler: ['2026-10-21', '2026-10-22'] }, { kisiId: '8', gunler: ['2026-10-23'] }],
};
const ELLE: KaynakElleVerisi = {
  tezgahlar: [
    // elle değiştirilmiş ücret (izlemez) ve sayfanın ayarları
    { id: '100', ad: 'Eski ad', grup: '10', ucret: 950, ucretIst: 900, verim: 0.8, vardiyalar: ['1'], opOran: 0, isiksiz: true, arizaGun: 30, onarimSaat: 4 },
    // izleyen ücret: istasyon maliyetine geçer
    { id: '110', ad: 'Freze 1', grup: '11', ucret: 1000, ucretIst: 1000, verim: 1, vardiyalar: ['1', '2'], opOran: 1 },
    // artık okunmayan tezgâh: düşer
    { id: '999', ad: 'Kalkan', grup: '10', ucret: null, verim: 1, opOran: 1 },
  ],
  personel: [{ id: '8', ad: 'Eski ad', vardiya: '', gruplar: [], makineler: [], enCok: null, ayar: false, notu: 'sayfanin alani' }],
  devamsizlik: [{ personel: '8', gun: '2026-10-23' }, { personel: '7', gun: '2026-10-20', sunucu: true }],
};

// Eski yolun kaynak okuması: recete-rota/kurallar.ts (istasyonCevir, makineCevir, kisiCevir, vardiyaCevir) ve planlama-servis.ts
// (takvimEki, kaynakOku) biçimi.
function eskiKaynak(o: KaynakDilimiOkumasi): { durum: Record<string, unknown>; ek: Record<string, unknown> } {
  const hafta: Record<string, Record<number, string[]>> = {};
  for (const h of o.takvim?.hafta ?? []) ((hafta[String(h.merkezId)] ??= {})[h.gun] ??= []).push(String(h.vardiyaId));
  const maliyet = o.istasyonMaliyeti === null ? null
    : { istasyon: Object.fromEntries([...o.istasyonMaliyeti].map(([id, t]) => [String(id), { birimMaliyet: String(t), paraBirimi: 'TRY', surum: 1 }])), kisi: {}, malzeme: {} };
  return {
    durum: {
      cal: { shifts: o.vardiyalar.map((v) => ({ id: String(v.id), name: 'V', start: v.bas, end: v.bit, breaks: v.molalar.map((m) => ({ start: m.bas, end: m.bit })) })), holidays: o.tatiller },
      wcs: o.istasyon?.merkezler.map((m) => ({ id: String(m.id), code: 'IM', name: 'Merkez', week: null, aktif: true })) ?? null,
      stations: o.istasyon?.istasyonlar.map((i) => ({ id: String(i.id), code: 'IS', name: 'Istasyon', wcId: String(i.merkezId), eff: i.verimYuzde, opPer: i.operatorOrani, count: 1, cost: null, aktif: true })) ?? null,
      machines: o.istasyon?.makineler.map((m) => ({ id: String(m.id), code: 'M', name: m.ad, stationId: m.istasyonId === null ? null : String(m.istasyonId), status: 'aktif', aktif: true })) ?? null,
      people: o.kisiler?.map((k) => ({ id: String(k.id), name: k.ad, code: null, role: null, stationId: null, wcId: null, shiftId: null, skills: k.yetkinlikler.map(String), cost: null, active: true, machines: k.makineler.map(String), maxMachines: k.enCok })) ?? null,
      maliyet,
    },
    ek: {
      takvim: o.takvim === null ? null : { hafta, kisiVardiyasi: Object.fromEntries(o.takvim.kisiVardiyasi.map((k) => [String(k.kisiId), String(k.vardiyaId)])) },
      kisiGorevi: o.kisiler === null ? null : Object.fromEntries(o.kisiler.map((k) => [String(k.id), k.gorev])),
      kapasite: { kisiler: o.izinler?.map((p) => ({ id: p.kisiId, izinli: p.gunler, fazlaMesai: [], paylar: [] })) ?? null },
    },
  };
}

const KAYIT = { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] };
function eskiYol(o: KaynakDilimiOkumasi, elle: KaynakElleVerisi): Record<string, unknown> {
  const calisma = {
    surum: 2, rrSavedAt: 9, dataVer: 1, kisitSurum: 2, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], siparisler: [], tezgahlar: [], personel: [], ...elle },
  };
  const r = planGirdisi({ calisma, kayit: KAYIT, kaynak: eskiKaynak(o), bugun: '2026-10-19' });
  assert.ok(r);
  return r.S['D'] as Record<string, unknown>;
}
const esdeger = (o: KaynakDilimiOkumasi, elle: KaynakElleVerisi): void => {
  const fark = dilimFarki(eskiYol(o, elle), kaynakDilimiKur(o, elle), KAYNAK_ALANLARI);
  assert.equal(farkMetni(fark), '');
};

describe('kaynak dilimi eşdeğerliği (1716, saf)', () => {
  test('KD-01: tam okuma ve elle değerlerle eski yolla aynı', () => esdeger(OKUMA, ELLE));
  test('KD-02: elle verisi olmayan yeni çalışmada (ilk kurulum) eski yolla aynı', () => esdeger(OKUMA, {}));
  test('KD-03: maliyet okunamazsa ücret izlemesi durur, ilk kurulumdaki ücret boştur; eski yolla aynı', () => esdeger({ ...OKUMA, istasyonMaliyeti: null }, ELLE));
  test('KD-04: haftası olmayan takvim, vardiyasız gün ve vardiyasız kişi; eski yolla aynı', () => {
    esdeger({ ...OKUMA, takvim: { hafta: [], kisiVardiyasi: [] } }, ELLE);
    esdeger({ ...OKUMA, vardiyalar: [], takvim: { hafta: [], kisiVardiyasi: [] } }, {});
  });
  test('KD-05: izin okunamazsa elle devamsızlık olduğu gibi kalır; eski yolla aynı', () => esdeger({ ...OKUMA, izinler: null }, ELLE));

  test('KD-06: yeni yolun değerleri (eski yolun kuralları)', () => {
    const d = kaynakDilimiKur(OKUMA, ELLE);
    const t = Object.fromEntries(d.tezgahlar.map((x) => [x.id, x]));
    assert.deepEqual(Object.keys(t), ['100', '101', '110', '120'], 'istasyonsuz ve okunmayan tezgâh düşer');
    assert.deepEqual([t['100']?.ad, t['100']?.ucret, t['100']?.verim, t['100']?.opOran, t['100']?.isiksiz], ['Torna 1', 950, 0.8, 0.5, true]);
    assert.deepEqual([t['101']?.ucret, t['101']?.verim, t['101']?.vardiyalar], [900, 0.9, ['1', '2']]);
    assert.deepEqual([t['110']?.ucret, t['110']?.ucretIst], [1200, 1200]);
    assert.deepEqual([t['120']?.ucret, t['120']?.verim, t['120']?.opOran, t['120']?.hafta], [null, 1, 1, undefined]);
    assert.deepEqual(t['100']?.hafta, { pzt: ['1', '2'], sal: ['1'], car: [], per: [], cum: [], cmt: [], paz: [] });
    assert.deepEqual(d.calismaGunleri, { pzt: ['1', '2'], sal: ['1'], car: [], per: [], cum: [], cmt: ['1'], paz: [] });
    const p = Object.fromEntries(d.personel.map((x) => [x.id, x]));
    assert.deepEqual([p['7']?.vardiya, p['7']?.ayar, p['8']?.vardiya, p['8']?.ayar, (p['8'] as unknown as Record<string, unknown>)['notu']], ['1', false, '', false, 'sayfanin alani']);
    assert.deepEqual(d.devamsizlik, [
      { personel: '8', gun: '2026-10-23' }, { personel: '7', gun: '2026-10-21', sunucu: true }, { personel: '7', gun: '2026-10-22', sunucu: true },
    ]);
  });

  // Eski yol okunamayan dilimde Reçete ve Rota kaydındaki kopyaya düşer; yeni yol açık çalışmadakini korur; hangisinin geçerli olacağı 1720'de sorulur.
  test('KD-07: istasyon ya da kişi okunamazsa yeni yol açık çalışmadakini korur', () => {
    const d = kaynakDilimiKur({ ...OKUMA, istasyon: null, kisiler: null }, ELLE);
    assert.deepEqual(d.tezgahlar.map((x) => x.id), ['100', '110', '999']);
    assert.deepEqual(d.personel.map((x) => x.id), ['8']);
    assert.deepEqual(d.calismaGunleri, {});
  });
});
