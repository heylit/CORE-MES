import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ayAraligi, aylikIsverenMaliyeti, calisilanGun, dogrudanEmilmeyen, dolayliPersonel, girdiSaatMaliyeti, grupDegerleri, isverenMaliyeti, kisiSaatMaliyeti,
  KUCUK_GRUP_ESIGI, kucukGrupHavuzu, type KapsamGirdisi,
} from './kurallar.ts';

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

// 2026-11: 30 günlük ay. Adlar ve tutarlar uydurmadır.
const AB = '2026-11-01', AS = '2026-11-30';
const k = (o: Partial<KapsamGirdisi> & { personelNo: number }): KapsamGirdisi => ({
  kisiId: null, departmanNo: 1, departmanAd: 'Dolayli', departmanIptal: false, dogrudan: false, brut: 22000, iseGiris: null, cikis: null, bordroMaliyeti: null, ...o,
});

test('IK-88 (Maliyet C1): çalışılan gün işe giriş ve çıkışa göre, bütün ay 30; formül brütü ve SGK tavanı gün oranlı; bordro varsa bordro', () => {
  assert.equal(calisilanGun(null, null, AB, AS), 30);
  assert.equal(calisilanGun(null, null, '2026-10-01', '2026-10-31'), 30);
  assert.equal(calisilanGun('2026-11-16', null, AB, AS), 15);
  assert.equal(calisilanGun(null, '2026-11-10', AB, AS), 10);
  assert.equal(calisilanGun('2026-10-16', '2026-11-03', AB, AS), 3);
  assert.equal(calisilanGun('2026-12-01', null, AB, AS), 0);
  // Ayın 16'sında giren: maliyet yarı (26.840 / 2).
  assert.equal(aylikIsverenMaliyeti(k({ personelNo: 1, iseGiris: '2026-11-16' }), p, AB, AS), 13420);
  // Tavan da gün oranlı: brüt 200.000, yarım ay -> brüt 100.000, tavan 75.000: 100.000 + 75.000 x 0,22 = 116.500.
  assert.equal(aylikIsverenMaliyeti(k({ personelNo: 1, brut: 200000, iseGiris: '2026-11-16' }), p, AB, AS), 116500);
  assert.equal(aylikIsverenMaliyeti(k({ personelNo: 1, bordroMaliyeti: 31000, iseGiris: '2026-11-16' }), p, AB, AS), 31000);
  assert.equal(aylikIsverenMaliyeti(k({ personelNo: 1, brut: null }), p, AB, AS), null);
  assert.equal(aylikIsverenMaliyeti(k({ personelNo: 1 }), { ...p, sgkTavani: null }, AB, AS), null);
});

test('IK-88 (2647 a): dolaylı personel yalnız dolaylı departmanların toplamı; doğrudan girmez; bordro ve formül karışık; küçük grup bayrağı', () => {
  const kapsam = [
    k({ personelNo: 1 }), k({ personelNo: 2, bordroMaliyeti: 30000.004 }), k({ personelNo: 3, iseGiris: '2026-11-16' }),
    k({ personelNo: 4, departmanNo: 2, departmanAd: 'Uretim', dogrudan: true, brut: 99999 }),
  ];
  assert.deepEqual(dolayliPersonel(kapsam, p, AB, AS), { tutar: 26840 + 30000 + 13420, kisiSayisi: 3, kucuk: false, eksik: [] });
  assert.deepEqual(dolayliPersonel(kapsam.slice(0, 2), p, AB, AS), { tutar: 56840, kisiSayisi: 2, kucuk: true, eksik: [] });
  assert.equal(KUCUK_GRUP_ESIGI, 3);
});

