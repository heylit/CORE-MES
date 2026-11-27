import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kodTuru, komutKodu, okunurKod, okutmaDuzelt } from './kod-sozlugu.ts';

test('kod sözlüğü: her önek kendi türüne yönlendirir', () => {
  assert.deepEqual(kodTuru('LOC:A-01-01'), { tur: 'konum', deger: 'A-01-01' });
  assert.deepEqual(kodTuru('MLZ:901'), { tur: 'malzeme', deger: '901' });
  assert.deepEqual(kodTuru('LOT:LT-000123'), { tur: 'lot', deger: 'LT-000123' });
  assert.deepEqual(kodTuru('UE:4512'), { tur: 'uretim-emri', deger: '4512', bicim: 'kimlik' });
  assert.deepEqual(kodTuru('RAF:A12'), { tur: 'raf', deger: 'A12' });
  assert.deepEqual(kodTuru('RP:37'), { tur: 'refakat-partisi', deger: '37' });
  assert.deepEqual(kodTuru('UE:UE-004512'), { tur: 'uretim-emri', deger: 'UE-004512', bicim: 'no' });
});

test('kod sözlüğü: öneksiz emir ve lot numarası tanınır', () => {
  assert.deepEqual(kodTuru('UE-004512'), { tur: 'uretim-emri', deger: 'UE-004512', bicim: 'no' });
  assert.deepEqual(kodTuru('LT-000123'), { tur: 'lot', deger: 'LT-000123' });
});

test('kod sözlüğü: büyük-küçük harf ve boşluk sonucu değiştirmez', () => {
  assert.deepEqual(kodTuru('  loc : a-01-01 \n'), { tur: 'konum', deger: 'A-01-01' });
  assert.deepEqual(kodTuru('Mlz: 901'), { tur: 'malzeme', deger: '901' });
  assert.deepEqual(kodTuru('lot:lt-000123'), { tur: 'lot', deger: 'LT-000123' });
  assert.deepEqual(kodTuru(' raf : a12 '), { tur: 'raf', deger: 'A12' });
  assert.deepEqual(kodTuru(' rp : 37 '), { tur: 'refakat-partisi', deger: '37' });
  assert.deepEqual(kodTuru(' ue : 4512 '), { tur: 'uretim-emri', deger: '4512', bicim: 'kimlik' });
  assert.deepEqual(kodTuru('ue-004512'), { tur: 'uretim-emri', deger: 'UE-004512', bicim: 'no' });
  assert.deepEqual(kodTuru(' lt-000123'), { tur: 'lot', deger: 'LT-000123' });
});

test('kod sözlüğü: tanınmayan, boş ya da biçimi tutmayan kod "bilinmiyor" döner, ham değer kırpılarak kalır', () => {
  for (const ham of ['', '   ', 'XYZ:12', 'A-01-01', '901', 'LOC:', 'LOT:', 'RAF:', 'MLZ:abc', 'MLZ:', 'UE:abc', 'UE:', 'UE-', 'LT-', 'UE-12A', 'IE:5', 'RP:', 'RP:abc', 'RP:-3', 'RP:12a', 'RP-1A', 'LOCA01', 'LOT', 'RP', 'RP 12-', 'UE 4512']) {
    assert.deepEqual(kodTuru(ham), { tur: 'bilinmiyor', deger: ham.trim() }, ham);
  }
  assert.deepEqual(kodTuru(' xyz:12 '), { tur: 'bilinmiyor', deger: 'xyz:12' });
});

