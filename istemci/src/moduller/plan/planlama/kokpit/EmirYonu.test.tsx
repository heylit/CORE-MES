import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CalismaKomutu } from '../kayit.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { planKurSifirla } from '../motor/coz.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { EmirYonu } from './EmirYonu.tsx';

// Çalışma uydurmadır; sunucu yerine komut ve değerlendirme sahtedir.
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

function kur(c: PlanlamaCalismasi, yazabilir = true) {
  const yazilan: { ne: string; c: PlanlamaCalismasi; ayrinti: string | undefined }[] = [];
  const komut: CalismaKomutu = {
    degistir: vi.fn((ne: string, fn: (t: PlanlamaCalismasi) => boolean | void, s?: { ayrinti?: string }) => {
      const t = structuredClone(c);
      if (fn(t) === false) return false;
      yazilan.push({ ne, c: t, ayrinti: s?.ayrinti });
      return true;
    }),
    geriAl: vi.fn(() => true), geriAlinabilir: () => true, geriAdimlari: () => [], geriDon: () => true, kaydet: vi.fn(() => Promise.resolve(9)),
  };
  const iste = vi.fn(() => Promise.resolve({
    calismaSurumu: 9, dataVer: c.dataVer, baslangic: null, simdi: 0, maliyetGorunur: false,
    sonuc: { tur: 'plan-uygula' as const, plan: { ozet: { wT: 0, late: 0, n: 2 } } },
  }));
  render(<EmirYonu c={c} komut={komut} yazabilir={yazabilir} kim="ORN-Planlamaci" emirId="S1" no="ORN-1" iste={iste as never} />);
  return { komut, iste, yazilan };
}

describe('Kokpit emrin planlama yönü (3282 1c)', () => {
  it('açılışta planınki seçilidir; Geri emrin yönünü yazar, etkisini gösterir, Uygula planı alır', async () => {
    const { iste, yazilan } = kur(ornekCalisma());
    const grup = screen.getByRole('group', { name: 'Planlama yönü' });
    expect(within(grup).getByRole('button', { name: 'Planınki' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(grup).getByRole('button', { name: 'Teslimden geriye' }));
    const etki = await screen.findByRole('region', { name: 'Yönün etkisi' });
    expect(yazilan[0]).toMatchObject({ ne: 'Emrin yönü değişti', ayrinti: 'ORN-1: Planınki (ileri) → geri (teslimden)' });
    expect(yazilan[0]?.c.w['yonEmir']).toEqual({ S1: 'geri' });
    expect(iste).toHaveBeenCalledWith(9, { tur: 'plan-uygula', isler: ['*'] });
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    expect(yazilan[1]?.ne).toBe('Emrin yönü uygulandı');
  });

  it('Vazgeç değişikliği geri alır; yazamayan kişide düğmeler kapalıdır', async () => {
    const { komut } = kur(ornekCalisma());
    fireEvent.click(screen.getByRole('button', { name: 'Teslimden geriye' }));
    fireEvent.click(within(await screen.findByRole('region', { name: 'Yönün etkisi' })).getByRole('button', { name: 'Vazgeç' }));
    expect(komut.geriAl).toHaveBeenCalled();
    cleanup();
    kur(ornekCalisma(), false);
    expect(screen.getByRole('button', { name: 'Teslimden geriye' }).hasAttribute('disabled')).toBe(true);
  });
});
