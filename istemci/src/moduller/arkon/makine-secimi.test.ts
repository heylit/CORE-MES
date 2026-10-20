import { describe, expect, it } from 'vitest';
import { AZAMI_MAKINE_SECIMI, kayittakiMakineler, makineSecimiGorunur, secimOzeti, secimiDegistir, seciliMakineler } from '../../../../arkon/web/src/data/makine-secimi.ts';

const M = [{ id: 'M1', name: 'Torna 1' }, { id: 'M2', name: 'Torna 2' }, { id: 'M3' }];

// Kart #1148: terminalde makine seçimi. Sunucu tarafı kuralları sunucu/moduller/arkon/kurallar.test.ts ve yansima.test.ts'tedir.
describe('terminal makine seçimi', () => {
  it('seçici yalnız birden çok makineli istasyonda ve iş çalışmıyorken görünür', () => {
    expect(makineSecimiGorunur(M, 'queued')).toBe(true);
    expect(makineSecimiGorunur(M, 'paused')).toBe(true);
    expect(makineSecimiGorunur(M, 'running')).toBe(false);
    expect(makineSecimiGorunur([M[0]!], 'queued')).toBe(false);
    expect(makineSecimiGorunur([], 'queued')).toBe(false);
  });

  it('dokunuş seçer ve bırakır; en çok 20 makine', () => {
    expect(secimiDegistir([], 'M1')).toEqual(['M1']);
    expect(secimiDegistir(['M1'], 'M2')).toEqual(['M1', 'M2']);
    expect(secimiDegistir(['M1', 'M2'], 'M1')).toEqual(['M2']);
    const dolu = Array.from({ length: AZAMI_MAKINE_SECIMI }, (_, i) => `K${i}`);
    expect(secimiDegistir(dolu, 'YENI')).toEqual(dolu);
  });

  it('kayıtta seçim yalnız çalışmaya geçişte ve istasyonun makineleriyle gider; seçim yoksa alan yoktur', () => {
    expect(kayittakiMakineler(['M2'], M, 'running')).toEqual(['M2']);
    expect(kayittakiMakineler([], M, 'running')).toBeUndefined();
    expect(kayittakiMakineler(['M2'], M, 'paused')).toBeUndefined();
    expect(kayittakiMakineler(['M2'], M, 'stopped')).toBeUndefined();
    expect(kayittakiMakineler(['BASKA'], M, 'running')).toBeUndefined();
    expect(seciliMakineler(['M1', 'BASKA', 'M3'], M)).toEqual(['M1', 'M3']);
  });

  it('özet seçileni ya da varsayılanı söyler', () => {
    expect(secimOzeti(['M1', 'M2'], 'M3')).toBe('2 makine seçili');
    expect(secimOzeti([], 'M3')).toBe('Seçilmezse M3 makinesinde başlar');
    expect(secimOzeti([], null)).toBe('Seçilmezse işe atanmış makinede başlar');
  });
});
