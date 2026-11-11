import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import {
  GOREV_EN_FAZLA, PAROLA_EN_AZ, SICIL_EN_FAZLA, islemleriBirlestir, kisiAlanlariniDuzelt, kullaniciAdiHatasi, oturumKapatmaReddi, parolaBaskasiReddi,
  ILETILER, PIN_UZUNLUK, SINIRLI_EN_UZUN_GUN, bayrakliKisiReddi, gunEkle, icHesapReddi, sinirliHesapReddi, sinirliRolReddi, girisYontemi, korumaliMi, hesapAcmaReddi, parolaHatasi, pasifeAlmaReddi, pinHatasi, pinVermeReddi,
} from './kurallar.ts';

test('rollerden gelen işlemler birleşir; kayıtlı olmayan işlem yetki vermez', () => {
  assert.deepEqual(
    islemleriBirlestir(false, ['sayfa.terminal', 'kisiler.oku', 'stok.her-sey', 5, 'sayfa.terminal']).sort(),
    ['kisiler.oku', 'sayfa.terminal'],
  );
  assert.deepEqual(islemleriBirlestir(false, []), []);
});

test('bütün işlemler bayrağı kayıtlı her işlemi verir; bayraksız rol yalnız kendi satırlarını', () => {
  assert.deepEqual(islemleriBirlestir(true, []), [...ISLEMLER]);
  assert.deepEqual(islemleriBirlestir(true, ['kisiler.oku']), [...ISLEMLER]);
  assert.deepEqual(islemleriBirlestir(false, ['kisiler.oku']), ['kisiler.oku']);
});

describe('kişi alanları', () => {
  test('ad ve görev kırpılır; boş sicil ve görev null olur; ad boş olamaz', () => {
    assert.deepEqual(kisiAlanlariniDuzelt({ ad: '  Deneme Kişi ', sicilNo: ' 12-A ', gorev: ' Operatör ' }), {
      tamam: { ad: 'Deneme Kişi', sicilNo: '12-A', gorev: 'Operatör' },
    });
    assert.deepEqual(kisiAlanlariniDuzelt({ ad: 'Kişi', sicilNo: '  ', gorev: undefined }), {
      tamam: { ad: 'Kişi', sicilNo: null, gorev: null },
    });
    assert.equal('tamam' in kisiAlanlariniDuzelt({ ad: '   ' }), false);
    assert.equal((kisiAlanlariniDuzelt({ ad: '   ' }) as { alan: string }).alan, 'ad');
  });

  test('sicil ve görev sınırında kabul, bir fazlasında red', () => {
    assert.equal('tamam' in kisiAlanlariniDuzelt({ ad: 'K', sicilNo: 's'.repeat(SICIL_EN_FAZLA), gorev: 'g'.repeat(GOREV_EN_FAZLA) }), true);
    const sicil = kisiAlanlariniDuzelt({ ad: 'K', sicilNo: 's'.repeat(SICIL_EN_FAZLA + 1) });
    assert.equal('alan' in sicil && sicil.alan, 'sicilNo');
    const gorev = kisiAlanlariniDuzelt({ ad: 'K', gorev: 'g'.repeat(GOREV_EN_FAZLA + 1) });
    assert.equal('alan' in gorev && gorev.alan, 'gorev');
  });
});

describe('pasife alma', () => {
  const temel = { kendiKendine: false, hedefBayrakli: false, aktorBayrakli: false, hedefSayiliyor: false, kalanBayrakli: 0 };

  test('sıradan kişi herkesçe pasife alınır; kişi kendini alamaz', () => {
    assert.equal(pasifeAlmaReddi(temel), null);
    assert.equal(pasifeAlmaReddi({ ...temel, kendiKendine: true, aktorBayrakli: true })?.tur, 'gecersiz');
  });

  test('bayraklı kişiyi yalnız bayraklı başka biri pasife alır', () => {
    assert.equal(pasifeAlmaReddi({ ...temel, hedefBayrakli: true })?.tur, 'yetki');
    assert.equal(pasifeAlmaReddi({ ...temel, hedefBayrakli: true, aktorBayrakli: true }), null);
  });

  test('sayılan son bayraklı pasife alınamaz; sayılmayan (girişsiz) bayraklı alınabilir', () => {
    const girdi = { ...temel, hedefBayrakli: true, aktorBayrakli: true };
    assert.equal(pasifeAlmaReddi({ ...girdi, hedefSayiliyor: true, kalanBayrakli: 0 })?.tur, 'gecersiz');
    assert.equal(pasifeAlmaReddi({ ...girdi, hedefSayiliyor: true, kalanBayrakli: 1 }), null);
    assert.equal(pasifeAlmaReddi({ ...girdi, hedefSayiliyor: false, kalanBayrakli: 0 }), null);
  });
});

