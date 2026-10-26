import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { MALIYET_ANAHTARLARI, ONERILEN_IKINCI_MENU } from '../planlama-menusu.ts';
import { GORUNUM_KAYITLARI } from './gorunumler.ts';
import { CALISMA_KAYDI, KAPISIZ, MALIYETSIZ, PLANLAMASIZ, YONETICI, ac, sunucuKur } from './test-ortak.tsx';

// Testler yer tutucu metnine bağlı değildir: görünüm kabın `data-gorunum`'undan, şerit sekmelerden okunur (parça teslim edilince değişmezler).
const MENU = ONERILEN_IKINCI_MENU.gruplar[0].maddeler;
const kap = () => document.querySelector('[data-gorunum]');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PlanlamaYeni', () => {
  it('kök adres Planlama motoru görünümüdür; görünüm sırası ikinci menünündür; kayıt varken açılış yalnız okur', async () => {
    const istekler = sunucuKur(YONETICI, [CALISMA_KAYDI]);
    ac('/plan');
    await waitFor(() => { expect(kap()?.getAttribute('data-gorunum')).toBe('plan'); }, { timeout: 10000 });
    expect(screen.getByTestId('adres').textContent).toBe('/plan');
    expect(GORUNUM_KAYITLARI.map((k) => k.baslik)).toEqual(MENU.map((m) => m.baslik));
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
    expect(istekler).toEqual(expect.arrayContaining(['GET /recete-rota/ben', 'GET /recete-rota/kayitlar', 'GET /plan/planlama-kaynagi', 'GET /plan/senaryolar']));
  }, 20000);

  it('görünüm adresle açılır, adres eski ekranın anahtarıdır; /plan/plan eski bağlantı olarak motoru açar', async () => {
    sunucuKur(YONETICI);
    ac('/plan/sevkiyat');
    await waitFor(() => { expect(kap()?.getAttribute('data-gorunum')).toBe('sevkiyat'); }, { timeout: 10000 });
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(YONETICI);
    ac('/plan/plan');
    await waitFor(() => { expect(kap()?.getAttribute('data-gorunum')).toBe('plan'); }, { timeout: 10000 });
  }, 20000);

  it('657 a: kayıt yoksa yazabilen kişide boş çalışma bir kez kurulur ve yeniden okunur; yazamayan yalnız okur', async () => {
    const istekler = sunucuKur(YONETICI);
    ac('/plan');
    await waitFor(() => { expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual(['POST /plan/planlama-calismasi/olustur']); }, { timeout: 10000 });
    await waitFor(() => { expect(istekler.filter((i) => i === 'GET /plan/planlama-calismasi')).toHaveLength(2); }, { timeout: 10000 });
    cleanup(); vi.unstubAllGlobals();
    const okuyan = sunucuKur(MALIYETSIZ);
    ac('/plan');
    await waitFor(() => { expect(kap()?.getAttribute('data-gorunum')).toBe('plan'); }, { timeout: 10000 });
    expect(okuyan.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);

  it('plan çubuğu motor dışındaki her sayfanın üstündedir; Plan düğmesi motora götürür, motorda tek çubuk vardır (497/10 a)', async () => {
    sunucuKur(YONETICI);
    ac('/plan/ysiparis');
    const cubuk = await screen.findByRole('toolbar', { name: 'Plan çubuğu' }, { timeout: 10000 });
    expect(cubuk.querySelector('[aria-current]')).toBeNull();
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Plan' }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/plan'); });
    await waitFor(() => { expect(screen.getAllByRole('toolbar', { name: 'Plan çubuğu' })).toHaveLength(1); }, { timeout: 10000 });
  }, 20000);

  it('bilinmeyen görünüm adresi kök görünüme döner', async () => {
    sunucuKur(YONETICI);
    ac('/plan/yok');
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/plan'); }, { timeout: 10000 });
  }, 20000);

  it('maliyet okuması olmayan kişide maliyet görünümleri şeritte yoktur, adresle açılmaz (izinli ve reddedilen)', async () => {
    sunucuKur(MALIYETSIZ);
    ac('/plan/maliyet');
    expect(await screen.findByText('Bu sayfayı görme yetkiniz yok.', {}, { timeout: 10000 })).toBeTruthy();
    for (const a of MALIYET_ANAHTARLARI) expect(MENU.find((m) => m.anahtar === a)?.islem).toBe('finans.maliyet-oku');
  }, 20000);

  it('planlama okuması olmayan kişi ekranı açamaz ve hiçbir planlama ucunu sormaz', async () => {
    const istekler = sunucuKur(PLANLAMASIZ);
    ac('/plan');
    expect(await screen.findByText('Planlama sayfalarını görme yetkiniz yok.', {}, { timeout: 10000 })).toBeTruthy();
    expect(istekler.filter((i) => i !== 'GET /oturum')).toEqual([]);
  }, 20000);

  it('659 a: ekran yönetici kapısı istemez; planlama işlemi olan kişi açar', async () => {
    sunucuKur(KAPISIZ);
    ac('/plan');
    await waitFor(() => { expect(kap()?.getAttribute('data-gorunum')).toBe('plan'); }, { timeout: 10000 });
    expect(screen.queryByText(YENI_EKRAN_ILETISI)).toBeNull();
  }, 20000);

  it('zorunlu okuma düşerse hata ve yeniden deneme gösterilir; isteğe bağlı okuma düşerse ekran açılır', async () => {
    sunucuKur(YONETICI, [], { ret: (y) => y === '/recete-rota/kayitlar' });
    ac('/plan');
    expect(await screen.findByText('Bu işlem için yetkiniz yok.', {}, { timeout: 10000 })).toBeTruthy();
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(YONETICI, [], { ret: (y) => y === '/plan/senaryolar' });
    ac('/plan');
    await waitFor(() => { expect(kap()?.getAttribute('data-gorunum')).toBe('plan'); }, { timeout: 10000 });
  }, 20000);
});
