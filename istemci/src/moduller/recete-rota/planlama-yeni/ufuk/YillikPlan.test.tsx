import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import { calismaKaydi } from './test-verisi.ts';
import { yillikDurumSifirla } from './yillik-durum.ts';

// HiGHS jsdom'da yüklenmez; model kurallar.test.ts'te gerçek çözücüyle sınanır. Burada çözücü her sütunu sıfır döndürür.
vi.mock('./cozucu.ts', () => ({
  hsCoz: (_lp: string, _sure: number, want: readonly string[]) => Promise.resolve({ s: 7, ob: 1234, val: Object.fromEntries(want.map((w) => [w, 0])), dual: {} }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yillikDurumSifirla(); });
const BEKLE = { timeout: 10000 };

describe('Yıllık plan', () => {
  it('özet çözülmemiş planı söyler; çöz düğmesi planı kurar, ayrıntıda gösterge, darboğaz ve TL görünür', async () => {
    sunucuKur(YONETICI, calismaKaydi());
    ac('/recete-rota/planlama-yeni/yillik');
    expect(await screen.findByText('Yıllık plan henüz hesaplanmadı', {}, BEKLE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yıllık planı çöz' }));
    expect(await screen.findByText('güncel')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Tüm ayrıntılar' }));
    expect(screen.getByText('Plan bedeli')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Darboğaz ve gölge fiyat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeniden çöz' })).toBeTruthy();
    expect(screen.getByLabelText('Geç teslim bedeli, değerin %/gün')).toBeTruthy();
  }, 20000);

  it('plan.yaz olan kişi tahmini Elle yapar: değişiklik yalnız çalışmanın yıllık ayarına yazılır ve sonuç eskir', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, calismaKaydi(), { govdeler });
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

  it('çalışmanın başlangıç günü yoksa yıllık plan kurulmaz', async () => {
    sunucuKur(YONETICI, calismaKaydi({ meta: {} }));
    ac('/recete-rota/planlama-yeni/yillik');
    expect(await screen.findByText('Planın başlangıç günü okunamadı; yıllık plan kurulamıyor.', {}, BEKLE)).toBeTruthy();
  }, 20000);
});
