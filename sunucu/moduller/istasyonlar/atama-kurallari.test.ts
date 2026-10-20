import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { AtamaSatiri } from './kurallar.ts';
import { ekipCakismasi, gecerliAtamalar, gecmisTarihliMi, gunBicimi, kalanYuk, kontrolTarihleri, sentBicimi, yuzdeSente } from './kurallar.ts';

const kalanSent = (...a: Parameters<typeof kalanYuk>): number => kalanYuk(...a).kalan;
const at = (tur: AtamaSatiri['tur'], hedefId: number, baslangic: string, sent: number | null): AtamaSatiri => ({ tur, hedefId, baslangic, sent });

describe('yüzde biçimi (kural, IK3)', () => {
  test('metin sente, sent metne ondalık hatasız çevrilir', () => {
    assert.equal(yuzdeSente('12.5'), 1250);
    assert.equal(yuzdeSente('33.33'), 3333);
    assert.equal(yuzdeSente('100'), 10000);
    assert.equal(yuzdeSente('0.07'), 7);
    assert.equal(sentBicimi(1250), '12.5');
    assert.equal(sentBicimi(6000), '60');
    assert.equal(sentBicimi(7), '0.07');
    assert.equal(sentBicimi(3333), '33.33');
  });

  test('ondalık toplam hatasızdır: 33.33 + 33.33 + 33.34 tam 100 eder', () => {
    const toplam = ['33.33', '33.33', '33.34'].map(yuzdeSente).reduce((t, s) => t + s, 0);
    assert.equal(toplam, 10000);
  });
});

describe('geçerlilik tarihi (kural, IK2)', () => {
  const satirlar = [
    at('makine', 1, '2026-01-01', 5000),
    at('makine', 1, '2026-03-01', 2000),
    at('makine', 1, '2026-06-01', null),
    at('istasyon', 7, '2026-02-01', 1000),
  ];

  test('bir tarihte o tarihe kadarki en son satır geçerlidir; yüzdesi boş satır çıkarılmış demektir', () => {
    const yuzdeler = (t: string) => gecerliAtamalar(satirlar, t).map((s) => `${s.tur}${s.hedefId}:${s.sent}`).sort();
    assert.deepEqual(yuzdeler('2025-12-31'), []);
    assert.deepEqual(yuzdeler('2026-01-15'), ['makine1:5000']);
    assert.deepEqual(yuzdeler('2026-02-01'), ['istasyon7:1000', 'makine1:5000']);
    assert.deepEqual(yuzdeler('2026-03-01'), ['istasyon7:1000', 'makine1:2000']);
    assert.deepEqual(yuzdeler('2026-06-01'), ['istasyon7:1000']);
  });

  test('geçmiş tarihli değişiklik reddedilir, bugün ve ileri tarih kabul edilir', () => {
    assert.equal(gecmisTarihliMi('2026-10-05', '2026-10-06'), true);
    assert.equal(gecmisTarihliMi('2026-10-06', '2026-10-06'), false);
    assert.equal(gecmisTarihliMi('2026-10-07', '2026-10-06'), false);
  });

  test('kontrol tarihleri: başlangıç ve pencerede başka hedeflerin değişiklik günleri; aynı hedefin sonraki satırı pencereyi bitirir', () => {
    const s = [at('makine', 1, '2026-05-01', 1000), at('makine', 1, '2026-09-01', 2000), at('istasyon', 2, '2026-07-01', 1000), at('istasyon', 2, '2026-10-01', null)];
    assert.deepEqual(kontrolTarihleri(s, 'makine', 1, '2026-05-01'), ['2026-05-01', '2026-07-01']);
    assert.deepEqual(kontrolTarihleri(s, 'makine', 1, '2026-09-01'), ['2026-09-01', '2026-10-01']);
  });
});

