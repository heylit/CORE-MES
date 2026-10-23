import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { ornekDepo, onay, SIMDI } from '../ornek-veri.ts';
import { ac, sunucuKur } from '../test-ortak.tsx';
import { akisAdimlari, isParcalari } from './IsMerkezi.tsx';

const SATINALMACI: Kullanici = { id: 5, ad: 'Deneme Satınalmacı', islemler: ['kisiler.rol-yonet', 'portal.oku', 'portal.yaz'] };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('IsMerkezi', () => {
  it('aciliyete göre yapılacakları, sayıları ve satın alma akışını gösterir', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    sunucuKur(SATINALMACI, ornekDepo());
    ac('/portal/yeni');
    expect(await screen.findByRole('heading', { name: 'Yapılacaklar' }, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Acil' })).toBeTruthy();
    expect(screen.getByText('SP-2026-o1')).toBeTruthy();
    expect(screen.getAllByText('Satın alma akışı').length).toBeGreaterThan(0);
    // 230 a: taşınmayan sipariş işi sahibin listesine gider.
    expect(screen.getAllByRole('link', { name: /SP-2026-o1/ }).map((a) => a.getAttribute('href'))).toContain('/satin-alma');
    // Satış ve finans izni yok: satış akışı ve satış siparişi kısayolu görünmez.
    expect(screen.queryByText('Satış akışı')).toBeNull();
    expect(screen.queryByText('Satış siparişi')).toBeNull();
    expect(screen.getAllByText('Satın alma siparişi').length).toBeGreaterThan(0);
  });

  it('grupta beşten fazla iş varsa kalanını düğmeyle açar', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const d = ornekDepo();
    const approvals = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`a${String(i)}`, onay({ id: `a${String(i)}` })]));
    sunucuKur(SATINALMACI, { ...d, approvals });
    ac('/portal/yeni');
    const dugme = await screen.findByRole('button', { name: '2 iş daha göster' }, { timeout: 5000 });
    fireEvent.click(dugme);
    expect(screen.queryByRole('button', { name: '2 iş daha göster' })).toBeNull();
  });

  it('iş adını düğme ve etikete ayırır; akış kapalı siparişi saymaz', () => {
    expect(isParcalari({ t: 'Teslim alın: SP-1', v: 'order' })).toEqual({ etiket: '', baslik: 'SP-1', dugme: 'Teslim alın' });
    expect(isParcalari({ t: 'Müşteri siparişi gecikmede: SP-2', v: 'order' })).toEqual({ etiket: 'Müşteri siparişi gecikmede', baslik: 'SP-2', dugme: 'Siparişi aç' });
    const adimlar = akisAdimlari(ornekDepo(), 'purchase', SIMDI);
    expect(adimlar.find((a) => a.etiket === 'Gecikmede')).toEqual({ etiket: 'Gecikmede', sayi: 1, dikkat: true });
  });
});
