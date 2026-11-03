import { describe, expect, it } from 'vitest';
import type { Tezgah, TezgahAyari } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { makineListesi, modelUret } from './model-uret.ts';

// Makine kodları ve adları uydurmadır.
const AYAR: TezgahAyari = {
  tur: 'mill', kontrol: 'iso', konik: 'BT40', cepSayisi: 24, devir: 12000, isMiliDevri: null, canliTakim: null, canliDevir: null, elle: null, modelTuru: null,
};
const tezgah = (makineId: number, kod: string, ad: string, d: Partial<Tezgah> = {}): Tezgah => ({
  makineId, kod, ad, istasyonId: 40 + makineId, aktif: true, ayar: AYAR, surum: 1, ...d,
});
const TEZGAHLAR: Tezgah[] = [
  tezgah(1, 'F-11', 'Dik işlem'),
  tezgah(2, 'T-12', 'Torna', { ayar: { ...AYAR, tur: 'lathe', konik: 'VDI30', modelTuru: 'm_lathe' }, istasyonId: null }),
  tezgah(3, 'F-13', 'Ayarı eksik', { ayar: { ...AYAR, kontrol: null } }),
  tezgah(4, 'F-14', 'Ayarsız', { ayar: null }),
  tezgah(5, 'F-15', 'Pasif', { aktif: false }),
];
// Elle eklenen makine artık listeye girmez; düzeltme (mo) yalnız ad ve numara dışındaki alanları değiştirir.
const KAYIT = JSON.stringify({
  customMachines: [{ id: 'cm1', no: 'F-77', name: 'Elle freze', kind: 'm_vmc' }],
  mo: { mk1: { name: 'Düzeltilmiş ad', no: '', kind: 'm_lathe' } },
});

function glbJson(b: Uint8Array): { meshes?: unknown[]; asset?: { version?: string } } {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const uzunluk = v.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + uzunluk))) as never;
}

describe('Çizim Merkezi için makine modeli (1135 a, 1986)', () => {
  it('liste aktif CNC makineleridir; ayarı eksik olan işaretli gelir, pasif, gömülü ve elle eklenen makine gelmez (1988 b)', () => {
    expect(makineListesi(TEZGAHLAR, KAYIT)).toEqual([
      { makineId: 'mk1', no: 'F-11', ad: 'Dik işlem', istasyonId: 41, eksik: false },
      { makineId: 'mk2', no: 'T-12', ad: 'Torna', istasyonId: null, eksik: false },
      { makineId: 'mk3', no: 'F-13', ad: 'Ayarı eksik', istasyonId: 43, eksik: true },
      { makineId: 'mk4', no: 'F-14', ad: 'Ayarsız', istasyonId: 44, eksik: true },
    ]);
  });

  it('kayıt yoksa ya da bozuksa liste yine sunucudan gelir; sunucuda makine yoksa liste boştur', () => {
    expect(makineListesi(TEZGAHLAR, undefined).map((m) => m.makineId)).toEqual(['mk1', 'mk2', 'mk3', 'mk4']);
    expect(makineListesi(TEZGAHLAR, '{bozuk')).toHaveLength(4);
    expect(makineListesi([], KAYIT)).toEqual([]);
  });

  it('her makine geçerli bir GLB verir', () => {
    for (const m of makineListesi(TEZGAHLAR, KAYIT).filter((x) => !x.eksik)) {
      const r = modelUret(m.makineId, TEZGAHLAR, KAYIT);
      expect(r).toMatchObject(m);
      expect(new TextDecoder().decode(r.glb.subarray(0, 4)), m.makineId).toBe('glTF');
      const j = glbJson(r.glb);
      expect(j.asset?.version).toBe('2.0');
      expect(j.meshes?.length ?? 0, m.makineId).toBeGreaterThan(0);
    }
  });

  it('listede olmayan ya da ayarı eksik makinede hata verir (reddedilen)', () => {
    expect(() => modelUret('yok', TEZGAHLAR, KAYIT)).toThrow('Makine modeli bulunamadı.');
    expect(() => modelUret('cm1', TEZGAHLAR, KAYIT)).toThrow('Makine modeli bulunamadı.');
    expect(() => modelUret('mk3', TEZGAHLAR, KAYIT)).toThrow('Makinenin ayarı eksik');
    expect(() => modelUret('mk4', TEZGAHLAR, KAYIT)).toThrow('Makinenin ayarı eksik');
    expect(() => modelUret('mk5', TEZGAHLAR, KAYIT)).toThrow('Makine modeli bulunamadı.');
  });
});