describe('yüzde toplamı (kural, IK1)', () => {
  test('kalan: diğer hedeflerin toplamı 100\'den düşer, hedefin kendi yüzdesi sayılmaz; türler birlikte sayılır', () => {
    const s = [at('istasyon', 5, '2026-01-01', 3000), at('makine', 1, '2026-01-01', 2000), at('istasyon', 9, '2026-01-01', 1500), at('makine', 2, '2026-01-01', 1000)];
    assert.equal(kalanSent([], 'makine', 1, '2026-01-01'), 10000);
    assert.equal(kalanSent(s, 'makine', 3, '2026-01-01'), 10000 - 3000 - 2000 - 1500 - 1000);
    assert.equal(kalanSent(s, 'makine', 1, '2026-01-01'), 10000 - 3000 - 1500 - 1000);
    assert.equal(kalanSent(s, 'istasyon', 9, '2026-01-01'), 10000 - 3000 - 2000 - 1000);
  });

  test('kalan, çıkarılmış atamayı saymaz ve gelecekteki yükü pencerede gözetir', () => {
    const s = [at('makine', 1, '2026-01-01', 5000), at('makine', 1, '2026-02-01', null), at('istasyon', 2, '2026-03-01', 4000)];
    assert.equal(kalanSent(s, 'istasyon', 7, '2026-02-15'), 10000 - 4000);
    assert.equal(kalanSent(s, 'istasyon', 7, '2026-01-15'), 10000 - 5000);
  });

  test('Bulgu 3: sınırı koyan gün döner; ileride başlayan yük sınırı koyuyorsa o gün, eşitlikte en erken gün', () => {
    const s = [at('makine', 1, '2026-01-01', 2000), at('istasyon', 2, '2026-03-01', 6000)];
    assert.deepEqual(kalanYuk(s, 'istasyon', 7, '2026-01-01'), { kalan: 10000 - 8000, tarih: '2026-03-01' });
    assert.deepEqual(kalanYuk([at('makine', 1, '2026-01-01', 2000)], 'istasyon', 7, '2026-01-01'), { kalan: 8000, tarih: '2026-01-01' });
    assert.deepEqual(kalanYuk([], 'istasyon', 7, '2026-01-01'), { kalan: 10000, tarih: '2026-01-01' });
    assert.equal(gunBicimi('2026-03-01'), '01.03.2026');
  });

  test('aynı hedefin sonraki satırı pencereyi bitirir: o günden sonrasını o satır belirler', () => {
    const s = [at('istasyon', 2, '2026-06-01', 9000), at('makine', 1, '2026-05-01', 1000), at('makine', 1, '2026-06-01', null)];
    assert.equal(kalanSent(s, 'makine', 1, '2026-05-01'), 10000);
  });
});

describe('tek ekip (kural, IK6)', () => {
  test('başka ekipte geçerli üyelik penceredeyse çakışır; çıkarıldıysa ya da sonra başlıyorsa çakışmaz', () => {
    const s = [at('ekip', 1, '2026-01-01', 5000), at('ekip', 1, '2026-06-01', null)];
    assert.equal(ekipCakismasi(s, 2, '2026-02-01')?.hedefId, 1);
    assert.equal(ekipCakismasi(s, 2, '2026-06-01'), null);
    assert.equal(ekipCakismasi(s, 1, '2026-02-01'), null);
    assert.deepEqual(ekipCakismasi([at('ekip', 1, '2026-08-01', 5000)], 2, '2026-02-01'), at('ekip', 1, '2026-08-01', 5000));
    assert.equal(ekipCakismasi([at('ekip', 1, '2026-08-01', 5000), at('ekip', 2, '2026-06-01', 1000)], 2, '2026-02-01'), null);
  });

  test('istasyon ve makine atamaları ekip çakışması sayılmaz; yüzde toplamına ekip de girer', () => {
    const s = [at('istasyon', 1, '2026-01-01', 5000), at('makine', 2, '2026-01-01', 2000)];
    assert.equal(ekipCakismasi(s, 3, '2026-01-01'), null);
    assert.equal(kalanSent([...s, at('ekip', 4, '2026-01-01', 1000)], 'ekip', 3, '2026-01-01'), 10000 - 5000 - 2000 - 1000);
  });
});
