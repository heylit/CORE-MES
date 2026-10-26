import { describe, expect, it } from 'vitest';
import { numuneSeridi, type SeritGirdisi } from '../../../../arkon/web/src/data/numune-seridi.ts';

// Değerler uydurmadır.
const KURALLAR: SeritGirdisi['kurallar'] = [
  { id: 'ilk', etiket: 'İlk parça', olcen: 'Kalite', ilk: true, olculer: [1, 2] },
  { id: 'her', etiket: 'Her 50 parça', olcen: 'Operatör', ilk: false, olculer: [3] },
  { id: 'saat', etiket: 'Her 60 dk', olcen: 'Kalite→Operatör', ilk: false, olculer: [4] },
  { id: 'bos', etiket: 'Son parça', olcen: 'Kalite', ilk: false, olculer: [] },
];
const girdi = (ek: Partial<SeritGirdisi> = {}): SeritGirdisi => ({ kurallar: KURALLAR, meas: {}, bekleyen: [], zamani: [], siradaki: null, ilkKarar: null, ...ek });
const durumlar = (g: SeritGirdisi) => Object.fromEntries(numuneSeridi(g).map((p) => [p.id, p.durum]));

describe('numune planı şeridi (566, 559 1)', () => {
  it('her kural bir parça; ölçüsüz kural gösterilmez; ilerleme geçen ölçü sayısıdır', () => {
    const l = numuneSeridi(girdi({ meas: { 1: { ok: true }, 2: { ok: false }, 3: { dev: true } } }));
    expect(l.map((p) => p.id)).toEqual(['ilk', 'her', 'saat']);
    expect(l[0]).toMatchObject({ etiket: 'İlk parça', olcen: 'Kalite', gecen: 1, toplam: 2 });
    expect(l[1]).toMatchObject({ durum: 'tamam', metin: 'Ölçüldü', gecen: 1, toplam: 1 });
    expect(l[2]).toMatchObject({ durum: 'bekliyor', gecen: 0 });
  });

  it('kalitedeki numune, zamanı gelen kontrol ve sıradaki kontrol kural kural görünür', () => {
    expect(durumlar(girdi({ bekleyen: [1, 2], zamani: [4], siradaki: { olcu: 3, v: 12, u: 'parça' } }))).toEqual({ ilk: 'kalitede', her: 'siradaki', saat: 'zamani' });
    const p = numuneSeridi(girdi({ siradaki: { olcu: 4, v: 25, u: 'dk' }, zamani: [3] }));
    expect(p.find((x) => x.id === 'saat')?.metin).toBe('25 dk sonra');
    expect(p.find((x) => x.id === 'her')?.metin).toBe('Zamanı geldi · 1 ölçü');
  });

  it('521 1 a: ilk parçanın durumu Kalite Merkezi kararıdır; ret yeni numune ister, kalitedeki yeni numune önce gelir', () => {
    expect(numuneSeridi(girdi({ ilkKarar: 'onay' }))[0]).toMatchObject({ durum: 'tamam', metin: 'Kalite Merkezi onayladı', gecen: 0 });
    expect(numuneSeridi(girdi({ ilkKarar: 'ret', zamani: [1, 2] }))[0]).toMatchObject({ durum: 'red' });
    expect(numuneSeridi(girdi({ ilkKarar: 'ret', bekleyen: [1] }))[0]).toMatchObject({ durum: 'kalitede' });
    expect(numuneSeridi(girdi({ ilkKarar: 'onay', zamani: [1] }))[0]).toMatchObject({ durum: 'zamani' });
  });

  it('plan yoksa şerit boştur', () => {
    expect(numuneSeridi(girdi({ kurallar: [] }))).toEqual([]);
  });
});
