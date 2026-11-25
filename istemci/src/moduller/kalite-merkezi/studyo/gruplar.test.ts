import { describe, expect, it } from 'vitest';
import type { KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { degisti, govdeOlustur, grupsuzOperasyonlar, operasyonBagla, taslakHatasi, taslakOlustur, yeniGrupAdi } from './gruplar.ts';

const resim = { gruplar: [
  { id: 1, ad: 'A', balonlar: [1, 2], operasyonlar: [{ operasyonId: 10, opNo: 10 }] },
  { id: 2, ad: 'B', balonlar: [3], operasyonlar: [] },
] } as unknown as KmResim;
const rota = [{ operasyonId: 10, opNo: 10 }, { operasyonId: 20, opNo: 20 }];

describe('Balon grubu taslağı (3693)', () => {
  it('KM-G1 kayıtlı plan taslağa döner; dokunulmamış taslak değişmemiş sayılır', () => {
    const t = taslakOlustur(resim);
    expect(t.map((g) => [g.id, g.ad, g.balonlar, g.operasyonlar])).toEqual([[1, 'A', [1, 2], [10]], [2, 'B', [3], []]]);
    expect(degisti(resim, t)).toBe(false);
    expect(degisti(resim, operasyonBagla(t, 'g2', 20))).toBe(true);
  });

  it('KM-G2 operasyon tek gruba bağlanır: başka gruptaysa oradan alınır', () => {
    const t = operasyonBagla(taslakOlustur(resim), 'g2', 10);
    expect(t.map((g) => g.operasyonlar)).toEqual([[], [10]]);
  });

  it('KM-G3 grupsuz operasyon uyarısı yalnız en az bir atama varken çıkar (eski parçada çıkmaz)', () => {
    expect(grupsuzOperasyonlar(taslakOlustur(resim), rota).map((o) => o.operasyonId)).toEqual([20]);
    const bos = taslakOlustur(resim).map((g) => ({ ...g, operasyonlar: [] }));
    expect(grupsuzOperasyonlar(bos, rota)).toEqual([]);
  });

  it('KM-G4 ad denetimi: boş ve büyük küçük harf farkıyla tekrar kaydedilmez; yeni ad boş harfi alır', () => {
    const t = taslakOlustur(resim);
    expect(taslakHatasi(t)).toBe(null);
    expect(taslakHatasi([...t, { ...t[0]!, anahtar: 'x', id: null, ad: 'a' }])).toBe('Bu adla grup zaten var.');
    expect(taslakHatasi([{ ...t[0]!, ad: '  ' }])).toBe('Grup adı boş olamaz.');
    expect(yeniGrupAdi(t)).toBe('C');
  });

  it('KM-G5 gövde: yeni grup kimliksiz, atama grup adıyla, balonlar sıralı', () => {
    const t = [...taslakOlustur(resim), { anahtar: 'y', id: null, ad: 'Çaplar', balonlar: [4, 3], operasyonlar: [20] }];
    expect(govdeOlustur(5, t)).toEqual({
      surum: 5,
      gruplar: [{ id: 1, ad: 'A', balonlar: [1, 2] }, { id: 2, ad: 'B', balonlar: [3] }, { ad: 'Çaplar', balonlar: [3, 4] }],
      atamalar: [{ operasyonId: 10, grup: 'A' }, { operasyonId: 20, grup: 'Çaplar' }],
    });
  });
});