// 3758 b: kamera kullanmayan operatör kodu etiketten okuyup elle yazar; basılan gruplu biçim ve yaygın yazım farkları aynı kodu verir.
test('kod sözlüğü: elle yazılan kodda önek ayracı, grup boşluğu, tire ve rakam yerine harf hoş görülür (3758)', () => {
  for (const ham of ['RP:1234', 'rp 1234', 'RP-1234', 'RP1234', 'rp - 1234', 'RP 1 234', 'RP:12-34', 'RP:I234', 'RP:l234']) {
    assert.deepEqual(kodTuru(ham), { tur: 'refakat-partisi', deger: '1234' }, ham);
  }
  assert.deepEqual(kodTuru('RP:12O4'), { tur: 'refakat-partisi', deger: '1204' });
  assert.deepEqual(kodTuru('RP 12 345'), { tur: 'refakat-partisi', deger: '12345' });
  assert.deepEqual(kodTuru('mlz 9O1'), { tur: 'malzeme', deger: '901' });
  // Konum ve lot gövdesi kullanıcının tanımıdır: ayraç hoş görülür, içindeki O ve I olduğu gibi kalır.
  assert.deepEqual(kodTuru('loc a01-02-3'), { tur: 'konum', deger: 'A01-02-3' });
  assert.deepEqual(kodTuru('LOC-AO1-I2'), { tur: 'konum', deger: 'AO1-I2' });
  assert.deepEqual(kodTuru('lot lt-000123'), { tur: 'lot', deger: 'LT-000123' });
  // UE ile tire emir numarasıdır, kimlik olmaz.
  assert.deepEqual(kodTuru('UE-004512'), { tur: 'uretim-emri', deger: 'UE-004512', bicim: 'no' });
});

test('kod sözlüğü: okunur kod rakam gövdeli öneki boşlukla ayırır, beş hane ve üstünü üçerli gruplar; elle yazılınca aynı kodu verir (3758)', () => {
  const ornekler: [string, string][] = [['RP:1234', 'RP 1234'], ['RP:12345', 'RP 12 345'], ['RP:1234567', 'RP 1 234 567'], ['MLZ:901', 'MLZ 901'], ['LOC:A01-02-3', 'LOC:A01-02-3'], ['LOT:LT-000123', 'LOT:LT-000123'], ['UE:4512', 'UE:4512']];
  for (const [kimlik, basilan] of ornekler) {
    assert.equal(okunurKod(kimlik), basilan, kimlik);
    assert.deepEqual(kodTuru(basilan), kodTuru(kimlik), basilan);
  }
});

test('kod sözlüğü: refakat partisi kartı gelmeden basılan refakat kartı (UE:<emir>) emir olarak okunmaya devam eder', () => {
  assert.deepEqual(kodTuru('UE:4512'), { tur: 'uretim-emri', deger: '4512', bicim: 'kimlik' });
  assert.notEqual(kodTuru('RP:4512').tur, 'uretim-emri');
});

test('kod sözlüğü: fabrika ayarındaki okuyucunun Türkçe Q klavyede yazdığı kod çözülür', () => {
  assert.deepEqual(kodTuru('LOTŞLT*000123'), { tur: 'lot', deger: 'LT-000123' });
  assert.deepEqual(kodTuru('UEŞ4512'), { tur: 'uretim-emri', deger: '4512', bicim: 'kimlik' });
  assert.deepEqual(kodTuru('UE*004512'), { tur: 'uretim-emri', deger: 'UE-004512', bicim: 'no' });
  assert.deepEqual(kodTuru('LOCŞA*01*01'), { tur: 'konum', deger: 'A-01-01' });
  assert.deepEqual(kodTuru('rpş37'), { tur: 'refakat-partisi', deger: '37' });
  assert.equal(okutmaDuzelt('MLZŞ901'), 'MLZ:901');
  assert.equal(okutmaDuzelt('LT*000123'), 'LT-000123');
});

test('kod sözlüğü: düzeltme yalnız bilinen koda dönüşen okutmaya uygulanır (reddedilen)', () => {
  for (const ham of ['ŞAFT 20', 'Ş*', 'XYZŞ12', '2*3', 'A1B2C3D4', '04A1B2C3', 'LOC:A*01', 'MLZŞabc', 'RPŞ*3']) {
    assert.equal(okutmaDuzelt(ham), ham, ham);
  }
  assert.deepEqual(kodTuru('XYZŞ12'), { tur: 'bilinmiyor', deger: 'XYZŞ12' });
});

