import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { kalibrasyonHesapla, kalibreAralik, kalibreOrta, malzemeBasinaModel, negatifOlmayanEnKucukKareler, parcaCarpani } from './kurallar.ts';
import type { KalibrasyonCifti } from './kurallar.ts';

// Süre kalibrasyonu (3321-3): saf kural, elle hesaplanmış değerlerle.
const yakin = (x: number, beklenen: number, m = '', tol = 1e-3): void => assert.ok(Math.abs(x - beklenen) < tol, `${m} ${String(x)} != ${String(beklenen)}`);
let sayac = 0;
const cift = (tahminDk: number, olcumDk: number, g: { -readonly [K in keyof KalibrasyonCifti['gruplar']]?: string | null } = {}, ek: Partial<KalibrasyonCifti> = {}): KalibrasyonCifti => ({
  malzemeNo: ++sayac, tahminDk, olcumDk, disarida: false, gruplar: { malzeme: null, tezgah: null, islem: null, geometri: null, ...g },
  kabaDk: tahminDk / 2, finisDk: tahminDk / 2, delikDk: 0, ozellikSayisi: 0, ...ek,
});

describe('geometri: süre kalibrasyonu (3321-3)', () => {
  test('GEO-KA1 5 parçadan az kalibresiz; çarpan yok, kalibresiz hata yine ölçülür; dışarıda bırakılan sayılmaz', () => {
    const l = [cift(10, 12), cift(10, 13), cift(10, 14), cift(10, 15), cift(10, 99, {}, { disarida: true })];
    const s = kalibrasyonHesapla(l);
    assert.deepEqual([s.asama, s.n, s.disarida, s.carpan, s.aralik], ['kalibresiz', 4, 1, null, null]);
    yakin(s.kalibresizHataYuzde ?? 0, 35);
    assert.equal(kalibreOrta(s, l[0]!), null);
  });

  test('GEO-KA2 5 parçada tek çarpan ortanca orandan; aykırı ölçüm ortancayı bozmaz; 9 çiftten azsa aralık geniş', () => {
    const l = [cift(10, 12), cift(10, 13), cift(20, 26), cift(10, 13), cift(5, 50)];
    const s = kalibrasyonHesapla(l);
    assert.equal(s.asama, 'tek');
    yakin(s.carpan ?? 0, 1.3);
    assert.equal(s.gruplar.length, 0);
    assert.equal(s.aralik?.genis, true);
    yakin(s.aralik!.ustLn, Math.log(10 / 1.3));
    yakin(kalibreOrta(s, cift(4, 0))!, 5.2);
  });

  test('GEO-KA3 20 parçada grup çarpanları kısmi havuzlamayla; az veri grubu genele yakın; parça çarpanı genel x grup oranları', () => {
    const l = [
      ...Array.from({ length: 16 }, () => cift(10, 12, { malzeme: 'P', tezgah: 'ORN-CNC-01', islem: 'FRZ' })),
      ...Array.from({ length: 4 }, () => cift(10, 20, { malzeme: 'M', tezgah: 'ORN-CNC-01', islem: 'FRZ' })),
    ];
    const s = kalibrasyonHesapla(l);
    assert.equal(s.asama, 'grup');
    yakin(s.carpan ?? 0, 1.2);
    const genelOrt = (16 * Math.log(1.2) + 4 * Math.log(2)) / 20;
    const m = s.gruplar.find((g) => g.tur === 'malzeme' && g.anahtar === 'M')!;
    yakin(m.carpan, Math.exp((4 * Math.log(2) + 5 * genelOrt) / 9), 'M havuzlu');
    assert.equal(m.azVeri, true);
    assert.ok(m.carpan < 2 && m.carpan > 1.2, 'az veri genel çarpana çekilir');
    const p = s.gruplar.find((g) => g.tur === 'malzeme' && g.anahtar === 'P')!;
    assert.deepEqual([p.n, p.azVeri], [16, true]);
    const tezgah = s.gruplar.find((g) => g.tur === 'tezgah')!;
    assert.deepEqual([tezgah.n, tezgah.azVeri], [20, false]);
    // Parça çarpanı: log(genel) + her grubun log farkı.
    const beklenen = Math.exp(Math.log(s.carpan!) + (Math.log(m.carpan) - Math.log(s.carpan!)) + (Math.log(tezgah.carpan) - Math.log(s.carpan!)) * 2);
    yakin(parcaCarpani(s, { malzeme: 'M', tezgah: 'ORN-CNC-01', islem: 'FRZ', geometri: null }), beklenen);
    yakin(parcaCarpani(s, { malzeme: null, tezgah: null, islem: null, geometri: null }), s.carpan!, 'grubu bilinmeyen parça genel çarpanı alır');
    assert.equal(s.aralik?.genis, false);
  });

  test('GEO-KA4 40 parçada bileşen regresyonu, gruptan iyiyse kullanılır; kötüyse kullanılmaz', () => {
    // Ölçüm = 1 x kaba + 3 x finiş: tek çarpan bunu açıklayamaz, regresyon açıklar.
    const l = Array.from({ length: 40 }, (_, i) => {
      const kaba = 1 + (i % 7), finis = 1 + ((i * 3) % 5);
      return cift(kaba + finis, kaba + 3 * finis, {}, { kabaDk: kaba, finisDk: finis });
    });
    const s = kalibrasyonHesapla(l);
    assert.equal(s.asama, 'regresyon');
    assert.ok(s.regresyon);
    yakin(s.regresyon.kaba, 1, 'kaba', 1e-2);
    yakin(s.regresyon.finis, 3, 'finiş', 1e-2);
    assert.ok((s.hataYuzde ?? 100) < 1);
    const orantili = kalibrasyonHesapla(Array.from({ length: 40 }, (_, i) => cift(5 + i, (5 + i) * 1.25, {}, { kabaDk: 5 + i, finisDk: 0 })));
    assert.equal(orantili.asama, 'regresyon');
    assert.equal(orantili.regresyon, null, 'tek çarpan zaten tam açıklıyorsa regresyon kullanılmaz');
  });

  test('GEO-KA5 negatif olmayan en küçük kareler: negatif çıkacak katsayı sıfırda kalır', () => {
    const x = [[1, 1], [2, 1], [3, 1], [4, 1]];
    const b = negatifOlmayanEnKucukKareler(x, [1, 2, 3, 4]);
    yakin(b[0]!, 1, 'eğim', 1e-4);
    yakin(b[1]!, 0, 'sabit', 1e-4);
    const z = negatifOlmayanEnKucukKareler([[1], [2]], [-1, -2]);
    assert.deepEqual(z, [0]);
  });

  test('GEO-KA6 9 ve üstü çiftte aralık P10-P90: 11 çiftte ikinci küçük ve onuncu artık', () => {
    const r = [-0.5, -0.3, -0.2, -0.1, 0, 0, 0, 0.1, 0.2, 0.3, 0.6];
    const s = kalibrasyonHesapla(r.map((x) => cift(10, 10 * Math.exp(x))));
    assert.equal(s.asama, 'tek');
    yakin(s.carpan ?? 0, 1);
    assert.equal(s.aralik?.genis, false);
    // n 11: alt sıra floor(12 x 0,1) = 1 (en küçük), üst sıra ceil(12 x 0,9) = 11 (en büyük).
    yakin(s.aralik!.altLn, -0.5, 'alt');
    yakin(s.aralik!.ustLn, 0.6, 'üst');
    const n19 = [-0.9, -0.5, -0.4, -0.3, -0.2, -0.1, -0.05, 0, 0, 0, 0, 0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1];
    const s19 = kalibrasyonHesapla(n19.map((x) => cift(10, 10 * Math.exp(x))));
    // n 19: alt sıra floor(20 x 0,1) = 2 (ikinci küçük), üst sıra ceil(20 x 0,9) = 18 (ikinci büyük).
    yakin(s19.aralik!.altLn, -0.5, 'alt 19');
    yakin(s19.aralik!.ustLn, 0.5, 'üst 19');
  });

  test('GEO-KA7 süre kartının aralığı parçanın kendi çarpanıyla: grup aşamasında genelden farklı; bant düzeltilmiş ortanın etrafında', () => {
    const l = [...Array.from({ length: 12 }, () => cift(10, 20, { malzeme: 'P' })), ...Array.from({ length: 12 }, () => cift(10, 12, { malzeme: 'N' }))];
    const s = kalibrasyonHesapla(l);
    assert.equal(s.asama, 'grup');
    const p = kalibreAralik(s, { ...cift(5, 1, { malzeme: 'P' }) });
    assert.ok(p !== null);
    yakin(p.carpan, parcaCarpani(s, { malzeme: 'P', tezgah: null, islem: null, geometri: null }), 'parça çarpanı');
    assert.ok(Math.abs(p.carpan - (s.carpan ?? 0)) > 0.05, 'genel çarpandan farklı');
    yakin(p.ortaDk, 5 * p.carpan, 'orta', 1e-3);
    yakin(p.altDk, p.ortaDk * Math.exp(s.aralik!.altLn), 'alt', 1e-3);
    yakin(p.ustDk, p.ortaDk * Math.exp(s.aralik!.ustLn), 'üst', 1e-3);
    assert.equal(kalibreAralik(kalibrasyonHesapla(l.slice(0, 3)), cift(5, 1)), null, 'kalibresizde null');
  });

  test('GEO-KA8 malzeme başına model: kapak seçili olan, daha yeni revizyondan önce; kapak yoksa en büyük revizyon', () => {
    const m = (malzemeNo: number, revizyonId: number, kapak: boolean) => ({ malzemeNo, revizyonId, kapak });
    const s = malzemeBasinaModel([m(1, 10, true), m(1, 20, false), m(2, 5, false), m(2, 9, false), m(3, 30, false), m(3, 3, true)]);
    assert.deepEqual([...s.values()].map((x) => [x.malzemeNo, x.revizyonId]), [[1, 10], [2, 9], [3, 3]]);
  });
});
