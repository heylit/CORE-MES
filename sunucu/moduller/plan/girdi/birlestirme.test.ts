import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi } from '../plan-girdisi.ts';
import { tipliKaynakBirlestir, type KaynakBirlestir } from './birlestirme.ts';
import { girdiFarki, farkMetni } from './esdegerlik.ts';
import { kaynakDilimiKapsami, kaynakDilimiKur, type KaynakDilimiOkumasi, type KaynakElleVerisi } from './kaynaklar-kurallar.ts';

// 1720 kaynak: bayrak açıkken kaynak alanlarını tipli dilim kurar. Burada birleştirmenin kuralları (kapsam, 1744 a, tezgâh iskeleti) ve
// betik bağlamına bağlanması sınanır; eski yolla eşdeğerlik gerçek PostgreSQL'de kaynaklar-vt.test.ts KV-04..06. Veriler uydurmadır.

const OKUMA: KaynakDilimiOkumasi = {
  vardiyalar: [{ id: 1, bas: '08:00', bit: '16:00', molalar: [] }],
  tatiller: ['2026-10-29'],
  istasyon: { merkezler: [{ id: 5 }], istasyonlar: [{ id: 10, merkezId: 5, verimYuzde: 90, operatorOrani: 1 }], makineler: [{ id: 100, ad: 'Torna 1', istasyonId: 10 }] },
  takvim: { hafta: [{ merkezId: 5, gun: 1, vardiyaId: 1 }], kisiVardiyasi: [] },
  istasyonMaliyeti: new Map([[10, 900]]),
  kisiler: [{ id: 7, ad: 'Ornek Operator', gorev: null, yetkinlikler: [10], makineler: [], enCok: null }],
  izinler: [{ kisiId: '7', gunler: ['2026-10-21'] }],
};

// Eski birleştirmenin yerine: verilen değerleri yazar, çağrıldığı andaki çalışmayı saklar.
function sahteEski(yaz: Record<string, unknown>): { fn: KaynakBirlestir; gordugu: () => unknown } {
  let gordugu: unknown = null;
  return {
    fn: (D0) => { gordugu = structuredClone(D0); Object.assign(D0, structuredClone(yaz)); return Object.keys(yaz); },
    gordugu: () => gordugu,
  };
}
const ESKI_TEZGAH = [{ id: '100', ad: 'Eski', grup: '10', ucret: 950, ucretIst: 900, verim: 0.8, vardiyalar: ['1'], opOran: 1 }];

describe('tipli kaynak birleştirmesi (1720 kaynak)', () => {
  test('BR-01: okunan dilimin alanlarını tipli kurulum belirler; elle veri birleşmeden önceki çalışmadır', () => {
    const D0: Record<string, unknown> = { tezgahlar: ESKI_TEZGAH, personel: [], devamsizlik: [{ personel: '7', gun: '2026-10-20' }], urunler: ['dokunulmaz'] };
    const elle = structuredClone({ tezgahlar: D0['tezgahlar'], personel: D0['personel'], devamsizlik: D0['devamsizlik'] }) as KaynakElleVerisi;
    const eski = sahteEski({ tatiller: ['2026-01-01'], tezgahlar: [{ id: '100', grup: '10', ad: 'Bozuk' }], urunler: ['eski yol'] });
    const alanlar = tipliKaynakBirlestir(eski.fn, OKUMA)(D0, null, null, '2026-10-19');
    const yeni = kaynakDilimiKur(OKUMA, elle);
    assert.equal(farkMetni(girdiFarki(D0['tezgahlar'], yeni.tezgahlar)), '');
    assert.deepEqual([D0['tatiller'], D0['vardiyalar'], D0['devamsizlik'], D0['urunler']], [yeni.tatiller, yeni.vardiyalar, yeni.devamsizlik, ['eski yol']]);
    assert.deepEqual((D0['tezgahlar'] as { ucret: unknown }[])[0]?.ucret, 950, 'elle ücret eski birleştirmenin yazdığından değil açık çalışmadan');
    assert.ok(alanlar.includes('urunler') && alanlar.includes('personel'));
  });

  test('BR-02 (1744 a): istasyon okunamazsa tezgâh ve çalışma günü eski yolunki kalır; kişi okunamazsa personel', () => {
    assert.deepEqual(kaynakDilimiKapsami({ ...OKUMA, istasyon: null, kisiler: null }), ['vardiyalar', 'tatiller', 'devamsizlik']);
    const yaz = { tezgahlar: ESKI_TEZGAH, calismaGunleri: { pzt: ['9'] }, personel: [{ id: '3', ad: 'Kayittan' }] };
    const D0: Record<string, unknown> = {};
    tipliKaynakBirlestir(sahteEski(yaz).fn, { ...OKUMA, istasyon: null, kisiler: null })(D0, null, null, '2026-10-19');
    assert.deepEqual([D0['tezgahlar'], D0['calismaGunleri'], D0['personel']], [yaz.tezgahlar, yaz.calismaGunleri, yaz.personel]);
  });

  test('BR-03: tipli tezgâh listesi kimlik ya da istasyon olarak ayrılırsa eski yolunki kalır (ürünlerin adımları ona göre kurulu)', () => {
    const baska = [{ id: '100', grup: '11', ad: 'Torna 1' }];
    const D0: Record<string, unknown> = {};
    tipliKaynakBirlestir(sahteEski({ tezgahlar: baska }).fn, OKUMA)(D0, null, null, '2026-10-19');
    assert.deepEqual(D0['tezgahlar'], baska);
  });

  test('BR-04: planGirdisi tipli dilimi betiğin bağlamına bağlar; dilim verilmezse eski yol aynen koşar', () => {
    const calisma = {
      surum: 2, rrSavedAt: 9, dataVer: 1, kisitSurum: 2, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
      w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
      D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], siparisler: [], tezgahlar: [], personel: [] },
    };
    const kayit = { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] };
    const kaynak = { durum: { cal: { shifts: [], holidays: ['2026-12-31'] }, wcs: null, stations: null, machines: null, people: null, maliyet: null }, ek: {} };
    const istek = { calisma, kayit, kaynak, bugun: '2026-10-19' };
    const eskiD = planGirdisi(istek)?.S['D'] as Record<string, unknown>;
    const yeniD = planGirdisi({ ...istek, kaynakDilimi: OKUMA })?.S['D'] as Record<string, unknown>;
    assert.deepEqual(eskiD['tatiller'], ['2026-12-31']);
    assert.deepEqual(yeniD['tatiller'], ['2026-10-29']);
    assert.deepEqual(yeniD['tezgahlar'], eskiD['tezgahlar'], 'iskeleti eskisinden ayrılan tezgâh listesi eski yolun (BR-03)');
  });
});
