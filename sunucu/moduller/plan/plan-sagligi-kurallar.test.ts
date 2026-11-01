import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { haftaSiniri, ortanca, planSagligi, type OlculenAdim, type Olcum, type PlanSagligiGirdisi } from './plan-sagligi-kurallar.ts';

// 1478: plan sağlığının saf hesabı. Veriler uydurmadır.

const SIMDI = Date.parse('2026-11-01T09:00:00Z');
const GUN = 86_400_000;
const once = (gun: number, saat = 0) => new Date(SIMDI - gun * GUN + saat * 3_600_000).toISOString();
const adim = (p: Partial<OlculenAdim>): OlculenAdim => ({
  isEmriId: 1, emirNo: 'E-1', opNo: 10, istasyonId: 1, istasyonAdi: 'İstasyon 1', bitis: once(1),
  tezgahUyumu: true, siraUyumu: true, kaymaDk: 0, sureOrani: 1, ...p,
});
const olcum = (gun: number, toplamIs: number, degisenIs: number, p: Partial<Olcum> = {}): Olcum => ({
  zaman: once(gun), toplamIs, degisenIs, yakinDegisenIs: 0, yerlesmeyenIs: 0, vardiyasizIs: 0, gelirsizEmir: 0, ...p,
});
const bos = (p: Partial<PlanSagligiGirdisi> = {}): PlanSagligiGirdisi => ({
  simdi: SIMDI, emirler: [], adimlar: [], olcumler: [], tahminler: [], emirNolari: new Map(), veri: { eksikKonu: 0, okunamayanKonu: 0 }, ...p,
});

