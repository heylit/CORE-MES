import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { degisimler, emirBitisleri, type OlcumYeri } from './olcum-kurallar.ts';

const yer = (isEmriId: number, kaynak: string, baslangic: number, bitis = baslangic + 60): OlcumYeri => ({ isEmriId, kaynak, baslangic, bitis });

describe('plan ölçümü kuralları (1470 a)', () => {
  test('tezgâhı değişen ya da 8 saatten çok kayan geçen iş değişmiştir; yakın olan eski başlangıcı 72 saat içinde olandır; geçmeyen sayılmaz', () => {
    const eski = [yer(1, 'm:1', 0), yer(2, 'm:1', 100), yer(3, 'm:1', 80 * 60), yer(4, 'm:2', 10), yer(5, 'm:2', 20)];
    const yeni = [yer(1, 'm:2', 0), yer(2, 'm:1', 100 + 8 * 60), yer(3, 'm:1', 80 * 60 + 9 * 60), yer(4, 'm:3', 10), yer(5, 'm:2', 20), yer(6, 'm:1', 0)];
    assert.deepEqual(degisimler(eski, yeni, new Set([1, 2, 3, 5, 6])), { degisen: 2, yakinDegisen: 1, yeni: 1 });
  });

  test('emrin tahmini bitişi işlerinin en geç bitişidir; bir işi yerleşmemişse bilinmez', () => {
    const isler = [{ id: 1, uretimEmriId: 10, teslim: '2030-04-10' }, { id: 2, uretimEmriId: 10, teslim: '2030-04-10' }, { id: 3, uretimEmriId: 20, teslim: null }];
    assert.deepEqual(emirBitisleri(isler, [yer(1, 'm:1', 0, 50), yer(2, 'm:1', 60, 120), yer(3, 'm:1', 0)]),
      [{ uretimEmriId: 10, bitis: 120, termin: '2030-04-10' }, { uretimEmriId: 20, bitis: 60, termin: null }]);
    assert.deepEqual(emirBitisleri(isler, [yer(2, 'm:1', 60, 120)]).map((e) => e.bitis), [null, null]);
  });
});
