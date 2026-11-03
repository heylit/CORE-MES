import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { finansAc, json, OKUYAN, sunucuKur, YAZAN, type Istek } from '../test-ortak.tsx';

// Örnek verinin tarihleri sabittir: bugün 20.10.2026 (verilen çekin vadesi bugün, alınan çek 30 gün içinde).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T09:00:00'));
  // Grafik tuvali test ortamında çizilmez; değerler gizli tabloda okunur.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// Günlük skoru sunucu yazar (1456 b); ekranın her POST'u satır eylemidir.
const postlar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST');

const anaSayfa = async (istekler: readonly Istek[]) => {
  await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
  await screen.findByText('Yapılacaklar');
};

describe('F4 ana sayfa', () => {
  it('şirket adı, dört sayı, yapılacaklar ve finansal durum çizilir', async () => {
    const istekler = sunucuKur(YAZAN);
    finansAc();
    await anaSayfa(istekler);
    expect(screen.getByRole('heading', { name: 'Deneme Sirketi' })).toBeTruthy();
    for (const b of ['Kasada ve bankada', 'Alacağım', 'Borcum', 'Aylık ortalama kâr']) expect(screen.getByText(b)).toBeTruthy();
    expect(screen.getByText('Finansal durum')).toBeTruthy();
    expect(screen.getByText('Nakit görünümü')).toBeTruthy();
    expect(screen.getByText('Verilen çek · hesapta para bulunmalı')).toBeTruthy();
  });

  it('finans.yaz yoksa hızlı kayıt ve satır düğmeleri gizli; gezinme düğmeleri kalır', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc();
    await anaSayfa(istekler);
    expect(screen.queryByRole('group', { name: 'Hızlı kayıt' })).toBeNull();
    for (const ad of ['Satış', 'Tahsilat gir', 'Ödeme gir', 'Ödendi', 'Tahsil edildi', 'Bankaya verdim']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
    expect(screen.queryByRole('button', { name: /gerçek bakiyeyle eşitle/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Hesabı aç' }).length).toBeGreaterThan(0);
  });

  it('hızlı "Satış" düğmesi satış formunu açar', async () => {
    const istekler = sunucuKur(YAZAN);
    finansAc();
    await anaSayfa(istekler);
    fireEvent.click(screen.getByRole('button', { name: 'Satış' }));
    expect(await screen.findByRole('dialog', { name: 'Satış yaptım' })).toBeTruthy();
  });

  it('verilen çek "Ödendi": hesap ve tarih sorulur, çekin kendi ucuna gider', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/cekler/2/odendi': () => json(200, { cek: {} }) });
    finansAc();
    await anaSayfa(istekler);
    const satir = screen.getByText('Verilen çek · hesapta para bulunmalı').closest('.tc-fa-is') as HTMLElement;
    fireEvent.click(within(satir).getByRole('button', { name: 'Ödendi' }));
    const pencere = await screen.findByRole('dialog', { name: 'Verilen çek ödendi' });
    expect((within(pencere).getByLabelText('Hesap') as HTMLSelectElement).value).toBe('1');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(postlar(istekler)).toHaveLength(1));
    expect(postlar(istekler)[0]).toMatchObject({ yol: '/finans/cekler/2/odendi', govde: { surum: 1, hesapId: 1, tarih: '2026-10-20' } });
  });

  it('alınan çek "Bankaya verdim" tek tıkla tahsile verir', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/cekler/1/tahsile-ver': () => json(200, { cek: {} }) });
    finansAc();
    await anaSayfa(istekler);
    fireEvent.click(screen.getAllByRole('button', { name: 'Bankaya verdim' })[0]!);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/finans/cekler/1/tahsile-ver')).toBe(true));
    expect(istekler.find((i) => i.yol === '/finans/cekler/1/tahsile-ver')!.govde).toEqual({ surum: 1 });
  });

  it('"Tahsilat gir" kayıt formunu o firmayla açar', async () => {
    const istekler = sunucuKur(YAZAN);
    finansAc();
    await anaSayfa(istekler);
    fireEvent.click(screen.getAllByRole('button', { name: 'Tahsilat gir' })[0]!);
    const form = await screen.findByRole('dialog', { name: 'Müşteriden para geldi' });
    expect((within(form).getByLabelText(/Kimden geldi/) as HTMLInputElement).value).toMatch(/^Deneme Musteri/);
  });
  it('"Hesabı aç" Firmalar bölümüne gider', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc();
    await anaSayfa(istekler);
    fireEvent.click(screen.getAllByRole('button', { name: 'Hesabı aç' })[0]!);
    const serit = screen.getByRole('tablist', { name: 'Finans bölümleri' });
    await waitFor(() => expect(within(serit).getByRole('tab', { selected: true }).textContent).toMatch(/Firmalar/));
  });
});