describe('plan sağlığı kuralları', () => {
  test('veri yoksa ölçüler boş kalır, sıfır uydurulmaz', () => {
    const r = planSagligi(bos());
    assert.equal(r.termin.yuzde, null);
    assert.equal(r.soz.ortancaKaymaSaat, null);
    assert.equal(r.tutarlilik.yuzde, null);
    assert.equal(r.tutarlilik.yakinDegisen, null);
    assert.equal(r.uyum.yuzde, null);
    assert.equal(r.veri.sonOlcum, null);
    assert.equal(r.veri.yerlesmeyenIs, null);
    assert.deepEqual(r.termin.egilim, Array(8).fill(null));
    assert.equal(r.haftalar.length, 8);
    assert.deepEqual(r.kayanEmirler, []);
  });

  test('haftalar şimdiden geriye yedişer gün; pencere dışı ve gelecek hafta dışı', () => {
    const { hafta, haftalar } = haftaSiniri(SIMDI);
    assert.equal(hafta(SIMDI - 1), 7);
    assert.equal(hafta(SIMDI - 7 * GUN - 1), 6);
    assert.equal(hafta(SIMDI - 56 * GUN), 0);
    assert.equal(hafta(SIMDI - 56 * GUN - 1), null);
    assert.equal(hafta(SIMDI), null);
    assert.equal(haftalar.at(-1)!.bitis, '2026-11-01');
    assert.equal(ortanca([3, 1, 2, 10]), 2.5);
  });

  test('termin: günün sonuna kadar biten zamanında, terminsiz sayılmaz; geç kalanın ortanca gecikmesi gün', () => {
    const r = planSagligi(bos({ emirler: [
      { uretimEmriId: 1, emirNo: 'E-1', bitis: '2026-10-30T20:30:00Z', termin: '2026-10-30' }, // tesiste 23:30, aynı gün
      { uretimEmriId: 2, emirNo: 'E-2', bitis: '2026-10-30T21:30:00Z', termin: '2026-10-30' }, // tesiste ertesi gün 00:30
      { uretimEmriId: 3, emirNo: 'E-3', bitis: '2026-10-29T08:00:00Z', termin: '2026-10-26' },
      { uretimEmriId: 4, emirNo: 'E-4', bitis: '2026-10-29T08:00:00Z', termin: null },
      { uretimEmriId: 5, emirNo: 'E-5', bitis: once(80), termin: '2026-01-01' },
    ] }));
    assert.equal(r.termin.emir, 3);
    assert.equal(r.termin.gecKalan, 2);
    assert.equal(r.termin.yuzde, 33.3);
    assert.equal(r.termin.ortancaGecikmeGun, 2);
    assert.equal(r.termin.egilim[7], 33.3);
  });

  test('plan uyumu: tezgâh, sıra ve 8 saat; ölçüsüz adım sayılmaz, boş ölçü bozulmuş sayılmaz', () => {
    const r = planSagligi(bos({ adimlar: [
      adim({}),
      adim({ tezgahUyumu: false }),
      adim({ siraUyumu: false, kaymaDk: 481 }),
      adim({ kaymaDk: -480, tezgahUyumu: null, siraUyumu: null }),
      adim({ tezgahUyumu: null, siraUyumu: null, kaymaDk: null }),
      adim({ bitis: once(60) }),
    ] }));
    assert.equal(r.uyum.olculenAdim, 4);
    assert.equal(r.uyum.yuzde, 50);
    assert.deepEqual([r.uyum.tezgahDisi, r.uyum.siraDisi, r.uyum.kaymaDisi], [1, 1, 1]);
  });

  test('plan tutarlılığı son 7 günün canlıya almalarından; eğilim haftalık', () => {
    const r = planSagligi(bos({ olcumler: [olcum(1, 100, 10, { yakinDegisenIs: 3 }), olcum(3, 100, 30, { yakinDegisenIs: 2, yerlesmeyenIs: 9 }), olcum(10, 50, 50)] }));
    assert.equal(r.tutarlilik.yuzde, 20);
    assert.equal(r.tutarlilik.yakinDegisen, 5);
    assert.equal(r.tutarlilik.canliyaAlma, 2);
    assert.equal(r.tutarlilik.egilim[6], 100);
    assert.equal(r.veri.sonOlcum, once(1));
    assert.equal(r.veri.yerlesmeyenIs, 0, 'son ölçümün sayısı');
  });

  test('söz tutarlılığı: ilk dolu tahminden son dolu tahmine kayma, bir saatten az oynama değişim değil', () => {
    const t = (olcumId: number, gun: number, uretimEmriId: number, tahminiBitis: string | null) =>
      ({ olcumId, zaman: once(gun), uretimEmriId, tahminiBitis, termin: '2026-11-10' });
    const r = planSagligi(bos({
      emirNolari: new Map([[7, 'E-7']]),
      tahminler: [
        t(1, 5, 7, '2026-11-05T10:00:00Z'), t(1, 5, 8, '2026-11-05T10:00:00Z'), t(1, 5, 9, '2026-11-05T10:00:00Z'),
        t(2, 3, 7, null), t(2, 3, 8, '2026-11-05T10:30:00Z'), t(2, 3, 9, '2026-11-04T10:00:00Z'),
        t(3, 1, 7, '2026-11-06T22:00:00Z'), t(3, 1, 8, '2026-11-05T10:20:00Z'),
      ],
    }));
    assert.equal(r.soz.izlenenEmir, 3);
    assert.equal(r.soz.kayanEmir, 2);
    assert.equal(r.soz.ortancaKaymaSaat, 0.3);
    assert.deepEqual(r.kayanEmirler.map((k) => [k.emirNo, k.kaymaSaat, k.degisim]), [['E-7', 36, 2], ['#9', -24, 1]]);
    assert.equal(r.kayanEmirler[0]!.gecmis.length, 3);
    assert.equal(r.soz.egilim[7], 0.5, 'son haftada dolu çiftlerin mutlak farklarının ortancası (0,5; 0,17; 24)');
  });

  test('süre doğruluğu: istasyon başına ortanca oran, en az üç örnek, bire en uzak önce', () => {
    const r = planSagligi(bos({ adimlar: [
      ...[1.1, 1.2, 1.0].map((o, i) => adim({ isEmriId: i, sureOrani: o })),
      ...[2, 1.8, 3.5, 2.2].map((o, i) => adim({ isEmriId: 10 + i, istasyonId: 2, istasyonAdi: 'İstasyon 2', emirNo: `E-${String(i)}`, sureOrani: o })),
      ...[0.4, 0.5].map((o) => adim({ istasyonId: 3, sureOrani: o })),
      adim({ istasyonId: 1, sureOrani: null }),
    ] }));
    assert.deepEqual(r.sapanSureler.map((s) => [s.istasyonAdi, s.ornek, s.ortancaOran]), [['İstasyon 2', 4, 2.1], ['İstasyon 1', 3, 1.1]]);
    assert.deepEqual(r.sapanSureler[0]!.enCok, { emirNo: 'E-2', opNo: 10, oran: 3.5 });
  });
});
