import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../depo.ts';
import { D, defaults } from '../durum.ts';
import type { Tezgah as SunucuTezgahi, TezgahAyari } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { allMachines, allMaterials, byId, dirtyUsage, machine, machNoDup, sunucuTezgahSatirlari, tezgahKaynagi, tezgahlariKur } from '../secici.ts';
import {
  AYAR_EKSIK_ILETISI, deleteMachine, deleteMat, isCustomMachine, malzemeAlanlari, saveMachine, saveMat, sayi, setMachineNo, sunucuTezgahiKaydet, tezgahAlanlari,
  YENI_TEZGAH, type Malzeme, type Tezgah,
} from './tanimlar.ts';

vi.mock('../depo.ts', async (asil) => ({ ...await asil<object>(), save: vi.fn() }));
const sunucu = vi.hoisted(() => ({ yazilan: [] as unknown[] }));
vi.mock('../veri.ts', async (asil) => ({
  ...await asil<object>(),
  tezgahAyarYaz: vi.fn(async (t: SunucuTezgahi, ayar: TezgahAyari) => { sunucu.yazilan.push({ makineId: t.makineId, surum: t.surum, ayar }); return { ...t, ayar, surum: t.surum + 1 }; }),
}));

function sifirla(): void {
  for (const k of Object.keys(state)) delete (state as Record<string, unknown>)[k];
  Object.assign(state, defaults());
  tezgahlariKur(null);
  sunucu.yazilan = [];
  dirtyUsage();
}

// Makine kodları ve adları uydurmadır; F-01 gömülü tezgâhın numarasıdır (1192).
const AYAR: TezgahAyari = {
  tur: 'mill', kontrol: 'iso', konik: 'BT40', cepSayisi: 24, devir: 10000, isMiliDevri: null, canliTakim: false, canliDevir: null, elle: null, modelTuru: 'm_vmc',
};
const makine = (makineId: number, kod: string, ayar: TezgahAyari | null, aktif = true): SunucuTezgahi =>
  ({ makineId, kod, ad: `Deneme ${kod}`, istasyonId: 3, aktif, ayar, surum: ayar ? 1 : 0 });
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

describe('tezgâh listesi İstasyonlar\'dan (1091 a, 1139 b, 1192 a)', () => {
  beforeEach(sifirla);

  it('liste yoksa ya da hiçbir makinenin ayarı tam değilse gömülü liste kullanılır', () => {
    expect(tezgahKaynagi()).toBe('gomulu');
    tezgahlariKur([makine(7, 'X-01', null)]);
    expect(tezgahKaynagi()).toBe('gomulu');
    expect(allMachines().length).toBe(D.MACHINES.length);
    expect(sunucuTezgahSatirlari()?.map((x) => [x.tezgah.id, x.tam])).toEqual([['mk7', false]]);
  });

  it('kodu gömülü numarayla aynı makine gömülü kimliği ve değerleri alır; kayıttaki seçim ve düzeltme ona okunur; ad İstasyonlar\'dandır', () => {
    const g = katalogTezgahi();
    state.machine = g.id;
    state.mo[g.id] = { pockets: 40, name: 'Kayıttaki ad' };
    tezgahlariKur([makine(5, g.no!, null), makine(6, 'Y-01', AYAR), makine(8, 'Z-01', null), makine(9, 'P-01', AYAR, false)]);
    expect(tezgahKaynagi()).toBe('sunucu');
    expect(allMachines().map((m) => m.id)).toEqual([g.id, 'mk6']);
    expect(machine()).toMatchObject({ id: g.id, no: g.no, baseName: `Deneme ${g.no!}`, pockets: 40, taper: g.taper, makineId: 5 });
    expect(byId(allMachines(), 'mk6')).toMatchObject({ type: 'mill', ctrl: 'iso', taper: 'BT40', pockets: 24, rpm: 10000, kind: 'm_vmc', code: 'Freze · BT40 · ISO' });
  });

  it('sunucudaki ayar gömülü değerin, kayıttaki düzeltme ayarın önüne geçer; pasif makine yalnız seçiliyse kalır', () => {
    const g = katalogTezgahi();
    state.mo[g.id] = { rpm: 9000 };
    tezgahlariKur([makine(5, g.no!, { ...AYAR, cepSayisi: 12 }), makine(9, 'P-01', AYAR, false)]);
    expect(machine()).toMatchObject({ pockets: 12, rpm: 9000, taper: 'BT40' });
    state.machine = 'mk9';
    expect(allMachines().map((m) => m.id)).toEqual([g.id, 'mk9']);
  });

  it('ayar sunucuya sürümüyle yazılır; yazılan alanların kayıttaki düzeltmesi düşer', async () => {
    const g = katalogTezgahi();
    state.mo[g.id] = { rpm: 9000, info: { not: 'kalır' } } as Partial<Tezgah>;
    tezgahlariKur([makine(5, g.no!, null)]);
    const satir = sunucuTezgahSatirlari()![0]!;
    await sunucuTezgahiKaydet(satir, { ...tezgahAlanlari(satir.tezgah), pockets: '36', rpm: '14000', taper: 'Taret' });
    expect(sunucu.yazilan).toEqual([{ makineId: 5, surum: 0, ayar: expect.objectContaining({ cepSayisi: 36, devir: 14000, konik: 'HSK-A63', tur: g.type }) }]);
    expect(state.mo[g.id]).toEqual({ info: { not: 'kalır' } });
    expect(sunucuTezgahSatirlari()![0]!.sunucu.surum).toBe(1);
    expect(machine()).toMatchObject({ pockets: 36, rpm: 14000 });
  });

  it('cep ya da devir boşsa yazılmaz', async () => {
    tezgahlariKur([makine(8, 'Z-01', null)]);
    const satir = sunucuTezgahSatirlari()![0]!;
    await expect(sunucuTezgahiKaydet(satir, { ...tezgahAlanlari(satir.tezgah), pockets: '', rpm: '1000' })).rejects.toThrow(AYAR_EKSIK_ILETISI);
    expect(sunucu.yazilan).toEqual([]);
  });
});
