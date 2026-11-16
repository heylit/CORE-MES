import assert from 'node:assert/strict';
import { test } from 'node:test';
import { durumEmirlerSemasi } from '#paylasilan/sozlesme/recete-rota.ts';
import { emirleriCevir, fasonSiparisiSorulacaklar, fasonSiparisleriniYaz, type EmirKaydi } from './kurallar.ts';

// 3330 a: bitmemiş fason adımın açık siparişindeki firma tarihi plan motoruna opYer.fasonSiparis ile gider. Veriler uydurmadır.
const adim = (sira: number, ek: Partial<EmirKaydi['isEmirleri'][number]> = {}): EmirKaydi['isEmirleri'][number] => ({
  id: 100 + sira, sira, opNo: sira * 10, durum: 'bekliyor', saglamAdet: null, canliAdet: null, ad: `OP ${String(sira)}`, operasyonTipiId: 3,
  istasyonId: 10, ayarSuresiDk: '0', birimSureDk: '1', ...ek,
});
const emir = (isEmirleri: EmirKaydi['isEmirleri'], ek: Partial<EmirKaydi> = {}): EmirKaydi => ({
  id: 1, emirNo: 'E-1', malzemeNo: 50, adet: 4, baslangic: null, teslim: null, oncelik: 1, aciklama: null, kaynakRotaRevizyonId: 7,
  durum: 'planli', emirTuru: 'normal', acilma: '2026-10-19T05:00:00.000Z', bitis: null, ustEmirId: null, bolunmeSira: null,
  birlestigiEmirId: null, birlesmeOpNo: null, surum: 1, isEmirleri, ...ek,
});
const FASON = { kaynak: { tur: 'fason', id: 9 }, terminGun: 2, istasyonId: null };
const EMIRLER = [
  emir([adim(1), adim(2, FASON), adim(3, { ...FASON, durum: 'tamam' }), adim(4, FASON)]),
  emir([adim(5, FASON)], { id: 2, emirNo: 'E-2', kaynakRotaRevizyonId: null }),
];
const TARIHLER = new Map([[102, { tarih: '2026-10-23', siparisNo: 'ORN-SP-1' }], [103, { tarih: '2026-10-24', siparisNo: 'ORN-SP-2' }], [101, { tarih: '2026-10-25', siparisNo: 'ORN-SP-3' }]]);

test('yalnız rotalı emrin bitmemiş fason adımları sorulur; fason adım yoksa soru yok', () => {
  assert.deepEqual(fasonSiparisiSorulacaklar(EMIRLER), [102, 104]);
  assert.deepEqual(fasonSiparisiSorulacaklar([emir([adim(1), adim(2)])]), []);
});

test('firma tarihi adıma yazılır ve opYer ile gider; siparişi olmayan, biten ve iç adımda alan yok; sözleşmeden geçer', () => {
  const d = emirleriCevir(fasonSiparisleriniYaz(EMIRLER, TARIHLER, true));
  assert.deepEqual(d.opYer?.['1|root|2']?.fasonSiparis, { tarih: '2026-10-23', siparisNo: 'ORN-SP-1' });
  assert.equal(d.opYer?.['1|root|1']?.fasonSiparis, undefined, 'iç adım, haritada kimliği olsa da');
  assert.equal(d.opYer?.['1|root|3'], undefined, 'biten adım');
  assert.equal(d.opYer?.['1|root|4']?.fasonSiparis, undefined, 'siparişi olmayan fason adım');
  assert.deepEqual(d.opYer?.['1|root|4'], { fasonId: '9', terminGun: 2, stationId: null, setup: 0, cycle: 1 });
  assert.doesNotThrow(() => durumEmirlerSemasi.parse(d));
});

test('Satın Alma\'yı göremeyene tarih gider, sipariş numarası gitmez', () => {
  const d = emirleriCevir(fasonSiparisleriniYaz(EMIRLER, TARIHLER, false));
  assert.deepEqual(d.opYer?.['1|root|2']?.fasonSiparis, { tarih: '2026-10-23', siparisNo: null });
});

test('sipariş tarihi yoksa emirler aynen döner', () => {
  assert.equal(fasonSiparisleriniYaz(EMIRLER, new Map(), true), EMIRLER);
});
