import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { AlanGovdesi } from '#paylasilan/sozlesme/markalama.ts';
import {
  alanHatasi, baslangicHatasi, durumGecisi, hurdaNedeniHatasi, isoHafta, kapsamAnahtari, normalHatasi, olcuHatasi, sablonHatasi, seriAlaniVarMi, seriNoUret, seriUzunlukHatasi,
} from './kurallar.ts';

const alan = (a: Partial<AlanGovdesi> = {}): AlanGovdesi => ({
  ad: 'Seri', icerik: 'seri', sabitMetin: null, kodTuru: 'yok', yontem: 'lazer', yaziYuksekligiMm: null, yaziDerinligiMm: null, yaziTipi: null, program: null, yuzey: null, yer: null, ...a,
});

describe('markalama kuralları', () => {
  test('MRK-01: geçerli şablon kabul edilir; parça kodu, tek sıra ve kapsam parçası zorunlu', () => {
    assert.equal(sablonHatasi('{PARCA}-{YY}{WW}-{SEQ:5}', 'malzeme'), null);
    assert.equal(sablonHatasi('{PARCA}-{EMIR}-{SEQ}', 'emir'), null);
    assert.equal(sablonHatasi('{PARCA}/{YYYY}.{SEQ:3}', 'yil'), null);
    assert.match(sablonHatasi('{YY}-{SEQ:5}', 'malzeme') ?? '', /\{PARCA\}/);
    assert.match(sablonHatasi('{PARCA}', 'malzeme') ?? '', /tam bir kez/);
    assert.match(sablonHatasi('{PARCA}-{SEQ}-{SEQ}', 'malzeme') ?? '', /tam bir kez/);
    assert.match(sablonHatasi('{PARCA}-{SEQ}', 'emir') ?? '', /\{EMIR\}/);
    assert.match(sablonHatasi('{PARCA}-{SEQ}', 'yil') ?? '', /\{YY\}/);
    assert.match(sablonHatasi('{PARCA}-{FIRMA}-{SEQ}', 'malzeme') ?? '', /bilinmeyen/);
    assert.match(sablonHatasi('{PARCA:2}-{SEQ}', 'malzeme') ?? '', /bilinmeyen/);
    assert.match(sablonHatasi('{PARCA} {SEQ}', 'malzeme') ?? '', /yalnız harf/);
  });

  test('MRK-02: sabit markanın metni olur, seri markanın olmaz; seri alanı yoksa birim izlenmez', () => {
    assert.equal(alanHatasi([alan(), alan({ icerik: 'sabit', sabitMetin: 'C' })]), null);
    assert.match(alanHatasi([alan({ icerik: 'sabit' })]) ?? '', /sabit metni boş/);
    assert.match(alanHatasi([alan({ sabitMetin: 'C' })]) ?? '', /sabit metin yazılmaz/);
    assert.equal(seriAlaniVarMi([alan({ icerik: 'sabit', sabitMetin: 'C' })]), false);
    assert.equal(seriAlaniVarMi([alan({ icerik: 'sabit', sabitMetin: 'C' }), alan()]), true);
  });

  test('MRK-03: seri no şablondan üretilir; sıra genişliğe doldurulur, taşarsa kısalmaz', () => {
    const b = { parca: 'ORN-A', emir: 'UE-7', gun: '2026-10-27' };
    assert.equal(seriNoUret('{PARCA}-{YY}{WW}-{SEQ:5}', b, 128), 'ORN-A-2644-00128');
    assert.equal(seriNoUret('{PARCA}.{EMIR}.{YYYY}{MM}{DD}.{SEQ}', b, 7), 'ORN-A.UE-7.20261027.0007');
    assert.equal(seriNoUret('{PARCA}-{SEQ:2}', b, 123), 'ORN-A-123');
    assert.equal(isoHafta('2026-01-01'), 1);
    assert.equal(isoHafta('2027-01-01'), 53);
    assert.equal(kapsamAnahtari('malzeme', 5, '2026-10-27'), '');
    assert.equal(kapsamAnahtari('emir', 5, '2026-10-27'), 'E5');
    assert.equal(kapsamAnahtari('yil', 5, '2026-10-27'), 'Y2026');
  });

  test('MRK-04: durum geçişi; rework yalnız red birime, hurda son durumdur', () => {
    assert.equal(durumGecisi('saglam', 'red'), 'red');
    assert.equal(durumGecisi('red', 'rework'), 'rework');
    assert.equal(durumGecisi('rework', 'kabul'), 'saglam');
    assert.equal(durumGecisi('red', 'kabul'), 'saglam');
    assert.equal(durumGecisi('rework', 'hurda'), 'hurda');
    assert.equal(durumGecisi('saglam', 'rework'), null);
    assert.equal(durumGecisi('saglam', 'kabul'), null);
    for (const k of ['red', 'rework', 'kabul', 'hurda'] as const) assert.equal(durumGecisi('hurda', k), null);
  });

  test('MRK-05: hurda nedeni yalnız hurdada ve orada zorunlu', () => {
    assert.equal(hurdaNedeniHatasi('hurda', 3), null);
    assert.equal(hurdaNedeniHatasi('red', null), null);
    assert.match(hurdaNedeniHatasi('hurda', null) ?? '', /neden/);
    assert.match(hurdaNedeniHatasi('red', 3) ?? '', /yalnız hurda/);
  });

  test('MRK-12: işaretlenen yerin yüzey yönü sıfır olamaz; yeri olmayan marka denetlenmez', () => {
    const yer = (normal: [number, number, number]) => ({ merkez: [0, 0, 0] as [number, number, number], normal, enMm: 5, boyMm: 2, aciDerece: 0 });
    assert.equal(normalHatasi([alan(), alan({ yer: yer([0, 0, 1]) })]), null);
    assert.deepEqual(normalHatasi([alan(), alan({ yer: yer([0, 0, 0]) })])?.alan, 'alanlar.1.yer.normal');
  });

  test('MRK-10: sıfıra yuvarlanan ölçü ve sınır dışı yer markanın sırasıyla reddedilir', () => {
    const yer = { merkez: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], enMm: 5, boyMm: 2, aciDerece: 0 };
    assert.equal(olcuHatasi([alan({ yaziYuksekligiMm: 0.01, yaziDerinligiMm: 0.001, yer })]), null);
    assert.equal(olcuHatasi([alan(), alan({ yaziYuksekligiMm: 0.004 })])?.alan, 'alanlar.1.yaziYuksekligiMm');
    assert.equal(olcuHatasi([alan({ yaziDerinligiMm: 0.0004 })])?.alan, 'alanlar.0.yaziDerinligiMm');
    assert.equal(olcuHatasi([alan({ yer: { ...yer, merkez: [0, -1e7, 0] } })])?.alan, 'alanlar.0.yer.merkez');
    assert.equal(olcuHatasi([alan({ yer: { ...yer, enMm: 0.001 } })])?.alan, 'alanlar.0.yer.enMm');
    assert.equal(olcuHatasi([alan({ yer: { ...yer, aciDerece: 359.999 } })])?.alan, 'alanlar.0.yer.aciDerece');
  });

  test('MRK-11: seri no en çok 80 karakter', () => {
    assert.equal(seriUzunlukHatasi('A'.repeat(80)), null);
    assert.match(seriUzunlukHatasi('A'.repeat(81)) ?? '', /81 karakter/);
  });

  test('MRK-09: başlangıç sırası sayacın ilerisine alınabilir', () => {
    assert.equal(baslangicHatasi(5, null), null);
    assert.equal(baslangicHatasi(13, 12), null);
    assert.match(baslangicHatasi(12, 12) ?? '', /en az 13/);
  });
});
