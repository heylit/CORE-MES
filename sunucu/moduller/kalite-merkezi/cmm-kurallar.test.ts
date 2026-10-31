import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  balonNoBul, baslikVarMi, bicimSez, csvOku, csvSatirlari, eslemeOner, ondalikNormal, planSatiri, qifSatirlari, satirlariDegerlendir, xmlOku,
  yazilacakSatirlar,
} from './cmm-kurallar.ts';
import type { CmmHamSatir, XmlDugum } from './cmm-kurallar.ts';

// Örnek dosyalar sentetiktir; gerçek CMM çıktısı depoya girmez.

test('KM-C1 sayı okuma: ondalık virgül ve nokta, üs, birim; altı ondalığa yarım yukarı; sayı olmayan null', () => {
  assert.deepEqual(['10,0125', '10.0125', ' -0,5 ', '+3', '1.2E-03', '12.5mm', '45°', '0012.300', '-0.0000001', '9.9999995', '.5'].map(ondalikNormal),
    ['10.0125', '10.0125', '-0.5', '3', '0.0012', '12.5', '45', '12.3', '0', '10', '0.5']);
  assert.deepEqual(['', 'abc', '1.2.3', '1,2,3', '=1+1', '1234567890', '-', 'NaN'].map(ondalikNormal), [null, null, null, null, null, null, null, null]);
});

test('KM-C2 CSV: noktalı virgül ve ondalık virgül, tırnaklı alan, başlık ve eşleme önerisi', () => {
  const metin = '﻿Balon;Nominal;Ölçülen;Not\r\n1;10,000;10,012;"a;b"\r\n2;5,5;5,49;\r\n';
  const csv = csvOku(metin);
  assert.ok(!('ret' in csv));
  assert.equal(csv.ayirici, ';');
  assert.deepEqual(csv.satirlar[1], ['1', '10,000', '10,012', 'a;b']);
  assert.equal(baslikVarMi(csv.satirlar), true);
  const esleme = eslemeOner(csv.satirlar[0]!);
  assert.deepEqual(esleme, { karakteristik: 0, olculen: 2, nominal: 1 });
  assert.deepEqual(csvSatirlari(csv.satirlar, esleme!, true), [
    { satir: 2, karakteristik: '1', olculen: '10.012', nominal: '10' },
    { satir: 3, karakteristik: '2', olculen: '5.49', nominal: '5.5' },
  ]);
  const virgul = csvOku('Feature,Measured\nB1,1.5\nB2,2.5\n');
  assert.ok(!('ret' in virgul) && virgul.ayirici === ',');
  const sekme = csvOku('a\tb\n1\t2\n');
  assert.ok(!('ret' in sekme) && sekme.ayirici === '\t');
  assert.deepEqual(csvOku('\n\n'), { ret: 'bosDosya' });
  assert.deepEqual(csvOku(`a;b\n${'1;2\n'.repeat(5001)}`), { ret: 'cokSatir' });
  assert.deepEqual(csvSatirlari([['1', '2']], { karakteristik: 0, olculen: 5, nominal: null }, false), { ret: 'sutunYok' });
  assert.equal(eslemeOner(['x', 'y']), null);
  assert.equal(bicimSez('  <?xml version="1.0"?><a/>'), 'qif');
  assert.equal(bicimSez('a;b'), 'csv');
});

test('KM-C3 balon numarası: sayı, önekli ad, baştaki numara; sondaki sayı ve çok aday eşleşmez', () => {
  assert.deepEqual(['12', 'B12', '#7', 'Balon 3', 'No.4', 'b_9 çap', '5 - Çap', '(B2)', 'CIRCLE_3', 'PLN1', 'B1-B2', 'B12345', ''].map(balonNoBul),
    [12, 12, 7, 3, 4, 9, 5, 2, null, null, 'belirsiz', null, null]);
});

const balonlar = [
  { id: 101, no: 1, nominal: 'Ø10', alt: '9.95', ust: '10.05' },
  { id: 102, no: 2, nominal: 'Mastar', alt: null, ust: null },
  { id: 103, no: 3, nominal: '25 ±0,1', alt: '24.9', ust: '25.1' },
  { id: 104, no: 4, nominal: '8', alt: '7.9', ust: '8.1' },
];
const h = (satir: number, karakteristik: string, olculen: string | null, nominal: string | null = null): CmmHamSatir => ({ satir, karakteristik, olculen, nominal });

test('KM-C4 satır kararları: eşleşen, nominal farkı, eşleşmeyen, belirsiz, yinelenen, değersiz, nitel balon; uygunluk sınırdan', () => {
  const s = satirlariDegerlendir([
    h(1, 'B1', '10.05', '10'), h(2, 'B2', '1'), h(3, 'B3', '25.2', '26'), h(4, 'B9', '1'), h(5, 'B1-B3', '1'), h(6, '4', '8'), h(7, '4', '8.01'),
    h(8, 'B3', null),
  ], balonlar);
  assert.deepEqual(s.map((x) => [x.satir, x.durum, x.balonId, x.uygun]), [
    [1, 'eslesti', 101, true], [2, 'nitelBalon', 102, null], [3, 'nominalFarki', 103, false], [4, 'eslesmedi', null, null], [5, 'belirsiz', null, null],
    [6, 'yinelenen', 104, true], [7, 'yinelenen', 104, true], [8, 'degerYok', 103, null],
  ]);
  assert.equal(s[0]!.balonNominali, 'Ø10');
  // Yazılacaklar: eşleşenler ve onaylanan nominal farkı; onay nominal farkı olmayan satıra verilemez.
  assert.deepEqual((yazilacakSatirlar(s, []) as { satir: number }[]).map((x) => x.satir), [1]);
  assert.deepEqual((yazilacakSatirlar(s, [3]) as { satir: number }[]).map((x) => x.satir), [1, 3]);
  assert.deepEqual(yazilacakSatirlar(s, [1]), { ret: 'onayDisi' });
  assert.deepEqual(yazilacakSatirlar(s.filter((x) => x.durum !== 'eslesti'), []), { ret: 'yazilacakYok' });
  const cok = satirlariDegerlendir(Array.from({ length: 501 }, (_, i) => h(i + 1, String(i + 1), '1')),
    Array.from({ length: 501 }, (_, i) => ({ id: i + 1, no: i + 1, nominal: '1', alt: '0', ust: '2' })));
  assert.deepEqual(yazilacakSatirlar(cok, []), { ret: 'cokOlcum' });
});

