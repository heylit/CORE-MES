import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gizle, gizliAnahtarMi, kimlikParametreleri } from './kurallar.ts';

test('parola alanları iç içe yapıda da gizlenir; diğer alanlar aynen kalır', () => {
  const girdi = { kullaniciAdi: 'ali', parola: 'gizli1', kisiler: [{ ad: 'A', yeniParola: 'gizli2', adet: 0 }], not: null };
  assert.deepEqual(gizle(girdi), {
    kullaniciAdi: 'ali', parola: '[gizli]', kisiler: [{ ad: 'A', yeniParola: '[gizli]', adet: 0 }], not: null,
  });
  assert.equal(JSON.stringify(gizle(girdi)).includes('gizli1'), false);
  assert.equal(gizle(undefined), undefined);
});

test('token ve pin alanları sözcük olarak maskelenir; adı onları yalnız içeren alan açık kalır', () => {
  const gizli = [
    'pin', 'PIN', 'token', 'Token', 'yeniPin', 'yeniPIN', 'userPIN', 'erisimToken', 'erisimTOKEN', 'refresh_token', 'kart_pin', 'ACCESS_TOKEN',
    'parola', 'eskiSifre',
  ];
  const acik = ['pins', 'tokens', 'spin', 'SPIN', 'spindle', 'ping', 'pinResolved', 'tokenSayisi', 'kupin', 'clippingPlanes', 'veri', 'ad', 'id', 'ozet', 'kimlik'];
  assert.deepEqual(gizli.filter((ad) => !gizliAnahtarMi(ad)), []);
  assert.deepEqual(acik.filter(gizliAnahtarMi), []);
  // Anahtar adı maskelenir, değer değil: ileti türü olarak geçen 'pin-resolved' aynen kalır.
  assert.deepEqual(
    gizle({ tur: 'pin-resolved', pins: [{ id: 'p1', token: 't-1' }], oturum: { token: 't-2', pin: '1234' } }),
    { tur: 'pin-resolved', pins: [{ id: 'p1', token: '[gizli]' }], oturum: { token: '[gizli]', pin: '[gizli]' } },
  );
});

test('password, passwd ve secret tam ad ya da sonek olarak maskelenir; sözcüğü başta ya da ortada taşıyan ad açık kalır', () => {
  const gizli = ['password', 'Password', 'PASSWORD', 'newPassword', 'old_password', 'passwd', 'dbPasswd', 'secret', 'clientSecret', 'client_secret', 'APISECRET'];
  const acik = ['secretary', 'secrets', 'passwordPolicy', 'passwords', 'secretSayisi'];
  assert.deepEqual(gizli.filter((ad) => !gizliAnahtarMi(ad)), []);
  assert.deepEqual(acik.filter(gizliAnahtarMi), []);
});

test('DNT-01 listede yalnız tam sayı değerli id ve ...Id parametreleri kalır; metin, gizli adlı ve kimlik biçiminde olmayan parametre düşer', () => {
  assert.deepEqual(kimlikParametreleri({ id: 41, adimId: 3, kisiId: 7 }), { id: 41, adimId: 3, kisiId: 7 });
  assert.deepEqual(kimlikParametreleri({
    kimlik: 'MK-9', anahtar: 'tema', ozet: 'abc', tur: 'events', depo: 'x', token: '[gizli]',
    id: '41', kisiId: 1.5, Id: 3, ID: 4, idler: 5, gecersizid: 6, emirId: 9,
  }), { emirId: 9 });
  for (const bos of [null, undefined, 'metin', 7, [1, 2]]) assert.deepEqual(kimlikParametreleri(bos), {});
});

test('kişisel kimlik numarası (TCKN, SGK no) serbest sözlükte de gizlenir; benzer adlı alan açık kalır', () => {
  assert.deepEqual(gizle({ tckn: '1', tcKimlikNo: '2', sgkNo: '3', sgk_no: '4', ad: 'Ayşe', tcknGosterilsin: true }), {
    tckn: '[gizli]', tcKimlikNo: '[gizli]', sgkNo: '[gizli]', sgk_no: '[gizli]', ad: 'Ayşe', tcknGosterilsin: true,
  });
});

test('IBAN, maaş, ücret geçmişi, kan grubu, engel durumu, adres, telefon ve doğum tarihi İK gövdesinde de gizlenir; benzer adlı alan açık kalır', () => {
  const govde = {
    govde: {
      ad: 'Ayşe', banka: 'ORNEK Bankası', iban: 'TR00 0000 0000 0000 0000 0000 01', brutMaas: 45000, maasBeklentisi: 50000,
      kanGrubu: '0 Rh+', engelDurumu: '2. derece (%60–79)', ucretGecmisi: [{ tarih: '2026-01-01', brut: 40000, neden: 'zam' }],
      adres: 'Deneme mahallesi 1', telefon: '0000 000 00 00', acilTelefon: '0000 000 00 01', dogumTarihi: '1990-01-01', il: 'Deneme',
    },
    surum: 3,
  };
  assert.deepEqual(gizle(govde), {
    govde: {
      ad: 'Ayşe', banka: 'ORNEK Bankası', iban: '[gizli]', brutMaas: '[gizli]', maasBeklentisi: '[gizli]',
      kanGrubu: '[gizli]', engelDurumu: '[gizli]', ucretGecmisi: '[gizli]',
      adres: '[gizli]', telefon: '[gizli]', acilTelefon: '[gizli]', dogumTarihi: '[gizli]', il: 'Deneme',
    },
    surum: 3,
  });
  const gizli = ['IBAN', 'firmaIban', 'iban_no', 'ibanNo', 'maas', 'netMaas', 'brut_maas', 'kan_grubu', 'engel_durumu', 'ucret_gecmisi',
    'faturaAdres', 'teslim_adres', 'cepTelefon', 'dogum_tarihi'];
  const acik = ['engel', 'engelli', 'engeller', 'onayEngelleri', 'dengeler', 'kanal', 'kanGrubuGosterilsin', 'ibanSayisi', 'temas', 'banka',
    'adresler', 'adresTuru', 'telefonlar', 'dogumYeri', 'tarih'];
  assert.deepEqual(gizli.filter((ad) => !gizliAnahtarMi(ad)), []);
  assert.deepEqual(acik.filter(gizliAnahtarMi), []);
});