describe('başkasının parolası', () => {
  const temel = { kendiKendine: false, hedefBayrakli: false, aktorBayrakli: false };

  test('kendi parolası bu yoldan değişmez; bayraklı kişinin parolasını yalnız bayraklı başkası değiştirir', () => {
    assert.equal(parolaBaskasiReddi(temel), null);
    assert.equal(parolaBaskasiReddi({ ...temel, kendiKendine: true, aktorBayrakli: true })?.tur, 'gecersiz');
    assert.equal(parolaBaskasiReddi({ ...temel, hedefBayrakli: true })?.tur, 'yetki');
    assert.equal(parolaBaskasiReddi({ ...temel, hedefBayrakli: true, aktorBayrakli: true }), null);
  });

  test('KS-11: başkasının oturumları kapanır; kendine geçersiz, bayraklıya yalnız bayraklı aktör', () => {
    assert.equal(oturumKapatmaReddi(temel), null);
    assert.deepEqual(oturumKapatmaReddi({ ...temel, kendiKendine: true, aktorBayrakli: true }), { tur: 'gecersiz', ileti: ILETILER.kendiOturumYolu });
    assert.equal(oturumKapatmaReddi({ ...temel, hedefBayrakli: true })?.tur, 'yetki');
    assert.equal(oturumKapatmaReddi({ ...temel, hedefBayrakli: true, aktorBayrakli: true }), null);
  });
});

describe('giriş bilgisi', () => {
  test('kullanıcı adı ve parola kuralı sınırda sınanır', () => {
    assert.equal(PAROLA_EN_AZ, 10);
    assert.equal(parolaHatasi('pqrs-tuvw-1'), null);
    assert.notEqual(parolaHatasi('pq'.repeat(PAROLA_EN_AZ / 2)), null);
    for (const zayif of ['p'.repeat(PAROLA_EN_AZ), '1111111111', '9876543210', 'abcdefghij', 'ABCDEFGHIJ', 'jihgfedcba']) {
      assert.match(parolaHatasi(zayif) ?? '', /tekrarı ya da sıralı/, zayif);
    }
    for (const zayif of ['1234567890', '0987654321', '1234567890!', '1212121212', '123123123123', 'abcabcabca', '1qaz2wsx3edc']) {
      assert.notEqual(parolaHatasi(zayif), null, zayif);
    }
    for (const yeterli of ['1234567891', 'abcdefghik', 'dogru-parola-1', '1111111112', 'mavi kapi yedi elma']) assert.equal(parolaHatasi(yeterli), null, yeterli);
    assert.notEqual(parolaHatasi('p'.repeat(PAROLA_EN_AZ - 1)), null);
    assert.match(parolaHatasi('dogru-par') ?? '', /en az 10/);
  });

  test('sık parola kökü başına ve sonuna rakam, işaret eklense de reddedilir; Türkçe harf ve sık yer değiştirme açılır', () => {
    for (const sik of [
      'Galatasaray1905!', 'parola2024!', 'Qwerty123456', 'P@ssw0rd2024', 'Şifre12345678', 'fenerbahçe1907', 'Besiktas.1903',
      '2024istanbul', 'mustafa12345', 'qwertyqwerty', 'askimaskim1', 'Seni_Seviyorum1', 'Admin!2024!!',
    ]) {
      assert.match(parolaHatasi(sik) ?? '', /çok sık kullanılan/, sik);
    }
    for (const yeterli of ['dogru-parola-1', 'galatasaray-sahil-yolu', 'istanbul7ankara3', 'tezgah-sogutma-suyu', 'Kedi ile Kopek 3']) {
      assert.equal(parolaHatasi(yeterli), null, yeterli);
    }
  });

  test('kullanıcı adı kuralı sınırda sınanır', () => {
    assert.equal(kullaniciAdiHatasi('abc'), null);
    assert.notEqual(kullaniciAdiHatasi('ab'), null);
    assert.notEqual(kullaniciAdiHatasi('Büyük Harf'), null);
    assert.equal(
      kullaniciAdiHatasi('ayşe yılmaz'),
      'Kullanıcı adında izin verilmeyen karakter var: "ş", boşluk, "ı". Yalnız a-z harf, rakam, nokta, tire ve alt çizgi kullanın (ş, ı, ğ, ü, ö, ç yerine s, i, g, u, o, c).',
    );
    assert.equal(kullaniciAdiHatasi('ab'), 'Kullanıcı adı 3-40 karakter olmalı; şu an 2 karakter.');
    assert.equal(kullaniciAdiHatasi('a'.repeat(41)), 'Kullanıcı adı 3-40 karakter olmalı; şu an 41 karakter.');
    assert.equal(kullaniciAdiHatasi('a'.repeat(40)), null);
  });
});

