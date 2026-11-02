import { describe, expect, it } from 'vitest';
import { siparisDurumu, siparisSuz } from '../ic/veri/kurallar.ts';
import { calismaKur } from '../ic/veri/test-veri.tsx';
import { aktifSiparisler } from '../maliyet/kurallar.ts';
import { girdiKur, planOku, plandanBitenler, yerlesmeyenSiparisler } from '../motor/kurallar.ts';
import { planDisi } from '../tipler.ts';
import { plandaki } from './kurallar.ts';

// 1892 b: Üretim Emirleri'nde iptal edilen emir çalışmada `iptal` işaretiyle kalır. Liste onu "İptal" diye gösterir; plan, maliyet,
// gecikme ve yerleşmeyen sayıları onu saymaz. Kayıtlı planda çubuğu kalmış olsa da (plan eskimeden önce) sonucu ona yazılmaz.
const iptalli = () => calismaKur((c) => { const s = c.D.siparisler[1] as Record<string, unknown>; s.iptal = true; });

describe('iptal edilen emir (1892 b)', () => {
  it('planın dışındadır; havuzdaki gibi sayılmaz ama havuzda da değildir', () => {
    expect([planDisi({}), planDisi({ havuz: true }), planDisi({ iptal: true }), planDisi({ havuz: false, iptal: false })]).toEqual([false, true, true, false]);
    const c = iptalli();
    expect(plandaki(c.D).map((s) => s.id)).toEqual(['S1', 'S3']);
    expect(aktifSiparisler(c.D).map((s) => s.id)).toEqual(['S1', 'S3']);
    expect(c.D.siparisler.filter((s) => s.havuz).map((s) => s.id)).toEqual([]);
  });

  it('motorun girdisine girmez, yerleşmeyen sayılmaz', () => {
    const c = iptalli();
    const p = planOku(c);
    if (!p) throw new Error('plan');
    expect(girdiKur(c, plandanBitenler(c, p)).D.siparisler.map((s) => s.id)).not.toContain('S2');
    expect(yerlesmeyenSiparisler(c, { ...p, J: { S1: { C: 90, T: 3 } } }, { siparis: new Set(), adim: new Set() })).toEqual(['S3']);
  });

  it('siparişler listesinde "İptal" görünür; gecikenler süzgecine girmez', () => {
    const c = iptalli();
    const J = { S1: { C: 90, T: 3 }, S2: { C: 100, T: 5 } };
    expect(siparisDurumu(J, 'S2', true)).toEqual({ ad: 'İptal', ton: 'pasif' });
    expect(siparisDurumu(null, 'S2', true)).toEqual({ ad: 'İptal', ton: 'pasif' });
    expect(siparisDurumu(J, 'S2')).toEqual({ ad: '5 sa geç', ton: 'hata' });
    expect(siparisSuz(c.D.siparisler, J, 'hepsi', '').map((s) => s.id)).toEqual(['S1', 'S2', 'S3']);
    expect(siparisSuz(c.D.siparisler, J, 'gec', '').map((s) => s.id)).toEqual(['S1']);
  });
});
