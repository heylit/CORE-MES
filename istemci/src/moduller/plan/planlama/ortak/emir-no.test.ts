import { describe, expect, it } from 'vitest';
import { kayitliPlan, siparisIsisi } from '../siparis/kurallar.ts';
import { calismaKur } from '../siparis/test-veri.ts';
import { emirNoOkuyucu, isAdi } from './emir-no.ts';

describe('emir no gösterimi (2693 a)', () => {
  const no = emirNoOkuyucu({ orders: [{ id: 'S1', no: 'MM-ORN-00001-26-11-001' }] });

  it('adım kimliğinin sipariş kısmı emir no olur; adım soneki ve bilinmeyen kimlik korunur', () => {
    expect(isAdi(no, 'S1.a2', 'S1')).toBe('MM-ORN-00001-26-11-001.a2');
    expect(isAdi(no, 'S2.a1', 'S2')).toBe('S2.a1');
    expect(isAdi(no, 'baska', 'S1')).toBe('baska');
  });

  it('sipariş ısısı satır adını ve üst metni emir noyla yazar, satır anahtarı kimlik kalır', () => {
    const c = calismaKur(); const V = siparisIsisi(c, kayitliPlan(c)!, no);
    const r = V.satirlar.find((x) => x.k === 'S1')!;
    expect(r.ad).toBe('MM-ORN-00001-26-11-001');
    expect(V.ust.metin).toContain('MM-ORN-00001-26-11-001');
    expect(V.satirlar.find((x) => x.k === 'S2')!.ad).toBe('S2');
  });
  it('2693-1 a: Reçete ve Rota kaydında olmayan emir canlı planlama kaynağından numarasını alır; ikisinde de varsa canlı geçer', () => {
    const okuyucu = emirNoOkuyucu({ orders: [{ id: 'S1', no: 'ESKI-1' }] }, { orders: [{ id: 'S1', no: 'YENI-1' }, { id: 5, no: 'ORN-0005' }] });
    expect(okuyucu('5')).toBe('ORN-0005');
    expect(okuyucu('5/2')).toBe('ORN-0005/2');
    expect(okuyucu('S1')).toBe('YENI-1');
    expect(emirNoOkuyucu(null, null)('11')).toBe('11');
  });
});
