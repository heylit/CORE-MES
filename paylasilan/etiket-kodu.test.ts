import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alanGosterimi, cm1Coz, eksikAlanlar, etiketFarklari, farkMetni, kimlikKodu, ozetSatirlari, tarihKodundan } from './etiket-kodu.ts';

const LOT = 'CM1/LOT:ORN-LT-2041/TPN:ORN-TPN-77812/DKM:ORN-DKM-5531/SRT:ORN-SRT-310/SKT:270527/MK:ORN-MK-0045/GT:261118/TDR:ORN-TD-07/DRM:KBK/BT:261122';
const REFAKAT = 'CM1/UE:142/PRC:ORN-PRC-001/REV:B/RRV:3/LOT:ORN-LT-2041/ADT:120/TRM:261125/OPS:10+20+30+40+50/KPY:1-2/BT:261122';

test('CM1: alanlar sırayla, ilk alan kimlik, basım tarihi ISO', () => {
  const o = cm1Coz(LOT);
  assert.ok(o);
  assert.deepEqual(o.kimlik, { anahtar: 'LOT', deger: 'ORN-LT-2041' });
  assert.equal(o.alanlar.length, 10);
  assert.equal(o.basim, '2026-11-22');
  assert.equal(o.eksikSayisi, 0);
  assert.equal(o.surumTanindi, true);
  assert.equal(kimlikKodu(o), 'LOT:ORN-LT-2041');
});

test('CM1: CM1 olmayan metin null; ilk alan bozuksa null', () => {
  for (const k of ['LOT:ORN-LT-2041', 'UE-004512', '', 'CM1', 'CM1/', 'CM1/xyz', 'CM1/:abc', 'CM1/LOTLAR:1']) assert.equal(cm1Coz(k), null, k);
});

test('CM1: küçük harf, boşluk ve değerde boşluk; bozuk ara alan atlanır', () => {
  const o = cm1Coz(' cm1/raf:orn-r12/ad:orn palet rafi/bozuk/yer:salon1 b2 k3/bt:261122 ');
  assert.ok(o);
  assert.deepEqual(o.alanlar.map((a) => `${a.anahtar}=${a.deger}`), ['RAF=ORN-R12', 'AD=ORN PALET RAFI', 'YER=SALON1 B2 K3', 'BT=261122']);
});

test('CM1: bilinmeyen sürüm yalnız kimlik olarak okunur', () => {
  const o = cm1Coz('CM2/UE:142/YENI:ALAN');
  assert.ok(o);
  assert.equal(o.surumTanindi, false);
  assert.equal(kimlikKodu(o), 'UE:142');
});

test('CM1: koddan düşen alan sayısı sondaki +N ile gelir ve düşenler adıyla bulunur', () => {
  const sevk = 'CM1/KOL:ORN-KL-0091-1/NN:1-4/SVK:ORN-SVK-0091/MSN:ORN-SIP-5520/PRC:ORN-PRC-001/REV:B/ADT:50/LOT:ORN-LT-2041+ORN-LT-2042/BT:261122/+1';
  const o = cm1Coz(sevk);
  assert.ok(o);
  assert.equal(o.eksikSayisi, 1);
  assert.deepEqual(eksikAlanlar(o), ['UT']);
  assert.equal(o.alanlar.at(-1)?.anahtar, 'BT');
  assert.deepEqual(eksikAlanlar(cm1Coz(LOT)!), []);
});

test('tarih: YYAAGG geçerliyse GG.AA.YYYY, değilse olduğu gibi', () => {
  assert.equal(tarihKodundan('261122'), '2026-11-22');
  assert.equal(tarihKodundan('261322'), null);
  assert.equal(tarihKodundan('26112'), null);
  assert.deepEqual(alanGosterimi({ anahtar: 'SKT', deger: '270527' }), { ad: 'Son kullanma', deger: '27.05.2027', eskir: false });
  assert.equal(alanGosterimi({ anahtar: 'SKT', deger: 'YOK' }).deger, 'YOK');
});

test('okuyan ekran alanları Türkçe ad ve ekran dilinde değer taşır', () => {
  const satir = Object.fromEntries(ozetSatirlari(cm1Coz(LOT)!).map((s) => [s.ad, s]));
  assert.equal(satir['Tedarikçi lotu']?.deger, 'ORN-TPN-77812');
  assert.equal(satir['Döküm no']?.deger, 'ORN-DKM-5531');
  assert.equal(satir['Giriş tarihi']?.deger, '18.11.2026');
  assert.equal(satir['Durum']?.deger, 'Karar bekliyor');
  assert.equal(satir['Durum']?.eskir, true);
  assert.equal(satir['Basım'], undefined, 'basım ayrı gösterilir');
  assert.equal(satir['LOT'], undefined, 'kimlik ayrı gösterilir');
  assert.equal(satir['Lot'], undefined);
});

test('okuyan ekran: işlem listesi ve kırpma, koli sırası, çok lot', () => {
  assert.equal(alanGosterimi({ anahtar: 'OPS', deger: '10+20+30' }).deger, '10 · 20 · 30');
  assert.equal(alanGosterimi({ anahtar: 'OPS', deger: '10+20+15K' }).deger, '10 · 20 · 15 işlem daha');
  assert.equal(alanGosterimi({ anahtar: 'NN', deger: '1-4' }).deger, '1 / 4');
  assert.equal(alanGosterimi({ anahtar: 'LOT', deger: 'A-1+A-2' }).deger, 'A-1 · A-2');
  assert.equal(alanGosterimi({ anahtar: 'DRM', deger: 'ZZ' }).deger, 'ZZ');
  assert.equal(alanGosterimi({ anahtar: 'TRM', deger: '261125' }).eskir, true);
});

test('eski etiket: sunucudaki değer farklıysa fark listelenir, kimlik ve basım karşılaştırılmaz', () => {
  const o = cm1Coz(REFAKAT)!;
  assert.deepEqual(etiketFarklari(o, { REV: 'B', RRV: '3', ADT: '120', UE: '999', BT: '270101', KPY: '9' }), []);
  const f = etiketFarklari(o, { REV: 'C', TRM: '261201' });
  assert.deepEqual(f.map((x) => x.anahtar), ['REV', 'TRM']);
  assert.equal(farkMetni(f), 'revizyon B → C, termin 25.11.2026 → 01.12.2026');
  assert.deepEqual(etiketFarklari(o, {}), []);
});

test('el okuyucu kayması: ayraç "." ve işlem ayracı "_" okunur', () => {
  const o = cm1Coz('CM1.UE:142.REV:B.OPS:10_20_30.BT:261122._2');
  assert.ok(o);
  assert.equal(o.eksikSayisi, 2);
  assert.equal(alanGosterimi(o.alanlar.find((a) => a.anahtar === 'OPS')!).deger, '10 · 20 · 30');
});

test('DRM: her stok kalite durumunun kodu ve ekran adı var, kodlar tekil', async () => {
  const { KALITE_DURUM_KODLARI } = await import('./etiket-kodu.ts');
  const { KALITE_DURUMLARI } = await import('./sozlesme/stok.ts');
  assert.deepEqual(Object.keys(KALITE_DURUM_KODLARI).sort(), [...KALITE_DURUMLARI].sort());
  assert.equal(new Set(Object.values(KALITE_DURUM_KODLARI).map((d) => d.kod)).size, KALITE_DURUMLARI.length);
  assert.equal(alanGosterimi({ anahtar: 'DRM', deger: 'SRL' }).deger, 'Şartlı kabul');
});
