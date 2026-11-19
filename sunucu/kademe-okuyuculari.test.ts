import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Islem } from '#paylasilan/islemler.ts';
import { bakimKademeKayitlari, kalibrasyonKademeKayitlari, siparisTerminKademeKayitlari, siparisTerminRiskiKademeKayitlari } from './kablolama.ts';

// Kablolamadaki kademe okuyucularının eşlemesi: açık kayıt kimliği, son günü ve alıcılarıyla döner; kapanma koşulundaki kayıt dönmez.
const SAHIPLER: Partial<Record<Islem, number[]>> = {
  'kalibrasyon.yaz': [11], 'arkon.bakim': [21], 'arkon.amir': [22], 'siparisler.yaz': [31], 'siparisler.onayla': [32],
};
const sahip = (i: Islem): number[] => SAHIPLER[i] ?? [];

test('kalibrasyon vadesi: vadeli alet döner; kullanım dışı, kayıtsız ve vadesiz alet dönmez (3405)', () => {
  const alet = (id: number, durum: 'gecmis' | 'yaklasan' | 'gecerli' | 'kullanim-disi' | 'kayit-yok', vade: string | null = '2030-01-10') =>
    ({ id, no: `ORN-KAL-${String(id)}`, turId: 1, tur: 'Kumpas', vade, durum });
  const l = kalibrasyonKademeKayitlari([alet(1, 'yaklasan'), alet(2, 'kullanim-disi'), alet(3, 'kayit-yok'), alet(4, 'gecmis', null), alet(5, 'gecmis', '2029-12-01')], sahip);
  assert.deepEqual(l.map((k) => [k.kayit, k.no, k.sonGun, k.yapanlar, k.yoneticiler]), [
    ['1:2030-01-10', 'ORN-KAL-1', '2030-01-10', [11], []],
    ['5:2029-12-01', 'ORN-KAL-5', '2029-12-01', [11], []],
  ]);
});

test('bakım vadesi: son yapılmadan gün eklenir; hiç yapılmamış plan dönmez; yapan bakım, yönetici amir (3405)', () => {
  const plan = (kimlik: string, sonYapilma: Date | null) => ({ kimlik, makineKod: 'ORN-M1', baslik: '', herGun: 30, sureDk: null, sonYapilma });
  const l = bakimKademeKayitlari([plan('p1', new Date('2030-01-01T09:00:00Z')), plan('p2', null)], sahip);
  assert.deepEqual(l.map((k) => [k.kayit, k.sonGun, k.no, k.baslik, k.yapanlar, k.yoneticiler]), [['p1:2030-01-31', '2030-01-31', 'ORN-M1', 'ORN-M1', [21], [22]]]);
});

test('satış siparişi termini: biten kayıt dönmez; numarası olmayan kimliğiyle; yapan yazan, yönetici onaylayan (3405)', () => {
  const kayit = (kimlik: string, bitti: boolean, no: string | null = `ORN-SS-${kimlik}`) =>
    ({ kaynak: 'siparis' as const, kimlik, tarih: '2030-01-15', no, baslik: 'Termin', ilgili: null, durum: 'Açık', bitti });
  const l = siparisTerminKademeKayitlari([kayit('a', false), kayit('b', true), kayit('c', false, null)], sahip);
  assert.deepEqual(l.map((k) => [k.kayit, k.no, k.sonGun, k.yapanlar, k.yoneticiler]), [
    ['a:2030-01-15', 'ORN-SS-a', '2030-01-15', [31], [32]],
    ['c:2030-01-15', 'c', '2030-01-15', [31], [32]],
  ]);
});

test('satış siparişi termin riski: kayıt sipariş ve riskli termin döneminde; numara yoksa kimlik; yol siparişin kendisi (3429-2 D)', () => {
  const l = siparisTerminRiskiKademeKayitlari([{ siparisId: 7, termin: '2030-01-15', gun: 3 }, { siparisId: 8, termin: '2030-02-01', gun: 1 }], new Map([[7, 'ORN-SS-7']]), sahip);
  assert.deepEqual(l.map((k) => [k.kayit, k.no, k.baslik, k.yol, k.sonGun, k.yapanlar, k.yoneticiler]), [
    ['7:2030-01-15', 'ORN-SS-7', 'Sipariş ORN-SS-7: plan termini 3 gün aşıyor', '/siparisler/7', '2030-01-15', [31], [32]],
    ['8:2030-02-01', '8', 'Sipariş 8: plan termini 1 gün aşıyor', '/siparisler/8', '2030-02-01', [31], [32]],
  ]);
});
