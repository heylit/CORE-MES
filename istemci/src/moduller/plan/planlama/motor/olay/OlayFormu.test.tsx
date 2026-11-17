import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KIMLIK_ADLARI } from '../../kaynak-kodu.tsx';
import { saatOku, simdiSaati } from '../kurallar.ts';
import { ornekCalisma } from '../ornek.ts';
import { OlayFormu } from './OlayFormu.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// 3308-1 a: olay formu Stüdyo'dan şeride taşındı; gönderilen olay aynı sözleşmedir (1982 a).
const ciz = (o: { ekle?: (x: unknown) => Promise<boolean>; kapat?: () => void; on?: 'ariza' | 'acil' | 'malzeme' | 'eksik' | 'fason' } = {}) => {
  const ekle = o.ekle ?? vi.fn(() => Promise.resolve(true)); const kapat = o.kapat ?? vi.fn();
  render(<OlayFormu c={ornekCalisma()} ad={KIMLIK_ADLARI} ekle={ekle} kapat={kapat} on={o.on} />);
  return { ekle, kapat };
};

describe('olay formu', () => {
  it('arıza seçili tezgâh ve süreyle gider, başarılı olunca kapanır (izinli)', async () => {
    const { ekle, kapat } = ciz();
    fireEvent.change(screen.getByLabelText('Süre (saat)'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Olayı ekle' }));
    await waitFor(() => { expect(kapat).toHaveBeenCalledTimes(1); });
    expect(ekle).toHaveBeenCalledWith(expect.objectContaining({ tip: 'ariza', saat: 4, m: ornekCalisma().D.tezgahlar[0]?.id }));
  });

  it('eksik alanla gönderilmez: acil siparişte termin boşken düğme pasif (reddedilen)', () => {
    const { ekle } = ciz({ on: 'acil' });
    const d = screen.getByRole('button', { name: 'Olayı ekle' });
    expect(d.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(d);
    expect(ekle).not.toHaveBeenCalled();
  });

  it('sunucu reddederse form açık kalır, yeniden gönderilebilir', async () => {
    const ekle = vi.fn(() => Promise.resolve(false));
    const { kapat } = ciz({ ekle });
    fireEvent.click(screen.getByRole('button', { name: 'Olayı ekle' }));
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Olayı ekle' }).getAttribute('aria-disabled')).toBe('false'); });
    expect(kapat).not.toHaveBeenCalled();
  });

  it('tür seçimi alanları değiştirir; ön seçili tür basılı gelir', () => {
    ciz({ on: 'malzeme' });
    expect(screen.getByRole('button', { name: 'Malzeme gecikmesi' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Gecikme (gün)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fason gecikmesi' }));
    expect(screen.getByLabelText('Fasoncu')).toBeTruthy();
  });

  it('3355: firması belirlenmemiş fason hattı fason gecikmesinde seçilemez', () => {
    const c = ornekCalisma();
    c.D.fasoncular = [...(c.D.fasoncular ?? []), { id: '~belirsiz', ad: 'Firma belirlenmedi', sureGun: 7 } as NonNullable<typeof c.D.fasoncular>[number]];
    render(<OlayFormu c={c} ad={KIMLIK_ADLARI} ekle={vi.fn(() => Promise.resolve(true))} kapat={vi.fn()} on="fason" />);
    const secenekler = [...(screen.getByLabelText('Fasoncu') as HTMLSelectElement).options].map((o) => o.value);
    expect(secenekler.length).toBeGreaterThan(0);
    expect(secenekler).not.toContain('~belirsiz');
  });

  // 2506 a: arıza geçmişe yazılmaz. Geçmiş bir başlangıç seçilse de olay gönderme anından başlar; ileri bir başlangıç aynen gider.
  it('arızanın başlangıcı şimdiden önce olamaz: geçmiş an şimdiye çekilir, ileri an korunur', async () => {
    const c = ornekCalisma(); const gun0 = String(c.D.meta?.baslangic).slice(0, 10);
    const gun = (n: number) => new Date(Date.parse(`${gun0}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const an = Date.parse(`${gun(2)}T10:00:00+03:00`);
    vi.spyOn(Date, 'now').mockReturnValue(an);
    const simdi = simdiSaati(c, an);
    const gecmis = saatOku(c.D, `${gun(1)} 09:00`), ileri = saatOku(c.D, `${gun(4)} 09:00`);
    expect(gecmis).not.toBeNull(); expect(ileri).not.toBeNull();
    expect(gecmis as number).toBeLessThan(simdi); expect(ileri as number).toBeGreaterThan(simdi);

    const ilk = ciz();
    fireEvent.change(screen.getByLabelText('Başlangıç (boşsa şimdi)'), { target: { value: `${gun(1)}T09:00` } });
    fireEvent.click(screen.getByRole('button', { name: 'Olayı ekle' }));
    await waitFor(() => { expect(ilk.kapat).toHaveBeenCalledTimes(1); });
    expect(ilk.ekle).toHaveBeenCalledWith(expect.objectContaining({ tip: 'ariza', bas: simdi }));
    cleanup();

    const ikinci = ciz();
    fireEvent.change(screen.getByLabelText('Başlangıç (boşsa şimdi)'), { target: { value: `${gun(4)}T09:00` } });
    fireEvent.click(screen.getByRole('button', { name: 'Olayı ekle' }));
    await waitFor(() => { expect(ikinci.kapat).toHaveBeenCalledTimes(1); });
    expect(ikinci.ekle).toHaveBeenCalledWith(expect.objectContaining({ tip: 'ariza', bas: ileri }));
  });
});
