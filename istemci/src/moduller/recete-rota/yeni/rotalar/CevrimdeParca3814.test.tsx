import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

// 3814 a: süre satırının altında çevrimde parça; 1'den büyükse makine çevrimi açılır, yazılınca işlem / adet ondan hesaplanır. Veri uydurmadır.
beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

const BEKLE = { timeout: 4000 };
const bolumAc = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  const duzenle = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (duzenle) fireEvent.click(duzenle);
  return bolge;
};
const yaz = (alan: HTMLElement, deger: string) => { fireEvent.change(alan, { target: { value: deger } }); fireEvent.blur(alan); };
type Govde = { adimlar: { cevrimdeParca?: number; islemSuresiDk: number | null }[] };

describe('3814 çevrimde parça', () => {
  it('k = 1 iken makine çevrimi yok; 4 yazılınca açılır, 22 dk yazılınca işlem / adet 5,5 olur ve ikisi kaydedilir; k 2 olunca işlem korunur', async () => {
    const durum = rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 1, [adimOrnegi({ proc: 22, cycle: 22 })])]);
    const istekler = sunucuKur(YONETICI, { durum });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
    const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
    expect(within(panel).queryByLabelText('Makine çevrimi (dk)')).toBeNull();
    expect(within(panel).getByText(/parça başı süre 22 dk/)).toBeTruthy();

    yaz(within(panel).getByLabelText('Çevrimde parça'), '4');
    const cevrim = await within(panel).findByLabelText('Makine çevrimi (dk)');
    expect((cevrim as HTMLInputElement).value).toBe('88');
    expect(within(panel).getByRole('status').textContent).toMatch(/İşlem \/ adet 22 dk korundu/);
    yaz(cevrim, '22');
    await waitFor(() => { expect((within(panel).getByLabelText('İşlem / adet') as HTMLInputElement).value).toBe('5,5'); });
    expect(within(panel).getByText(/parça başı süre 5,5 dk · makine çevrimi 22 dk, 4 parça/)).toBeTruthy();
    expect(within(panel).getByRole('status').textContent).toBe('');

    yaz(within(panel).getByLabelText('Çevrimde parça'), '2');
    await waitFor(() => { expect((within(panel).getByLabelText('Makine çevrimi (dk)') as HTMLInputElement).value).toBe('11'); });
    expect((within(panel).getByLabelText('İşlem / adet') as HTMLInputElement).value).toBe('5,5');

    await waitFor(() => {
      const son = istekler.filter((i) => i.yol === '/rota/revizyonlar/72/kaydet').at(-1);
      expect((son?.govde as Govde | undefined)?.adimlar[0]).toMatchObject({ cevrimdeParca: 2, islemSuresiDk: 5.5 });
    }, BEKLE);
  }, 30000);

  it('geçersiz çevrimde parça metinle reddedilir, kayıt gitmez', async () => {
    const istekler = sunucuKur(YONETICI, { durum: rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 1)]) });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
    const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
    yaz(within(panel).getByLabelText('Çevrimde parça'), '1,5');
    expect(await within(panel).findByRole('alert')).toHaveProperty('textContent', '1 ya da daha büyük tam sayı girin.');
    await new Promise((r) => { setTimeout(r, 1000); });
    expect(istekler.filter((i) => i.yol === '/rota/revizyonlar/72/kaydet')).toEqual([]);
  }, 30000);
});
