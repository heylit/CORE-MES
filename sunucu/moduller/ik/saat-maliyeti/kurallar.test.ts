import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ayAraligi, girdiSaatMaliyeti, grupDegerleri, isverenMaliyeti, kisiSaatMaliyeti, KUCUK_GRUP_ESIGI, kucukGrupHavuzu } from './kurallar.ts';

const p = { sgkIsverenOrani: 20, issizlikIsverenOrani: 2, sgkTavani: 150000, aylikSaat: 220 };

test('IK-85: işveren maliyeti brüt + min(brüt, SGK tavanı) x (SGK + işsizlik işveren) / 100; saat maliyeti / aylık saat; eksik girdi bilinmez', () => {
  assert.equal(isverenMaliyeti(22000, p), 26840);
  assert.equal(kisiSaatMaliyeti(22000, p), 122);
  // Tavanın üstü: prim 150.000 üzerinden; 200.000 + 33.000 = 233.000 (tavansız hesap 244.000 verirdi).
  assert.equal(isverenMaliyeti(200000, p), 233000);
  assert.equal(kisiSaatMaliyeti(200000, p), 233000 / 220);
  // Maliyet ön bakışı örneği: tavan 100.000, brüt 150.000 -> (150.000 + 22.000) / 220 = 781,82 (tavansız 831,82).
  assert.equal(Math.round(kisiSaatMaliyeti(150000, { ...p, sgkTavani: 100000 })! * 100) / 100, 781.82);
  assert.equal(isverenMaliyeti(22000, { ...p, sgkIsverenOrani: null }), null);
  assert.equal(isverenMaliyeti(22000, { ...p, sgkTavani: null }), null);
  assert.equal(kisiSaatMaliyeti(null, p), null);
  assert.equal(kisiSaatMaliyeti(22000, { ...p, aylikSaat: null }), null);
  assert.equal(kisiSaatMaliyeti(22000, { ...p, aylikSaat: 0 }), null);
});

test('IK-86: grup değeri çalışılan saatle ağırlıklı; saati ya da maliyeti olmayan kişi girmez; sayılan yoksa null; eşik altı küçük', () => {
  const g = (personelNo: number, departmanNo: number, brut: number | null, saat: number) => ({ personelNo, departmanNo, departmanAd: `D${departmanNo}`, brut, saat });
  // D1: 122/saat x 100 saat ve 244/saat x 300 saat -> (12200 + 73200) / 400 = 213,5. Brütsüz ve saatsiz kişi sayılmaz.
  const sonuc = grupDegerleri([g(1, 1, 22000, 100), g(2, 1, 44000, 300), g(3, 1, null, 50), g(4, 1, 22000, 0), g(5, 1, 22000, 10), g(6, 2, 22000, 0)], p);
  assert.equal(KUCUK_GRUP_ESIGI, 3);
  // D1'e 5. kişi de girer: (12200 + 73200 + 1220) / 410.
  assert.deepEqual(sonuc.find((x) => x.departmanNo === 1), { departmanNo: 1, departmanAd: 'D1', saatMaliyeti: Math.round(((12200 + 73200 + 1220) / 410) * 10000) / 10000, kisiSayisi: 3, kucuk: false });
  assert.deepEqual(sonuc.find((x) => x.departmanNo === 2), { departmanNo: 2, departmanAd: 'D2', saatMaliyeti: null, kisiSayisi: 0, kucuk: true });
  const iki = grupDegerleri([g(1, 1, 22000, 100), g(2, 1, 44000, 300)], p);
  assert.deepEqual(iki[0], { departmanNo: 1, departmanAd: 'D1', saatMaliyeti: 213.5, kisiSayisi: 2, kucuk: true });
  assert.equal(grupDegerleri([g(1, 1, 22000, 100)], { ...p, aylikSaat: null })[0]?.saatMaliyeti, null);
});

