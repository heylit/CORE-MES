import { describe, expect, it } from 'vitest';
import { NUMUNE_REDDI_GEREKCESIZ, NUMUNE_REDDI_OLCUSUZ, numuneDugmeleri, numuneReddiEksigi, retGerekcesiMetni, secinceOlcumeAlinir, yeniNumuneYamasi, sonNumuneDurumu } from '../../../../arkon/web/src/data/numune.ts';

// Uçtan uca deneme 2. tur: kalite ilk parçayı ölçü girmeden ve gerekçesiz reddedebiliyordu; terminal yenilenince ret görünmüyordu.
describe('ilk parça numunesi reddi', () => {
  it('ölçü ve gerekçe olmadan ret yok', () => {
    expect(numuneReddiEksigi(0, 'çapak')).toBe(NUMUNE_REDDI_OLCUSUZ);
    expect(numuneReddiEksigi(1, '  ')).toBe(NUMUNE_REDDI_GEREKCESIZ);
    expect(numuneReddiEksigi(1, undefined)).toBe(NUMUNE_REDDI_GEREKCESIZ);
    expect(numuneReddiEksigi(1, 'çapak')).toBeNull();
  });

  const plan = [{ id: 1, nom: 'Ø40' }, { id: 2, nom: 'L18' }];
  it('son numune reddedildiyse ret, ölçü dışı değerler ve gerekçeyle terminale döner', () => {
    const numuneler = [
      { id: 'a', pkgId: 'P1', at: 1, status: 'approved' },
      { id: 'b', pkgId: 'P1', at: 5, status: 'rejected', items: [1, 2], results: { 1: { v: 40.2, ok: false }, 2: { v: 18, ok: true } }, note: 'çap büyük', decidedAt: 9 },
      { id: 'c', pkgId: 'P2', at: 7, status: 'waiting', items: [1] },
    ];
    expect(sonNumuneDurumu(numuneler, 'P1', plan)).toEqual({ lastDecision: { status: 'rejected', bad: 'Ø40 = 40.2', note: 'çap büyük', at: 9 } });
  });
  it('kalitede bekleyen numune bekliyor olarak döner; onaylı ya da numunesi olmayan işte durum yok', () => {
    expect(sonNumuneDurumu([{ id: 'c', pkgId: 'P2', at: 7, status: 'measuring', items: [1, 2] }], 'P2')).toEqual({ pendingReq: 'c', pendingItems: [1, 2], pendingAt: 7 });
    expect(sonNumuneDurumu([{ id: 'b', pkgId: 'P1', at: 5, status: 'rejected' }, { id: 'd', pkgId: 'P1', at: 8, status: 'approved' }], 'P1')).toBeNull();
    expect(sonNumuneDurumu([], 'P1')).toBeNull();
  });
});

// Kullanıcı kararı 17.10: numune isteği yalnız ölçüm yetkisi olan kişi seçince Ölçülüyor'a geçer; öteki roller yalnız görür (sunucu 403 verirdi).
describe('numune seçilince ölçüme alınır mı', () => {
  it('bekleyen istek yalnız ölçüm yetkisiyle ölçüme alınır', () => {
    expect(secinceOlcumeAlinir('waiting', true)).toBe(true);
    expect(secinceOlcumeAlinir('waiting', false)).toBe(false);
  });
  it('bekleme dışındaki istek yetkiden bağımsız değişmez', () => {
    expect(['measuring', 'approved', 'rejected', 'deviation', undefined].map((d) => secinceOlcumeAlinir(d, true))).toEqual([false, false, false, false, false]);
  });
});

// Akış A provası O3: ret gerekçesi kalitede yazılıyordu ama teknik resimdeki "ölçüldü · red" satırında görünmüyordu.
describe('ret gerekçesi satırı', () => {
  it('son karar redse gerekçe kırpılıp döner', () => {
    expect(retGerekcesiMetni({ status: 'rejected', note: '  Cap tolerans disi  ' })).toBe('Cap tolerans disi');
  });
  it('gerekçe yoksa, boşsa ya da karar ret değilse metin yok', () => {
    expect(retGerekcesiMetni({ status: 'rejected', note: null })).toBeNull();
    expect(retGerekcesiMetni({ status: 'rejected', note: '   ' })).toBeNull();
    expect(retGerekcesiMetni({ status: 'approved', note: 'tamam' })).toBeNull();
    expect(retGerekcesiMetni(null)).toBeNull();
    expect(retGerekcesiMetni(undefined)).toBeNull();
  });
});

// Akış A provası O3: otomatik numune retten hemen sonra yeni istek gönderiyor ve ret kartı gerekçesiyle birlikte siliniyordu.
describe('yeni numune gönderilince ret kartı', () => {
  it('bekleyen istek yazılır, son ret kararı ve gerekçesi yeni karar gelene kadar kalır', () => {
    const is = { no: 'E1', lastDecision: { status: 'rejected', bad: 'Ø40 = 40.2', note: 'Cap tolerans disi', at: 9 } };
    const yeni = Object.assign({}, is, yeniNumuneYamasi({ id: 'rq2', items: [1], at: 20 }));
    expect(yeni.pendingReq).toBe('rq2');
    expect(yeni.lastDecision).toEqual(is.lastDecision);
    expect(retGerekcesiMetni(yeni.lastDecision)).toBe('Cap tolerans disi');
  });
});

// Kullanıcı kararı 18.10 (107 a): numune kararı ve kalite ölçümü düğmelerini yalnız yetkili rol görür (q.decide, q.meas); basınca sunucu reddederdi.
describe('numune düğmelerinin görünürlüğü', () => {
  it('ölçüm girişi q.meas, karar düğmeleri q.decide ile açılır; ikisi birbirinden bağımsızdır', () => {
    expect(numuneDugmeleri({ olcebilir: true, karar: true })).toEqual({ olcum: true, karar: true });
    expect(numuneDugmeleri({ olcebilir: false, karar: true })).toEqual({ olcum: false, karar: true });
    expect(numuneDugmeleri({ olcebilir: true, karar: false })).toEqual({ olcum: true, karar: false });
    expect(numuneDugmeleri({ olcebilir: false, karar: false })).toEqual({ olcum: false, karar: false });
  });
});
