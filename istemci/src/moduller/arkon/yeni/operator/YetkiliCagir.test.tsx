import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { KartsizIzin } from '#paylasilan/sozlesme/kartsiz-izin.ts';
import { baslatmaKartAlani } from '../../../../../../arkon/web/src/data/refakat-karti.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { KartlaBaslat } from './KartlaBaslat.tsx';
import { IZIN_SORMA_MS } from './YetkiliCagir.tsx';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const ISTEK: KartsizIzin = {
  id: 31, durum: 'bekliyor', emir: { id: 5, no: 'ORN-UE-5' }, adim: { id: 41, sira: 1, ad: 'Tornalama' }, isteyen: { id: 9, ad: 'Ornek Operator' },
  istekAn: '2026-11-27T08:00:00+03:00', kararVeren: null, kararGerekce: null, kararAn: null, gecerlilikBitis: '2026-11-27T08:10:00+03:00',
};

describe('3771 a: kartı olmayan operatör yetkiliyi çağırır', () => {
  it('yetkisiz operatör çağırır, cevap kendiliğinden okunur; izin gelince iş bir kez izinle başlar', async () => {
    vi.useFakeTimers();
    const post = vi.spyOn(api, 'post').mockResolvedValue(ISTEK as never);
    const get = vi.spyOn(api, 'get').mockResolvedValue({ ...ISTEK, durum: 'izin', kararVeren: 'Ornek Mudur', kararGerekce: 'Kart basılmadı, ilk parti', gecerlilikBitis: null } as never);
    const izinle = vi.fn();
    render(<KartlaBaslat is="ORN-UE-5" kartlar={[]} yetkili={false} kartla={() => {}} kartsiz={() => {}} kamera={() => {}} kapat={() => {}} cagri={{ emirId: 5, isEmriId: 41 }} izinle={izinle} />);
    expect(screen.queryByRole('button', { name: /Kartsız başlat/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Yetkiliyi çağır/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(post).toHaveBeenCalledWith('/uretim-emirleri/5/kartsiz-izin-iste', { isEmriId: 41 });
    expect(screen.getByRole('status').textContent).toMatch(/Bekliyor.*Yetkiliye bildirim gitti/);
    expect(screen.getByRole('button', { name: /İsteği iptal et/ })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(IZIN_SORMA_MS); });
    expect(get).toHaveBeenCalledWith('/uretim-emirleri/kartsiz-izinler/31');
    expect(screen.getByRole('status').textContent).toContain('Ornek Mudur izin verdi: "Kart basılmadı, ilk parti"');
    expect(izinle).toHaveBeenCalledTimes(1);
    expect(izinle).toHaveBeenCalledWith(31);
    await act(async () => { await vi.advanceTimersByTimeAsync(IZIN_SORMA_MS * 2); });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('ret ve süre dolunca yeniden çağrılır; iptal isteği kapatır', async () => {
    vi.spyOn(api, 'post').mockImplementation(((yol: string) => Promise.resolve(yol.endsWith('/iptal') ? { ...ISTEK, durum: 'iptal', gecerlilikBitis: null } : ISTEK)) as never);
    render(<KartlaBaslat is="ORN-UE-5" kartlar={[]} yetkili={false} kartla={() => {}} kartsiz={() => {}} kamera={() => {}} kapat={() => {}} cagri={{ emirId: 5, isEmriId: null }} izinle={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Yetkiliyi çağır/ }));
    fireEvent.click(await screen.findByRole('button', { name: /İsteği iptal et/ }));
    expect((await screen.findByRole('status')).textContent).toBeTruthy();
    await screen.findByText(/İstek iptal edildi/);
    expect(screen.getByRole('button', { name: /Yeniden çağır/ })).toBeTruthy();
  });

  it('yetkili kendi gerekçesiyle başlatır, çağrı düğmesi çıkmaz; CORE dışı işte eski yol tarifi kalır', () => {
    const { unmount } = render(<KartlaBaslat is="ORN-UE-5" kartlar={[]} yetkili kartla={() => {}} kartsiz={() => {}} kamera={() => {}} kapat={() => {}} cagri={{ emirId: 5, isEmriId: 41 }} izinle={() => {}} />);
    expect(screen.queryByRole('button', { name: /Yetkiliyi çağır/ })).toBeNull();
    unmount();
    render(<KartlaBaslat is="ORN-UE-5" kartlar={[]} yetkili={false} kartla={() => {}} kartsiz={() => {}} kamera={() => {}} kapat={() => {}} />);
    expect(screen.getByText('Kart yoksa yetkili kişi gerekçeyle başlatır.')).toBeTruthy();
  });

  it('başlatma kaydı kart ya da gerekçe yoksa izni taşır', () => {
    expect(baslatmaKartAlani({ kart: null, kartsizGerekce: null, kartsizIzinId: 31 })).toEqual({ kartsizIzinId: 31 });
    expect(baslatmaKartAlani({ kart: 7, kartsizIzinId: 31 })).toEqual({ refakatPartisiId: 7 });
    expect(baslatmaKartAlani({ kart: null, kartsizIzinId: 0 })).toEqual({});
  });
});
