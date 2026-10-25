import assert from 'node:assert/strict';
import { test } from 'node:test';
import { satinAlmaCalismasi } from './satin-alma-gorunumu.ts';

// 546 a: Satın Alma'ya giden çalışmada yalnız iş kodu, ürün kodu, adet, termin, iş başlangıç ve bitişi, reçetenin malzeme satırları ve
// fason satırları kalır. Veriler uydurmadır.
const tam = {
  surum: 2, dataVer: 4, simdi: 30, w: { mat: 'sert' }, param: { mesaiHafta: 12 }, bedel: { tl: 1 }, locks: { 'E-1.10': 'T1' }, iz: [{ kim: 'Deneme' }],
  ekMesai: [{ m: 'T1', gun: 1, vardiya: 'V1' }], down: [{ m: 'T1', from: 1, to: 2 }], senaryolar: [{ id: 'S1', ad: 'Deneme senaryo' }],
  olaylar: [{ tip: 'fason', f: 'F1', gun: 2 }, { tip: 'ariza', m: 'T1', saat: 4 }, { tip: 'sure', urun: 'U1', k: '10', oran: 1.2 }],
  plan: {
    dataVer: 4,
    ops: {
      'E-1.10': { id: 'E-1.10', job: 'E-1', m: 'T1', S: 8, C: 10, su: 1, run: 1, fas: 0, done: 0, why: 'deneme' },
      'E-1.20': { id: 'E-1.20', job: 'E-1', m: '@F1', S: 10, C: 40, su: 0, run: 30, fas: 1, done: 0 },
    },
    J: { 'E-1': { id: 'E-1', C: 40, T: 0, kar: 999, mc: 77, sc: 5, fc: 6 } },
    cost: { toplam: 12345 },
  },
  D: {
    meta: { ad: 'Deneme calisma', baslangic: '2026-10-19' },
    siparisler: [{ id: 'E-1', ad: 'Deneme musteri siparisi', musteri: 'Deneme Musteri', urun: 'U1', adet: 5, termin: '2026-10-30 16:00', gelir: 5000, cezaGun: 100, oncelik: 3, malzeme: [{ kod: 'M1', miktar: 2, fiyat: 9 }] }],
    urunler: [{ id: 'U1', ad: 'Deneme urun adi', rota: [
      { k: '10', ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 3, ayar: 20 }], bag: [] },
      { k: '20', ad: 'Kaplama', fason: 'F1', bag: [['10', 'FS']] },
    ] }],
    malzemeler: [{ kod: 'M1', ad: 'Deneme cubuk', birim: 'kg', stok: 3, tedarikGun: 5, muayeneGun: 1, fire: 10, birimFiyat: 42, tedarikci: 'TD1' }],
    satinalma: [{ kod: 'M1', miktar: 4, gelis: '2026-10-22 08:00', tedarikci: 'TD1', no: 'SA-0001', birimFiyat: 41, tutar: 164 }],
    tedarikciler: [{ id: 'TD1', ad: 'Deneme tedarikci', ortGecikmeGun: 1, iban: 'TR00' }],
    fasoncular: [{ id: 'F1', ad: 'Deneme fasoncu', sureGun: 3, kapasite: 2, fiyat: 8, saatFiyat: 90, tasima: 15 }],
    tezgahlar: [{ id: 'T1', ad: 'Deneme tezgah', ucret: 500 }],
    personel: [{ id: 'P1', ad: 'Deneme kisi' }],
    vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00', molalar: [{ bas: '12:00', bit: '12:30' }], kisiler: ['P1'] }],
    calismaGunleri: { pzt: ['V1'] }, tatiller: ['2026-10-29'],
    terminAyar: { katMal: 1.5, esik: 7 }, fasonTermin: { 'E-1.20': '2026-10-24 08:00' }, fasonRef: {}, opAdet: {},
    ayarlar: { operatorUcret: 300, mesaiUcret: 400 }, planTL: { wip: {} },
  },
};
const kayit = { orders: [{ id: 'E-1', status: 'acik', musteri: 'Deneme Musteri', fiyat: 1 }], opStatus: { 'E-1|root|1': 'tamam' }, items: [{ id: 'U1' }] };

