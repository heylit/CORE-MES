import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ornekCalisma } from '../motor/ornek.ts';
import { planKurSifirla } from '../motor/coz.ts';
import { saatYaz } from '../motor/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { Kapasite } from './Kapasite.tsx';
import { sahteTaslak } from './taslak-test-yardim.ts';

// 3282 2a-1: Kokpit'in kapasite bölümü. Çalışma uydurmadır (örnek başlangıç 2026-10-19); taslak sahtedir.
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

const TEZGAHLAR = [{ id: 'ORN-T1', kod: 'T1', ad: 'Torna', fason: false }, { id: 'ORN-T2', kod: 'T2', ad: '', fason: false }, { id: '~fason', kod: 'Fason', ad: 'dış atölye', fason: true }];
const OTO = { m: 'ORN-T1', from: 30, to: 40, neden: 'bakım', oto: 1 };
const ELLE = { m: 'ORN-T1', from: 50, to: 58, neden: 'arıza' };
const GECMIS = { m: 'ORN-T1', from: 0, to: 4 };

function kur(yazabilir = true, down: unknown[] = [OTO, ELLE, GECMIS]) {
  const c = { ...ornekCalisma(), down } as unknown as PlanlamaCalismasi;
  const { t, yazilan } = sahteTaslak(c.dataVer);
  const kapat = vi.fn();
  const ciz = (cc: PlanlamaCalismasi) => <Kapasite c={cc} m={{ tezgahlar: TEZGAHLAR, simdi: 10 }} taslak={t} yazabilir={yazabilir} zaman={(x) => saatYaz(c.D, x)} kapat={kapat} />;
  const { rerender } = render(ciz(c));
  return { c, t, yazilan, kapat, yenile: (down: unknown[]) => { rerender(ciz({ ...c, down } as unknown as PlanlamaCalismasi)); }, panel: screen.getByRole('complementary', { name: 'Duruşlar' }) };
}

describe('Kokpit kapasite bölümü (3282 2a-1)', () => {
  it('tezgâhın önümüzdeki duruşlarını gösterir; kendiliğinden geleni silinmez, elle gireni adıyla silinir; fason seçilmez', () => {
    const { panel } = kur();
    expect(within(within(panel).getByLabelText('Tezgâh')).getAllByRole('option').map((o) => o.textContent)).toEqual(['T1 · Torna', 'T2']);
    const satirlar = within(panel).getAllByRole('listitem');
    expect(satirlar.map((s) => s.textContent)).toEqual(['Bakım 20.10 Sal 06:00 → 20.10 Sal 16:00 · kendiliğinden geldi', 'Arıza 21.10 Çar 02:00 → 21.10 Çar 10:00']);
    expect(within(satirlar[0]!).queryByRole('button')).toBeNull();
    expect(within(satirlar[1]!).getByRole('button', { name: 'T1 21.10 Çar 02:00 → 21.10 Çar 10:00 duruşunu sil' })).toBeTruthy();
    expect(within(panel).getByText(/kaynağında kapanınca kalkar/)).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText('Tezgâh'), { target: { value: 'ORN-T2' } });
    expect(within(panel).getByText('T2 için önümüzdeki duruş yok.')).toBeTruthy();
  });

  it('duruş ekle taslağa komut yazar (çeyrek saate yuvarlı), etkisini gösterir; Uygula dizmeyi yazar', async () => {
    const { t, yazilan, panel, yenile } = kur();
    fireEvent.change(within(panel).getByLabelText('Tür'), { target: { value: 'bakım' } });
    fireEvent.change(within(panel).getByLabelText('Başlangıç'), { target: { value: '2026-10-20T08:10' } });
    fireEvent.change(within(panel).getByLabelText('Bitiş'), { target: { value: '2026-10-20T12:00' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Duruş ekle, etkisini gör' }));
    const etki = await screen.findByRole('region', { name: 'Duruşun etkisi' });
    expect(yazilan).toEqual([{ tur: 'durus', tezgah: 'ORN-T1', bas: 32.25, bit: 36, neden: 'bakım' }]);
    expect(t.yaz).toHaveBeenCalledWith(yazilan[0], false);
    expect(t.degerlendir).toHaveBeenCalledWith({ tur: 'plan-uygula', isler: ['*'] });
    // Uygula tek birincil düğmedir; ekleme formu etki varken yoktur.
    expect(within(etki).getByRole('button', { name: 'Uygula' }).className).toContain('tc-dugme-birincil');
    expect(within(panel).queryByRole('button', { name: 'Duruş ekle, etkisini gör' })).toBeNull();
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    await vi.waitFor(() => { expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is'); });
    // Uygula'dan sonra odak eklenen satıra gider (dar ekranda form listenin altındadır).
    yenile([OTO, ELLE, { m: 'ORN-T1', from: 32.25, to: 36, neden: 'bakım' }]);
    await vi.waitFor(() => { expect(document.activeElement?.textContent).toBe('Bakım 20.10 Sal 08:15 → 20.10 Sal 12:00'); });
  });

  it('silme taslağa duruş-sil yazar; Vazgeç geri alır', async () => {
    const { t, yazilan, panel } = kur();
    fireEvent.click(within(panel).getByRole('button', { name: /duruşunu sil$/ }));
    const etki = await screen.findByRole('region', { name: 'Duruşun etkisi' });
    expect(yazilan).toEqual([{ tur: 'durus-sil', tezgah: 'ORN-T1', bas: 50, bit: 58 }]);
    fireEvent.click(within(etki).getByRole('button', { name: 'Vazgeç' }));
    await vi.waitFor(() => { expect(t.geriAl).toHaveBeenCalledWith(false); });
  });

  it('ters aralık ve geçmişte biten duruş yazılmaz, nedeni yazılır', () => {
    const { yazilan, panel } = kur();
    fireEvent.change(within(panel).getByLabelText('Başlangıç'), { target: { value: '2026-10-20T12:00' } });
    fireEvent.change(within(panel).getByLabelText('Bitiş'), { target: { value: '2026-10-20T08:00' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Duruş ekle, etkisini gör' }));
    expect(within(panel).getByRole('alert').textContent).toBe('Bitiş başlangıçtan sonra olmalı.');
    fireEvent.change(within(panel).getByLabelText('Başlangıç'), { target: { value: '2026-10-19T02:00' } });
    fireEvent.change(within(panel).getByLabelText('Bitiş'), { target: { value: '2026-10-19T06:00' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Duruş ekle, etkisini gör' }));
    expect(within(panel).getByRole('alert').textContent).toBe('Bitiş şimdiden sonra olmalı.');
    expect(yazilan).toEqual([]);
  });

  it('yazamayan kişi duruşları görür, ekleyemez ve silemez', () => {
    const { panel } = kur(false);
    expect(within(panel).getByText('Duruşu yalnız planı yazabilen kişi ekler ya da siler.')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: /sil$/ })).toBeNull();
    expect(within(panel).queryByRole('form')).toBeNull();
  });
});
