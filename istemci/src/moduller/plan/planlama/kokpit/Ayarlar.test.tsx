import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MotorAyarlari } from '#paylasilan/sozlesme/plan.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { planKurSifirla } from '../motor/coz.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { Ayarlar } from './Ayarlar.tsx';
import { sahteTaslak } from './taslak-test-yardim.ts';

const MOTOR: MotorAyarlari = { amac: 'sirali', eksikStok: 'varsay', kural: 'atcs', ogrenme: 'kapali', acilPay: 0.05, bolmeKip: 'otomatik', bolmeMaks: 3 };
// Çalışma uydurmadır; sunucu yerine taslak sahtedir (3282 1d-2b: değişiklik kişinin taslağına komut olarak yazılır).
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

function kur(c: PlanlamaCalismasi, yazabilir = true, yon: 'ileri' | 'geri' | null = null) {
  vi.spyOn(api, 'get').mockResolvedValue({ guncel: { surumId: null, degerler: MOTOR, yazan: null, zaman: null }, taslak: null });
  const { t, yazilan } = sahteTaslak(c.dataVer);
  const kapat = vi.fn();
  render(<MemoryRouter><Ayarlar c={c} taslak={t} yazabilir={yazabilir} kim="ORN-Planlamaci" kapat={kapat} yon={yon} /></MemoryRouter>);
  return { t, kapat, yazilan };
}

describe('Kokpit Ayarlar paneli (3282 1b)', () => {
  it('çalışmanın ayarlarını gösterir; motor ayarı okunur, kural motor ayarları sayfasındadır', async () => {
    kur(ornekCalisma());
    const panel = screen.getByRole('complementary', { name: 'Plan ayarları' });
    expect((within(panel).getByLabelText(/Dondurulmuş bölge/) as HTMLInputElement).value).toBe('4');
    expect((within(panel).getByLabelText('Operatör sayısı') as HTMLInputElement).checked).toBe(true);
    expect(await within(panel).findByText('ATCS (öncelik, termin ve süre birlikte)')).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Motor ayarları' }).getAttribute('href')).toBe('/plan/motor-ayarlari');
    expect(within(panel).getByRole('button', { name: /Etkisini gör/ }).hasAttribute('disabled')).toBe(true);
  });

  it('sınır dışı değer hata verir ve hesap düğmesi kapalı kalır', () => {
    kur(ornekCalisma());
    const kutu = screen.getByLabelText(/Dondurulmuş bölge/);
    fireEvent.blur(kutu, { target: { value: '100' } });
    expect(screen.getByRole('alert').textContent).toBe('0 ile 72 arasında olmalı.');
    expect(screen.getByRole('button', { name: /Etkisini gör/ }).hasAttribute('disabled')).toBe(true);
  });

  it('Etkisini gör ayarı taslağa komut olarak yazar, taslakta planı bütün işlerle dizdirir, önce ve sonrayı gösterir; Uygula dizmeyi yazar', async () => {
    const c = ornekCalisma();
    const { t, kapat, yazilan } = kur(c);
    fireEvent.blur(screen.getByLabelText(/Dondurulmuş bölge/), { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('Operatör sayısı'));
    expect(screen.getByText('Dondurulmuş bölge: 4 sa → 8 sa')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Etkisini gör/ }));
    const etki = await screen.findByRole('region', { name: 'Ayarın etkisi' });
    expect(yazilan).toEqual([{ tur: 'ayar', ayar: { w: { dondurma: 8 }, param: {}, ac: [], kapat: ['personel'] }, ayrinti: 'Dondurulmuş bölge: 4 sa → 8 sa; Operatör sayısı: açık → kapalı' }]);
    expect(t.yaz).toHaveBeenCalledWith(yazilan[0], false);
    expect(t.degerlendir).toHaveBeenCalledWith({ tur: 'plan-uygula', isler: ['*'] });
    expect(within(etki).getByText('1 / 2 → 0 / 2')).toBeTruthy();
    // Örnek çalışmanın planı zaten bayattır: o bekleyen de hesaba katılır, kişiye söylenir.
    expect(within(etki).getByText(/dizilmeyi bekleyen 1 değişiklik de/)).toBeTruthy();
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => { expect(kapat).toHaveBeenCalled(); });
    expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is');
    expect(t.geriAl).not.toHaveBeenCalled();
  });

  it('Vazgeç ayarı taslaktan geri alır, dizme yazılmaz', async () => {
    const { t } = kur(ornekCalisma());
    fireEvent.click(screen.getByLabelText('Arıza payı ve termin tamponu'));
    fireEvent.click(screen.getByRole('button', { name: /Etkisini gör/ }));
    const etki = await screen.findByRole('region', { name: 'Ayarın etkisi' });
    fireEvent.click(within(etki).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(screen.queryByRole('region', { name: 'Ayarın etkisi' })).toBeNull(); });
    expect(t.geriAl).toHaveBeenCalledWith(false);
    expect(t.dizmeyiYaz).not.toHaveBeenCalled();
  });

  it('plan yoksa ayar yalnız taslağa yazılır, hesap istenmez', async () => {
    const c = { ...ornekCalisma(), plan: null };
    const { t, yazilan } = kur(c);
    fireEvent.click(screen.getByLabelText('Operatör sayısı'));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazilan).toHaveLength(1); });
    expect(t.degerlendir).not.toHaveBeenCalled();
  });

  it('yazamayan kişi ayarları görür, değiştiremez', () => {
    kur(ornekCalisma(), false);
    expect(screen.getByText('Ayarları yalnız planı yazabilen kişi değiştirir.')).toBeTruthy();
    expect((screen.getByLabelText(/Dondurulmuş bölge/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Etkisini gör/ })).toBeNull();
  });

  it('üst şeritteki yön düğmesinden açılınca taslak o yönle başlar, fark görünür (3282 1c)', () => {
    kur(ornekCalisma(), true, 'geri');
    expect((screen.getByLabelText('Planlama yönü') as HTMLSelectElement).value).toBe('geri');
    expect(screen.getByText('Planlama yönü: İleri: hemen başla → Geri: teslimden geriye')).toBeTruthy();
  });
});
