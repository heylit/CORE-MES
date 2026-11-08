import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tesisGunBasi } from '#paylasilan/tesis-zamani.ts';
import { VARSAYILAN_SURE_DK, bakimAraliklari, bakimBaslangici, bakimGunleri, type BakimPlani } from './kurallar.ts';

// 2319 (2311 S10): Arkon periyodik bakımının plan aralıkları. Veriler uydurmadır.
const BUGUN = '2026-11-09';
const SIMDI = tesisGunBasi(BUGUN) + 10 * 3_600_000; // 10:00
const an = (gun: string, saat: number) => new Date(tesisGunBasi(gun) + saat * 3_600_000).toISOString();
const vardiya = (gun: string) => ({ baslangic: an(gun, 8), bitis: an(gun, 16) });
const plan = (p: Partial<BakimPlani> = {}): BakimPlani => ({ kimlik: 'pl-1', makineKod: 'T1', baslik: 'Yağ', herGun: 7, sureDk: 90, sonYapilma: new Date(an('2026-11-05', 9)), ...p });

describe('bakım aralığı kuralları', () => {
  test('BM-01: günler son yapılıştan herGun sonra başlar, ufuk boyunca tekrarlar', () => {
    assert.deepEqual(bakimGunleri(plan(), BUGUN, 14), ['2026-11-12', '2026-11-19']);
  });

  test('BM-02: vadesi geçmişse önce bugün, sonra bugünden sonraki ilk vade', () => {
    assert.deepEqual(bakimGunleri(plan({ sonYapilma: new Date(an('2026-10-20', 9)) }), BUGUN, 10), [BUGUN, '2026-11-10', '2026-11-17']);
  });

  test('BM-03: son yapılış yoksa vade bugün; gün sayısı geçersizse boş', () => {
    assert.deepEqual(bakimGunleri(plan({ sonYapilma: null, herGun: 30 }), BUGUN, 10), [BUGUN]);
    assert.deepEqual(bakimGunleri(plan({ herGun: 0 }), BUGUN), []);
  });

  test('BM-04: başlangıç günün ilk çalışma aralığı; gün çalışmıyorsa sonraki; bugün ise şimdiden; takvimsizde gün başı', () => {
    const t = [vardiya('2026-11-09'), vardiya('2026-11-11')];
    assert.equal(bakimBaslangici(t, '2026-11-09', SIMDI), SIMDI);
    assert.equal(bakimBaslangici(t, '2026-11-10', SIMDI), Date.parse(an('2026-11-11', 8)));
    assert.equal(bakimBaslangici(t, '2026-11-12', SIMDI), null);
    assert.equal(bakimBaslangici(null, '2026-11-12', SIMDI), tesisGunBasi('2026-11-12'));
  });

  test('BM-05: aralık makine kimliği, duvar saati ve süreyle; makinesi bilinmeyen atlanır; süre yoksa varsayılan', () => {
    const takvim = new Map([[100, [vardiya('2026-11-12'), vardiya('2026-11-19')]]]);
    const l = bakimAraliklari([plan(), plan({ kimlik: 'pl-2', makineKod: 'YOK' }), plan({ kimlik: 'pl-3', sureDk: null, herGun: 14 })], new Map([['T1', 100]]), takvim, SIMDI, 14);
    assert.deepEqual(l, [
      { anahtar: 'pl-1|2026-11-12', m: '100', bas: '2026-11-12 08:00', bit: '2026-11-12 09:30', baslik: 'Yağ' },
      { anahtar: 'pl-1|2026-11-19', m: '100', bas: '2026-11-19 08:00', bit: '2026-11-19 09:30', baslik: 'Yağ' },
      { anahtar: 'pl-3|2026-11-19', m: '100', bas: '2026-11-19 08:00', bit: `2026-11-19 0${String(8 + VARSAYILAN_SURE_DK / 60)}:00`, baslik: 'Yağ' },
    ]);
  });
});
