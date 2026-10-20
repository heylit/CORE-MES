import { describe, expect, it } from 'vitest';
import { paketGrubuOku, paketleriGrupla } from '../../../../arkon/web/src/data/paket-grup.ts';

const ie = (id: string, emirId: number, opNo: number, machine: string) =>
  ({ id, no: `UE-${emirId}`, part: `Parça ${emirId}`, partNo: `P-${emirId}`, machine, tmi: { emirId, opNo } });

describe('Hazırlık paket gruplaması', () => {
  const paketler = [ie('a', 2, 20, 'T2'), ie('b', 1, 10, 'T1'), ie('c', 2, 10, 'F1'), { id: 'yerel', no: 'Y-1', machine: 'T1' }];

  it('üretim emrine göre: emir başına bir grup, sıra listeden, paketler operasyon sırasıyla', () => {
    const g = paketleriGrupla(paketler, 'emir');
    expect(g.map((x) => x.baslik)).toEqual(['UE-2', 'UE-1', 'Y-1']);
    expect(g[0]!.paketler.map((p) => p.id)).toEqual(['c', 'a']);
    expect(g[0]!.alt).toBe('Parça 2 · P-2');
    expect(g[2]!.alt).toBe('Adsız parça');
  });

  it('istasyona göre: istasyon başına bir grup, koda göre sıralı, paket sayısıyla', () => {
    const g = paketleriGrupla(paketler, 'istasyon');
    expect(g.map((x) => [x.baslik, x.alt, x.paketler.map((p) => p.id)])).toEqual([
      ['F1', '1 paket', ['c']], ['T1', '2 paket', ['b', 'yerel']], ['T2', '1 paket', ['a']],
    ]);
  });

  it('istasyona göre: ad verilirse başlığın altında görünür', () => {
    const g = paketleriGrupla(paketler, 'istasyon', (tur, kod) => (tur === 'istasyon' && kod === 'T1' ? 'Torna' : undefined));
    expect(g.find((x) => x.baslik === 'T1')!.alt).toBe('Torna · 2 paket');
  });

  it('makineye göre: makine başına bir grup, makinesiz paketler en sonda', () => {
    const m = [{ ...paketler[0]!, mc: 'M-2' }, { ...paketler[1]!, mc: 'M-1' }, paketler[2]!, { ...paketler[3]!, mc: 'M-1' }];
    const g = paketleriGrupla(m, 'makine', (_t, kod) => (kod === 'M-1' ? 'Torna tezgahı' : undefined));
    expect(g.map((x) => [x.baslik, x.alt, x.paketler.map((p) => p.id)])).toEqual([
      ['M-1', 'Torna tezgahı · 2 paket', ['b', 'yerel']], ['M-2', '1 paket', ['a']], ['Makine seçilmemiş', '1 paket', ['c']],
    ]);
  });

  it('parçaya göre: parça numarası başına bir grup, parçasız paketler en sonda', () => {
    const g = paketleriGrupla(paketler, 'parca');
    expect(g.map((x) => [x.baslik, x.alt, x.paketler.map((p) => p.id)])).toEqual([
      ['P-1', 'Parça 1 · 1 paket', ['b']], ['P-2', 'Parça 2 · 2 paket', ['a', 'c']], ['Parça girilmemiş', '1 paket', ['yerel']],
    ]);
  });

  it('kayıtlı seçim okunamazsa üretim emri', () => {
    expect(paketGrubuOku('istasyon')).toBe('istasyon');
    expect(paketGrubuOku('makine')).toBe('makine');
    expect(paketGrubuOku('parca')).toBe('parca');
    for (const d of [null, undefined, 'x', 1]) expect(paketGrubuOku(d)).toBe('emir');
  });
});