test('IK-88: işaretlenmemiş departman, departmansız ya da iptal departmandaki kişi ve maaşı bilinmeyen kişi tutarı null yapar; ad yalnız departmanın', () => {
  const temel = [k({ personelNo: 1 }), k({ personelNo: 2 }), k({ personelNo: 3 })];
  const isaretsiz = dolayliPersonel([...temel, k({ personelNo: 4, departmanNo: 3, departmanAd: 'Kalite', dogrudan: null })], p, AB, AS);
  assert.deepEqual(isaretsiz, { tutar: null, kisiSayisi: 3, kucuk: false, eksik: ['işaretlenmemiş departman: Kalite'] });
  const departmansiz = dolayliPersonel([...temel, k({ personelNo: 5, departmanNo: null, departmanAd: null, dogrudan: null }), k({ personelNo: 6, departmanIptal: true })], p, AB, AS);
  assert.deepEqual(departmansiz.eksik, ['departmanı olmayan 2 kişi']);
  assert.equal(departmansiz.tutar, null);
  const maassiz = dolayliPersonel([...temel, k({ personelNo: 7, brut: null })], p, AB, AS);
  assert.deepEqual(maassiz, { tutar: null, kisiSayisi: 4, kucuk: false, eksik: ['maaşı bilinmeyen 1 kişi'] });
});

test('IK-89 (2659): emilmeyen = doğrudan maliyet - katılım saati x grup değeri; bağsız kişinin tamamı girer; eksi korunur; yuvarlama sonda', () => {
  const d = (o: Partial<KapsamGirdisi> & { personelNo: number }) => k({ departmanNo: 2, departmanAd: 'Uretim', dogrudan: true, ...o });
  const kapsam = [d({ personelNo: 1, kisiId: 11 }), d({ personelNo: 2, kisiId: 12, bordroMaliyeti: 30000 }), d({ personelNo: 3 }), k({ personelNo: 4, kisiId: 14 })];
  const grup = new Map([[2, 122.3333]]);
  // 26.840 + 30.000 + 26.840 - (150 + 100) x 122,3333 = 83.680 - 30.583,325 = 53.096,675 -> 53.096,68 (kişi başı yuvarlanmaz).
  const saat = new Map([[11, 150], [12, 100], [14, 500]]);
  assert.deepEqual(dogrudanEmilmeyen(kapsam, p, AB, AS, saat, grup), { tutar: 53096.68, kisiSayisi: 3, kucuk: false, eksik: [] });
  // Fazla emilim (Maliyet 2): katılım ödenen saati aşarsa eksi.
  assert.equal(dogrudanEmilmeyen(kapsam, p, AB, AS, new Map([[11, 400], [12, 400]]), grup).tutar, Math.round((83680 - 800 * 122.3333) * 100) / 100);
  assert.ok(dogrudanEmilmeyen(kapsam, p, AB, AS, new Map([[11, 400], [12, 400]]), grup).tutar! < 0);
  // Tam emilim sıfır verir, eksi sıfır değil.
  assert.ok(Object.is(dogrudanEmilmeyen([d({ personelNo: 9, kisiId: 19 })], p, AB, AS, new Map([[19, 220]]), new Map([[2, 122]])).tutar, 0));
  // Katılımı olmayan doğrudan kişi: maliyetin tamamı.
  assert.equal(dogrudanEmilmeyen(kapsam, p, AB, AS, new Map(), grup).tutar, 83680);
});

test('IK-89: katılım kaynağı yok, grup değeri bilinmeyen katılımlı kişi, işaretsiz departman null; küçük birleşik doğrudan grup bayrağı', () => {
  const d = (o: Partial<KapsamGirdisi> & { personelNo: number }) => k({ departmanNo: 2, departmanAd: 'Uretim', dogrudan: true, ...o });
  const kapsam = [d({ personelNo: 1, kisiId: 11 }), d({ personelNo: 2, kisiId: 12 })];
  assert.deepEqual(dogrudanEmilmeyen(kapsam, p, AB, AS, null, new Map([[2, 100]])), { tutar: null, kisiSayisi: 2, kucuk: true, eksik: ['katılım kaynağı yok'] });
  assert.deepEqual(dogrudanEmilmeyen(kapsam, p, AB, AS, new Map([[11, 10]]), new Map([[2, null]])).eksik, ['grup saat değeri bilinmeyen 1 kişi']);
  // Katılımsız kişi için grup değeri gerekmez.
  assert.equal(dogrudanEmilmeyen(kapsam, p, AB, AS, new Map(), new Map()).tutar, 53680);
  const isaretsiz = dogrudanEmilmeyen([...kapsam, d({ personelNo: 3, departmanNo: 5, departmanAd: 'Bakim', dogrudan: null })], p, AB, AS, new Map(), new Map());
  assert.deepEqual(isaretsiz.eksik, ['işaretlenmemiş departman: Bakim']);
  assert.equal(isaretsiz.tutar, null);
});
