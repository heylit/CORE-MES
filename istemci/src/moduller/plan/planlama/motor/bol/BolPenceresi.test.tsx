import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { saatiSabitle } from '../../test-saati.ts';
import { kbKomutlari } from '../Duzenle.tsx';
import { derle, girdiKur, planOku, plandanBitenler } from '../kurallar.ts';
import { ornekCalisma } from '../ornek.ts';
import { BolPenceresi } from './BolPenceresi.tsx';
import { BOL_KILITLI, bolDurumu, elleBolOku } from './kurallar.ts';
import { ikiTezgahli } from './test-veri.ts';

saatiSabitle(() => ornekCalisma());
afterEach(() => { cleanup(); });

// Uydurma çalışma; 3.10 tezgâh 1 ve 2'de yapılabilir (kurallar.test ikiTezgahli).
const kur = (c: PlanlamaCalismasi = ikiTezgahli()) => {
  const p = planOku(c); if (!p) throw new Error('plan');
  return { c, p, cx: derle(girdiKur(c, plandanBitenler(c, p))) };
};
const komutKur = (c: PlanlamaCalismasi) => {
  const t = structuredClone(c);
  const degistir = vi.fn((_ne: string, fn: (x: PlanlamaCalismasi) => boolean | void) => { fn(t); return true; });
  return { komut: { degistir } as unknown as CalismaKomutu, degistir, t };
};
const dugme = (ad: string) => screen.getByRole('button', { name: ad });