test('ay aralığı: ilk ve son gün; artık yıl; geçersiz ay null', () => {
  assert.deepEqual(ayAraligi('2026-02'), { ayBasi: '2026-02-01', aySonu: '2026-02-28' });
  assert.deepEqual(ayAraligi('2028-02'), { ayBasi: '2028-02-01', aySonu: '2028-02-29' });
  assert.deepEqual(ayAraligi('2026-12'), { ayBasi: '2026-12-01', aySonu: '2026-12-31' });
  assert.equal(ayAraligi('2026-13'), null);
  assert.equal(ayAraligi('2026-1'), null);
});

test('IK-85 (2632 a): kesinleşmiş bordro varsa işveren maliyeti / (aylık saat x gün / 30 + fazla mesai + resmi tatil saati); yoksa formül', () => {
  const b = (maliyet: number, gun: number | null, mesaiSaati: number | null, tatilSaati: number | null) => ({ maliyet, gun, mesaiSaati, tatilSaati });
  assert.equal(girdiSaatMaliyeti({ brut: 22000, bordro: b(30000, 30, 30, null) }, p), 120);
  assert.equal(girdiSaatMaliyeti({ brut: 22000, bordro: b(26400, null, null, null) }, p), 120);
  // Eksik gün: maliyet güne orantılıdır, bölen de (220 x 15 / 30 = 110).
  assert.equal(girdiSaatMaliyeti({ brut: 22000, bordro: b(13200, 15, 0, 0) }, p), 120);
  // Resmi tatil çalışma ücreti maliyettedir, saati de bölene girer (220 + 10 + 20 = 250).
  assert.equal(girdiSaatMaliyeti({ brut: 22000, bordro: b(30000, 30, 10, 20) }, p), 120);
  // Motor gibi gün 0-30 aralığında sayılır.
  assert.equal(girdiSaatMaliyeti({ brut: 22000, bordro: b(26400, 31, 0, 0) }, p), 120);
  assert.equal(girdiSaatMaliyeti({ brut: 22000, bordro: b(3000, 0, 25, 0) }, p), 120);
  assert.equal(girdiSaatMaliyeti({ brut: 22000, bordro: b(3000, 0, 0, 0) }, p), null);
  assert.equal(girdiSaatMaliyeti({ brut: 22000, bordro: null }, p), 122);
  assert.equal(girdiSaatMaliyeti({ brut: null, bordro: b(26400, 30, 0, 0) }, p), 120);
  assert.equal(girdiSaatMaliyeti({ brut: 22000, bordro: b(26400, 30, 0, 0) }, { ...p, aylikSaat: null }), null);
});

test('IK-87: küçük grupların sayılan kişileri tek havuzda saatle ağırlıklı; büyük grup girmez; havuz eşik altındaysa null', () => {
  const g = (personelNo: number, departmanNo: number, brut: number | null, saat: number) => ({ personelNo, departmanNo, departmanAd: `D${departmanNo}`, brut, saat });
  const buyuk = [g(1, 1, 22000, 100), g(2, 1, 22000, 100), g(3, 1, 22000, 100)];
  // D2 iki kişi (122 x 10, 244 x 30), D3 bir kişi (122 x 20); D3'ün saatsiz kişisi sayılmaz.
  const kucukler = [g(4, 2, 22000, 10), g(5, 2, 44000, 30), g(6, 3, 22000, 20), g(7, 3, 22000, 0)];
  assert.deepEqual(kucukGrupHavuzu([...buyuk, ...kucukler], p), { deger: Math.round(((1220 + 7320 + 2440) / 60) * 10000) / 10000, kisiSayisi: 3 });
  assert.equal(kucukGrupHavuzu([...buyuk, g(4, 2, 22000, 10), g(5, 2, 44000, 30)], p), null);
  assert.equal(kucukGrupHavuzu(buyuk, p), null);
  assert.equal(kucukGrupHavuzu(kucukler, { ...p, aylikSaat: null }), null);
});
