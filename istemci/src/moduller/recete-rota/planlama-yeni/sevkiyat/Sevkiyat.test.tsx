import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MALIYETSIZ, PLANLAMASIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from '../veri.ts';

// Veri ve kişi adları uydurmadır. Görünüm yalnız okur (soru 355 cevabına kadar): hiçbir yazma isteği gitmez.
const calisma = {
  surum: 2, dataVer: 3,
  D: {
    meta: { baslangic: '2026-03-02' },
    musteriler: [{ id: 'm1', ad: 'Deneme Musteri' }],
    urunler: [{ id: 'u1', ad: 'Deneme Urun', rota: [{ k: 'a', ad: 'Torna' }, { k: 'b', ad: 'Son olcum' }] }],
    tezgahlar: [{ id: 't1' }],
    siparisler: [
      { id: 'S1', urun: 'u1', adet: 10, termin: '2026-03-03 12:00', musteri: 'm1' },
      { id: 'S2', urun: 'u1', adet: 5, termin: '2026-03-02 20:00' },
    ],
  },
  plan: { dataVer: 3, J: { S1: { C: 20, T: 0 }, S2: { C: 26, T: 6 } }, ops: { 'S1.b': { job: 'S1', C: 20, m: 't1' }, 'S2.a': { job: 'S2', C: 26, fas: 1 } } },
  sevkEdildi: { S1: { t: '2026-03-04', kim: 'Deneme' } },
  sevkIz: { S1: [{ C: 18, t: 1, kaynak: 'plan', kim: 'A' }, { C: 20, t: 5, kaynak: 'plan', kim: 'B' }] },
};
const kayitlar = (deger: unknown) => [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger, surum: 4 }];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('P6 Sevkiyat', () => {
  it('plana göre bitmesi gereken işler, sayılar, dönem özeti ve bitiş akışı çizilir; yalnız okur (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, kayitlar(calisma) as never);
    ac('/recete-rota/planlama-yeni/sevkiyat');
    expect(await screen.findByRole('heading', { name: 'Plana göre bitmesi gereken işler' }, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sevkiyat özeti' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Dönem başına sevkiyat' })).toBeTruthy();
    expect(screen.getAllByText('S1').length).toBeGreaterThan(0);
    expect(screen.getByText('6 sa geç')).toBeTruthy();
    expect(screen.getByText('son gün')).toBeTruthy();
    expect(screen.getByText('sevk edildi 04.03')).toBeTruthy();
    expect(screen.getAllByText('Ertelenmiş plan 1')).toHaveLength(2);
    // Geç satır bugünkü sayfadaki gibi işaretlidir; tablo hücreleri dar ekran kartı için başlığını taşır.
    const gecSatir = screen.getByText('6 sa geç').closest('tr');
    expect(gecSatir?.getAttribute('data-ton')).toBe('hata');
    expect(gecSatir?.querySelector('td')?.getAttribute('data-baslik')).toBe('Sipariş ve müşteri');
    // Görünüm salt okunur: sevk tarihi girdisi yok, yazma isteği yok.
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);

  it('dönem, ölçü ve görünüm seçimi özeti değiştirir', async () => {
    sunucuKur(YONETICI, kayitlar(calisma) as never);
    ac('/recete-rota/planlama-yeni/sevkiyat');
    const olcu = await screen.findByRole('group', { name: 'Ölçü' }, { timeout: 10000 });
    fireEvent.click(within(olcu).getByRole('button', { name: 'Adet' }));
    expect(screen.getByText(/Birim: adet\./)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Tablo' }));
    expect(screen.queryByRole('img', { name: 'Dönem başına sevkiyat' })).toBeNull();
    fireEvent.click(within(screen.getAllByRole('group', { name: 'Dönem' })[0]!).getByRole('button', { name: 'Ay' }));
    expect(screen.getAllByText('Mart 2026').length).toBeGreaterThan(0);
  }, 20000);

  it('plan kurulmamışsa ya da çalışma yoksa yalnız uyarı çıkar', async () => {
    sunucuKur(MALIYETSIZ, kayitlar({ ...calisma, plan: null }) as never);
    ac('/recete-rota/planlama-yeni/sevkiyat');
    expect(await screen.findByText('Önce plan kurulmalı.', {}, { timeout: 10000 })).toBeTruthy();
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(YONETICI);
    ac('/recete-rota/planlama-yeni/sevkiyat');
    expect(await screen.findByText('Önce plan kurulmalı.', {}, { timeout: 10000 })).toBeTruthy();
  }, 20000);

  it('planlama okuması olmayan kişi görünümü açamaz (reddedilen)', async () => {
    sunucuKur(PLANLAMASIZ, kayitlar(calisma) as never);
    ac('/recete-rota/planlama-yeni/sevkiyat');
    expect(await screen.findByText('Planlama sayfalarını görme yetkiniz yok.', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText('S1')).toBeNull();
  }, 20000);
});