describe('bayraklı kişi üzerinde işlem', () => {
  test('bayraklı hedefe yalnız bayraklı aktör dokunur; sıradan hedefe herkes', () => {
    assert.equal(bayrakliKisiReddi({ hedefBayrakli: false, aktorBayrakli: false }), null);
    assert.equal(korumaliMi({ hedefBayrakli: true, aktorBayrakli: false }), true);
    assert.equal(korumaliMi({ hedefBayrakli: true, aktorBayrakli: true }), false);
    assert.equal(korumaliMi({ hedefBayrakli: false, aktorBayrakli: false }), false);
    assert.equal(bayrakliKisiReddi({ hedefBayrakli: true, aktorBayrakli: false })?.tur, 'yetki');
    assert.equal(bayrakliKisiReddi({ hedefBayrakli: true, aktorBayrakli: true }), null);
  });

  test('hesap açma: seçilen rol bayraklıysa ya da hedef zaten bayraklıysa yalnız bayraklı aktör açar', () => {
    const tamamen = { rolBayrakli: false, hedefBayrakli: false, aktorBayrakli: false };
    assert.equal(hesapAcmaReddi(tamamen), null);
    assert.equal(hesapAcmaReddi({ ...tamamen, rolBayrakli: true })?.tur, 'yetki');
    assert.equal(hesapAcmaReddi({ ...tamamen, hedefBayrakli: true })?.tur, 'yetki');
    assert.equal(hesapAcmaReddi({ rolBayrakli: true, hedefBayrakli: true, aktorBayrakli: true }), null);
  });
});

describe('PIN', () => {
  test('altı rakam kabul edilir; eksik, fazla ya da rakam dışı karakter reddedilir', () => {
    assert.equal(PIN_UZUNLUK, 6);
    for (const pin of ['482913', '102938', '000001', '135790', '121212']) assert.equal(pinHatasi(pin), null, pin);
    for (const pin of ['48291', '4829130', '48291a', ' 48291', '', '４８２９１３']) assert.notEqual(pinHatasi(pin), null, pin);
  });

  test('tek rakamın tekrarı ve art arda artan ya da azalan dizi reddedilir', () => {
    for (const pin of ['000000', '777777', '123456', '012345', '456789', '654321', '987654', '543210']) {
      assert.equal(pinHatasi(pin), 'PIN tek rakamın tekrarı ya da sıralı rakamlar olamaz.', pin);
    }
    // İki adımlı ya da dönerek sıralanan dizi bu kuralın dışındadır.
    for (const pin of ['135791', '890123', '246802']) assert.equal(pinHatasi(pin), null, pin);
  });

  test('bayraklı kişi her zaman parolayla girer; öteki PIN verildiyse PIN, verilmediyse parolayla', () => {
    assert.equal(girisYontemi({ bayrakli: true, pinVar: true }), 'parola');
    assert.equal(girisYontemi({ bayrakli: true, pinVar: false }), 'parola');
    assert.equal(girisYontemi({ bayrakli: false, pinVar: true }), 'pin');
    assert.equal(girisYontemi({ bayrakli: false, pinVar: false }), 'parola');
  });

  test('PIN kendine ve bayraklı kişiye verilmez', () => {
    assert.deepEqual(pinVermeReddi({ kendiKendine: true, hedefBayrakli: false }), { tur: 'gecersiz', ileti: ILETILER.kendiPin });
    assert.deepEqual(pinVermeReddi({ kendiKendine: false, hedefBayrakli: true }), { tur: 'gecersiz', ileti: ILETILER.bayrakliPin });
    assert.equal(pinVermeReddi({ kendiKendine: false, hedefBayrakli: false }), null);
  });
});

