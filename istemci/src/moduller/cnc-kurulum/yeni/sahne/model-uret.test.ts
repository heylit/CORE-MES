import { describe, expect, it } from 'vitest';
import { MACHINES } from '../veri/cncdata.ts';
import { makineListesi, modelUret } from './model-uret.ts';

// Kayıttaki makine adları uydurmadır.
const KAYIT = JSON.stringify({
  customMachines: [{ id: 'cm1', no: 'F-77', name: 'Elle freze', kind: 'm_vmc' }, { id: 'cm2', name: 'Türsüz' }],
  mo: { f5a: { name: 'Düzeltilmiş ad', no: '' } },
});

function glbJson(b: Uint8Array): { meshes?: unknown[]; nodes?: { name?: string }[]; asset?: { version?: string } } {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const uzunluk = v.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + uzunluk))) as never;
}

describe('Çizim Merkezi için makine modeli (1135 a)', () => {
  it('liste ekranın makineleri, elle eklenenler ve düzeltmelerle gelir', () => {
    const l = makineListesi(KAYIT);
    expect(l).toHaveLength(MACHINES.length + 2);
    expect(l[0]).toEqual({ makineId: 'f5a', no: null, ad: 'Düzeltilmiş ad' });
    expect(l[1]).toEqual({ makineId: MACHINES[1]!.id, no: MACHINES[1]!.no, ad: MACHINES[1]!.name });
    expect(l.slice(-2)).toEqual([{ makineId: 'cm1', no: 'F-77', ad: 'Elle freze' }, { makineId: 'cm2', no: null, ad: 'Türsüz' }]);
  });

  it('kayıt yoksa ya da bozuksa yalnız ekranın makineleri gelir', () => {
    expect(makineListesi(undefined)).toHaveLength(MACHINES.length);
    expect(makineListesi('{bozuk')).toHaveLength(MACHINES.length);
  });

  it('her makine geçerli bir GLB verir', () => {
    for (const m of makineListesi(KAYIT).filter((x) => x.makineId !== 'cm2')) {
      const r = modelUret(m.makineId, KAYIT);
      expect(r).toMatchObject(m);
      expect(new TextDecoder().decode(r.glb.subarray(0, 4)), m.makineId).toBe('glTF');
      const j = glbJson(r.glb);
      expect(j.asset?.version).toBe('2.0');
      expect(j.meshes?.length ?? 0, m.makineId).toBeGreaterThan(0);
    }
  });

  it('bulunmayan ya da türü olmayan makinede hata verir', () => {
    expect(() => modelUret('yok', KAYIT)).toThrow('Makine modeli bulunamadı.');
    expect(() => modelUret('cm2', KAYIT)).toThrow('Makine modeli bulunamadı.');
  });
});
