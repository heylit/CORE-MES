import { describe, expect, it } from 'vitest';
import type { PlanVerisi } from '../../tipler.ts';
import { odakAdi } from '../../ic/odak/kurallar.ts';
import { tezEtiketi } from '../cizelge/kurallar.ts';
import { tezgahKodlari, tezgahKodu } from './veri.ts';

// B-2499-2, B-2500-5: kişinin el tezgâhı ve fasoncu ekranda kimlikle değil adıyla yazılır; tezgâh koduyla. Veri uydurmadır.
const D: Pick<PlanVerisi, 'tezgahlar' | 'fasoncular'> = {
  tezgahlar: [{ id: 'T1', kod: 'ORN-CNC-T1', ad: 'Ornek torna' }, { id: 'kisi-4', ad: 'Ornek Kisi' }, { id: 'T9' }],
  fasoncular: [{ id: '5', ad: 'Ornek Fason' }, { id: '6' }],
};

describe('kaynağın ekrandaki adı', () => {
  it('tezgâh kodu, kişi tezgâhı ve fasoncu adı; adı olmayanda kimlik', () => {
    const k = tezgahKodlari(D);
    expect(['T1', 'kisi-4', '@5', 'T9', '@6'].map((m) => tezgahKodu(m, k))).toEqual(['ORN-CNC-T1', 'Ornek Kisi', 'Ornek Fason', 'T9', '6']);
    expect(tezEtiketi('@5', k)).toBe('fason Ornek Fason');
    expect(odakAdi('@5', k)).toBe('Ornek Fason (fason)');
    expect(odakAdi('kisi-4', k)).toBe('Ornek Kisi');
  });
});

describe('bitmiş sipariş (B-2499-3)', () => {
  it('rotası olup kalan adımı olmayan sipariş bitmiştir; rotasız ürün ve havuz sayılmaz', async () => {
    const { bitmisSiparisler } = await import('./veri.ts');
    const D = {
      urunler: [{ id: 'U1', rota: [{ k: '10' }] }, { id: 'U2', rota: [] }],
      siparisler: [{ id: 'S1', urun: 'U1' }, { id: 'S2', urun: 'U1' }, { id: 'S3', urun: 'U2' }, { id: 'S4', urun: 'U1', havuz: true }],
      tezgahlar: [],
    } as unknown as PlanVerisi;
    const jobs = { S1: { ops: [] }, S2: { ops: [{ id: 'S2.10' }] }, S3: { ops: [] }, S4: { ops: [] } } as never;
    expect(bitmisSiparisler(D, { jobs })).toEqual(['S1']);
  });
});
