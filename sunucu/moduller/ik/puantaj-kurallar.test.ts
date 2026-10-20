import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { calismaAraligi, calismaHesabi, fazlaTuru, puantajGunuDenetle, puantajKilidiDenetle, puantajTarihiDenetle } from './kurallar.ts';

// Puantaj kuralları (kart #1571): her kural için izinli ve reddedilen durum.
const SA = 3_600_000;
const GUN = Date.UTC(2026, 9, 5, 5); // günün başı yerine sabit bir an; hesap yalnız farklara bakar
const plan = (...parcalar: [number, number][]) => parcalar.map(([b, s]) => ({ bas: GUN + b * SA, bit: GUN + s * SA }));

describe('İK puantaj kuralları', () => {
  test('IK-61: çalışılan günde giriş zorunlu; öteki durumlarda saat yazılmaz', () => {
    assert.equal(puantajGunuDenetle({ durum: 'calisti', giris: '08:00', cikis: '17:00' }), null);
    assert.equal(puantajGunuDenetle({ durum: 'calisti', giris: '08:00', cikis: null }), null, 'çıkış sonra girilebilir');
    assert.equal(puantajGunuDenetle({ durum: 'izinli', giris: null, cikis: null }), null);
    assert.equal(puantajGunuDenetle({ durum: null, giris: null, cikis: null }), null, 'gün temizlenir');
    assert.equal(puantajGunuDenetle({ durum: 'calisti', giris: null, cikis: '17:00' })?.alan, 'giris');
    assert.equal(puantajGunuDenetle({ durum: 'devamsiz', giris: '08:00', cikis: null })?.kod, 'DOGRULAMA');
  });

  test('IK-62: çıkış girişle aynı olamaz; önceyse ertesi gündür', () => {
    assert.equal(puantajGunuDenetle({ durum: 'calisti', giris: '08:00', cikis: '08:00' })?.alan, 'cikis');
    const gece = calismaAraligi(GUN, '22:00', '06:00');
    assert.equal((gece.bit - gece.bas) / SA, 8);
    const gunduz = calismaAraligi(GUN, '08:00', '17:30');
    assert.equal((gunduz.bit - gunduz.bas) / SA, 9.5);
  });

  test('IK-63, IK-64: ileri tarih, işe girişten önce ve çıkıştan sonra yazılmaz', () => {
    assert.equal(puantajTarihiDenetle('2026-10-05', '2026-10-05', '2026-01-01', null), null);
    assert.equal(puantajTarihiDenetle('2026-10-06', '2026-10-05', null, null)?.kod, 'GECERSIZ');
    assert.equal(puantajTarihiDenetle('2025-12-31', '2026-10-05', '2026-01-01', null)?.kod, 'GECERSIZ');
    assert.equal(puantajTarihiDenetle('2026-09-02', '2026-10-05', null, '2026-09-01')?.kod, 'GECERSIZ');
    assert.equal(puantajTarihiDenetle('2026-09-01', '2026-10-05', null, '2026-09-01'), null, 'çıkış günü yazılır');
  });

  test('IK-65: kesinleşmiş ay kilit açma yetkisi olmadan değişmez', () => {
    assert.equal(puantajKilidiDenetle(false, ['ik.devam-yaz']), null);
    assert.equal(puantajKilidiDenetle(true, ['ik.devam-yaz', 'ik.bordro-kilit-ac']), null);
    assert.equal(puantajKilidiDenetle(true, ['ik.devam-yaz'])?.kod, 'YETKI_YOK');
  });

  test('IK-68: mola planın içinde düşülür, fazla planın net süresinin üstüdür', () => {
    // Plan 08:00-12:00 ve 13:00-17:00 (net 8 saat, mola 1 saat).
    const p = { araliklar: plan([8, 12], [13, 17]), molalar: plan([12, 13]) };
    assert.deepEqual(calismaHesabi(calismaAraligi(GUN, '08:00', '17:00'), p), { calismaDakika: 480, fazlaDakika: 0 });
    assert.deepEqual(calismaHesabi(calismaAraligi(GUN, '08:00', '19:30'), p), { calismaDakika: 630, fazlaDakika: 150 });
    assert.deepEqual(calismaHesabi(calismaAraligi(GUN, '09:00', '12:00'), p), { calismaDakika: 180, fazlaDakika: 0 }, 'eksik çalışma fazla değildir');
    assert.deepEqual(calismaHesabi(calismaAraligi(GUN, '10:00', '15:00'), { araliklar: [], molalar: [] }), { calismaDakika: 300, fazlaDakika: 300 }, 'boş planda hepsi fazla');
    assert.deepEqual(calismaHesabi(calismaAraligi(GUN, '08:00', '17:00'), null), { calismaDakika: 540, fazlaDakika: null }, 'plan bilinmiyorsa fazla da bilinmez');
  });

  test('IK-68: vardiyalar arasındaki boşluk mola değildir; orada çalışılan süre fazladır', () => {
    // Vardiya 08:00-16:00 (mola 12:00-13:00) ve planlı fazla mesai 18:00-20:00; kişi 08:00-20:00 çalıştı.
    const p = { araliklar: plan([8, 12], [13, 16], [18, 20]), molalar: plan([12, 13]) };
    assert.deepEqual(calismaHesabi(calismaAraligi(GUN, '08:00', '20:00'), p), { calismaDakika: 660, fazlaDakika: 120 });
    // Molada çalışmadan çıkan kişi molayı düşmez: 08:00-12:00.
    assert.deepEqual(calismaHesabi(calismaAraligi(GUN, '08:00', '12:00'), p), { calismaDakika: 240, fazlaDakika: 0 });
  });

  test('IK-69: fazla mesai türü günün planından önerilir', () => {
    assert.equal(fazlaTuru(60, { dakika: 480, kapali: null, izinli: false }), 'Fazla mesai');
    assert.equal(fazlaTuru(60, { dakika: 0, kapali: 'tatil', izinli: false }), 'Resmi tatil çalışması');
    assert.equal(fazlaTuru(60, { dakika: 0, kapali: 'kapali', izinli: false }), 'Hafta tatili çalışması');
    assert.equal(fazlaTuru(60, { dakika: 0, kapali: null, izinli: false }), 'Hafta tatili çalışması');
    assert.equal(fazlaTuru(60, { dakika: 0, kapali: null, izinli: true }), 'Fazla mesai', 'izinli gün hafta tatili değildir');
    assert.equal(fazlaTuru(0, { dakika: 480, kapali: null, izinli: false }), null);
    assert.equal(fazlaTuru(null, null), null);
  });
});