describe('sınırlı hesap (kart 2158)', () => {
  const temel = { kendiKendine: false, hedefBayrakli: false, sorumluUygun: true, sorumluKendisi: false, bugun: '2026-12-30' };

  test('gün ekleme ay ve yıl sınırını, artık yılı aşar', () => {
    assert.equal(gunEkle('2026-12-30', 2), '2027-01-01');
    assert.equal(gunEkle('2028-02-28', 1), '2028-02-29');
    assert.equal(gunEkle('2026-03-01', -1), '2026-02-28');
  });

  test('bitiş bugünden 90 güne kadar geçer; önce ve sonra reddedilir', () => {
    assert.equal(sinirliHesapReddi({ ...temel, bitis: '2026-12-30' }), null);
    assert.equal(sinirliHesapReddi({ ...temel, bitis: gunEkle('2026-12-30', SINIRLI_EN_UZUN_GUN) }), null);
    assert.deepEqual(sinirliHesapReddi({ ...temel, bitis: '2026-12-29' }), { tur: 'gecersiz', ileti: ILETILER.sinirliBitisGecmis });
    assert.deepEqual(
      sinirliHesapReddi({ ...temel, bitis: gunEkle('2026-12-30', SINIRLI_EN_UZUN_GUN + 1) }), { tur: 'gecersiz', ileti: ILETILER.sinirliBitisUzun },
    );
  });

  test('kendi hesabı, bayraklı kişi ve uygunsuz sorumlu reddedilir; ret sırası yetkiden başlar', () => {
    const bitis = '2027-01-10';
    assert.deepEqual(sinirliHesapReddi({ ...temel, bitis, kendiKendine: true, hedefBayrakli: true }), { tur: 'yetki', ileti: ILETILER.sinirliKendi });
    assert.deepEqual(sinirliHesapReddi({ ...temel, bitis, hedefBayrakli: true }), { tur: 'gecersiz', ileti: ILETILER.sinirliBayrakli });
    assert.deepEqual(sinirliHesapReddi({ ...temel, bitis, sorumluUygun: false }), { tur: 'gecersiz', ileti: ILETILER.sinirliSorumlu });
    assert.deepEqual(sinirliHesapReddi({ ...temel, bitis, sorumluKendisi: true }), { tur: 'gecersiz', ileti: ILETILER.sinirliSorumlu });
  });

  test('iç hesaba alma yalnız sınırlı hesapta ve başkasınca; bayraklı rol sınırlı hesaba verilmez', () => {
    assert.equal(icHesapReddi({ kendiKendine: false, hedefSinirli: true }), null);
    assert.deepEqual(icHesapReddi({ kendiKendine: true, hedefSinirli: true }), { tur: 'yetki', ileti: ILETILER.sinirliKendi });
    assert.deepEqual(icHesapReddi({ kendiKendine: false, hedefSinirli: false }), { tur: 'gecersiz', ileti: ILETILER.sinirliDegil });
    assert.deepEqual(sinirliRolReddi({ rolBayrakli: true, hedefSinirli: true }), { tur: 'gecersiz', ileti: ILETILER.sinirliBayrakli });
    assert.equal(sinirliRolReddi({ rolBayrakli: false, hedefSinirli: true }), null);
    assert.equal(sinirliRolReddi({ rolBayrakli: true, hedefSinirli: false }), null);
  });
});
