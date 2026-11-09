import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { bayatPlan, eksikEylemi, gecikenEmir, kayitsizGun, kayitsizGunSayisi, planGerisi, plansizIs, yarimIs } from './kurallar.ts';

const S = 3_600_000;
const gun = [{ bas: 0, bit: 24 * S }];

describe('eksik iş kuralları (2421 c)', () => {
  test('AR-EK-1: plan bitişi geçmiş bitmemiş iş net dakikayla gecikir; eşik, vardiya ve kalan adet hüküm koşuludur', () => {
    assert.deepEqual(planGerisi({ planBitis: 2 * S, simdi: 5 * S, araliklar: gun, kalanAdet: 4, esikDk: 60 }), { deger: 180, dayanak: 2 * S, kalanAdet: 4, planaGore: false });
    assert.equal(planGerisi({ planBitis: 2 * S, simdi: 2.5 * S, araliklar: gun, kalanAdet: 4, esikDk: 60 }), null, 'eşik dolmadı');
    assert.equal(planGerisi({ planBitis: 2 * S, simdi: 5 * S, araliklar: gun, kalanAdet: 4, esikDk: null }), null, 'kural kapalı');
    assert.equal(planGerisi({ planBitis: 2 * S, simdi: 5 * S, araliklar: null, kalanAdet: 4, esikDk: 60 }), null, 'vardiya bilinmiyor');
    assert.equal(planGerisi({ planBitis: 2 * S, simdi: 5 * S, araliklar: gun, kalanAdet: 0, esikDk: 60 }), null, 'kalan yok');
    // Vardiya 8-16: bitiş 15:00, şimdi ertesi gün 9:00; net 60 + 60 = 120 dk (gece sayılmaz).
    const vardiya = [{ bas: 8 * S, bit: 16 * S }, { bas: 32 * S, bit: 40 * S }];
    assert.equal(planGerisi({ planBitis: 15 * S, simdi: 33 * S, araliklar: vardiya, kalanAdet: 1, esikDk: 60 })?.deger, 120);
    assert.equal(planGerisi({ planBitis: 15.5 * S, simdi: 31 * S, araliklar: vardiya, kalanAdet: 1, esikDk: 60 }), null, 'gece beklemesi gecikme değil');
  });

  test('AR-EK-2: kayıtsız gün sondan sayılır; tatil, duruş ve açık işsiz gün zinciri kırmaz, giriş ve bilinmeyen vardiya keser', () => {
    const g = (aktifDk: number | null, acikIs: boolean, girisVar: boolean, durusVar = false) => ({ aktifDk, acikIs, girisVar, durusVar });
    assert.equal(kayitsizGunSayisi([g(480, true, true), g(480, true, false), g(0, true, false), g(480, true, false)]), 2);
    assert.equal(kayitsizGunSayisi([g(480, true, false), g(480, true, true)]), 0);
    assert.equal(kayitsizGunSayisi([g(480, true, false), g(null, true, false), g(480, true, false)]), 1);
    assert.equal(kayitsizGunSayisi([g(480, false, false), g(480, true, false)]), 1);
    assert.equal(kayitsizGunSayisi([g(480, true, false), g(480, true, false, true), g(480, true, false)]), 2, 'duruş günü sayılmaz, zinciri kırmaz');
    assert.deepEqual(kayitsizGun({ gunler: [g(480, true, false), g(480, true, false)], sonGiris: 5, esikGun: 2 }), { deger: 2, dayanak: 5, kalanAdet: null, planaGore: false });
    assert.equal(kayitsizGun({ gunler: [g(480, true, false)], sonGiris: 5, esikGun: 2 }), null);
    assert.equal(kayitsizGun({ gunler: [g(480, true, false)], sonGiris: 5, esikGun: null }), null);
    assert.equal(kayitsizGun({ gunler: [g(0, true, false)], sonGiris: null, esikGun: 1 }), null, 'sıfır gün işaret değil');
  });

  test('AR-EK-3: tezgahta açık olmayan başlamış iş son hareketinden vardiya saatiyle yarım kalır', () => {
    const t = { calisiyor: true, tezgahtaAcik: false, sonHareket: 0, simdi: 30 * S, araliklar: gun, kalanAdet: 3, esikSaat: 8 };
    assert.deepEqual(yarimIs(t), { deger: 24, dayanak: 0, kalanAdet: 3, planaGore: false });
    assert.equal(yarimIs({ ...t, tezgahtaAcik: true }), null);
    assert.equal(yarimIs({ ...t, calisiyor: false }), null);
    assert.equal(yarimIs({ ...t, simdi: 5 * S }), null);
    assert.equal(yarimIs({ ...t, esikSaat: null }), null);
    assert.equal(yarimIs({ ...t, sonHareket: null }), null);
    assert.equal(yarimIs({ ...t, araliklar: null }), null, 'vardiya bilinmiyor');
    // Vardiya 8-16: son hareket 15:00, şimdi ertesi gün 9:00; 1 + 1 = 2 vardiya saati (takvimde 18 saat).
    const vardiya = [{ bas: 8 * S, bit: 16 * S }, { bas: 32 * S, bit: 40 * S }];
    assert.equal(yarimIs({ ...t, sonHareket: 15 * S, simdi: 33 * S, araliklar: vardiya, esikSaat: 2 })?.deger, 2);
    assert.equal(yarimIs({ ...t, sonHareket: 15 * S, simdi: 33 * S, araliklar: vardiya, esikSaat: 8 }), null, 'gece ve hafta sonu bekleyişi sayılmaz');
  });

  test('AR-EK-4: yerleşmemiş açık iş emrin açılışından vardiya saatiyle', () => {
    const t = { yerlesimVar: false, acilma: 0, simdi: 25 * S, araliklar: gun, esikSaat: 8 };
    assert.equal(plansizIs(t)?.deger, 24);
    assert.equal(plansizIs({ ...t, yerlesimVar: true }), null);
    assert.equal(plansizIs({ ...t, simdi: 2 * S }), null);
    assert.equal(plansizIs({ ...t, esikSaat: null }), null);
    assert.equal(plansizIs({ ...t, araliklar: null }), null, 'takvim bilinmiyor');
    assert.equal(plansizIs({ ...t, araliklar: [{ bas: 8 * S, bit: 16 * S }] })?.deger, 8);
  });

  test('AR-EK-5: teslim günü geçen emir gün farkıyla; gelmediyse plana göre geciken; teslimsizde hüküm yok', () => {
    const t = { teslimSonu: 7, planBitisGunu: null, esikGun: 0 };
    assert.deepEqual(gecikenEmir({ ...t, teslim: '2026-11-05', bugun: '2026-11-09' }), { deger: 4, dayanak: 7, kalanAdet: null, planaGore: false });
    assert.equal(gecikenEmir({ ...t, teslim: '2026-11-09', bugun: '2026-11-09' }), null, 'teslim günü içinde');
    assert.equal(gecikenEmir({ ...t, teslim: '2026-11-05', bugun: '2026-11-09', esikGun: 4 }), null);
    assert.deepEqual(gecikenEmir({ ...t, teslim: '2026-11-10', bugun: '2026-11-09', planBitisGunu: '2026-11-12' }), { deger: 2, dayanak: 7, kalanAdet: null, planaGore: true });
    assert.equal(gecikenEmir({ ...t, teslim: '2026-11-10', bugun: '2026-11-09', planBitisGunu: '2026-11-10' }), null);
    assert.equal(gecikenEmir({ ...t, teslim: null, bugun: '2026-11-09' }), null);
    assert.equal(gecikenEmir({ ...t, teslim: '2026-11-05', bugun: '2026-11-09', esikGun: null }), null);
  });

  test('AR-EK-6: plan gerisi varken eşikten eski canlı (vardiya saati) bayattır; hiç canlıya alınmamış plan açık işte bayattır', () => {
    const t = { sonCanliyaAlma: 0, simdi: 20 * S, araliklar: gun, planGerisi: 1, acikIs: 3, esikSaat: 12 };
    assert.equal(bayatPlan(t)?.deger, 20);
    assert.equal(bayatPlan({ ...t, planGerisi: 0 }), null);
    assert.equal(bayatPlan({ ...t, simdi: 10 * S }), null);
    assert.equal(bayatPlan({ ...t, araliklar: [{ bas: 8 * S, bit: 16 * S }] }), null, 'tek vardiyada 8 saat, eşik 12');
    assert.equal(bayatPlan({ ...t, araliklar: null }), null, 'tesis takvimi bilinmiyor');
    assert.deepEqual(bayatPlan({ ...t, sonCanliyaAlma: null, simdi: 1, planGerisi: 0, acikIs: 1, araliklar: null }), { deger: 0, dayanak: null, kalanAdet: null, planaGore: false });
    assert.equal(bayatPlan({ ...t, sonCanliyaAlma: null, simdi: 1, planGerisi: 0, acikIs: 0 }), null);
    assert.equal(bayatPlan({ ...t, esikSaat: null }), null);
  });

  test('AR-EK-7: olay açılır, sürerken güncellenir, hüküm kalkınca kapanır', () => {
    const h = { deger: 1, dayanak: null, kalanAdet: null, planaGore: false };
    assert.deepEqual(eksikEylemi(false, h), { tur: 'ac', h });
    assert.deepEqual(eksikEylemi(true, h), { tur: 'guncelle', h });
    assert.deepEqual(eksikEylemi(true, null), { tur: 'kapat' });
    assert.deepEqual(eksikEylemi(false, null), { tur: 'yok' });
  });
});
