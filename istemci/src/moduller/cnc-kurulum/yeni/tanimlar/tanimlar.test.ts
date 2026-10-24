import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../depo.ts';
import { D, defaults } from '../durum.ts';
import { allMachines, allMaterials, byId, dirtyUsage, machNoDup } from '../secici.ts';
import {
  deleteMachine, deleteMat, isCustomMachine, malzemeAlanlari, saveMachine, saveMat, sayi, setMachineNo, tezgahAlanlari, YENI_TEZGAH,
  type Malzeme, type Tezgah,
} from './tanimlar.ts';

vi.mock('../depo.ts', async (asil) => ({ ...await asil<object>(), save: vi.fn() }));

function sifirla(): void {
  for (const k of Object.keys(state)) delete (state as Record<string, unknown>)[k];
  Object.assign(state, defaults());
  dirtyUsage();
}
const katalogTezgahi = (): Tezgah => (D.MACHINES as Tezgah[])[0]!;
const katalogMalzemesi = (): Malzeme => (D.MATERIALS as Malzeme[])[0]!;

describe('sayı alanı', () => {
  it('ondalık virgül kabul edilir, boş ya da sayı olmayan varsayılana döner', () => {
    expect(sayi('7,85', 1)).toBe(7.85);
    expect(sayi('', 3)).toBe(3);
    expect(sayi('x', 3)).toBe(3);
  });
});

describe('tezgâh tanımı', () => {
  beforeEach(sifirla);

  it('yeni özel tezgâh: kimlik, kod metni, numara büyük harf, cep ve devir sınırı', () => {
    const f = { ...tezgahAlanlari(YENI_TEZGAH), no: 't-09', pockets: '500', rpm: '50' };
    const id = saveMachine('new', YENI_TEZGAH, f, 1000);
    expect(id).toBe('um_' + (1000).toString(36));
    const m = byId(allMachines(), id) as Tezgah;
    expect(m).toMatchObject({ no: 'T-09', pockets: 120, rpm: 100, code: 'Freze · HSK-A63 · Heidenhain' });
    expect(m.name).toBe('T-09 · Yeni Tezgâh');
    expect(isCustomMachine(id)).toBe(true);
  });

  it('torna tipinde bağlantı Taret olur; freze Taret alamaz', () => {
    const torna = saveMachine('new', YENI_TEZGAH, { ...tezgahAlanlari(YENI_TEZGAH), type: 'lathe', taper: 'BT40' }, 1);
    expect((byId(allMachines(), torna) as Tezgah).taper).toBe('Taret');
    const freze = saveMachine('new', YENI_TEZGAH, { ...tezgahAlanlari(YENI_TEZGAH), type: 'mill', taper: 'Taret' }, 2);
    expect((byId(allMachines(), freze) as Tezgah).taper).toBe('HSK-A63');
  });

  it('katalog tezgâhı yalnız mo üzerinden değişir (no, ad, cep, devir)', () => {
    const m = katalogTezgahi();
    saveMachine('edit', m, { ...tezgahAlanlari(m), name: 'Yeni ad', pockets: '20' });
    expect(state.mo[m.id]).toMatchObject({ name: 'Yeni ad', pockets: 20 });
    expect(isCustomMachine(m.id)).toBe(false);
  });

  it('numara tekrarı uyarısı için tabloda aynı numara iki tezgâhta görünür', () => {
    const [a, b] = allMachines() as Tezgah[];
    setMachineNo(a!.id, 'x1');
    setMachineNo(b!.id, 'X1');
    expect(Object.keys(machNoDup())).toEqual(['X1']);
  });

  it('silme kurulum ve atama kayıtlarını da siler; seçili tezgâh katalogdakine döner', () => {
    const id = saveMachine('new', YENI_TEZGAH, tezgahAlanlari(YENI_TEZGAH), 5);
    state.machine = id;
    (state.tools as Record<string, unknown>)[id] = ['empty'];
    (state.active as Record<string, unknown>)[id] = { a: 1 };
    deleteMachine(id);
    expect(byId(allMachines(), id)).toBeNull();
    expect(state.tools[id]).toBeUndefined();
    expect(state.active[id]).toBeUndefined();
    expect(state.machine).toBe(katalogTezgahi().id);
  });
});

describe('iş malzemesi tanımı', () => {
  beforeEach(sifirla);

  it('yeni malzeme: ISO rengi, kod, etiket ve boş bırakılmayan zorluk alanları', () => {
    const f = { ...malzemeAlanlari(katalogMalzemesi()), name: 'Deneme alaşım', iso: 'N', vcK: '300', beh: { eng: '1,2', apT: '', nk: 'x', tune: '5' } };
    const id = saveMat('new', katalogMalzemesi(), f, 7);
    const m = byId(allMaterials(), id) as Malzeme;
    expect(id).toBe('ut_' + (7).toString(36));
    expect(m).toMatchObject({ name: 'Deneme alaşım', iso: 'N', code: 'ISO N', tags: 'Vc karbür ≈ 300 m/dk', kind: 'mat', beh: { eng: 1.2, tune: 5 } });
    expect(m.isoCol).toBe((D.ISO as Record<string, string>).N);
  });

  it('katalog malzemesi matO üzerine yazılır; özel malzeme yerinde güncellenir', () => {
    const k = katalogMalzemesi();
    saveMat('edit', k, { ...malzemeAlanlari(k), rho: '2,7' });
    expect((state.matO as Record<string, Malzeme>)[k.id]!.rho).toBe(2.7);
    const id = saveMat('new', k, malzemeAlanlari(k), 9);
    saveMat('edit', byId(allMaterials(), id) as Malzeme, { ...malzemeAlanlari(k), name: 'Ad2' });
    expect((byId(allMaterials(), id) as Malzeme).name).toBe('Ad2');
  });

  it('silinen seçili malzeme kataloğun ilkine döner', () => {
    const id = saveMat('new', katalogMalzemesi(), malzemeAlanlari(katalogMalzemesi()), 11);
    state.material = id;
    deleteMat(id);
    expect(byId(allMaterials(), id)).toBeNull();
    expect(state.material).toBe(katalogMalzemesi().id);
  });
});
