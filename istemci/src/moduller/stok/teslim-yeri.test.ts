import { describe, expect, it } from 'vitest';
import type { Teslim, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { teslimAlIstasyonu } from './teslim-yeri.ts';

const uc = (istasyonId: number | null) => ({ konumId: 1, kod: 'K', ad: null, istasyonId });
const teslim = (hedefIstasyonId: number | null) => ({ hedef: uc(hedefIstasyonId) }) as unknown as Teslim;
const kutu = (o: Partial<TeslimKutusuCevabi>): TeslimKutusuCevabi => ({
  gelenler: [], gonderdiklerim: [], isteklerim: [], hedefIstasyonlar: [], depoKonumlari: [], araAlanlar: [], harita: null, zemin: null,
  istasyonlar: [{ id: 1, kod: 'F1', ad: 'Freze 1' }, { id: 2, kod: 'T1', ad: 'Torna 1' }], buradakiIstasyonId: null, ...o,
});

describe('teslimAlIstasyonu (Akış A provası D2)', () => {
  it('istasyon bilinmiyorsa ilk istasyon yerine son seçileni, o da yoksa gelen teslimin istasyonunu açar', () => {
    expect(teslimAlIstasyonu(kutu({}), null, 2)).toBe(2);
    expect(teslimAlIstasyonu(kutu({ gelenler: [teslim(null), teslim(2)] }), null, null)).toBe(2);
    expect(teslimAlIstasyonu(kutu({}), null, null)).toBe(1);
  });
  it('terminalden gelen odak ve kişinin bulunduğu istasyon önce gelir; kapsam dışı son seçim kullanılmaz', () => {
    expect(teslimAlIstasyonu(kutu({ buradakiIstasyonId: 1 }), 2, 2)).toBe(2);
    expect(teslimAlIstasyonu(kutu({ buradakiIstasyonId: 1 }), null, 2)).toBe(1);
    expect(teslimAlIstasyonu(kutu({}), null, 9)).toBe(1);
  });
});
