import { describe, expect, it } from 'vitest';
import { modelHamOnerileri, kesitYuvarlak, type HazirGrup, type ModelOlcusu, type OneriFormu } from './model-onerisi.ts';

const MIL: ModelOlcusu = { a: 118, b: 46, c: 46, cap: 46, hacimMm3: 142000 };
const PLAKA: ModelOlcusu = { a: 160, b: 90, c: 18, cap: 91.8, hacimMm3: 196000 };
const G: Record<OneriFormu, HazirGrup[]> = {
  cubuk: [{ id: 'd', keys: ['d'], vals: [[40], [45], [50], [55]] }, { id: 'l', keys: ['l'], vals: [[3000], [6000]] }],
  altigen: [{ id: 's', keys: ['s'], vals: [[46], [50], [55]] }, { id: 'l', keys: ['l'], vals: [[3000]] }],
  lama: [{ id: 'ab', keys: ['a', 'b'], vals: [[100, 20], [60, 50], [50, 50]] }, { id: 'l', keys: ['l'], vals: [[6000]] }],
  levha: [{ id: 't', keys: ['t'], vals: [[10], [20], [25]] }, { id: 'plaka', keys: ['w', 'l'], vals: [[1500, 3000]] }],
  blok: [],
};
const HEPSI = ['cubuk', 'altigen', 'lama', 'levha', 'blok'];
const gruplar = (f: OneriFormu) => G[f];

describe('modelden ham önerisi (3243 a)', () => {
  it('mil: kesit standarda yukarı yuvarlanır, boy uzun eksen + iki pay + kesme payı, en az talaş önce', () => {
    const l = modelHamOnerileri(MIL, 2, 3, HEPSI, gruplar);
    expect(l.map((o) => o.form)).toEqual(['cubuk', 'altigen', 'lama', 'blok']);
    const [cubuk, altigen, lama, blok] = l;
    expect(cubuk).toMatchObject({ dims: { d: 50, l: 3000 }, kesimBoyuMm: 125, standartDisi: false });
    expect(cubuk!.hamHacimMm3).toBeCloseTo(Math.PI * 625 * 125, 6);
    expect(cubuk!.talas).toBeCloseTo(1 - 142000 / (Math.PI * 625 * 125), 6);
    expect(altigen!.dims).toEqual({ s: 50, l: 3000 });
    // 50 × 50 kesit 60 × 50'den küçük; ikisi de sığar, küçüğü seçilir.
    expect(lama!.dims).toEqual({ a: 50, b: 50, l: 6000 });
    expect(blok).toMatchObject({ dims: { a: 125, b: 50, h: 50 }, kesimBoyuMm: null });
  });

  it('virgüllü pay sayıya çevrilmiş gelir; pay büyüyünce çap bir üst standarda çıkar', () => {
    expect(modelHamOnerileri(MIL, 2.5, 3, ['cubuk'], gruplar)[0]).toMatchObject({ dims: { d: 55 }, kesimBoyuMm: 126 });
  });

  it('listede sığan yoksa 1 mm yukarı yuvarlanır ve standart dışı işaretlenir', () => {
    const o = modelHamOnerileri(MIL, 10, 0, ['cubuk'], gruplar)[0];
    expect(o).toMatchObject({ dims: { d: 66 }, standartDisi: true });
  });

  it('plaka parça: levhadan kesim önerilir (kalınlık standarda, en ve boy kesim ölçüsü)', () => {
    const l = modelHamOnerileri(PLAKA, 1, 3, HEPSI, gruplar);
    const levha = l.find((o) => o.form === 'levha');
    expect(levha).toMatchObject({ dims: { t: 20, w: 1500, l: 3000 }, kesimEnMm: 92, kesimBoyuMm: 165 });
    expect(l[0]!.form).toBe('levha');
  });

  it('ailenin izin vermediği form önerilmez; geçersiz pay ya da ölçüde öneri yok', () => {
    expect(modelHamOnerileri(MIL, 2, 3, ['cubuk', 'boru'], gruplar).map((o) => o.form)).toEqual(['cubuk']);
    expect(modelHamOnerileri(MIL, -1, 3, HEPSI, gruplar)).toEqual([]);
    expect(modelHamOnerileri(MIL, Number.NaN, 3, HEPSI, gruplar)).toEqual([]);
    expect(modelHamOnerileri({ ...MIL, a: 0 }, 2, 3, HEPSI, gruplar)).toEqual([]);
  });

  it('parça hacmi yoksa talaş bilinmiyor (null), sıfır uydurulmaz', () => {
    expect(modelHamOnerileri({ ...MIL, hacimMm3: null }, 2, 3, ['cubuk'], gruplar)[0]!.talas).toBeNull();
  });

  it('kare kesitte çubuk ve altıgen kesiti kapsayan daireye göre seçilir (kenara göre değil)', () => {
    // 40 × 40 kare kesit: kapsayan daire köşegen, 56,6; kenar 40 olsaydı d40 önerilirdi.
    const KARE: ModelOlcusu = { a: 100, b: 40, c: 40, cap: 56.6, hacimMm3: 160000 };
    const l = modelHamOnerileri(KARE, 0, 0, ['cubuk', 'altigen'], gruplar);
    expect(l.find((o) => o.form === 'cubuk')).toMatchObject({ dims: { d: 57 }, standartDisi: true });
    expect(l.find((o) => o.form === 'altigen')).toMatchObject({ dims: { s: 57 }, standartDisi: true });
  });

  it('levhadan kesim plakaya sığmıyorsa levha önerilmez', () => {
    // Boy 3500 + paylar, plaka 1500 × 3000: sığmaz.
    const UZUN: ModelOlcusu = { ...PLAKA, a: 3500 };
    expect(modelHamOnerileri(UZUN, 1, 3, HEPSI, gruplar).map((o) => o.form)).not.toContain('levha');
    expect(modelHamOnerileri(PLAKA, 1, 3, HEPSI, gruplar).map((o) => o.form)).toContain('levha');
  });

  it('kesit yuvarlak mı: mil evet, plaka hayır', () => {
    expect([kesitYuvarlak(MIL), kesitYuvarlak(PLAKA)]).toEqual([true, false]);
  });
});
