import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MotorAyarlari } from '#paylasilan/sozlesme/plan.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { planKurSifirla } from '../motor/coz.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { Ayarlar } from './Ayarlar.tsx';

const MOTOR: MotorAyarlari = { amac: 'sirali', eksikStok: 'varsay', kural: 'atcs', ogrenme: 'kapali', acilPay: 0.05, bolmeKip: 'otomatik', bolmeMaks: 3 };
// Çalışma uydurmadır; sunucu yerine komut ve değerlendirme sahtedir. Değişiklik kopyaya uygulanır (kayit.ts degistir gibi).
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

function kur(c: PlanlamaCalismasi, yazabilir = true) {
  vi.spyOn(api, 'get').mockResolvedValue({ guncel: { surumId: null, degerler: MOTOR, yazan: null, zaman: null }, taslak: null });
  const yazilan: { ne: string; c: PlanlamaCalismasi; planKoru: boolean }[] = [];
  const komut: CalismaKomutu = {
    degistir: vi.fn((ne: string, fn: (t: PlanlamaCalismasi) => boolean | void, s?: { planKoru?: boolean }) => {
      const t = structuredClone(c);
      if (fn(t) === false) return false;
      yazilan.push({ ne, c: t, planKoru: s?.planKoru === true });
      return true;
    }),
    geriAl: vi.fn(() => true), geriAlinabilir: () => true, geriAdimlari: () => [], geriDon: () => true, kaydet: vi.fn(() => Promise.resolve(9)),
  };
  const iste = vi.fn(() => Promise.resolve({
    calismaSurumu: 9, dataVer: c.dataVer, baslangic: null, simdi: 0, maliyetGorunur: false,
    sonuc: { tur: 'plan-uygula' as const, plan: { ozet: { wT: 20, late: 0, n: 2 } } },
  }));
  const kapat = vi.fn();
  render(<MemoryRouter><Ayarlar c={c} komut={komut} yazabilir={yazabilir} kim="ORN-Planlamaci" kapat={kapat} iste={iste as never} /></MemoryRouter>);
  return { komut, iste, kapat, yazilan };
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

  it('Etkisini gör ayarı yazar, planı bütün işlerle yeniden dizdirir, önce ve sonrayı gösterir; Uygula planı alır', async () => {
    const c = ornekCalisma();
    const { komut, iste, kapat, yazilan } = kur(c);
    fireEvent.blur(screen.getByLabelText(/Dondurulmuş bölge/), { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('Operatör sayısı'));
    expect(screen.getByText('Dondurulmuş bölge: 4 sa → 8 sa')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Etkisini gör/ }));
    const etki = await screen.findByRole('region', { name: 'Ayarın etkisi' });
    expect(yazilan[0]?.ne).toBe('Plan ayarı değişti');
    expect(yazilan[0]?.c.w.dondurma).toBe(8);
    expect(yazilan[0]?.c.kapali).toEqual(['personel']);
    expect(iste).toHaveBeenCalledWith(9, { tur: 'plan-uygula', isler: ['*'] });
    expect(within(etki).getByText('1 / 2 → 0 / 2')).toBeTruthy();
    // Örnek çalışmanın planı zaten bayattır: o bekleyen de hesaba katılır, kişiye söylenir.
    expect(within(etki).getByText(/bekleyen 1 değişiklik de/)).toBeTruthy();
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    expect(yazilan[1]).toMatchObject({ ne: 'Plan ayarı uygulandı', planKoru: true });
    expect(yazilan[1]?.c.plan?.ozet).toEqual({ wT: 20, late: 0, n: 2 });
    expect(kapat).toHaveBeenCalled();
    expect(komut.geriAl).not.toHaveBeenCalled();
  });

  it('Vazgeç ayarı geri alır, plan alınmaz', async () => {
    const { komut, yazilan } = kur(ornekCalisma());
    fireEvent.click(screen.getByLabelText('Arıza payı ve termin tamponu'));
    fireEvent.click(screen.getByRole('button', { name: /Etkisini gör/ }));
    const etki = await screen.findByRole('region', { name: 'Ayarın etkisi' });
    fireEvent.click(within(etki).getByRole('button', { name: 'Vazgeç' }));
    expect(komut.geriAl).toHaveBeenCalledTimes(1);
    expect(yazilan).toHaveLength(1);
    await waitFor(() => { expect(screen.queryByRole('region', { name: 'Ayarın etkisi' })).toBeNull(); });
  });

  it('plan yoksa ayar yalnız kaydedilir, hesap istenmez', () => {
    const c = { ...ornekCalisma(), plan: null };
    const { iste, yazilan } = kur(c);
    fireEvent.click(screen.getByLabelText('Operatör sayısı'));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(yazilan).toHaveLength(1);
    expect(iste).not.toHaveBeenCalled();
  });

  it('yazamayan kişi ayarları görür, değiştiremez', () => {
    kur(ornekCalisma(), false);
    expect(screen.getByText('Ayarları yalnız planı yazabilen kişi değiştirir.')).toBeTruthy();
    expect((screen.getByLabelText(/Dondurulmuş bölge/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Etkisini gör/ })).toBeNull();
  });
});
