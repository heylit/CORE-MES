import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import { calismaKaydi } from './test-verisi.ts';
import { yillikDurumSifirla } from './yillik-durum.ts';

// Çözüm sunucudadır (454/6 a); model kurallar.test.ts'te gerçek HiGHS'le sınanır. Burada sahte sunucunun çözüm ucu her sütunu sıfır döndürür;
// verilmezse uç yoktur (ortak sahte sunucu bilinmeyen yazmaya 405 döner).
function cozucuKur(istekler: { lp: string; sure: number; want: string[] }[] = []) {
  const onceki = globalThis.fetch;
  const sonuclar = new Map<string, unknown>();
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const json = (g: unknown) => new Response(JSON.stringify(g), { status: 200 });
    if (adres === '/api/recete-rota/yillik-plan/coz' && istek?.method === 'POST') {
      const g = JSON.parse(String(istek.body)) as { lp: string; sure: number; want: string[] };
      istekler.push(g);
      const is = `00000000-0000-4000-8000-${String(istekler.length).padStart(12, '0')}`;
      sonuclar.set(is, { s: 7, ob: 1234, val: Object.fromEntries(g.want.map((w) => [w, 0])), dual: {} });
      return json({ is });
    }
    const m = /^\/api\/recete-rota\/yillik-plan\/coz\/(.+)$/.exec(adres);
    if (m?.[1] !== undefined) return json({ durum: 'bitti', cozum: sonuclar.get(m[1]) });
    return onceki(adres, istek);
  }));
  return istekler;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yillikDurumSifirla(); });
const BEKLE = { timeout: 10000 };

describe('Yıllık plan', () => {
  it('özet çözülmemiş planı söyler; çöz düğmesi planı kurar, ayrıntıda gösterge, darboğaz ve TL görünür', async () => {
    sunucuKur(YONETICI, calismaKaydi());
    const cozumler = cozucuKur();
    ac('/recete-rota/planlama-yeni/yillik');
    expect(await screen.findByText('Yıllık plan henüz hesaplanmadı', {}, BEKLE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yıllık planı çöz' }));
    expect(await screen.findByText('güncel')).toBeTruthy();
    expect(cozumler.map((c) => c.sure)).toEqual([30, 60, 30]);
    expect(cozumler[1]?.lp).toContain('Subject To');
    fireEvent.click(screen.getByRole('tab', { name: 'Tüm ayrıntılar' }));
    expect(screen.getByText('Plan bedeli')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Darboğaz ve gölge fiyat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeniden çöz' })).toBeTruthy();
    expect(screen.getByLabelText('Geç teslim bedeli, değerin %/gün')).toBeTruthy();
  }, 20000);

  it('plan.yaz olan kişi tahmini Elle yapar: değişiklik yalnız çalışmanın yıllık ayarına yazılır ve sonuç eskir', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, calismaKaydi(), { govdeler });
    cozucuKur();
    ac('/recete-rota/planlama-yeni/yillik');
    fireEvent.click(await screen.findByRole('tab', { name: 'Tüm ayrıntılar' }, BEKLE));
    fireEvent.click(screen.getByRole('button', { name: 'Yıllık planı çöz' }));
    await screen.findByText('Grup yükü, kapasitenin %\'si');
    const grup = screen.getByRole('group', { name: 'Talep tahmini' });
    fireEvent.click(within(grup).getByRole('button', { name: 'Elle' }));
    expect(await screen.findByText('Veri ya da varsayım değişti; yeniden çözülmeli.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Elle tahmin' })).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ beklenenSurum: 4, deger: { D: { yillik: { tahmin: 'elle', buyume: 10 } } } });
  }, 20000);

  it('veri gir: varsayım formu değişmeyen kaydı reddeder, değişeni yazar', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, calismaKaydi(), { govdeler });
    ac('/recete-rota/planlama-yeni/yillik');
    fireEvent.click(await screen.findByRole('tab', { name: 'Veri gir' }, BEKLE));
    fireEvent.click(screen.getAllByRole('button', { name: 'Aç' })[0] as HTMLElement);
    const form = await screen.findByRole('form', { name: 'Talep ve kapasite varsayımları' });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await within(form).findByText('Hiçbir şey değişmedi.')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('Ek mesai sınırı (kapasitenin %)'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await within(form).findByText('0 ile 60 arasında bir sayı girin.')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('Ek mesai sınırı (kapasitenin %)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ deger: { D: { yillik: { mesaiMaks: 25 } } } });
  }, 20000);

  it('plan.yaz ve maliyet okuması olmayan kişi: Veri gir yok, ayarlar kapalı, TL ve bedel ayarları görünmez (reddedilen)', async () => {
    sunucuKur(MALIYETSIZ, calismaKaydi());
    cozucuKur();
    ac('/recete-rota/planlama-yeni/yillik');
    await screen.findByRole('tab', { name: 'Özet' }, BEKLE);
    expect(screen.queryByRole('tab', { name: 'Veri gir' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Tüm ayrıntılar' }));
    const grup = screen.getByRole('group', { name: 'Talep tahmini' });
    expect((within(grup).getByRole('button', { name: 'Elle' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText('Geç teslim bedeli, değerin %/gün')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yıllık planı çöz' }));
    await screen.findByText('Grup yükü, kapasitenin %\'si');
    expect(screen.queryByText('Plan bedeli')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hedefi motora ver' })).toBeNull();
  }, 20000);

  it('sunucuda çözüm ucu yoksa çöz düğmesi kapanır ve nedeni yazılır; ekranın geri kalanı açık kalır', async () => {
    const istekler = sunucuKur(YONETICI, calismaKaydi());
    ac('/recete-rota/planlama-yeni/yillik');
    fireEvent.click(await screen.findByRole('tab', { name: 'Tüm ayrıntılar' }, BEKLE));
    fireEvent.click(screen.getByRole('button', { name: 'Yıllık planı çöz' }));
    expect(await screen.findByText('Yıllık plan çözücüsü sunucuya bağlanınca açılır.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Yıllık planı çöz' }) as HTMLButtonElement).disabled).toBe(true);
    expect(istekler.filter((i) => i === 'POST /recete-rota/yillik-plan/coz')).toHaveLength(1);
    expect((within(screen.getByRole('group', { name: 'Talep tahmini' })).getByRole('button', { name: 'Elle' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Özet' }));
    expect(screen.getByText('kapalı')).toBeTruthy();
  }, 20000);

  it('çalışmanın başlangıç günü yoksa yıllık plan kurulmaz', async () => {
    sunucuKur(YONETICI, calismaKaydi({ meta: {} }));
    ac('/recete-rota/planlama-yeni/yillik');
    expect(await screen.findByText('Planın başlangıç günü okunamadı; yıllık plan kurulamıyor.', {}, BEKLE)).toBeTruthy();
  }, 20000);
});
