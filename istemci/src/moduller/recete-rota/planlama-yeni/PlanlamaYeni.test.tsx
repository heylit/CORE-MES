import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { MALIYET_ANAHTARLARI, ONERILEN_IKINCI_MENU } from '../planlama-menusu.ts';
import { KAPISIZ, MALIYETSIZ, PLANLAMASIZ, YONETICI, ac, sunucuKur } from './test-ortak.tsx';

// Testler yer tutucu metnine bağlı değildir: görünüm kabın `data-gorunum`'undan, şerit sekmelerden okunur (parça teslim edilince değişmezler).
const MENU = ONERILEN_IKINCI_MENU.gruplar[1].maddeler;
const kap = () => document.querySelector('[data-gorunum]');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PlanlamaYeni', () => {
  it('kök adres Planlama motoru görünümüne düşer; şerit ikinci menünün Planlama grubuyla aynı sırada gelir; açılış yalnız okur', async () => {
    const istekler = sunucuKur(YONETICI);
    ac('/recete-rota/planlama-yeni');
    const serit = await screen.findByRole('tablist', { name: 'Planlama görünümleri' }, { timeout: 10000 });
    expect(screen.getByTestId('adres').textContent).toBe('/recete-rota/planlama-yeni/plan');
    expect(kap()?.getAttribute('data-gorunum')).toBe('plan');
    expect([...serit.querySelectorAll('[role="tab"]')].map((s) => s.textContent)).toEqual(MENU.map((m) => m.baslik));
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
    expect(istekler).toEqual(expect.arrayContaining(['GET /recete-rota/ben', 'GET /recete-rota/kayitlar', 'GET /recete-rota/durum', 'GET /plan/senaryolar']));
  }, 20000);

  it('şeritten görünüm değişir, adres eski ekranın anahtarıdır', async () => {
    sunucuKur(YONETICI);
    ac('/recete-rota/planlama-yeni/plan');
    fireEvent.click(await screen.findByRole('tab', { name: 'Sevkiyat' }, { timeout: 10000 }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/recete-rota/planlama-yeni/sevkiyat'); });
    expect(kap()?.getAttribute('data-gorunum')).toBe('sevkiyat');
  }, 20000);

  it('bilinmeyen görünüm adresi kök görünüme döner', async () => {
    sunucuKur(YONETICI);
    ac('/recete-rota/planlama-yeni/yok');
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/recete-rota/planlama-yeni/plan'); }, { timeout: 10000 });
  }, 20000);

  it('maliyet okuması olmayan kişide maliyet görünümleri şeritte yoktur, adresle açılmaz (izinli ve reddedilen)', async () => {
    sunucuKur(MALIYETSIZ);
    ac('/recete-rota/planlama-yeni/maliyet');
    const serit = await screen.findByRole('tablist', { name: 'Planlama görünümleri' }, { timeout: 10000 });
    const sekmeler = [...serit.querySelectorAll('[role="tab"]')].map((s) => s.getAttribute('data-sekme'));
    for (const a of MALIYET_ANAHTARLARI) expect(sekmeler).not.toContain(a);
    expect(screen.getByText('Bu sayfayı görme yetkiniz yok.')).toBeTruthy();
  }, 20000);

  it('planlama okuması olmayan kişi ekranı açamaz ve hiçbir planlama ucunu sormaz', async () => {
    const istekler = sunucuKur(PLANLAMASIZ);
    ac('/recete-rota/planlama-yeni');
    expect(await screen.findByText('Planlama sayfalarını görme yetkiniz yok.', {}, { timeout: 10000 })).toBeTruthy();
    expect(istekler.filter((i) => i !== 'GET /oturum')).toEqual([]);
  }, 20000);

  it('kapı yöneticide: kapısız kişi ekranı görmez', async () => {
    const istekler = sunucuKur(KAPISIZ);
    ac('/recete-rota/planlama-yeni');
    expect(await screen.findByText(YENI_EKRAN_ILETISI, {}, { timeout: 10000 })).toBeTruthy();
    expect(istekler.filter((i) => i !== 'GET /oturum')).toEqual([]);
  }, 20000);

  it('zorunlu okuma düşerse hata ve yeniden deneme gösterilir; isteğe bağlı okuma düşerse ekran açılır', async () => {
    sunucuKur(YONETICI, [], { ret: (y) => y === '/recete-rota/kayitlar' });
    ac('/recete-rota/planlama-yeni');
    expect(await screen.findByText('Bu işlem için yetkiniz yok.', {}, { timeout: 10000 })).toBeTruthy();
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(YONETICI, [], { ret: (y) => y === '/plan/senaryolar' });
    ac('/recete-rota/planlama-yeni');
    expect(await screen.findByRole('tablist', { name: 'Planlama görünümleri' }, { timeout: 10000 })).toBeTruthy();
  }, 20000);
});
