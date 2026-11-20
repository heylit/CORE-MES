import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ornekCalisma } from '../motor/ornek.ts';
import { planKurSifirla } from '../motor/coz.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { ElleBol, ilkParcalar, parcaDenetimi } from './ElleBol.tsx';
import type { KokpitModeli } from './kurallar.ts';
import { sahteTaslak } from './taslak-test-yardim.ts';

// 3488 c: adımı elle bölme paneli. Çalışma uydurmadır; taslak sahtedir.
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

const M = {
  isler: {},
  emirler: [{ id: 'ORN-1', no: 'ORN-0001', adet: 9, adimlar: [{ id: 'ORN-1.20', ad: 'Frezeleme', adaylar: ['ORN-F1', 'ORN-F2', 'ORN-F3'] }] }],
  tezgahlar: [{ id: 'ORN-F1', kod: 'F1', ad: '', fason: false }, { id: 'ORN-F2', kod: 'F2', ad: '', fason: false }, { id: 'ORN-F3', kod: 'F3', ad: '', fason: false }],
} as unknown as Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar'>;

function kur({ yazabilir = true, kayitli = null as { adet: number; m: string }[] | null } = {}) {
  const c = ornekCalisma() as unknown as PlanlamaCalismasi;
  if (kayitli !== null) (c as unknown as Record<string, unknown>)['elleBol'] = { 'ORN-1.20': kayitli };
  const { t, yazilan } = sahteTaslak(c.dataVer);
  const kapat = vi.fn();
  render(<ElleBol c={c} m={M} isId="ORN-1.20" taslak={t} yazabilir={yazabilir} kapat={kapat} />);
  return { t, yazilan, kapat, panel: screen.getByRole('complementary', { name: 'Adımı böl' }) };
}
const adetler = (panel: HTMLElement) => within(panel).getAllByLabelText('Adet') as HTMLInputElement[];
const tezgahlar = (panel: HTMLElement) => within(panel).getAllByLabelText('Tezgâh') as HTMLSelectElement[];

describe('Kokpit adımı elle böl (3488 c)', () => {
  it('öneri: kayıtlı bölme varsa o, yoksa adet ilk iki tezgâha yarı yarıya; denetim toplamı, adedi ve tezgâhı arar', () => {
    expect(ilkParcalar(9, ['A', 'B'], null)).toEqual([{ adet: '5', tezgah: 'A' }, { adet: '4', tezgah: 'B' }]);
    expect(ilkParcalar(9, ['A'], null)).toEqual([{ adet: '5', tezgah: 'A' }, { adet: '4', tezgah: 'A' }]);
    expect(ilkParcalar(9, ['A', 'B'], [{ adet: 6, m: 'B' }, { adet: 3, m: 'A' }])).toEqual([{ adet: '6', tezgah: 'B' }, { adet: '3', tezgah: 'A' }]);
    expect(parcaDenetimi([{ adet: '6', tezgah: 'A' }, { adet: '3', tezgah: 'B' }], 9)).toEqual({ paylar: [{ adet: 6, tezgah: 'A' }, { adet: 3, tezgah: 'B' }], toplam: 9, hata: null });
    expect(parcaDenetimi([{ adet: '6', tezgah: 'A' }, { adet: '2', tezgah: 'B' }], 9).hata).toBe('Parçaların toplamı adımın adedi (9) olmalı.');
    expect(parcaDenetimi([{ adet: '0', tezgah: 'A' }, { adet: '9', tezgah: 'B' }], 9).hata).toBe('Her parçanın adedi 1 ya da daha çok tam sayı olmalı.');
    expect(parcaDenetimi([{ adet: '4,5', tezgah: 'A' }, { adet: '4', tezgah: 'B' }], 9).hata).toBe('Her parçanın adedi 1 ya da daha çok tam sayı olmalı.');
    expect(parcaDenetimi([{ adet: '5', tezgah: '' }, { adet: '4', tezgah: 'B' }], 9).hata).toBe('Her parçanın tezgâhını seçin.');
    expect(parcaDenetimi([{ adet: '9', tezgah: 'A' }], 9).hata).toBe('En az iki parça girin.');
  });

  it('tutmayan toplam komut yazmaz, nedeni yazar; doğru bölme taslağa yazılır, etkisi emrin için hesaplanır, Uygula dizmeyi yazar', async () => {
    const { t, yazilan, panel } = kur();
    expect(adetler(panel).map((x) => x.value)).toEqual(['5', '4']);
    expect(tezgahlar(panel).map((x) => x.value)).toEqual(['ORN-F1', 'ORN-F2']);
    fireEvent.change(adetler(panel)[1]!, { target: { value: '2' } });
    expect(panel.querySelector('[data-toplam]')?.textContent).toMatch(/^Toplam 7 \/ 9 adet\./);
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    expect(within(panel).getByRole('alert').textContent).toBe('Parçaların toplamı adımın adedi (9) olmalı.');
    expect(yazilan).toEqual([]);
    fireEvent.click(within(panel).getByRole('button', { name: 'Parça ekle' }));
    fireEvent.change(adetler(panel)[2]!, { target: { value: '2' } });
    fireEvent.change(tezgahlar(panel)[0]!, { target: { value: 'ORN-F3' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    const etki = await screen.findByRole('region', { name: 'Bölmenin etkisi' });
    expect(yazilan).toEqual([{ tur: 'elle-bol', isId: 'ORN-1.20', paylar: [{ adet: 5, tezgah: 'ORN-F3' }, { adet: 2, tezgah: 'ORN-F2' }, { adet: 2, tezgah: 'ORN-F3' }] }]);
    expect(t.degerlendir).toHaveBeenCalledWith({ tur: 'plan-uygula', isler: ['ORN-1'] });
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    await vi.waitFor(() => { expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is'); });
  });

  it('kayıtlı bölme yazar ve formu doldurur; Bölmeyi kaldır silme komutunu yazar; en çok altı parça; üçüncü parçadan sonra Sil çıkar', async () => {
    const { yazilan, panel } = kur({ kayitli: [{ adet: 6, m: 'ORN-F2' }, { adet: 3, m: 'ORN-F1' }] });
    expect(panel.querySelector('[data-kayitli-bolme]')?.textContent).toBe('F2 6, F1 3');
    expect(adetler(panel).map((x) => x.value)).toEqual(['6', '3']);
    expect(within(panel).queryByRole('button', { name: /Parça \d'i sil/ })).toBeNull();
    for (let i = 0; i < 4; i++) fireEvent.click(within(panel).getByRole('button', { name: 'Parça ekle' }));
    expect(adetler(panel).length).toBe(6);
    expect(within(panel).queryByRole('button', { name: 'Parça ekle' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: "Parça 6'i sil" }));
    expect(adetler(panel).length).toBe(5);
    fireEvent.click(within(panel).getByRole('button', { name: 'Bölmeyi kaldır' }));
    await screen.findByRole('region', { name: 'Bölmenin etkisi' });
    expect(yazilan).toEqual([{ tur: 'elle-bol-sil', isId: 'ORN-1.20' }]);
  });

  it('yazamayan kişide form yoktur, nedeni yazar; kapat düğmesi paneli kapatır', () => {
    const { panel, kapat } = kur({ yazabilir: false });
    expect(within(panel).queryByRole('textbox')).toBeNull();
    expect(within(panel).getByText('Adımı yalnız planı yazabilen kişi böler.')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Adımı bölmeyi kapat' }));
    expect(kapat).toHaveBeenCalled();
  });
});
