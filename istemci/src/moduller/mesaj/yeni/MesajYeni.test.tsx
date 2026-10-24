import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { ORNEK_ZAMAN, ornekBelgeler } from './ornek-veri.ts';
import { KAPISIZ, OKUYAN, YAZAN, mesajAc, sunucuKur } from './test-ortak.tsx';

// Örnek verinin zamanları ORNEK_ZAMAN'a göredir; saat sabitlenmezse toplantı ve görev zamanla geçmişe düşer.
// Yalnız Date sahte: zamanlayıcılar gerçek kalır, findBy/waitFor beklemeleri bozulmaz.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(ORNEK_ZAMAN); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const sekme = (ad: RegExp) => screen.findByRole('tab', { name: ad });

describe('MesajYeni iskeleti', () => {
  it('kapı işlemi olmayan kişide açılmaz, hazırlanıyor der; Mesaj uçlarına gitmez', async () => {
    const s = sunucuKur({ kullanici: KAPISIZ });
    mesajAc();
    expect(await screen.findByText(YENI_EKRAN_ILETISI)).toBeTruthy();
    expect(s.istekler.some((i) => i.startsWith('GET /mesaj/'))).toBe(false);
  });

  it('altı bölüm sekmesi sayaçlarla gelir; bekleyen duyuru, iş ve davet sayılır', async () => {
    sunucuKur({ belgeler: ornekBelgeler() });
    mesajAc();
    expect(await sekme(/^Bugün \(1\)$/)).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Sohbet \(1\)$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^İşler \(2\)$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Takvim \(1\)$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Siparişler$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Ayarlar ve otomasyon$/ })).toBeTruthy();
  });

  it('sekme yolu değiştirir; bilinmeyen bölüm köke döner', async () => {
    sunucuKur({ belgeler: ornekBelgeler() });
    mesajAc('/mesaj/yeni/bilinmeyen');
    const isler = await sekme(/^İşler/);
    expect(screen.getByRole('tab', { selected: true }).textContent).toMatch(/^Bugün/);
    fireEvent.click(isler);
    await waitFor(() => { expect(screen.getByRole('tab', { selected: true }).textContent).toMatch(/^İşler/); });
  });

  it('kanal yolu Sohbet bölümünü açar ve kanal sohbette okunmamış sayılmaz', async () => {
    sunucuKur({ belgeler: ornekBelgeler() });
    mesajAc('/mesaj/yeni/sohbet/genel');
    await waitFor(() => { expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Sohbet'); });
  });

  it('yazabilen kişi Yeni ile seçiciyi açar (dört seçenek; sipariş açma yok, 212 a)', async () => {
    sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    mesajAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni' }));
    const pencere = await screen.findByRole('dialog', { name: 'Ne yapmak istiyorsun?' });
    for (const ad of ['Görev ver', 'Onay iste', 'Toplantı planla', 'Duyuru yap']) expect(within(pencere).getByText(ad)).toBeTruthy();
    expect(within(pencere).queryByText('Sipariş aç')).toBeNull();
    fireEvent.click(within(pencere).getByText('Görev ver'));
    // Seçici kapanır, yerine görev formu açılır (formun içi parçanındır; başlığına bakılmaz).
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Ne yapmak istiyorsun?' })).toBeNull(); });
    expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0);
  });

  it('salt okur kişide Yeni düğmesi yoktur', async () => {
    sunucuKur({ ben: OKUYAN, belgeler: ornekBelgeler() });
    mesajAc();
    await sekme(/^Bugün/);
    expect(screen.queryByRole('button', { name: 'Yeni' })).toBeNull();
  });

  it('açılışta eski ekranla ortak son görünüme döner', async () => {
    const belgeler = { ...ornekBelgeler(), 'data/users/5/prefs': { lastRead: {}, lastView: 'work', notif: {} } };
    sunucuKur({ belgeler });
    mesajAc();
    await waitFor(() => { expect(screen.getByRole('tab', { selected: true }).textContent).toMatch(/^İşler/); });
  });
});