const QIF = `<?xml version="1.0" encoding="UTF-8"?>
<QIFDocument xmlns="urn:deneme" xmlns:t="urn:deneme">
  <!-- sentetik -->
  <Characteristics>
    <CharacteristicNominals n="1"><DiameterCharacteristicNominal id="10"><TargetValue>10.000</TargetValue></DiameterCharacteristicNominal></CharacteristicNominals>
    <CharacteristicItems n="2">
      <DiameterCharacteristicItem id="20"><Name>Delik &amp; çap</Name><CharacteristicDesignator><Designator>1</Designator></CharacteristicDesignator><CharacteristicNominalId>10</CharacteristicNominalId></DiameterCharacteristicItem>
      <t:LengthCharacteristicItem id='21'><Name>B3</Name></t:LengthCharacteristicItem>
    </CharacteristicItems>
  </Characteristics>
  <Results><MeasurementResultsSet><MeasurementResults id="30"><MeasuredCharacteristics><CharacteristicMeasurements n="3">
    <DiameterCharacteristicMeasurement id="40"><Status><CharacteristicStatusEnum>PASS</CharacteristicStatusEnum></Status><Value>10.0123</Value><CharacteristicItemId>20</CharacteristicItemId></DiameterCharacteristicMeasurement>
    <LengthCharacteristicMeasurement id="41"><Value>25.05</Value><CharacteristicItemId>21</CharacteristicItemId></LengthCharacteristicMeasurement>
    <LengthCharacteristicMeasurement id="42"><Value><![CDATA[1.5]]></Value><CharacteristicItemId>99</CharacteristicItemId></LengthCharacteristicMeasurement>
  </CharacteristicMeasurements></MeasuredCharacteristics></MeasurementResults></MeasurementResultsSet></Results>
</QIFDocument>`;

test('KM-C5 QIF 3.0 Results: ölçüm öğeye, öğe tasarımcı numarasına ve nominale bağlanır; ad önekli de olur', () => {
  const kok = xmlOku(QIF);
  assert.ok(!('ret' in kok));
  assert.equal((kok as XmlDugum).ad, 'QIFDocument');
  assert.deepEqual(qifSatirlari(kok as XmlDugum), [
    { satir: 1, karakteristik: '1', olculen: '10.0123', nominal: '10' },
    { satir: 2, karakteristik: 'B3', olculen: '25.05', nominal: null },
    { satir: 3, karakteristik: '#99', olculen: '1.5', nominal: null },
  ]);
  assert.deepEqual(qifSatirlari(xmlOku('<QIFDocument><Characteristics/></QIFDocument>') as XmlDugum), { ret: 'qifSonucYok' });
});

test('KM-C6 XML güvenliği: belge tanımı ve bilinmeyen varlık reddedilir; bozuk ve aşırı derin belge okunmaz', () => {
  assert.deepEqual(xmlOku('<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>'), { ret: 'xmlTanim' });
  assert.deepEqual(xmlOku('<a>&x;</a>'), { ret: 'xmlBozuk' });
  assert.deepEqual(xmlOku('<a><b></a>'), { ret: 'xmlBozuk' });
  assert.deepEqual(xmlOku('<a></a><b></b>'), { ret: 'xmlBozuk' });
  assert.deepEqual(xmlOku('<a'), { ret: 'xmlBozuk' });
  assert.deepEqual(xmlOku(`${'<a>'.repeat(70)}${'</a>'.repeat(70)}`), { ret: 'xmlBuyuk' });
  assert.deepEqual(xmlOku('<a><b/><b/><b/></a>', { dugum: 2, derinlik: 64 }), { ret: 'xmlBuyuk' });
});

test('KM-C7 ölçüm planı satırı: özellik simgeden ve türden, dar toleransta nokta iki katı; diş mastarla', () => {
  const b = (nominal: string, alt: string | null, ust: string | null, tur: string | null = null) =>
    planSatiri({ no: 1, tur, nominal, tolerans: null, alt, ust, kritik: false });
  assert.deepEqual([b('Ø10', '9.95', '10.05'), b('Ø10', '9.99', '10.01'), b('R2', '1.9', '2.1'), b('M8', null, null), b('25', '24.9', '25.1'), b('0,02', '0', '0.02', 'Düzlemsellik')]
    .map((x) => [x.ozellik, x.enAzNokta, x.not]), [
    ['Silindir / delik', 8, null],
    ['Silindir / delik', 16, 'Dar tolerans: nokta sayısı iki katı.'],
    ['Yay', 5, null],
    ['Diş', null, 'CMM ile değil, mastarla ölçülür. Sınırsız ölçü: geçer/geçmez.'],
    ['Uzunluk / mesafe (iki özellik arası)', 6, null],
    ['Düzlem', 18, 'Dar tolerans: nokta sayısı iki katı.'],
  ]);
});