describe('Böl penceresi (2524 b)', () => {
  it('eşit paylarla açılır; toplam tutmazsa Uygula pasif ve neden yazılı; tutunca çalışmaya elleBol yazılır', () => {
    const { c, p, cx } = kur(); const { komut, degistir, t } = komutKur(c); const kapat = vi.fn();
    const d = bolDurumu(c, cx, p, p.ops['3.10']!);
    render(<BolPenceresi c={c} p={p} cx={cx} id="3.10" kip="bol" komut={komut} kapat={kapat} />);
    const a1 = screen.getByLabelText('Pay 1 adedi') as HTMLInputElement; const a2 = screen.getByLabelText('Pay 2 adedi') as HTMLInputElement;
    expect(Number(a1.value) + Number(a2.value)).toBe(d.adet);
    expect((screen.getByLabelText('Pay 1 tezgâhı') as HTMLSelectElement).value).toBe('1');
    expect((screen.getByLabelText('Pay 2 tezgâhı') as HTMLSelectElement).value).toBe('2');
    fireEvent.change(a1, { target: { value: String(Number(a1.value) + 1) } });
    expect(screen.getByRole('alert').textContent).toMatch(/^Payların toplamı/);
    expect(dugme('Uygula').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(dugme('Uygula'));
    expect(degistir).not.toHaveBeenCalled();
    fireEvent.change(a2, { target: { value: String(Number(a2.value) - 1) } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(dugme('Uygula'));
    expect(degistir).toHaveBeenCalledWith('İş bölündü', expect.any(Function), expect.objectContaining({ ayrinti: expect.stringMatching(/^3\.10 · /) }));
    expect(elleBolOku(t)['3.10']).toEqual([{ adet: Number(a1.value), m: '1' }, { adet: Number(a2.value), m: '2' }]);
    expect(kapat).toHaveBeenCalled();
  });

  it('aynı tezgâh iki paya seçilemez; pay sayısı en çok bolmeMaks', () => {
    const { c, p, cx } = kur(); const { komut } = komutKur(c);
    render(<BolPenceresi c={c} p={p} cx={cx} id="3.10" kip="bol" komut={komut} kapat={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Pay 2 tezgâhı'), { target: { value: '1' } });
    expect(screen.getByRole('alert').textContent).toBe('Her pay ayrı tezgâhta olmalı.');
    expect([...(screen.getByLabelText('Pay sayısı') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['2', '3']);
  });

  it('payları birleştir tek tezgâh seçer; bütün adet tek pay olur', () => {
    const { c, p, cx } = kur(); const { komut, degistir, t } = komutKur(c);
    const d = bolDurumu(c, cx, p, p.ops['3.10']!);
    render(<BolPenceresi c={c} p={p} cx={cx} id="3.10" kip="birlestir" komut={komut} kapat={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Tezgâh'), { target: { value: '2' } });
    fireEvent.click(dugme('Uygula'));
    expect(degistir.mock.calls[0]?.[0]).toBe('Paylar birleştirildi');
    expect(elleBolOku(t)['3.10']).toEqual([{ adet: d.adet, m: '2' }]);
  });

  it('yazamayan kişide Uygula pasif; tek tezgâhlı işte bölme nedeniyle kapalı', () => {
    const { c, p, cx } = kur();
    render(<BolPenceresi c={c} p={p} cx={cx} id="3.10" kip="bol" komut={null} kapat={vi.fn()} />);
    expect(screen.getByText('Plan yazma yetkiniz yok.')).toBeTruthy();
    expect(dugme('Uygula').getAttribute('aria-disabled')).toBe('true');
    cleanup();
    const o = kur(ornekCalisma());
    render(<BolPenceresi c={o.c} p={o.p} cx={o.cx} id="3.10" kip="bol" komut={komutKur(o.c).komut} kapat={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe('Bölmek için işi yapabilen en az iki tezgâh gerekir.');
  });
});

describe('Düzenle menüsünde elle bölme', () => {
  const komutlar = (c: PlanlamaCalismasi, komut: CalismaKomutu | null, bolAc: ((id: string) => void) | null) => {
    const { p, cx } = kur(c);
    return kbKomutlari({ c, cx, p, komut, altAc: vi.fn(), bolAc }, { k: 'is', r: p.ops['3.10']! }, false);
  };
  it('Böl… pencereyi açar; sabit işte pasif ve nedeniyle; yetkisizde pasif', () => {
    const c = ikiTezgahli(); const { komut } = komutKur(c); const bolAc = vi.fn();
    const bol = komutlar(c, komut, bolAc).find((k) => k.ad === 'Böl…');
    expect(bol?.pencere).toBe(true);
    bol?.yap?.();
    expect(bolAc).toHaveBeenCalledWith('3.10', 'bol');
    const r = planOku(c)!.ops['3.10']!;
    const kilitli = { ...c, locks: { ...c.locks, '3.10': { m: r.m, S: r.S } } };
    expect(komutlar(kilitli, komut, bolAc).find((k) => k.ad === 'Böl…')).toMatchObject({ yap: null, not: BOL_KILITLI });
    expect(komutlar(c, null, null).find((k) => k.ad === 'Böl…')).toMatchObject({ yap: null, not: 'Plan yazma yetkiniz yok.' });
    expect(komutlar(c, komut, bolAc).some((k) => k.ad === 'Payları birleştir' || k.ad === 'Elle bölmeyi kaldır')).toBe(false);
  });
  it('elle bölünmüş işte birleştir ve kaldır görünür; kaldır anahtarı siler', () => {
    const c = { ...ikiTezgahli(), elleBol: { '3.10': [{ adet: 1, m: '1' }, { adet: 1, m: '2' }] } } as PlanlamaCalismasi;
    const { komut, degistir, t } = komutKur(c);
    const l = komutlar(c, komut, vi.fn());
    expect(l.map((k) => k.ad)).toEqual(expect.arrayContaining(['Böl…', 'Payları birleştir', 'Elle bölmeyi kaldır']));
    l.find((k) => k.ad === 'Elle bölmeyi kaldır')?.yap?.();
    expect(degistir.mock.calls[0]?.[0]).toBe('Elle bölme kaldırıldı');
    expect(elleBolOku(t)).toEqual({});
  });
});