test('kod sözlüğü: komut kartı (1909) sabit komut, miktar ve modu tanır; bozuk komut bilinmiyordur', () => {
  assert.deepEqual(kodTuru('CMD:KAYDET'), { tur: 'komut', komut: { ad: 'KAYDET' } });
  assert.deepEqual(kodTuru(' cmd : geri-al '), { tur: 'komut', komut: { ad: 'GERI-AL' } });
  assert.deepEqual(kodTuru('CMD:MIKTAR:12'), { tur: 'komut', komut: { ad: 'MIKTAR', miktar: 12 } });
  assert.deepEqual(kodTuru('CMD:MOD:SAY'), { tur: 'komut', komut: { ad: 'MOD', mod: 'SAY' } });
  for (const ham of ['CMD:', 'CMD:SIL', 'CMD:MIKTAR:', 'CMD:MIKTAR:-3', 'CMD:MIKTAR:1.5', 'CMD:MOD:', 'CMD:MOD:S4Y']) assert.equal(kodTuru(ham).tur, 'bilinmiyor');
  // Fabrika ayarındaki okuyucunun Türkçe Q klavyede bozduğu ayraç düzelir.
  assert.deepEqual(kodTuru('CMDŞMIKTARŞ10'), { tur: 'komut', komut: { ad: 'MIKTAR', miktar: 10 } });
  assert.deepEqual(kodTuru('CMDŞGERI*AL'), { tur: 'komut', komut: { ad: 'GERI-AL' } });
  for (const k of [{ ad: 'KAYDET' }, { ad: 'MIKTAR', miktar: 25 }, { ad: 'MOD', mod: 'TASI' }] as const) assert.deepEqual(kodTuru(komutKodu(k)), { tur: 'komut', komut: k });
});

test('kod sözlüğü: CM1 özet kodu ilk alanıyla çözülür, eski biçimler aynen sürer', () => {
  assert.deepEqual(kodTuru('CM1/LOT:ORN-LT-2041/TPN:ORN-TPN-77812/BT:261122'), { tur: 'lot', deger: 'ORN-LT-2041' });
  assert.deepEqual(kodTuru('CM1/UE:142/PRC:ORN-PRC-001/REV:B/BT:261122'), { tur: 'uretim-emri', deger: '142', bicim: 'kimlik' });
  assert.deepEqual(kodTuru('CM1/RP:37/PRC:X/BT:261122'), { tur: 'refakat-partisi', deger: '37' });
  assert.deepEqual(kodTuru('CM1/LOC:ORN-A01-02-3/AD:ORN RAF GOZU A01/BT:261122'), { tur: 'konum', deger: 'ORN-A01-02-3' });
  assert.deepEqual(kodTuru('cm1/mlz:1002/sk:orn-0002/bt:261122'), { tur: 'malzeme', deger: '1002' });
  assert.deepEqual(kodTuru('CM2/UE:142/YENI:X'), { tur: 'uretim-emri', deger: '142', bicim: 'kimlik' });
  assert.deepEqual(kodTuru('LOT:LT-000123'), { tur: 'lot', deger: 'LT-000123' });
});

test('kod sözlüğü: CM1 ilk alanı sözlükte yoksa bilinmiyor (koli, hatalı parça)', () => {
  assert.equal(kodTuru('CM1/KOL:ORN-KL-0091-1/NN:1-4/BT:261122').tur, 'bilinmiyor');
  assert.equal(kodTuru('CM1/UE:ABC/BT:261122').tur, 'bilinmiyor');
});

test('kod sözlüğü: CM1 ABD klavyesi kaymasında da çözülür', () => {
  const duz = 'CM1/LOT:ORN-LT-2041/TPN:ORN-TPN-77812/BT:261122';
  const bozuk = duz.replaceAll(':', 'Ş').replaceAll('-', '*');
  assert.equal(okutmaDuzelt(bozuk), duz);
  assert.deepEqual(kodTuru(bozuk), { tur: 'lot', deger: 'ORN-LT-2041' });
});
