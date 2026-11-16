import { describe, expect, it } from 'vitest';
import { modelHamOnerileri, type FormGeregi, type HazirGrup, type OneriFormu } from './model-onerisi.ts';

const G: Record<OneriFormu, HazirGrup[]> = {
  cubuk: [{ id: 'd', keys: ['d'], vals: [[40], [45], [50], [55], [105], [110]] }, { id: 'l', keys: ['l'], vals: [[3000], [6000]] }],
  altigen: [{ id: 's', keys: ['s'], vals: [[46], [50], [55]] }, { id: 'l', keys: ['l'], vals: [[3000]] }],
  lama: [{ id: 'ab', keys: ['a', 'b'], vals: [[100, 20], [60, 50], [50, 50]] }, { id: 'l', keys: ['l'], vals: [[6000]] }],
  levha: [{ id: 't', keys: ['t'], vals: [[10], [20], [25]] }, { id: 'plaka', keys: ['w', 'l'], vals: [[1500, 3000]] }],
  blok: [],
};
const HEPSI = ['cubuk', 'altigen', 'lama', 'levha', 'blok'];
const gruplar = (f: OneriFormu) => G[f];
const fg = (form: string, olcu: Record<string, number> | null, kesimBoyuMm: number | null = null, kesimEnMm: number | null = null): FormGeregi =>
  ({ form, olcu, kesimBoyuMm, kesimEnMm });

// Mil Ø46 x 118, pay 2, kesme 3: sunucunun en az ölçüsü (3D Atölyesi ile aynı hesap).
const MIL: FormGeregi[] = [
  fg('cubuk', { d: 50 }, 125), fg('altigen', { s: 50 }, 125), fg('lama', { a: 50, b: 50 }, 125), fg('levha', null),
  fg('blok', { a: 122, b: 50, h: 50 }), fg('boru', null), fg('disk', null),
];

describe('modelden ham önerisi (3243 a, 3321-1)', () => {
  it('mil: kesit standarda yukarı yuvarlanır, kesim boyu sunucudan, en az talaş önce', () => {
    const l = modelHamOnerileri(MIL, 142000, HEPSI, gruplar);
    expect(l.map((o) => o.form)).toEqual(['cubuk', 'altigen', 'lama', 'blok']);
    const [cubuk, altigen, lama, blok] = l;
    expect(cubuk).toMatchObject({ dims: { d: 50, l: 3000 }, kesimBoyuMm: 125, standartDisi: false });
    expect(cubuk!.hamHacimMm3).toBeCloseTo(Math.PI * 625 * 125, 6);
    expect(cubuk!.talas).toBeCloseTo(1 - 142000 / (Math.PI * 625 * 125), 6);
    expect(altigen!.dims).toEqual({ s: 50, l: 3000 });
    // 50 × 50 kesit 60 × 50'den küçük; ikisi de sığar, küçüğü seçilir.
    expect(lama!.dims).toEqual({ a: 50, b: 50, l: 6000 });
    // Blok 5 mm'ye yukarı yuvarlanır.
    expect(blok).toMatchObject({ dims: { a: 125, b: 50, h: 50 }, kesimBoyuMm: null });
  });

  it('flanş (dönel kısa eksen): çubuk sunucunun çapı ve kalınlık boyunda kesilir; uygun olmayan form önerilmez', () => {
    const FLANS = [fg('cubuk', { d: 104 }, 17), fg('levha', null), fg('disk', { d: 104, t: 14 })];
    const l = modelHamOnerileri(FLANS, 67700, HEPSI, gruplar);
    expect(l.map((o) => o.form)).toEqual(['cubuk']);
    expect(l[0]).toMatchObject({ dims: { d: 105, l: 3000 }, kesimBoyuMm: 17 });
  });

  it('listede sığan yoksa 1 mm yukarı yuvarlanır ve standart dışı işaretlenir', () => {
    expect(modelHamOnerileri([fg('cubuk', { d: 115.2 }, 140)], null, ['cubuk'], gruplar)[0]).toMatchObject({ dims: { d: 116 }, standartDisi: true });
  });

  it('levha: kalınlık standarda, forma kesim ölçüsü yazılır (plakanın tamamı değil)', () => {
    const l = modelHamOnerileri([fg('levha', { t: 20 }, 165, 95)], 196000, HEPSI, gruplar);
    expect(l[0]).toMatchObject({ form: 'levha', dims: { t: 20, w: 95, l: 165 }, kesimEnMm: 95, kesimBoyuMm: 165 });
  });

  it('levhadan kesim plakaya sığmıyorsa ya da kalınlık standart dışıysa levha önerilmez', () => {
    expect(modelHamOnerileri([fg('levha', { t: 20 }, 3510, 95)], null, HEPSI, gruplar)).toEqual([]);
    expect(modelHamOnerileri([fg('levha', { t: 30 }, 165, 95)], null, HEPSI, gruplar)).toEqual([]);
  });

  it('ailenin izin vermediği ve sihirbazda olmayan form önerilmez', () => {
    expect(modelHamOnerileri(MIL, null, ['cubuk', 'boru'], gruplar).map((o) => o.form)).toEqual(['cubuk']);
    expect(modelHamOnerileri([fg('boru', { D: 60, t: 5 }, 125)], null, ['boru'], gruplar)).toEqual([]);
  });

  it('parça hacmi yoksa talaş bilinmiyor (null), sıfır uydurulmaz', () => {
    expect(modelHamOnerileri(MIL, null, ['cubuk'], gruplar)[0]!.talas).toBeNull();
  });
});