test('SA-01: yalnız beyaz listedeki alanlar gider; müşteri, fiyat, tutar, maliyet, tezgâh ve personel gitmez', () => {
  const g = satinAlmaCalismasi(tam, kayit);
  const metin = JSON.stringify(g);
  for (const yasak of ['Deneme Musteri', 'Deneme musteri siparisi', 'Deneme urun adi', 'Deneme tezgah', 'Deneme kisi', 'Deneme calisma', 'Deneme senaryo',
    'birimFiyat', 'fiyat', 'tutar', 'gelir', 'cezaGun', 'oncelik', '"kar"', '"mc"', 'ucret', 'saatFiyat', 'tasima', 'iban', 'cost', 'ayarlar', 'planTL',
    'tezgahlar":[{', 'cevrim', '"T1"', 'mesaiHafta', 'locks', 'ekMesai', '"down"', '"iz"', 'bedel', 'kisiler', 'items']) {
    assert.ok(!metin.includes(yasak), `${yasak} gitmemeli`);
  }
});

test('SA-02: iki hesabın okuduğu alanlar olduğu gibi kalır', () => {
  const g = satinAlmaCalismasi(tam, kayit) as { D: Record<string, unknown>; plan: Record<string, unknown>; olaylar: unknown[]; emirDurumu: unknown; simdi: unknown };
  assert.deepEqual(g.D['siparisler'], [{ id: 'E-1', urun: 'U1', adet: 5, termin: '2026-10-30 16:00', malzeme: [{ kod: 'M1', miktar: 2 }] }]);
  assert.deepEqual(g.D['urunler'], [{ id: 'U1', rota: [{ k: '10', ad: 'Torna', bag: [] }, { k: '20', ad: 'Kaplama', fason: 'F1', bag: [['10', 'FS']] }] }]);
  assert.deepEqual(g.D['malzemeler'], [{ kod: 'M1', ad: 'Deneme cubuk', birim: 'kg', stok: 3, tedarikGun: 5, muayeneGun: 1, fire: 10, tedarikci: 'TD1' }]);
  assert.deepEqual(g.D['satinalma'], [{ kod: 'M1', miktar: 4, gelis: '2026-10-22 08:00', tedarikci: 'TD1', no: 'SA-0001' }]);
  assert.deepEqual(g.D['fasoncular'], [{ id: 'F1', ad: 'Deneme fasoncu', sureGun: 3, kapasite: 2 }]);
  assert.deepEqual(g.D['vardiyalar'], [{ id: 'V1', bas: '08:00', bit: '16:00', molalar: [{ bas: '12:00', bit: '12:30' }] }]);
  assert.deepEqual(g.D['fasonTermin'], { 'E-1.20': '2026-10-24 08:00' });
  assert.deepEqual(g.D['meta'], { baslangic: '2026-10-19' });
  assert.deepEqual(g.plan, {
    dataVer: 4,
    ops: { 'E-1.10': { id: 'E-1.10', job: 'E-1', S: 8, C: 10, done: 0 }, 'E-1.20': { id: 'E-1.20', job: 'E-1', S: 10, C: 40, done: 0, fas: 1, m: '@F1' } },
    J: { 'E-1': { C: 40, T: 0 } },
  });
  assert.deepEqual(g.olaylar, [{ tip: 'fason', f: 'F1', gun: 2 }]);
  assert.deepEqual(g.emirDurumu, { orders: [{ id: 'E-1', status: 'acik' }], opStatus: { 'E-1|root|1': 'tamam' } });
  assert.equal(g.simdi, 30);
});

test('SA-03: plansız çalışmada plan null; eksik alanlar boş gelir, uydurulmaz', () => {
  const g = satinAlmaCalismasi({ surum: 2, dataVer: 1, plan: null, D: {} }, null) as { D: Record<string, unknown>; plan: unknown };
  assert.equal(g.plan, null);
  assert.deepEqual(g.D['siparisler'], []);
  assert.equal(g.D['terminAyar'], undefined);
});
